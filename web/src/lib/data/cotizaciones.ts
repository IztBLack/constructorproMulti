import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { buildSnapshot } from './cotizacion-diff';
import { getEmpresaConfig } from './empresa-config';
import { IVA_POR_DEFECTO } from './types';
import type { Cotizacion, CotizacionConDetalle, EstadoCotizacion, Partida, Seccion } from './types';
import { generarClave } from '@/lib/cotizacion/clave-generator';
import type { ParsedConcepto } from '@/lib/cotizacion/text-import-parser';

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
  /** Tasa aplicada, para poder rotularla ("IVA (16%)") sin volver a suponerla. */
  ivaPct: number;
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

  // La tasa sale de la COTIZACIÓN, no de la configuración de la empresa: cada
  // una guarda la suya (migración 0017) para que cambiar el IVA por defecto no
  // reescriba el total de documentos ya enviados y aceptados por un cliente.
  // El `?? IVA_POR_DEFECTO` cubre las filas leídas antes de aplicar 0017.
  const ivaPct = cotizacion.iva_porcentaje ?? IVA_POR_DEFECTO;
  const ivaMonto = cotizacion.iva_enabled ? baseConDescuento * (ivaPct / 100) : 0;
  const total = baseConDescuento + ivaMonto;

  return { subtotal, descuentoMonto, baseConDescuento, ivaMonto, ivaPct, total };
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
    // Se CONGELA la tasa vigente de la empresa en el momento de crearla. A
    // partir de aquí esta cotización es inmune a que se cambie el IVA por
    // defecto: lo que el cliente reciba y acepte seguirá cuadrando siempre.
    // `actualizarCotizacion` tampoco la toca, a propósito.
    iva_porcentaje: (await getEmpresaConfig()).ivaPorcentaje,
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

// ── Paridad con la app móvil ────────────────────────────────────────────────
// Funciones que hasta ahora solo existían en el móvil, portadas con el mismo
// comportamiento (ver `lib/data/repositories_cotizacion.dart`).

/**
 * Duplica una cotización: copia encabezado + secciones + partidas con ids nuevos.
 * Nace como BORRADOR con fecha de hoy y SIN obra ligada; no copia pagos, archivos
 * ni el snapshot de aprobación. Conserva la tasa de IVA CONGELADA del original
 * (no la re-congela de la empresa), para no reescribir el precio de la copia.
 */
export async function duplicarCotizacion(
  id: string,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { empresaId } = await getEmpresaUsuario();

  const { data: origen, error } = await getCotizacionConDetalle(id);
  if (error) return { id: null, error };
  if (!origen) return { id: null, error: 'Cotización no encontrada.' };

  const now = Date.now();
  const nuevaId = crypto.randomUUID();

  const { error: cotErr } = await supabase.from('cotizaciones').insert({
    id: nuevaId,
    empresa_id: empresaId,
    cliente: origen.cliente,
    cliente_id: origen.cliente_id,
    nombre_proyecto: `${origen.nombre_proyecto} (copia)`,
    ubicacion: origen.ubicacion ?? '',
    fecha: now,
    estado: 'BORRADOR',
    iva_enabled: origen.iva_enabled,
    iva_porcentaje: origen.iva_porcentaje ?? IVA_POR_DEFECTO,
    descuento: origen.descuento,
    notas: origen.notas ?? '',
    obra_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  if (cotErr) return { id: null, error: cotErr.message };

  for (const s of origen.secciones) {
    const nuevaSecId = crypto.randomUUID();
    const { error: secErr } = await supabase.from('secciones').insert({
      id: nuevaSecId,
      empresa_id: empresaId,
      cotizacion_id: nuevaId,
      nombre: s.nombre,
      orden: s.orden,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    if (secErr) return { id: null, error: secErr.message };

    const filas = s.partidas.map((p) => ({
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      seccion_id: nuevaSecId,
      clave: p.clave ?? '',
      descripcion: p.descripcion,
      unidad: p.unidad ?? '',
      cantidad: p.cantidad,
      precio_unitario: p.precio_unitario,
      orden: p.orden,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }));
    if (filas.length > 0) {
      const { error: partErr } = await supabase.from('partidas').insert(filas);
      if (partErr) return { id: null, error: partErr.message };
    }
  }

  return { id: nuevaId, error: null };
}

/**
 * Liga una cotización a una obra que YA existe (distinto de convertir, que crea
 * una obra nueva y copia el presupuesto). Solo escribe `obra_id`. La obra debe
 * ser de la misma empresa (lo garantiza la RLS + la lista de origen).
 */
export async function vincularCotizacionAObra(
  cotId: string,
  obraId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: cot, error } = await supabase
    .from('cotizaciones')
    .select('id, estado, obra_id')
    .eq('id', cotId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!cot) return { error: 'Cotización no encontrada.' };
  if (cot.obra_id) return { error: 'Esta cotización ya está ligada a una obra.' };
  if (cot.estado === 'CONVERTIDA') return { error: 'Esta cotización ya se convirtió en obra.' };

  const { error: updErr } = await supabase
    .from('cotizaciones')
    .update({ obra_id: obraId, updated_at: Date.now() })
    .eq('id', cotId);
  if (updErr) return { error: updErr.message };
  return { error: null };
}

/**
 * Ajuste global de precios: multiplica el `precio_unitario` de TODAS las partidas
 * por `factor` (= 1 + pct/100). No toca cantidades ni redondea (igual que el
 * móvil). Se exige `factor > 0` — el móvil no lo hacía, pero un factor ≤ 0
 * dejaría precios en cero o negativos.
 */
export async function ajustarPreciosCotizacion(
  cotId: string,
  factor: number,
): Promise<{ n: number; error: string | null }> {
  if (!(factor > 0)) {
    return { n: 0, error: 'El ajuste dejaría precios en cero o negativos.' };
  }
  const supabase = await createClient();

  const { data: detalle, error } = await getCotizacionConDetalle(cotId);
  if (error) return { n: 0, error };
  if (!detalle) return { n: 0, error: 'Cotización no encontrada.' };

  const partidas = detalle.secciones.flatMap((s) => s.partidas);
  const now = Date.now();
  let n = 0;
  for (const p of partidas) {
    const { error: updErr } = await supabase
      .from('partidas')
      .update({ precio_unitario: p.precio_unitario * factor, updated_at: now })
      .eq('id', p.id);
    if (updErr) return { n, error: updErr.message };
    n++;
  }
  return { n, error: null };
}

/**
 * Inserta partidas parseadas de texto pegado en una sección. Genera la clave de
 * cada una con el mismo generador del móvil, acumulando para no colisionar entre
 * sí ni con las claves ya existentes de la cotización. Se agregan al final (orden
 * después de la última partida de la sección).
 */
export async function importarPartidasTexto(
  seccionId: string,
  conceptos: ParsedConcepto[],
): Promise<{ n: number; error: string | null }> {
  if (conceptos.length === 0) return { n: 0, error: 'No hay partidas que importar.' };
  const supabase = await createClient();
  const { empresaId } = await getEmpresaUsuario();

  const { data: sec, error: secErr } = await supabase
    .from('secciones')
    .select('cotizacion_id')
    .eq('id', seccionId)
    .maybeSingle();
  if (secErr) return { n: 0, error: secErr.message };
  if (!sec) return { n: 0, error: 'Sección no encontrada.' };

  const { data: detalle } = await getCotizacionConDetalle(sec.cotizacion_id as string);
  const claves = detalle
    ? detalle.secciones
        .flatMap((s) => s.partidas.map((p) => p.clave ?? ''))
        .filter((c) => c.length > 0)
    : [];
  const seccionActual = detalle?.secciones.find((s) => s.id === seccionId);
  let orden =
    seccionActual && seccionActual.partidas.length > 0
      ? Math.max(...seccionActual.partidas.map((p) => p.orden)) + 1
      : 0;

  const now = Date.now();
  const filas = conceptos.map((c) => {
    const clave = generarClave(c.nombre, claves);
    claves.push(clave);
    return {
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      seccion_id: seccionId,
      clave,
      descripcion: c.nombre,
      unidad: c.unidad,
      cantidad: c.cantidad,
      precio_unitario: c.precioUnitario,
      orden: orden++,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  });

  const { error: insErr } = await supabase.from('partidas').insert(filas);
  if (insErr) return { n: 0, error: insErr.message };
  return { n: filas.length, error: null };
}

/**
 * "Aportado" (gasto real) por partida: suma de las SALIDAS ligadas a esa partida
 * vía `movimientos.partida_id`, para la cotización dada. Devuelve un mapa
 * partida_id → monto gastado. Las ENTRADAS y las salidas sin partida no cuentan.
 */
export async function aportadoPorCotizacion(cotId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('movimientos')
    .select('monto, partida_id')
    .eq('cotizacion_id', cotId)
    .eq('tipo', 'SALIDA')
    .not('partida_id', 'is', null)
    .is('deleted_at', null);

  if (error || !data) return {};

  const map: Record<string, number> = {};
  for (const m of data) {
    const pid = m.partida_id as string;
    map[pid] = (map[pid] ?? 0) + (m.monto as number);
  }
  return map;
}
