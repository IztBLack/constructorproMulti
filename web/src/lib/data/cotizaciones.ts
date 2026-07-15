import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { buildSnapshot } from './cotizacion-diff';
import type { Cotizacion, CotizacionConDetalle, EstadoCotizacion, Partida, Seccion } from './types';

export async function listCotizaciones(): Promise<{
  data: Cotizacion[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*')
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Cotizacion[], error: null };
}

export async function getCotizacionConDetalle(
  id: string,
): Promise<{ data: CotizacionConDetalle | null; error: string | null }> {
  const supabase = await createClient();

  const { data: cotizacion, error: cotError } = await supabase
    .from('cotizaciones')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (cotError) return { data: null, error: cotError.message };
  if (!cotizacion) return { data: null, error: null };

  const { data: secciones, error: secError } = await supabase
    .from('secciones')
    .select('*')
    .eq('cotizacion_id', id)
    .is('deleted_at', null)
    .order('orden');

  if (secError) return { data: null, error: secError.message };

  const seccionesList = (secciones ?? []) as Seccion[];
  const seccionIds = seccionesList.map((s) => s.id);

  let partidas: Partida[] = [];
  if (seccionIds.length > 0) {
    const { data: partidasData, error: partError } = await supabase
      .from('partidas')
      .select('*')
      .in('seccion_id', seccionIds)
      .is('deleted_at', null)
      .order('orden');

    if (partError) return { data: null, error: partError.message };
    partidas = (partidasData ?? []) as Partida[];
  }

  const seccionesConPartidas = seccionesList.map((s) => ({
    ...s,
    partidas: partidas.filter((p) => p.seccion_id === s.id),
  }));

  return {
    data: { ...(cotizacion as Cotizacion), secciones: seccionesConPartidas },
    error: null,
  };
}

export interface TotalesCotizacion {
  subtotal: number;
  descuentoMonto: number;
  baseConDescuento: number;
  ivaMonto: number;
  total: number;
}

export function calcularTotales(cotizacion: CotizacionConDetalle): TotalesCotizacion {
  const subtotal = cotizacion.secciones.reduce(
    (accSeccion, seccion) =>
      accSeccion +
      seccion.partidas.reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0),
    0,
  );

  const descuentoPct = cotizacion.descuento ?? 0;
  const descuentoMonto = subtotal * (descuentoPct / 100);
  const baseConDescuento = subtotal - descuentoMonto;
  const ivaMonto = cotizacion.iva_enabled ? baseConDescuento * 0.16 : 0;
  const total = baseConDescuento + ivaMonto;

  return { subtotal, descuentoMonto, baseConDescuento, ivaMonto, total };
}

/// --- Escritura ---------------------------------------------------------
/// Convenciones (ver CLAUDE.md): id = crypto.randomUUID(), empresa_id obligatorio,
/// created_at/updated_at = Date.now(), soft delete vía deleted_at, sin server_updated_at/sync_status.

/// Datos de cabecera que el usuario edita. El `estado` NO se maneja aquí: una
/// cotización nueva nace en BORRADOR y las transiciones van por acciones
/// guiadas (`enviarCotizacion` / `cambiarEstadoCotizacion` / RPC del cliente).
export interface NuevaCotizacionInput {
  cliente: string;
  cliente_id: string | null;
  nombre_proyecto: string;
  ubicacion: string | null;
  fecha: number;
  iva_enabled: boolean;
  descuento: number;
  notas: string | null;
}

export async function crearCotizacion(
  input: NuevaCotizacionInput,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { empresaId } = await getEmpresaUsuario();

  const now = Date.now();
  const id = crypto.randomUUID();

  const { error } = await supabase.from('cotizaciones').insert({
    id,
    empresa_id: empresaId,
    cliente: input.cliente,
    cliente_id: input.cliente_id,
    nombre_proyecto: input.nombre_proyecto,
    ubicacion: input.ubicacion ?? '',
    fecha: input.fecha,
    estado: 'BORRADOR',
    iva_enabled: input.iva_enabled,
    descuento: input.descuento,
    notas: input.notas ?? '',
    obra_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (error) return { id: null, error: error.message };
  return { id, error: null };
}

export type ActualizarCotizacionInput = NuevaCotizacionInput;

export async function actualizarCotizacion(
  id: string,
  input: ActualizarCotizacionInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('cotizaciones')
    .update({
      cliente: input.cliente,
      cliente_id: input.cliente_id,
      nombre_proyecto: input.nombre_proyecto,
      ubicacion: input.ubicacion ?? '',
      fecha: input.fecha,
      iva_enabled: input.iva_enabled,
      descuento: input.descuento,
      notas: input.notas ?? '',
      updated_at: Date.now(),
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

/// Transiciones de estado permitidas desde el admin (además del envío y de la
/// respuesta del cliente vía RPC). BORRADOR sale solo por `enviarCotizacion`;
/// CONVERTIDA es terminal. El admin puede registrar manualmente una respuesta
/// (override) del cliente recibida por fuera del portal.
const TRANSICIONES_ADMIN: Record<EstadoCotizacion, EstadoCotizacion[]> = {
  BORRADOR: [],
  ENVIADA: ['BORRADOR', 'ACEPTADA', 'RECHAZADA'],
  ACEPTADA: ['BORRADOR', 'RECHAZADA'],
  RECHAZADA: ['BORRADOR', 'ENVIADA'],
  CONVERTIDA: [],
};

/// Envía la cotización al cliente: BORRADOR → ENVIADA. Valida que tenga un
/// cliente del portal vinculado (si no, no sería visible) y al menos una partida.
export async function enviarCotizacion(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: cot, error } = await supabase
    .from('cotizaciones')
    .select('estado, cliente_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!cot) return { error: 'Cotización no encontrada.' };
  if (cot.estado !== 'BORRADOR') {
    return { error: 'Solo se puede enviar una cotización en borrador.' };
  }
  if (!cot.cliente_id) {
    return {
      error: 'Vincula un cliente del portal antes de enviar (Editar → Cliente).',
    };
  }

  // Debe tener al menos una partida viva (secciones → partidas).
  const { data: secs, error: secErr } = await supabase
    .from('secciones')
    .select('id')
    .eq('cotizacion_id', id)
    .is('deleted_at', null);
  if (secErr) return { error: secErr.message };

  const secIds = (secs ?? []).map((s) => s.id as string);
  let tienePartidas = false;
  if (secIds.length > 0) {
    const { count, error: partErr } = await supabase
      .from('partidas')
      .select('id', { count: 'exact', head: true })
      .in('seccion_id', secIds)
      .is('deleted_at', null);
    if (partErr) return { error: partErr.message };
    tienePartidas = (count ?? 0) > 0;
  }
  if (!tienePartidas) {
    return { error: 'Agrega al menos una partida antes de enviar.' };
  }

  const { error: updErr } = await supabase
    .from('cotizaciones')
    .update({ estado: 'ENVIADA', updated_at: Date.now() })
    .eq('id', id);

  if (updErr) return { error: updErr.message };
  return { error: null };
}

/// Cambia el estado siguiendo `TRANSICIONES_ADMIN`. Al marcar ACEPTADA congela
/// la foto (snapshot) igual que el RPC del cliente, para habilitar la
/// re-aprobación de cambios posteriores.
export async function cambiarEstadoCotizacion(
  id: string,
  nuevo: EstadoCotizacion,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: cot, error } = await supabase
    .from('cotizaciones')
    .select('estado')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!cot) return { error: 'Cotización no encontrada.' };

  const permitidas = TRANSICIONES_ADMIN[cot.estado as EstadoCotizacion] ?? [];
  if (!permitidas.includes(nuevo)) {
    return { error: `Cambio de estado no permitido (${cot.estado} → ${nuevo}).` };
  }

  const patch: Record<string, unknown> = { estado: nuevo, updated_at: Date.now() };
  if (nuevo === 'ACEPTADA') {
    const { data: detalle } = await getCotizacionConDetalle(id);
    if (detalle) patch.aprobado_snapshot_json = JSON.stringify(buildSnapshot(detalle));
  }

  const { error: updErr } = await supabase.from('cotizaciones').update(patch).eq('id', id);
  if (updErr) return { error: updErr.message };
  return { error: null };
}

/// Convierte una cotización ACEPTADA en obra: crea la obra ligada, copia el
/// presupuesto conservando las secciones (partidas → obra_presupuesto con su
/// `seccion`) y marca la cotización como CONVERTIDA. Idempotente: si ya se
/// convirtió, devuelve la obra existente. Requiere la migración 0012 (columna
/// obra_presupuesto.seccion).
export async function convertirCotizacionEnObra(
  id: string,
): Promise<{ obraId: string | null; error: string | null }> {
  const supabase = await createClient();
  const { empresaId } = await getEmpresaUsuario();

  const { data: detalle, error } = await getCotizacionConDetalle(id);
  if (error) return { obraId: null, error };
  if (!detalle) return { obraId: null, error: 'Cotización no encontrada.' };

  // Idempotente: ya convertida.
  if (detalle.obra_id) return { obraId: detalle.obra_id, error: null };
  if (detalle.estado !== 'ACEPTADA') {
    return { obraId: null, error: 'Solo se puede convertir en obra una cotización aceptada.' };
  }

  const now = Date.now();
  const obraId = crypto.randomUUID();

  const { error: obraErr } = await supabase.from('obras').insert({
    id: obraId,
    empresa_id: empresaId,
    nombre: detalle.nombre_proyecto,
    cliente: detalle.cliente,
    cliente_id: detalle.cliente_id,
    ubicacion: detalle.ubicacion ?? '',
    fecha_inicio: now,
    activa: true,
    avance: 0,
    cotizacion_origen_id: id,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  if (obraErr) return { obraId: null, error: obraErr.message };

  // Copia el presupuesto conservando las secciones (orden global creciente).
  const filas = detalle.secciones.flatMap((s) =>
    s.partidas.map((p) => ({
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      obra_id: obraId,
      seccion: s.nombre,
      concepto: p.clave ? `${p.clave} ${p.descripcion}` : p.descripcion,
      unidad: p.unidad ?? '',
      cantidad: p.cantidad,
      precio_unitario: p.precio_unitario,
      orden: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })),
  );
  filas.forEach((f, idx) => {
    f.orden = idx;
  });

  if (filas.length > 0) {
    const { error: presErr } = await supabase.from('obra_presupuesto').insert(filas);
    if (presErr) return { obraId: null, error: presErr.message };
  }

  const { error: updErr } = await supabase
    .from('cotizaciones')
    .update({ estado: 'CONVERTIDA', obra_id: obraId, updated_at: now })
    .eq('id', id);
  if (updErr) return { obraId: null, error: updErr.message };

  return { obraId, error: null };
}

export async function eliminarCotizacion(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { data: secciones, error: secError } = await supabase
    .from('secciones')
    .select('id')
    .eq('cotizacion_id', id)
    .is('deleted_at', null);

  if (secError) return { error: secError.message };

  const seccionIds = (secciones ?? []).map((s) => s.id as string);

  if (seccionIds.length > 0) {
    const { error: partError } = await supabase
      .from('partidas')
      .update({ deleted_at: now, updated_at: now })
      .in('seccion_id', seccionIds)
      .is('deleted_at', null);

    if (partError) return { error: partError.message };

    const { error: secDelError } = await supabase
      .from('secciones')
      .update({ deleted_at: now, updated_at: now })
      .eq('cotizacion_id', id)
      .is('deleted_at', null);

    if (secDelError) return { error: secDelError.message };
  }

  const { error: pagosError } = await supabase
    .from('pagos')
    .update({ deleted_at: now, updated_at: now })
    .eq('cotizacion_id', id)
    .is('deleted_at', null);

  // La tabla `pagos` puede no existir o no tener la columna `cotizacion_id`; si falla por
  // eso, lo ignoramos para no bloquear el borrado de la cotización con sus secciones/partidas.
  const TABLA_O_COLUMNA_INEXISTENTE = ['42P01', '42703', 'PGRST205', 'PGRST204'];
  if (pagosError && !TABLA_O_COLUMNA_INEXISTENTE.includes(pagosError.code)) {
    return { error: pagosError.message };
  }

  const { error: cotError } = await supabase
    .from('cotizaciones')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (cotError) return { error: cotError.message };
  return { error: null };
}

export interface NuevaSeccionInput {
  cotizacion_id: string;
  nombre: string;
  orden: number;
}

export async function crearSeccion(
  input: NuevaSeccionInput,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { empresaId } = await getEmpresaUsuario();

  const now = Date.now();
  const id = crypto.randomUUID();

  const { error } = await supabase.from('secciones').insert({
    id,
    empresa_id: empresaId,
    cotizacion_id: input.cotizacion_id,
    nombre: input.nombre,
    orden: input.orden,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (error) return { id: null, error: error.message };
  return { id, error: null };
}

export async function actualizarSeccion(
  id: string,
  input: { nombre: string; orden: number },
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('secciones')
    .update({ nombre: input.nombre, orden: input.orden, updated_at: Date.now() })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function eliminarSeccion(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error: partError } = await supabase
    .from('partidas')
    .update({ deleted_at: now, updated_at: now })
    .eq('seccion_id', id)
    .is('deleted_at', null);

  if (partError) return { error: partError.message };

  const { error: secError } = await supabase
    .from('secciones')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (secError) return { error: secError.message };
  return { error: null };
}

export interface NuevaPartidaInput {
  seccion_id: string;
  clave: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  orden: number;
}

export async function crearPartida(
  input: NuevaPartidaInput,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { empresaId } = await getEmpresaUsuario();

  const now = Date.now();
  const id = crypto.randomUUID();

  const { error } = await supabase.from('partidas').insert({
    id,
    empresa_id: empresaId,
    seccion_id: input.seccion_id,
    clave: input.clave ?? '',
    descripcion: input.descripcion,
    unidad: input.unidad ?? '',
    cantidad: input.cantidad,
    precio_unitario: input.precio_unitario,
    orden: input.orden,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (error) return { id: null, error: error.message };
  return { id, error: null };
}

export type ActualizarPartidaInput = Omit<NuevaPartidaInput, 'seccion_id'>;

export async function actualizarPartida(
  id: string,
  input: ActualizarPartidaInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('partidas')
    .update({
      clave: input.clave ?? '',
      descripcion: input.descripcion,
      unidad: input.unidad ?? '',
      cantidad: input.cantidad,
      precio_unitario: input.precio_unitario,
      orden: input.orden,
      updated_at: Date.now(),
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function eliminarPartida(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('partidas')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}
