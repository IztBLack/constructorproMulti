import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { SELECT_CON_SUELDO, aplanarSueldos } from './colaborador-sueldo';
import { calcularTotales, type RenglonNota } from './notas-obra-calculo';
import { comprometidoComprasPorObra } from './compras';
import type { Asistencia, Destajo, Obra, Puesto } from './types';
import { puedeFijarMargen, puedeVerUtilidad } from '@/lib/auth/utilidad';
import { totalExtrasAprobados } from '@/lib/cambios/extras';
import { avanceFisicoPorObra } from './estimaciones';
import { getIvaEstadoCuentaObras } from './iva-obra';
import type { IvaEstadoCuenta } from '@/lib/cliente/estado-cuenta-calculo';
import {
  MARGEN_OBJETIVO_POR_DEFECTO,
  calcularRentabilidad,
  margenObjetivoDe,
  rayaCalculada,
  type FilaComparativo,
  type NotaCosto,
  type ResultadoRentabilidad,
} from '@/lib/rentabilidad/calculo';

/**
 * UTILIDAD POR OBRA en el servidor: junta los datos, llama al cálculo puro y
 * ENTREGA el resultado solo a quien puede verlo.
 *
 * D1 (el supervisor NO ve la utilidad) se cumple AQUÍ. Los datos crudos
 * (caja, raya, presupuesto) el supervisor los lee por RLS desde antes, así que
 * no hay policy que pueda esconder "la resta"; lo que se hace es no calcularla
 * ni mandarla nunca al navegador de alguien sin `puedeVerUtilidad`. Cada
 * función exportada empieza por ese chequeo, y la página lo repite.
 */

export type RespuestaUtilidad<T> =
  | { permitido: false }
  | { permitido: true; data: T | null; error: string | null };

export interface RentabilidadObra {
  obra: Pick<Obra, 'id' | 'nombre' | 'activa' | 'avance'>;
  r: ResultadoRentabilidad;
  /** Margen propio de la obra (null = usa el de la empresa). */
  margenObra: number | null;
  margenEmpresa: number;
  puedeFijarMargen: boolean;
}

/** PostgREST corta en 1000 filas; la asistencia de una empresa pasa de eso en semanas. */
const PAGINA = 1000;

async function leerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: string | null }> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) return { data: [], error: error.message };
    const filas = (data ?? []) as T[];
    todo.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return { data: todo, error: null };
}

interface DatosCrudos {
  obras: Pick<Obra, 'id' | 'nombre' | 'activa' | 'avance'>[];
  presupuesto: { obra_id: string; cantidad: number; precio_unitario: number }[];
  movimientos: {
    id: string;
    obra_id: string;
    tipo: string;
    monto: number;
    categoria: string | null;
    categoria_costo: string | null;
  }[];
  asistencias: Asistencia[];
  destajos: Destajo[];
  colaboradores: ReturnType<typeof aplanarSueldos>;
  puestos: Puesto[];
  extras: { obra_id: string; estado: 'APROBADA'; total_enviado: number | null; deleted_at: number | null }[];
  notas: { id: string; obra_id: string; estado: string; total_override: number | null; saldo_override: number | null }[];
  renglonesNotas: RenglonNota[];
  margenEmpresa: number;
  margenesObra: { obra_id: string; margen_objetivo: number }[];
  /** % físico por obra desde `avance_partida` (F3); solo las que tienen capturas. */
  avanceFisico: Map<string, number>;
  /** Saldo por pagar a proveedores por obra (compras, 0038). Vacío sin el módulo. */
  comprometidoCompras: Map<string, number>;
  /** IVA con que cobra cada obra (0047) y sus estimaciones cobradas. Vacío: sin IVA. */
  iva: Map<string, IvaEstadoCuenta>;
}

/**
 * Todo lo que hace falta para la utilidad, de UNA obra o de todas. Se filtra por
 * `empresa_id` además de la RLS: quien es personal de dos empresas vería filas
 * de las dos, y el panel trabaja sobre la primera (`getEmpresaUsuario`).
 */
async function leerDatos(empresaId: string, obraId?: string): Promise<{ d: DatosCrudos | null; error: string | null }> {
  const supabase = await createClient();
  // `match({})` no filtra nada: una sola forma de consulta para una obra o todas.
  const deLaObra: Record<string, string> = obraId ? { obra_id: obraId } : {};

  const obrasQ = supabase
    .from('obras')
    .select('id, nombre, activa, avance')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .order('nombre');
  const { data: obras, error: errObras } = obraId ? await obrasQ.eq('id', obraId) : await obrasQ;
  if (errObras) return { d: null, error: errObras.message };
  if (!obras || obras.length === 0) return { d: null, error: null };

  const [
    presupuesto,
    movimientos,
    asistencias,
    destajos,
    colaboradores,
    puestos,
    extras,
    notas,
    config,
    margenesObra,
  ] = await Promise.all([
    leerTodo<DatosCrudos['presupuesto'][number]>((a, b) =>
              supabase
          .from('obra_presupuesto')
          .select('obra_id, cantidad, precio_unitario')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null)
        .match(deLaObra).range(a, b),
    ),
    leerTodo<DatosCrudos['movimientos'][number]>((a, b) =>
              supabase
          .from('movimientos')
          .select('id, obra_id, tipo, monto, categoria, categoria_costo')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null)
        .match(deLaObra).range(a, b),
    ),
    leerTodo<Asistencia>((a, b) =>
              supabase
          .from('asistencias')
          .select('id, colaborador_id, obra_id, fecha, fraccion')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null)
        .match(deLaObra)
        .order('id')
        .range(a, b),
    ),
    leerTodo<Destajo>((a, b) =>
              supabase
          .from('destajos')
          .select('id, colaborador_id, obra_id, fecha, monto')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null)
        .match(deLaObra)
        .order('id')
        .range(a, b),
    ),
    // Con los dados de baja: si trabajaron en la obra, su raya fue costo.
    leerTodo<Record<string, unknown>>((a, b) =>
      supabase
        .from('colaboradores')
        .select(SELECT_CON_SUELDO)
        .eq('empresa_id', empresaId)
        .order('id')
        .range(a, b),
    ),
    leerTodo<Puesto>((a, b) =>
      supabase.from('puestos').select('*').eq('empresa_id', empresaId).range(a, b),
    ),
    leerTodo<DatosCrudos['extras'][number]>((a, b) =>
              supabase
          .from('orden_cambio')
          .select('obra_id, estado, total_enviado, deleted_at')
          .eq('empresa_id', empresaId)
          .eq('estado', 'APROBADA')
          .is('deleted_at', null)
        .match(deLaObra).range(a, b),
    ),
    leerTodo<DatosCrudos['notas'][number]>((a, b) =>
              supabase
          .from('nota_obra')
          .select('id, obra_id, estado, total_override, saldo_override')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null)
        .match(deLaObra).range(a, b),
    ),
    // Tabla aparte (0036, SEG-B3): `empresa_config` la leen roles de campo.
    supabase
      .from('empresa_margen')
      .select('margen_objetivo')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .maybeSingle(),
    leerTodo<DatosCrudos['margenesObra'][number]>((a, b) =>
              supabase
          .from('obra_margen_objetivo')
          .select('obra_id, margen_objetivo')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null)
        .match(deLaObra).range(a, b),
    ),
  ]);

  const error =
    presupuesto.error ??
    movimientos.error ??
    asistencias.error ??
    destajos.error ??
    colaboradores.error ??
    puestos.error ??
    extras.error ??
    notas.error ??
    margenesObra.error;
  if (error) return { d: null, error };

  // Renglones de las notas, para sus totales (con lo fijado a mano).
  let renglonesNotas: RenglonNota[] = [];
  const idsNotas = notas.data.map((n) => n.id);
  for (let i = 0; i < idsNotas.length; i += 200) {
    const lote = idsNotas.slice(i, i + 200);
    const r = await leerTodo<RenglonNota>((a, b) =>
      supabase
        .from('nota_obra_renglon')
        .select('id, nota_id, tipo, etiqueta, monto, monto_base, porcentaje, mostrar_porcentaje, texto, fecha, orden')
        .in('nota_id', lote)
        .is('deleted_at', null)
        .order('id')
        .range(a, b),
    );
    if (r.error) return { d: null, error: r.error };
    renglonesNotas = renglonesNotas.concat(r.data);
  }

  // Avance físico por partida (F3). Si 0039 no está aplicada, mapa vacío y la
  // proyección usa el avance manual, como antes.
  const avanceFisico = await avanceFisicoPorObra(empresaId, obraId);

  // Sin la tabla (0036 sin aplicar), sin permiso o sin fila: el objetivo de siempre.
  const margenEmpresa = Number(config.data?.margen_objetivo ?? MARGEN_OBJETIVO_POR_DEFECTO);

  return {
    d: {
      obras: obras as DatosCrudos['obras'],
      presupuesto: presupuesto.data,
      movimientos: movimientos.data,
      asistencias: asistencias.data,
      destajos: destajos.data,
      colaboradores: aplanarSueldos(colaboradores.data),
      puestos: puestos.data,
      extras: extras.data,
      notas: notas.data,
      renglonesNotas,
      margenEmpresa: Number.isFinite(margenEmpresa) ? margenEmpresa : MARGEN_OBJETIVO_POR_DEFECTO,
      margenesObra: margenesObra.data,
      avanceFisico,
      // Sin 0038 o sin permiso regresa un mapa vacío: la utilidad queda como antes.
      comprometidoCompras: await comprometidoComprasPorObra(obras.map((o) => o.id as string)),
      // Lo cobrado se compara SIN IVA contra lo contratado. Sin 0047: sin IVA.
      iva: await getIvaEstadoCuentaObras(obras.map((o) => o.id as string)),
    },
    error: null,
  };
}

function agrupar<T extends { obra_id: string }>(filas: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const l = m.get(f.obra_id);
    if (l) l.push(f);
    else m.set(f.obra_id, [f]);
  }
  return m;
}

function calcularTodas(d: DatosCrudos): RentabilidadObra[] {
  const pres = agrupar(d.presupuesto);
  const movs = agrupar(d.movimientos);
  const asis = agrupar(d.asistencias);
  const dest = agrupar(d.destajos);
  const extras = agrupar(d.extras);
  const notas = agrupar(d.notas);
  const margenes = new Map(d.margenesObra.map((m) => [m.obra_id, Number(m.margen_objetivo)]));

  const renglonesPorNota = new Map<string, RenglonNota[]>();
  for (const r of d.renglonesNotas) {
    const l = renglonesPorNota.get(r.nota_id);
    if (l) l.push(r);
    else renglonesPorNota.set(r.nota_id, [r]);
  }

  return d.obras.map((obra) => {
    const notasCosto: NotaCosto[] = (notas.get(obra.id) ?? []).map((n) => {
      const t = calcularTotales(n, renglonesPorNota.get(n.id) ?? []);
      return { estado: n.estado, total: t.total, pagado: t.pagado, saldo: t.saldo };
    });
    const margenObra = margenes.has(obra.id) ? (margenes.get(obra.id) ?? null) : null;

    const r = calcularRentabilidad({
      presupuesto: (pres.get(obra.id) ?? []).reduce(
        (acc, p) => acc + Number(p.cantidad) * Number(p.precio_unitario),
        0,
      ),
      extrasAprobados: totalExtrasAprobados(extras.get(obra.id) ?? []),
      movimientos: movs.get(obra.id) ?? [],
      rayaCalculada: rayaCalculada({
        colaboradores: d.colaboradores,
        asistencias: asis.get(obra.id) ?? [],
        destajos: dest.get(obra.id) ?? [],
        puestos: d.puestos,
      }),
      notas: notasCosto,
      avance: obra.avance ?? null,
      avanceFisico: d.avanceFisico.get(obra.id) ?? null,
      margenObjetivo: margenObjetivoDe(margenObra, d.margenEmpresa),
      comprometidoCompras: d.comprometidoCompras.get(obra.id) ?? 0,
      iva: d.iva.get(obra.id) ?? null,
    });

    return {
      obra,
      r,
      margenObra,
      margenEmpresa: d.margenEmpresa,
      puedeFijarMargen: false,
    };
  });
}

async function rolActual(): Promise<{ empresaId: string; rol: string } | null> {
  try {
    return await getEmpresaUsuario();
  } catch {
    return null;
  }
}

/** Utilidad de UNA obra. `permitido: false` para quien no es admin ni contador. */
export async function getRentabilidadObra(obraId: string): Promise<RespuestaUtilidad<RentabilidadObra>> {
  const yo = await rolActual();
  if (!yo || !puedeVerUtilidad(yo.rol)) return { permitido: false };

  const { d, error } = await leerDatos(yo.empresaId, obraId);
  if (error) return { permitido: true, data: null, error };
  if (!d) return { permitido: true, data: null, error: null };

  const [fila] = calcularTodas(d);
  return {
    permitido: true,
    data: fila ? { ...fila, puedeFijarMargen: puedeFijarMargen(yo.rol) } : null,
    error: null,
  };
}

/** Comparativo de todas las obras de la empresa (RF1.8). Mismo candado. */
export async function getComparativoRentabilidad(): Promise<
  RespuestaUtilidad<{ filas: FilaComparativo[]; margenEmpresa: number }>
> {
  const yo = await rolActual();
  if (!yo || !puedeVerUtilidad(yo.rol)) return { permitido: false };

  const { d, error } = await leerDatos(yo.empresaId);
  if (error) return { permitido: true, data: null, error };
  if (!d) return { permitido: true, data: { filas: [], margenEmpresa: MARGEN_OBJETIVO_POR_DEFECTO }, error: null };

  return {
    permitido: true,
    data: {
      filas: calcularTodas(d).map((f) => ({
        obraId: f.obra.id,
        nombre: f.obra.nombre,
        activa: f.obra.activa,
        r: f.r,
      })),
      margenEmpresa: d.margenEmpresa,
    },
    error: null,
  };
}

// ── Margen objetivo ──────────────────────────────────────────────────────────

export interface Resultado {
  ok: boolean;
  error?: string;
}

function margenValido(m: number): boolean {
  return Number.isFinite(m) && m >= 0 && m < 100;
}

/**
 * Fija (o quita, con `null`) el margen objetivo de UNA obra. Solo admin: lo
 * exige también la RLS de `obra_margen_objetivo`.
 */
export async function guardarMargenObra(obraId: string, margen: number | null): Promise<Resultado> {
  const yo = await rolActual();
  if (!yo || !puedeFijarMargen(yo.rol)) {
    return { ok: false, error: 'Solo un administrador puede cambiar el margen objetivo.' };
  }
  if (margen !== null && !margenValido(margen)) {
    return { ok: false, error: 'El margen debe ser un número de 0 a 99.' };
  }

  const supabase = await createClient();
  const now = Date.now();

  if (margen === null) {
    const { error } = await supabase
      .from('obra_margen_objetivo')
      .update({ deleted_at: now, updated_at: now })
      .eq('obra_id', obraId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // Una fila por obra: se revive si estaba "borrada". Se escriben TODAS las
  // columnas de la fila (no es un upsert parcial sobre configuración, RT7).
  const { error } = await supabase.from('obra_margen_objetivo').upsert(
    {
      obra_id: obraId,
      empresa_id: yo.empresaId,
      margen_objetivo: margen,
      deleted_at: null,
      updated_at: now,
    },
    { onConflict: 'obra_id' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Margen objetivo por defecto de la empresa. Solo admin (RLS de `empresa_margen`, 0036). */
export async function guardarMargenEmpresa(margen: number): Promise<Resultado> {
  const yo = await rolActual();
  if (!yo || !puedeFijarMargen(yo.rol)) {
    return { ok: false, error: 'Solo un administrador puede cambiar el margen objetivo.' };
  }
  if (!margenValido(margen)) {
    return { ok: false, error: 'El margen debe ser un número de 0 a 99.' };
  }
  const supabase = await createClient();
  // Una fila por empresa (se crea la primera vez). Se escriben TODAS las
  // columnas de la fila: no es un upsert parcial sobre configuración (RT7).
  const { error } = await supabase.from('empresa_margen').upsert(
    {
      empresa_id: yo.empresaId,
      margen_objetivo: margen,
      deleted_at: null,
      updated_at: Date.now(),
    },
    { onConflict: 'empresa_id' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Margen por defecto de la empresa, para Ajustes. Cae a 15 si falta. */
export async function getMargenEmpresa(): Promise<number> {
  const yo = await rolActual();
  if (!yo) return MARGEN_OBJETIVO_POR_DEFECTO;
  const supabase = await createClient();
  // Sin la tabla (0036 sin aplicar), sin permiso o sin fila → 15.
  const { data } = await supabase
    .from('empresa_margen')
    .select('margen_objetivo')
    .eq('empresa_id', yo.empresaId)
    .is('deleted_at', null)
    .maybeSingle();
  const m = data?.margen_objetivo == null ? NaN : Number(data.margen_objetivo);
  return Number.isFinite(m) ? m : MARGEN_OBJETIVO_POR_DEFECTO;
}
