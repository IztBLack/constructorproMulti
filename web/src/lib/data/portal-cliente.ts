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
      // BORRADOR, ENVIADA y cualquier otro → "Enviada" (pendiente de respuesta)
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
export async function getClienteActual(): Promise<ClientePortal | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, email, telefono, user_id')
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
    .select('id, nombre_proyecto, ubicacion, fecha, estado, iva_enabled, descuento, notas, cliente_id')
    .eq('id', id)
    .is('deleted_at', null)
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

  const raw = cotData as CotizacionPortal;

  return {
    ...raw,
    estado: mapEstadoCotizacion(raw.estado as string),
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

/// Dado un cliente, devuelve el estado de cuenta global:
/// suma total de cotizaciones (aceptadas/convertidas) vs suma total de pagos.
export async function getEstadoCuentaCliente(): Promise<{
  totalPresupuestado: number;
  totalPagado: number;
  totalSaldo: number;
}> {
  const supabase = await createClient();

  // Traer cotizaciones aceptadas con secciones+partidas para calcular total
  const { data: cotsData } = await supabase
    .from('cotizaciones')
    .select('id, descuento, iva_enabled, estado')
    .is('deleted_at', null)
    .in('estado', ['ACEPTADA', 'CONVERTIDA', 'ENVIADA', 'BORRADOR']);

  if (!cotsData || cotsData.length === 0) {
    return { totalPresupuestado: 0, totalPagado: 0, totalSaldo: 0 };
  }

  const cotIds = cotsData.map((c) => c.id as string);

  // Secciones
  const { data: secsData } = await supabase
    .from('secciones')
    .select('id, cotizacion_id')
    .in('cotizacion_id', cotIds)
    .is('deleted_at', null);

  const seccionesRaw = (secsData ?? []) as { id: string; cotizacion_id: string }[];
  const secIds = seccionesRaw.map((s) => s.id);

  // Partidas
  let partidasRaw: { seccion_id: string; cantidad: number; precio_unitario: number }[] = [];
  if (secIds.length > 0) {
    const { data: parsData } = await supabase
      .from('partidas')
      .select('seccion_id, cantidad, precio_unitario')
      .in('seccion_id', secIds)
      .is('deleted_at', null);

    partidasRaw = (parsData ?? []) as { seccion_id: string; cantidad: number; precio_unitario: number }[];
  }

  // Calcular presupuesto total de cada cotización
  let totalPresupuestado = 0;
  for (const cot of cotsData) {
    const misSecIds = seccionesRaw
      .filter((s) => s.cotizacion_id === cot.id)
      .map((s) => s.id);

    const subtotal = partidasRaw
      .filter((p) => misSecIds.includes(p.seccion_id))
      .reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0);

    const descuentoMonto = subtotal * ((cot.descuento ?? 0) / 100);
    const base = subtotal - descuentoMonto;
    const ivaMonto = cot.iva_enabled ? base * 0.16 : 0;
    totalPresupuestado += base + ivaMonto;
  }

  // Pagos de todas las cotizaciones
  const { data: pagosData } = await supabase
    .from('pagos')
    .select('monto')
    .in('cotizacion_id', cotIds)
    .is('deleted_at', null);

  const totalPagado = (pagosData ?? []).reduce((acc, p) => acc + (p.monto as number), 0);
  const totalSaldo = totalPresupuestado - totalPagado;

  return { totalPresupuestado, totalPagado, totalSaldo };
}

// ─── Re-exportar helpers de estado para las vistas ───────────────────────────

export { mapEstadoObra };
