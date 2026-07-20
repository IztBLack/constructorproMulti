/// Capa de datos del PASE DE LISTA UNIFICADO (todas las obras activas de un día),
/// leída **desde el navegador**.
///
/// ¿Por qué cliente y no servidor, si `nomina.ts` ya tiene estas lecturas?
/// La pantalla se renderiza 100% en el cliente para que el service worker pueda
/// cachear el HTML sin que ese HTML contenga datos de ninguna empresa: si el
/// documento viniera pre-renderizado con la lista de colaboradores, el caché del
/// SW se convertiría en una fuga entre empresas en cualquier dispositivo
/// compartido (tablet de obra). Aquí el HTML es un cascarón vacío y los datos
/// entran por Supabase con la sesión del usuario, sujetos a RLS.
///
/// Es un port de `listColaboradoresActivosObra` + `listAsistenciasObraRango`
/// (versiones de servidor, en `@/lib/data/nomina`) pero **multi-obra y de un solo
/// día**, y con las mismas reglas de comportamiento que la pantalla móvil
/// `lib/presentation/asistencia/pase_lista_screen.dart`.
///
/// Fechas: SIEMPRE epoch ms de la medianoche de México (`@/lib/data/tz`). Nunca
/// `new Date('YYYY-MM-DD')` — eso interpreta la cadena en UTC y desfasa el día.

import { createClient } from '@/lib/supabase/client';
import { ESPECIALIDAD_LABEL } from '@/app/admin/cuadrillas/especialidades';
import { DIA_MS, partesTz, siguienteMedianocheMx } from './tz';

// ── Tipos públicos ────────────────────────────────────────────────────────

export interface ColaboradorPaseLista {
  id: string;
  nombre: string;
  cuadrillaId: string | null;
  /** Ya formateado para mostrar: `nombre · especialidad`. */
  cuadrillaNombre: string | null;
}

export interface ObraPaseLista {
  id: string;
  nombre: string;
  /** Solo `tipo_pago === 'DIA'`, activos, ordenados por nombre. */
  colaboradores: ColaboradorPaseLista[];
}

export interface DatosPaseLista {
  empresaId: string;
  diaMs: number;
  /** Solo obras activas, ordenadas por nombre. */
  obras: ObraPaseLista[];
  /** clave `${obraId}|${colaboradorId}` → fracción de ESE día. */
  fracciones: Record<string, number>;
}

/** Clave de celda usada en `fracciones`. */
export function claveFraccion(obraId: string, colaboradorId: string): string {
  return `${obraId}|${colaboradorId}`;
}

// ── Filas crudas de Supabase ──────────────────────────────────────────────

interface FilaObra {
  id: string;
  nombre: string;
}

interface FilaAsignacion {
  obra_id: string;
  colaborador_id: string;
  fecha_ingreso: number;
}

interface FilaColaborador {
  id: string;
  nombre: string;
}

interface FilaMiembroCuadrilla {
  colaborador_id: string;
  cuadrillas: { id: string; nombre: string; especialidad: string } | null;
}

interface FilaAsistencia {
  obra_id: string;
  colaborador_id: string;
  fecha: number;
  fraccion: number;
}

// ── Utilidades ────────────────────────────────────────────────────────────

/**
 * Tamaño de lote para los filtros `.in(...)`. PostgREST recibe los ids en la
 * query string; con varios cientos de UUIDs la URL revienta el límite del
 * servidor. Lotear mantiene el número de consultas acotado (unas pocas) sin
 * caer en el antipatrón de una consulta por colaborador.
 */
const TAM_LOTE = 200;

async function enLotes<T>(
  ids: string[],
  fn: (lote: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  if (ids.length <= TAM_LOTE) return fn(ids);
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += TAM_LOTE) lotes.push(ids.slice(i, i + TAM_LOTE));
  const res = await Promise.all(lotes.map(fn));
  return res.flat();
}

function porNombre(a: { nombre: string }, b: { nombre: string }): number {
  return a.nombre.localeCompare(b.nombre, 'es');
}

/** Convierte un error de PostgREST en excepción (aquí no devolvemos `{data,error}`). */
function orLanzar<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo cargar ${que}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

// ── Carga principal ───────────────────────────────────────────────────────

/**
 * Carga todo lo necesario para pasar lista de un día, desde el navegador.
 * Lanza si no hay sesión o red (la vista debe caer al snapshot local).
 *
 * Hace un número FIJO de consultas (no una por colaborador):
 *   1. `usuarios_empresa`  → empresa del usuario (obligatoria para sellar la cola)
 *   2. `obras`             → obras activas
 *   3. `obra_colaborador`  → relación N:M vigente de esas obras
 *   4. `colaboradores`     → los de tipo DIA y activos de esa relación
 *   5. `cuadrilla_miembro` → cuadrilla vigente de cada uno (con embed a `cuadrillas`)
 *   6. `asistencias`       → lo ya marcado ese día en esas obras
 * (3–6 se lotean si hay más de `TAM_LOTE` ids; 4/5 y 6 corren en paralelo).
 */
export async function cargarPaseLista(diaMs: number): Promise<DatosPaseLista> {
  if (typeof window === 'undefined') {
    // Guarda SSR: importar este módulo desde un componente de servidor es válido,
    // pero ejecutarlo ahí no — no hay sesión de navegador que respalde el RLS.
    throw new Error('cargarPaseLista() solo puede ejecutarse en el navegador.');
  }

  const supabase = createClient();

  // Empresa del usuario. Se lee de la sesión local (`getSession` NO sale a la
  // red) y se resuelve contra `usuarios_empresa`, que sí requiere red. El id de
  // empresa es indispensable: la cola de escritura sella `empresa_id` en cada
  // marca y descarta las que no coinciden con la sesión.
  const { data: ses } = await supabase.auth.getSession();
  const userId = ses?.session?.user?.id;
  if (!userId) throw new Error('No hay sesión activa.');

  const { data: mem, error: errMem } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (errMem) throw new Error(`No se pudo obtener la empresa del usuario: ${errMem.message}`);
  if (!mem) throw new Error('El usuario no tiene una empresa asignada.');
  const empresaId = mem.empresa_id as string;

  // 2. Obras activas.
  const obrasRaw = orLanzar<FilaObra[]>(
    await supabase
      .from('obras')
      .select('id, nombre')
      .eq('activa', true)
      .is('deleted_at', null)
      .order('nombre'),
    'las obras',
  );
  const obras = [...obrasRaw].sort(porNombre);
  if (obras.length === 0) {
    return { empresaId, diaMs, obras: [], fracciones: {} };
  }
  const obraIds = obras.map((o) => o.id);

  // 3. Relación N:M vigente EL DÍA CONSULTADO (misma regla que
  //    `listColaboradoresActivosObra`). No basta con `fecha_salida is null`: al
  //    mover a alguien de obra se le cierra la anterior, y con ese filtro
  //    desaparecería de la obra vieja también al revisar días pasados, cuando sí
  //    trabajó ahí.
  //
  //    `fecha_salida` es el día en que deja de pertenecer a la obra: ese día ya
  //    no cuenta como suyo. Se compara contra la medianoche del día siguiente
  //    para que la hora de reloj de las filas viejas no altere el resultado.
  const finDelDia = siguienteMedianocheMx(diaMs);
  const asignaciones = await enLotes<FilaAsignacion>(obraIds, async (lote) =>
    orLanzar<FilaAsignacion[]>(
      await supabase
        .from('obra_colaborador')
        .select('obra_id, colaborador_id, fecha_ingreso')
        .in('obra_id', lote)
        .or(`fecha_salida.is.null,fecha_salida.gte.${finDelDia}`)
        .is('deleted_at', null),
      'las asignaciones de colaboradores',
    ),
  );

  const colabIds = [...new Set(asignaciones.map((a) => a.colaborador_id))];

  // 4/5/6 en paralelo: son independientes entre sí.
  const [colaboradores, miembros, asistencias] = await Promise.all([
    // 4. Solo tipo DIA y activos: los de destajo no llevan pase de lista.
    enLotes<FilaColaborador>(colabIds, async (lote) =>
      orLanzar<FilaColaborador[]>(
        await supabase
          .from('colaboradores')
          .select('id, nombre')
          .in('id', lote)
          .eq('tipo_pago', 'DIA')
          .eq('activo', true)
          .is('deleted_at', null),
        'los colaboradores',
      ),
    ),
    // 5. Cuadrilla VIGENTE de cada colaborador: membresía sin fecha de salida ni
    //    borrado, y cuadrilla activa y no borrada (mismo criterio que
    //    `watchCuadrillaPorColaborador` del móvil).
    enLotes<FilaMiembroCuadrilla>(colabIds, async (lote) =>
      orLanzar<FilaMiembroCuadrilla[]>(
        (await supabase
          .from('cuadrilla_miembro')
          .select('colaborador_id, cuadrillas(id, nombre, especialidad, activa, deleted_at)')
          .in('colaborador_id', lote)
          .is('fecha_salida', null)
          .is('deleted_at', null)) as unknown as {
          data: FilaMiembroCuadrilla[] | null;
          error: { message: string } | null;
        },
        'las cuadrillas',
      ),
    ),
    // 6. Asistencias del día. Ver `asistenciasDelDia` para el porqué del margen.
    cargarAsistenciasDia(obraIds, diaMs),
  ]);

  const colabPorId = new Map(colaboradores.map((c) => [c.id, c]));

  // Cuadrilla por colaborador. Si alguien pertenece (por dato sucio) a dos
  // cuadrillas vigentes, gana la de nombre menor — determinista y espejo del
  // móvil, que ordena por nombre y se queda con la primera.
  const cuadrillaPorColab = new Map<string, { id: string; nombre: string; especialidad: string }>();
  for (const m of miembros) {
    const q = m.cuadrillas;
    if (!q) continue;
    const previa = cuadrillaPorColab.get(m.colaborador_id);
    if (!previa || q.nombre.localeCompare(previa.nombre, 'es') < 0) {
      cuadrillaPorColab.set(m.colaborador_id, q);
    }
  }

  // Cada colaborador aparece UNA sola vez. La obra por defecto es su última
  // asignada (mayor `fecha_ingreso`), regla del móvil
  // (`ultimaObraPorColaboradorProvider`), y no es cosmética: si alguien sigue
  // asignado a tres obras a la vez —lo
  // normal cuando nadie cierra las asignaciones viejas— aparecería tres veces y
  // el capturista podría marcarle tres días en la misma jornada, inflando la
  // nómina. Empate de `fecha_ingreso`: gana el `obra_id` menor, para que el
  // orden sea estable entre cargas y no baile la lista.
  const ultimaObra = new Map<string, { obraId: string; fechaIngreso: number }>();
  for (const a of asignaciones) {
    if (!colabPorId.has(a.colaborador_id)) continue; // no es de tipo DIA / no activo
    const prev = ultimaObra.get(a.colaborador_id);
    const mejor =
      !prev ||
      a.fecha_ingreso > prev.fechaIngreso ||
      (a.fecha_ingreso === prev.fechaIngreso && a.obra_id < prev.obraId);
    if (mejor) ultimaObra.set(a.colaborador_id, { obraId: a.obra_id, fechaIngreso: a.fecha_ingreso });
  }

  // …PERO la última obra solo decide dónde va quien AÚN NO tiene asistencia ese
  // día. Si ya la tiene, manda la obra con la que quedó registrada.
  //
  // Sin esto, mover a alguien de obra a media semana rompe los días anteriores:
  // su marca del lunes quedó con `obra_id` = obra vieja, pero él pasa a listarse
  // bajo la nueva. La marca se vuelve invisible (la obra vieja ya no lo lista) y
  // el capturista, viéndolo "sin marcar", lo marca otra vez — creando un SEGUNDO
  // registro de ese mismo día bajo la obra nueva. El día se pagaría dos veces.
  // No es un detalle de presentación: es dinero.
  //
  // Empate raro (dos registros del mismo día en obras distintas, dato heredado
  // de antes de `uq_asist`): gana la fracción mayor y, si igualan, el `obra_id`
  // menor — determinista, para que la lista no baile entre cargas.
  const obraDelDia = new Map<string, { obraId: string; fraccion: number }>();
  for (const a of asistencias) {
    if (!colabPorId.has(a.colaborador_id)) continue;
    const prev = obraDelDia.get(a.colaborador_id);
    const mejor =
      !prev ||
      a.fraccion > prev.fraccion ||
      (a.fraccion === prev.fraccion && a.obra_id < prev.obraId);
    if (mejor) obraDelDia.set(a.colaborador_id, { obraId: a.obra_id, fraccion: a.fraccion });
  }

  const porObra = new Map<string, ColaboradorPaseLista[]>(obraIds.map((id) => [id, []]));
  for (const [colabId, { obraId: obraAsignada }] of ultimaObra) {
    const c = colabPorId.get(colabId);
    // La obra del registro solo se respeta si sigue activa (si no, no hay
    // sección donde ponerlo y se cae a la asignación vigente).
    const registrada = obraDelDia.get(colabId)?.obraId;
    const obraId = registrada && porObra.has(registrada) ? registrada : obraAsignada;
    const destino = porObra.get(obraId);
    if (!c || !destino) continue;
    const q = cuadrillaPorColab.get(colabId) ?? null;
    destino.push({
      id: c.id,
      nombre: c.nombre,
      cuadrillaId: q?.id ?? null,
      cuadrillaNombre: q
        ? `${q.nombre} · ${ESPECIALIDAD_LABEL[q.especialidad] ?? q.especialidad}`
        : null,
    });
  }
  for (const lista of porObra.values()) lista.sort(porNombre);

  // Fracciones ya marcadas. Se suman por si hubiera más de un registro para la
  // misma celda (no debería: `uq_asist` lo impide, pero el dato viejo del móvil
  // pudo dejar duplicados antes de esa restricción).
  const fracciones: Record<string, number> = {};
  for (const a of asistencias) {
    const k = claveFraccion(a.obra_id, a.colaborador_id);
    fracciones[k] = (fracciones[k] ?? 0) + a.fraccion;
  }

  return {
    empresaId,
    diaMs,
    obras: obras.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      colaboradores: porObra.get(o.id) ?? [],
    })),
    fracciones,
  };
}

/**
 * Asistencias de ESE día de calendario mexicano en esas obras.
 *
 * No basta con `eq('fecha', diaMs)`: la app móvil normaliza la fecha al inicio
 * del día en la hora del dispositivo, así que un registro puede venir con un ms
 * que NO es exactamente la medianoche de México (teléfono en otra zona, dato
 * viejo, cambio de reglas de DST). Por eso se pide una ventana holgada de ±1 día
 * y se filtra en memoria comparando la **fecha de calendario en México** con
 * `partesTz` — exactamente el criterio de la vista semanal por obra
 * (`app/admin/obras/[id]/asistencia/page.tsx`).
 */
async function cargarAsistenciasDia(
  obraIds: string[],
  diaMs: number,
): Promise<FilaAsistencia[]> {
  const supabase = createClient();
  const desde = diaMs - DIA_MS;
  const hasta = diaMs + 2 * DIA_MS - 1;

  const filas = await enLotes<FilaAsistencia>(obraIds, async (lote) =>
    orLanzar<FilaAsistencia[]>(
      await supabase
        .from('asistencias')
        .select('obra_id, colaborador_id, fecha, fraccion')
        .in('obra_id', lote)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .is('deleted_at', null),
      'las asistencias',
    ),
  );

  const d = partesTz(diaMs);
  return filas.filter((a) => {
    const p = partesTz(a.fecha);
    return p.year === d.year && p.month === d.month && p.day === d.day;
  });
}
