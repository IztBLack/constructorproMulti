/// Capa de datos del portal del cliente (/cliente).
/// Todas las queries usan RLS de Supabase — el cliente autenticado solo recibe SUS datos.
/// No filtrar manualmente por cliente_id: RLS lo hace. Solo agregar .is('deleted_at', null).

import { createClient } from '@/lib/supabase/server';

// ─── Tipos propios del portal ─────────────────────────────────────────────────

export type EstadoCotizacionPortal = 'Enviada' | 'Aceptada' | 'Rechazada';
export type EstadoObraPortal = 'En progreso' | 'Pausada' | 'Completada';

export interface ClientePortal {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  user_id: string | null;
}

export interface ObraPortal {
  id: string;
  nombre: string;
  cliente: string | null;
  ubicacion: string | null;
  fecha_inicio: number | null;
  activa: boolean;
  avance: number; // 0-100
  cliente_id: string | null;
}

export interface PagoPortal {
  id: string;
  cotizacion_id: string;
  fecha: number;
  monto: number;
  metodo: string;
  concepto: string;
  referencia: string | null;
}

export interface PartidaPortal {
  id: string;
  seccion_id: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  orden: number;
}

export interface SeccionPortal {
  id: string;
  cotizacion_id: string;
  nombre: string;
  orden: number;
  partidas: PartidaPortal[];
}

export interface CotizacionPortal {
  id: string;
  nombre_proyecto: string;
  ubicacion: string | null;
  fecha: number;
  estado: EstadoCotizacionPortal;
  iva_enabled: boolean;
  descuento: number;
  notas: string | null;
  cliente_id: string | null;
}

export interface CotizacionPortalConDetalle extends CotizacionPortal {
  secciones: SeccionPortal[];
  /// Estado crudo de la BD (BORRADOR/ENVIADA/ACEPTADA/RECHAZADA/CONVERTIDA), sin
  /// mapear. Se usa para saber si aplica la re-aprobación (solo ACEPTADA).
  estadoRaw: string;
  /// Foto (JSON) de la versión que el cliente aprobó, o null. Ver cotizacion-diff.
  snapshotJson: string | null;
}

export interface TotalesCotizacionPortal {
  subtotal: number;
  descuentoMonto: number;
  base: number;
  ivaMonto: number;
  total: number;
}

// ─── Helper: mapear estado de BD → etiqueta legible del portal ───────────────

function mapEstadoCotizacion(estado: string): EstadoCotizacionPortal {
  switch (estado) {
    case 'ACEPTADA':
    case 'CONVERTIDA':
      return 'Aceptada';
    case 'RECHAZADA':
      return 'Rechazada';
    default:
      // ENVIADA (y defensivamente cualquier otro) → "Enviada", pendiente de
      // respuesta. Los BORRADOR se filtran antes de llegar al portal, así que
      // nunca deberían mapearse aquí.
      return 'Enviada';
  }
}

function mapEstadoObra(activa: boolean, avance: number): EstadoObraPortal {
  if (!activa) return avance >= 100 ? 'Completada' : 'Pausada';
  return avance >= 100 ? 'Completada' : 'En progreso';
}

// ─── Helper: calcular totales de una cotización ───────────────────────────────

export function calcularTotales(cot: CotizacionPortalConDetalle): TotalesCotizacionPortal {
  const subtotal = cot.secciones.reduce((accSec, sec) => {
    return (
      accSec +
      sec.partidas.reduce((accPar, p) => accPar + p.cantidad * p.precio_unitario, 0)
    );
  }, 0);

  const descuentoMonto = subtotal * ((cot.descuento ?? 0) / 100);
  const base = subtotal - descuentoMonto;
  const ivaMonto = cot.iva_enabled ? base * 0.16 : 0;
  const total = base + ivaMonto;

  return { subtotal, descuentoMonto, base, ivaMonto, total };
}

/// Versión simplificada para listas (sin secciones/partidas): usa solo el total de pagos
/// o el total calculado si se tienen las partidas. Esta función recibe subtotal ya calculado.
export function calcularTotalSimple(cot: Pick<CotizacionPortal, 'descuento' | 'iva_enabled'>, subtotal: number): number {
  const descuentoMonto = subtotal * ((cot.descuento ?? 0) / 100);
  const base = subtotal - descuentoMonto;
  const ivaMonto = cot.iva_enabled ? base * 0.16 : 0;
  return base + ivaMonto;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/// Devuelve el registro del cliente autenticado, o null si no tiene vínculo.
/// Filtra EXPLÍCITO por `user_id = auth.uid()`: aunque RLS ya acota, un usuario
/// STAFF tiene la política `clientes_staff` (ve todos los clientes de su
/// empresa); sin este filtro, `.limit(1)` tomaría un cliente ajeno arbitrario.
/// Con él, el portal siempre representa al cliente del propio usuario (o null).
export async function getClienteActual(): Promise<ClientePortal | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, email, telefono, user_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return data as ClientePortal;
}

/// Lista todas las obras del cliente autenticado (RLS filtra por cliente_id).
export async function listObrasCliente(): Promise<ObraPortal[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('obras')
    .select('id, nombre, cliente, ubicacion, fecha_inicio, activa, avance, cliente_id')
    .is('deleted_at', null)
    .order('fecha_inicio', { ascending: false });

  if (error || !data) return [];

  return (data as ObraPortal[]);
}

/// Devuelve una obra específica del cliente autenticado (RLS valida que sea suya).
export async function getObraCliente(id: string): Promise<ObraPortal | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('obras')
    .select('id, nombre, cliente, ubicacion, fecha_inicio, activa, avance, cliente_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;

  return data as ObraPortal;
}

/// Lista todas las cotizaciones del cliente autenticado con su subtotal calculado.
/// Incluye secciones y partidas para calcular totales.
export async function listCotizacionesCliente(): Promise<{
  cotizacion: CotizacionPortal;
  totales: TotalesCotizacionPortal;
}[]> {
  const supabase = await createClient();

  // Traer cotizaciones
  const { data: cotsData, error: cotsError } = await supabase
    .from('cotizaciones')
    .select('id, nombre_proyecto, ubicacion, fecha, estado, iva_enabled, descuento, notas, cliente_id')
    .is('deleted_at', null)
    // Un BORRADOR aún no se ha compartido con el cliente: nunca debe aparecer en
    // el portal (evita que el cliente responda una cotización no enviada).
    .neq('estado', 'BORRADOR')
    .order('fecha', { ascending: false });

  if (cotsError || !cotsData || cotsData.length === 0) return [];

  const cotIds = (cotsData as CotizacionPortal[]).map((c) => c.id);

  // Traer secciones de todas esas cotizaciones
  const { data: secsData } = await supabase
    .from('secciones')
    .select('id, cotizacion_id, nombre, orden')
    .in('cotizacion_id', cotIds)
    .is('deleted_at', null)
    .order('orden');

  const seccionesRaw = (secsData ?? []) as { id: string; cotizacion_id: string; nombre: string; orden: number }[];
  const secIds = seccionesRaw.map((s) => s.id);

  // Traer partidas de esas secciones
  let partidasRaw: PartidaPortal[] = [];
  if (secIds.length > 0) {
    const { data: parsData } = await supabase
      .from('partidas')
      .select('id, seccion_id, descripcion, unidad, cantidad, precio_unitario, orden')
      .in('seccion_id', secIds)
      .is('deleted_at', null);

    partidasRaw = (parsData ?? []) as PartidaPortal[];
  }

  return (cotsData as CotizacionPortal[]).map((cot) => {
    const secciones: SeccionPortal[] = seccionesRaw
      .filter((s) => s.cotizacion_id === cot.id)
      .map((s) => ({
        ...s,
        partidas: partidasRaw.filter((p) => p.seccion_id === s.id),
      }));

    const cotConDetalle: CotizacionPortalConDetalle = {
      ...cot,
      estado: mapEstadoCotizacion(cot.estado as string),
      estadoRaw: cot.estado as string,
      // La lista no trae el snapshot (solo el detalle hace el diff de cambios).
      snapshotJson: null,
      secciones,
    };

    return {
      cotizacion: { ...cot, estado: mapEstadoCotizacion(cot.estado as string) },
      totales: calcularTotales(cotConDetalle),
    };
  });
}

/// Devuelve una cotización completa con secciones y partidas ordenadas.
export async function getCotizacionClienteConDetalle(
  id: string,
): Promise<CotizacionPortalConDetalle | null> {
  const supabase = await createClient();

  const { data: cotData, error: cotError } = await supabase
    .from('cotizaciones')
    .select('id, nombre_proyecto, ubicacion, fecha, estado, iva_enabled, descuento, notas, cliente_id, aprobado_snapshot_json')
    .eq('id', id)
    .is('deleted_at', null)
    // Un BORRADOR no es visible en el portal (aún no se ha enviado al cliente).
    .neq('estado', 'BORRADOR')
    .maybeSingle();

  if (cotError || !cotData) return null;

  const { data: secsData, error: secError } = await supabase
    .from('secciones')
    .select('id, cotizacion_id, nombre, orden')
    .eq('cotizacion_id', id)
    .is('deleted_at', null)
    .order('orden');

  if (secError) return null;

  const seccionesRaw = (secsData ?? []) as { id: string; cotizacion_id: string; nombre: string; orden: number }[];
  const secIds = seccionesRaw.map((s) => s.id);

  let partidasRaw: PartidaPortal[] = [];
  if (secIds.length > 0) {
    const { data: parsData, error: parError } = await supabase
      .from('partidas')
      .select('id, seccion_id, descripcion, unidad, cantidad, precio_unitario, orden')
      .in('seccion_id', secIds)
      .is('deleted_at', null)
      .order('orden');

    if (parError) return null;
    partidasRaw = (parsData ?? []) as PartidaPortal[];
  }

  const secciones: SeccionPortal[] = seccionesRaw.map((s) => ({
    ...s,
    partidas: partidasRaw.filter((p) => p.seccion_id === s.id),
  }));

  const raw = cotData as CotizacionPortal & { aprobado_snapshot_json: string | null };

  return {
    ...raw,
    estado: mapEstadoCotizacion(raw.estado as string),
    estadoRaw: raw.estado as string,
    snapshotJson: raw.aprobado_snapshot_json ?? null,
    secciones,
  };
}

/// Lista los pagos de una cotización específica, ordenados por fecha desc.
export async function listPagosDeCotizacion(cotId: string): Promise<PagoPortal[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('pagos')
    .select('id, cotizacion_id, fecha, monto, metodo, concepto, referencia')
    .eq('cotizacion_id', cotId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error || !data) return [];

  return data as PagoPortal[];
}

// ─── Estado de cuenta REAL por obra ──────────────────────────────────────────
// Modelo (mismo que usa /admin): COSTO TOTAL = Σ obra_presupuesto,
// RECIBIDO = Σ movimientos tipo='ENTRADA'. Las SALIDA (pagos internos) NUNCA se
// exponen al cliente: la RLS de movimientos filtra tipo='ENTRADA' en el USING y
// aquí además pedimos .eq('tipo','ENTRADA') como defensa en profundidad.

export interface PartidaPresupuestoPortal {
  id: string;
  concepto: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  orden: number;
}

export interface EntradaPortal {
  id: string;
  fecha: number;
  concepto: string | null;
  categoria: string | null;
  monto: number;
  metodo_pago: string | null;
  referencia: string | null;
}

export interface EstadoCuentaObra {
  costoTotal: number;
  recibido: number;
  pendiente: number;
  pagadoPct: number;
  partidas: PartidaPresupuestoPortal[];
  entradas: EntradaPortal[];
}

/// Partidas del presupuesto de una obra del cliente (RLS: solo sus obras).
export async function listPresupuestoObraCliente(
  obraId: string,
): Promise<PartidaPresupuestoPortal[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('obra_presupuesto')
    .select('id, concepto, unidad, cantidad, precio_unitario, orden')
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('orden', { ascending: true });

  if (error || !data) return [];

  return data as PartidaPresupuestoPortal[];
}

/// ENTRADAS (pagos recibidos) de una obra del cliente, ordenadas por fecha desc.
/// El .eq('tipo','ENTRADA') es redundante con la RLS a propósito: nunca SALIDA.
export async function listEntradasObraCliente(obraId: string): Promise<EntradaPortal[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('movimientos')
    .select('id, fecha, concepto, categoria, monto, metodo_pago, referencia')
    .eq('obra_id', obraId)
    .eq('tipo', 'ENTRADA')
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error || !data) return [];

  return data as EntradaPortal[];
}

/// Estado de cuenta de UNA obra: COSTO TOTAL (presupuesto) vs RECIBIDO (ENTRADAS).
export async function getEstadoCuentaObra(obraId: string): Promise<EstadoCuentaObra> {
  const [partidas, entradas] = await Promise.all([
    listPresupuestoObraCliente(obraId),
    listEntradasObraCliente(obraId),
  ]);

  const costoTotal = partidas.reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0);
  const recibido = entradas.reduce((acc, e) => acc + e.monto, 0);
  const pendiente = costoTotal - recibido;
  const pagadoPct =
    costoTotal > 0 ? Math.min(100, Math.round((recibido / costoTotal) * 100)) : 0;

  return { costoTotal, recibido, pendiente, pagadoPct, partidas, entradas };
}

/// Estado de cuenta global del cliente, sumando TODAS sus obras (modelo real por
/// obra). RLS restringe ambas tablas a las obras del cliente autenticado.
export async function getEstadoCuentaCliente(): Promise<{
  totalPresupuestado: number;
  totalPagado: number;
  totalSaldo: number;
}> {
  const supabase = await createClient();

  const { data: presData } = await supabase
    .from('obra_presupuesto')
    .select('cantidad, precio_unitario')
    .is('deleted_at', null);

  const totalPresupuestado = (presData ?? []).reduce(
    (acc, p) => acc + (p.cantidad as number) * (p.precio_unitario as number),
    0,
  );

  const { data: entData } = await supabase
    .from('movimientos')
    .select('monto')
    .eq('tipo', 'ENTRADA')
    .is('deleted_at', null);

  const totalPagado = (entData ?? []).reduce((acc, m) => acc + (m.monto as number), 0);

  return {
    totalPresupuestado,
    totalPagado,
    totalSaldo: totalPresupuestado - totalPagado,
  };
}

// ─── Re-exportar helpers de estado para las vistas ───────────────────────────

export { mapEstadoObra };
