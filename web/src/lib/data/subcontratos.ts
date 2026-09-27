import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { faltaColumnaCategoria } from './obras';
import type { EstadoSubcontrato, PagoPrevio, RenglonContratoNuevo } from '@/lib/subcontratos/calculo';
import type { Resultado } from './cumplimiento';

/**
 * Acceso a los SUBCONTRATOS (migración 0040). La aritmética vive en
 * `lib/subcontratos/calculo.ts`; aquí solo se lee y se escribe.
 *
 * Escriben admin y contador; el supervisor solo lee (RLS de 0040). El
 * supervisor no puede leer el padrón de subcontratistas (trae RFC), por eso
 * aquí se usa siempre `subcontratista_nombre`, la copia que guarda el contrato.
 */

export const ROLES_ESCRIBEN_SUBCONTRATOS = ['admin', 'contador'] as const;
// + residente (0042): la RLS le deja leer solo los contratos de sus obras.
export const ROLES_LEEN_SUBCONTRATOS = ['admin', 'contador', 'supervisor', 'residente'] as const;

export function puedeEscribirSubcontratos(rol: string): boolean {
  return (ROLES_ESCRIBEN_SUBCONTRATOS as readonly string[]).includes(rol);
}

export interface Subcontrato {
  id: string;
  obra_id: string;
  subcontratista_id: string;
  subcontratista_nombre: string;
  nota_obra_id: string | null;
  alcance: string;
  monto: number | null;
  retencion_pct: number;
  forma_pago: string;
  fecha_inicio: number | null;
  fecha_fin: number | null;
  fecha_firma: number | null;
  estado: EstadoSubcontrato;
  clausulas: string | null;
  texto_final: string | null;
  notas: string;
  created_at: number;
}

export interface SubcontratoRenglon {
  id: string;
  subcontrato_id: string;
  concepto: string;
  unidad: string;
  cantidad: number | null;
  precio_unitario: number | null;
  importe: number;
  orden: number;
}

export interface SubcontratoPago {
  id: string;
  subcontrato_id: string;
  fecha: number;
  monto: number;
  retencion: number;
  metodo_pago: string;
  referencia: string;
  notas: string;
  movimiento_id: string | null;
}

export interface SubcontratoCompleto extends Subcontrato {
  renglones: SubcontratoRenglon[];
  pagos: SubcontratoPago[];
}

const CAMPOS =
  'id, obra_id, subcontratista_id, subcontratista_nombre, nota_obra_id, alcance, monto, retencion_pct, forma_pago, fecha_inicio, fecha_fin, fecha_firma, estado, clausulas, texto_final, notas, created_at';
const CAMPOS_RENGLON = 'id, subcontrato_id, concepto, unidad, cantidad, precio_unitario, importe, orden';
const CAMPOS_PAGO = 'id, subcontrato_id, fecha, monto, retencion, metodo_pago, referencia, notas, movimiento_id';

/** Espaciado del `orden` (convención de 0026). */
export const PASO_ORDEN_RENGLON = 100;

// ── Lectura ─────────────────────────────────────────────────────────────────

/** Contratos con renglones y pagos (para listas con totales). */
export async function listSubcontratos(filtro: {
  obraId?: string;
  subcontratistaId?: string;
} = {}): Promise<{ data: SubcontratoCompleto[]; error: string | null }> {
  const supabase = await createClient();
  let q = supabase.from('subcontrato').select(CAMPOS).is('deleted_at', null);
  if (filtro.obraId) q = q.eq('obra_id', filtro.obraId);
  if (filtro.subcontratistaId) q = q.eq('subcontratista_id', filtro.subcontratistaId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  const contratos = (data ?? []) as Subcontrato[];
  if (contratos.length === 0) return { data: [], error: null };
  const ids = contratos.map((c) => c.id);

  const [{ data: renglones, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
    supabase.from('subcontrato_renglon').select(CAMPOS_RENGLON).in('subcontrato_id', ids).is('deleted_at', null),
    supabase.from('subcontrato_pago').select(CAMPOS_PAGO).in('subcontrato_id', ids).is('deleted_at', null),
  ]);
  if (e1 || e2) return { data: [], error: (e1 ?? e2)!.message };

  const agrupar = <T extends { subcontrato_id: string }>(filas: T[]) => {
    const m = new Map<string, T[]>();
    for (const f of filas) {
      const l = m.get(f.subcontrato_id);
      if (l) l.push(f);
      else m.set(f.subcontrato_id, [f]);
    }
    return m;
  };
  const r = agrupar((renglones ?? []) as SubcontratoRenglon[]);
  const p = agrupar((pagos ?? []) as SubcontratoPago[]);
  return {
    data: contratos.map((c) => ({
      ...c,
      renglones: (r.get(c.id) ?? []).sort((a, b) => a.orden - b.orden),
      pagos: (p.get(c.id) ?? []).sort((a, b) => a.fecha - b.fecha),
    })),
    error: null,
  };
}

export async function getSubcontrato(id: string): Promise<{ data: SubcontratoCompleto | null; error: string | null }> {
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from('subcontrato')
    .select(CAMPOS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!c) return { data: null, error: null };
  const [{ data: renglones }, { data: pagos }] = await Promise.all([
    supabase
      .from('subcontrato_renglon')
      .select(CAMPOS_RENGLON)
      .eq('subcontrato_id', id)
      .is('deleted_at', null)
      .order('orden'),
    supabase
      .from('subcontrato_pago')
      .select(CAMPOS_PAGO)
      .eq('subcontrato_id', id)
      .is('deleted_at', null)
      .order('fecha'),
  ]);
  return {
    data: {
      ...(c as Subcontrato),
      renglones: (renglones ?? []) as SubcontratoRenglon[],
      pagos: (pagos ?? []) as SubcontratoPago[],
    },
    error: null,
  };
}

/** El contrato vivo que nació de una nota (si lo hay). */
export async function subcontratoDeNota(notaId: string): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subcontrato')
    .select('id')
    .eq('nota_obra_id', notaId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

// ── Escritura ───────────────────────────────────────────────────────────────

export interface NuevoSubcontrato {
  obraId: string;
  subcontratistaId: string;
  subcontratistaNombre: string;
  notaObraId: string | null;
  alcance: string;
  monto: number | null;
  retencionPct: number;
  renglones: RenglonContratoNuevo[];
  pagosPrevios: PagoPrevio[];
}

/**
 * Crea el contrato con sus renglones y pagos previos. Si algo falla después
 * de crear el encabezado, el contrato se marca borrado para no dejar uno a
 * medias (PostgREST no da transacciones entre llamadas).
 */
export async function crearSubcontrato(n: NuevoSubcontrato): Promise<Resultado<{ id: string }>> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const now = Date.now();

  const { error } = await supabase.from('subcontrato').insert({
    id,
    empresa_id: empresaId,
    obra_id: n.obraId,
    subcontratista_id: n.subcontratistaId,
    subcontratista_nombre: n.subcontratistaNombre,
    nota_obra_id: n.notaObraId,
    alcance: n.alcance.slice(0, 4000),
    monto: n.monto,
    retencion_pct: n.retencionPct,
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message };

  const deshacer = async (msg: string): Promise<Resultado<{ id: string }>> => {
    await supabase.from('subcontrato').update({ deleted_at: Date.now(), updated_at: Date.now() }).eq('id', id);
    return { ok: false, error: msg };
  };

  if (n.renglones.length > 0) {
    const { error: e } = await supabase.from('subcontrato_renglon').insert(
      n.renglones.map((r, i) => ({
        id: crypto.randomUUID(),
        empresa_id: empresaId,
        subcontrato_id: id,
        concepto: r.concepto.slice(0, 500),
        unidad: r.unidad,
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario,
        importe: r.importe,
        orden: (i + 1) * PASO_ORDEN_RENGLON,
        created_at: now,
        updated_at: now,
      })),
    );
    if (e) return deshacer(e.message);
  }

  if (n.pagosPrevios.length > 0) {
    const { error: e } = await supabase.from('subcontrato_pago').insert(
      n.pagosPrevios.map((p) => ({
        id: crypto.randomUUID(),
        empresa_id: empresaId,
        subcontrato_id: id,
        fecha: p.fecha ?? now,
        monto: p.monto,
        retencion: p.retencion,
        referencia: p.referencia.slice(0, 200),
        notas: 'Traído de la nota de obra',
        created_at: now,
        updated_at: now,
      })),
    );
    if (e) return deshacer(e.message);
  }

  return { ok: true, data: { id } };
}

export interface DatosSubcontrato {
  alcance: string;
  monto: number | null;
  retencion_pct: number;
  forma_pago: string;
  fecha_inicio: number | null;
  fecha_fin: number | null;
  fecha_firma: number | null;
  estado: EstadoSubcontrato;
  notas: string;
}

export async function actualizarSubcontrato(id: string, d: DatosSubcontrato): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('subcontrato')
    .update({ ...d, updated_at: Date.now() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** `null` = volver a las cláusulas base. */
export async function guardarClausulas(id: string, clausulas: string | null): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('subcontrato')
    .update({ clausulas, updated_at: Date.now() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function borrarSubcontrato(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('subcontrato')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface RenglonInput {
  concepto: string;
  unidad: string;
  cantidad: number | null;
  precio_unitario: number | null;
  importe: number;
}

export async function agregarRenglon(subcontratoId: string, r: RenglonInput, orden: number): Promise<Resultado> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase.from('subcontrato_renglon').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    subcontrato_id: subcontratoId,
    ...r,
    orden,
    created_at: now,
    updated_at: now,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarRenglon(id: string, r: RenglonInput): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('subcontrato_renglon')
    .update({ ...r, updated_at: Date.now() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function quitarRenglon(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('subcontrato_renglon')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface PagoInput {
  fecha: number;
  monto: number;
  retencion: number;
  metodo_pago: string;
  referencia: string;
  notas: string;
}

/**
 * Registra el pago y, si se pide, la SALIDA en la caja de la obra por lo que
 * realmente sale (monto − retención).
 *
 * Orden: primero el pago, luego el movimiento, luego se ligan. Si el
 * movimiento falla, el pago queda registrado sin liga y se avisa: es mejor
 * que perder el pago o que duplicar dinero en caja.
 */
export async function registrarPago(
  contrato: Pick<Subcontrato, 'id' | 'obra_id' | 'subcontratista_nombre'>,
  p: PagoInput,
  crearSalidaEnCaja: boolean,
): Promise<Resultado<{ aviso?: string }>> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const now = Date.now();
  const pagoId = crypto.randomUUID();

  const { error } = await supabase.from('subcontrato_pago').insert({
    id: pagoId,
    empresa_id: empresaId,
    subcontrato_id: contrato.id,
    ...p,
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message };
  if (!crearSalidaEnCaja) return { ok: true, data: {} };

  const movId = crypto.randomUUID();
  const neto = Math.round((p.monto - p.retencion) * 100) / 100;
  const filaMov = {
    id: movId,
    empresa_id: empresaId,
    obra_id: contrato.obra_id,
    fecha: p.fecha,
    tipo: 'SALIDA',
    // `categoria` es el texto libre heredado (0002); el costo lo clasifica
    // `categoria_costo` (0036), que es lo que lee la utilidad por obra.
    categoria: '',
    concepto: `Pago de subcontrato — ${contrato.subcontratista_nombre}`.slice(0, 200),
    monto: neto,
    metodo_pago: p.metodo_pago || 'TRANSFERENCIA',
    referencia: p.referencia,
    nombre: contrato.subcontratista_nombre,
    cotizacion_id: null,
    partida_id: null,
    created_at: now,
    updated_at: now,
  };
  let { error: errMov } = await supabase
    .from('movimientos')
    .insert({ ...filaMov, categoria_costo: 'SUBCONTRATO' });
  // 0036 sin aplicar: se guarda sin clasificar en vez de perder la salida.
  if (faltaColumnaCategoria(errMov)) {
    ({ error: errMov } = await supabase.from('movimientos').insert(filaMov));
  }
  if (errMov) {
    return {
      ok: true,
      data: { aviso: `El pago quedó registrado, pero no se pudo crear la salida en caja: ${errMov.message}` },
    };
  }
  const { error: errLiga } = await supabase
    .from('subcontrato_pago')
    .update({ movimiento_id: movId, updated_at: Date.now() })
    .eq('id', pagoId);
  if (errLiga) {
    return { ok: true, data: { aviso: `Se creó la salida en caja, pero no se pudo ligar al pago: ${errLiga.message}` } };
  }
  return { ok: true, data: {} };
}

/** Borrado lógico del pago. La salida en caja, si la hay, NO se toca. */
export async function quitarPago(id: string): Promise<Resultado<{ teniaMovimiento: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subcontrato_pago')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', id)
    .select('movimiento_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { teniaMovimiento: Boolean(data?.movimiento_id) } };
}
