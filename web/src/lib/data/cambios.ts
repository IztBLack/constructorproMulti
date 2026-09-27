import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import {
  leerSnapshot,
  totalExtrasAprobados,
  type EstadoExtra,
  type OrdenCambio,
  type OrdenCambioConRenglones,
  type RenglonExtra,
  type SnapshotExtra,
} from '@/lib/cambios/extras';

/**
 * Acceso a los EXTRAS (órdenes de cambio, migración 0036). Las cuentas viven en
 * `lib/cambios/extras.ts`; aquí solo se lee y se escribe.
 *
 * Quién puede qué lo deciden las policies, los triggers y las RPC de 0036:
 *   · admin y supervisor crean y editan BORRADORES,
 *   · solo el admin envía y cancela (RPC),
 *   · el cliente responde (RPC `responder_orden_cambio`).
 * Este código no repite esas reglas: si alguien sin permiso llega, la base lo
 * rechaza y el mensaje sube tal cual.
 */

export interface Resultado {
  ok: boolean;
  error?: string;
}

const CAMPOS =
  'id, empresa_id, obra_id, folio, titulo, motivo, fecha, estado, foto_uri, texto_final, snapshot_json, total_enviado, enviado_at, respondido_at, respondido_nombre, motivo_rechazo, cancelado_at, created_at, deleted_at';
const CAMPOS_RENGLON = 'id, orden_cambio_id, concepto, unidad, cantidad, precio_unitario, orden';

export const PASO_ORDEN_EXTRA = 100;

/** Error de una RPC que devuelve {ok, error}. */
function deRpc(data: unknown, error: { message: string } | null, porDefecto: string): Resultado {
  if (error) return { ok: false, error: porDefecto };
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) return { ok: false, error: r?.error ?? porDefecto };
  return { ok: true };
}

// ── Lectura (oficina) ────────────────────────────────────────────────────────

export async function listExtrasObra(
  obraId: string,
): Promise<{ data: OrdenCambioConRenglones[]; error: string | null }> {
  const supabase = await createClient();
  const { data: ordenes, error } = await supabase
    .from('orden_cambio')
    .select(CAMPOS)
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('folio', { ascending: false });

  if (error) return { data: [], error: error.message };
  if (!ordenes || ordenes.length === 0) return { data: [], error: null };

  const { data: renglones, error: errR } = await supabase
    .from('orden_cambio_renglon')
    .select(CAMPOS_RENGLON)
    .in(
      'orden_cambio_id',
      ordenes.map((o) => o.id as string),
    )
    .is('deleted_at', null)
    .order('orden', { ascending: true });

  if (errR) return { data: [], error: errR.message };

  const porOrden = new Map<string, RenglonExtra[]>();
  for (const r of (renglones ?? []) as RenglonExtra[]) {
    const l = porOrden.get(r.orden_cambio_id);
    if (l) l.push(r);
    else porOrden.set(r.orden_cambio_id, [r]);
  }

  return {
    data: (ordenes as OrdenCambio[]).map((o) => ({ ...o, renglones: porOrden.get(o.id) ?? [] })),
    error: null,
  };
}

export async function getExtra(
  id: string,
): Promise<{ data: OrdenCambioConRenglones | null; error: string | null }> {
  const supabase = await createClient();
  const { data: orden, error } = await supabase
    .from('orden_cambio')
    .select(CAMPOS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!orden) return { data: null, error: null };

  const { data: renglones, error: errR } = await supabase
    .from('orden_cambio_renglon')
    .select(CAMPOS_RENGLON)
    .eq('orden_cambio_id', id)
    .is('deleted_at', null)
    .order('orden', { ascending: true });

  if (errR) return { data: null, error: errR.message };
  return {
    data: { ...(orden as OrdenCambio), renglones: (renglones ?? []) as RenglonExtra[] },
    error: null,
  };
}

/**
 * Extras APROBADOS de una obra, para el estado de cuenta (oficina). Mismo
 * resultado que ve el cliente: solo aprobados, con el total de su foto.
 */
export async function listExtrasAprobadosObra(
  obraId: string,
): Promise<{ data: ExtraAprobado[]; total: number; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orden_cambio')
    .select('id, folio, titulo, estado, total_enviado, respondido_at, deleted_at')
    .eq('obra_id', obraId)
    .eq('estado', 'APROBADA')
    .is('deleted_at', null)
    .order('folio', { ascending: true });

  if (error) return { data: [], total: 0, error: error.message };
  return aExtrasAprobados(data ?? []);
}

export interface ExtraAprobado {
  id: string;
  folio: number;
  titulo: string;
  total: number;
  aprobadoEl: number | null;
}

function aExtrasAprobados(
  filas: Record<string, unknown>[],
): { data: ExtraAprobado[]; total: number; error: null } {
  const ordenes = filas as unknown as (Pick<
    OrdenCambio,
    'id' | 'folio' | 'titulo' | 'estado' | 'total_enviado' | 'respondido_at' | 'deleted_at'
  >)[];
  return {
    data: ordenes
      .filter((o) => o.estado === 'APROBADA' && !o.deleted_at)
      .map((o) => ({
        id: o.id,
        folio: o.folio,
        titulo: o.titulo,
        total: Number(o.total_enviado ?? 0),
        aprobadoEl: o.respondido_at,
      })),
    total: totalExtrasAprobados(ordenes),
    error: null,
  };
}

// ── Escritura (oficina) ──────────────────────────────────────────────────────

export interface ExtraInput {
  titulo: string;
  motivo: string;
  fecha: number;
}

export interface RenglonExtraInput {
  concepto: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  orden: number;
}

export async function crearExtra(
  obraId: string,
  input: ExtraInput,
  renglones: RenglonExtraInput[] = [],
): Promise<{ id: string | null; error: string | null }> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const id = crypto.randomUUID();
  const now = Date.now();

  // El folio lo pone la base (trigger de 0036); no se manda.
  const { error } = await supabase.from('orden_cambio').insert({
    id,
    empresa_id: empresaId,
    obra_id: obraId,
    titulo: input.titulo,
    motivo: input.motivo,
    fecha: input.fecha,
    created_at: now,
    updated_at: now,
  });
  if (error) return { id: null, error: error.message };

  if (renglones.length > 0) {
    const { error: errR } = await supabase.from('orden_cambio_renglon').insert(
      renglones.map((r) => ({
        id: crypto.randomUUID(),
        empresa_id: empresaId,
        orden_cambio_id: id,
        ...r,
        created_at: now,
        updated_at: now,
      })),
    );
    if (errR) return { id, error: errR.message };
  }

  return { id, error: null };
}

export async function actualizarExtra(id: string, input: ExtraInput): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orden_cambio')
    .update({ ...input, updated_at: Date.now() })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  // La RLS solo deja editar borradores: 0 filas = ya se envió (o no es tuyo).
  if (!data || data.length === 0) {
    return { ok: false, error: 'Este extra ya no se puede cambiar: solo se editan los borradores.' };
  }
  return { ok: true };
}

/** Borrado lógico de un BORRADOR (lo enviado se cancela, no se borra). */
export async function eliminarExtra(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('orden_cambio')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Solo se borran los borradores. Un extra enviado se cancela.' };
  }
  return { ok: true };
}

export async function crearRenglonExtra(
  ordenId: string,
  input: RenglonExtraInput,
): Promise<Resultado> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase.from('orden_cambio_renglon').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    orden_cambio_id: ordenId,
    ...input,
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function actualizarRenglonExtra(
  renglonId: string,
  input: RenglonExtraInput,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('orden_cambio_renglon')
    .update({ ...input, updated_at: Date.now() })
    .eq('id', renglonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarRenglonExtra(renglonId: string): Promise<Resultado> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('orden_cambio_renglon')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', renglonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function enviarExtra(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('enviar_orden_cambio', { p_id: id });
  return deRpc(data, error, 'No se pudo enviar el extra. Intenta de nuevo.');
}

export async function cancelarExtra(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancelar_orden_cambio', { p_id: id });
  return deRpc(data, error, 'No se pudo cancelar el extra. Intenta de nuevo.');
}

/**
 * Hace un BORRADOR nuevo con lo mismo que otro extra. Es la forma de "corregir"
 * uno ya enviado o rechazado: el original se queda como está (es la evidencia de
 * lo que vio el cliente) y el nuevo sale con el siguiente folio.
 *
 * Si el original ya se envió, se copia de su FOTO — lo que el cliente vio —, no
 * de los renglones vivos.
 */
export async function duplicarExtra(id: string): Promise<{ id: string | null; error: string | null }> {
  const { data: original, error } = await getExtra(id);
  if (error) return { id: null, error };
  if (!original) return { id: null, error: 'Extra no encontrado.' };

  const foto = leerSnapshot(original.snapshot_json);
  const renglones: RenglonExtraInput[] = foto
    ? foto.renglones.map((r, i) => ({
        concepto: r.concepto,
        unidad: r.unidad,
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario,
        orden: (i + 1) * PASO_ORDEN_EXTRA,
      }))
    : original.renglones.map((r) => ({
        concepto: r.concepto,
        unidad: r.unidad,
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario,
        orden: r.orden,
      }));

  return crearExtra(
    original.obra_id,
    {
      titulo: foto?.titulo ?? original.titulo,
      motivo: foto?.motivo ?? original.motivo,
      fecha: Date.now(),
    },
    renglones,
  );
}

// ── Foto (bucket `extras`, 0036) ─────────────────────────────────────────────

export const BUCKET_EXTRAS = 'extras';
export const MAX_BYTES_FOTO = 10 * 1024 * 1024;
export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export async function fijarFotoExtra(id: string, uri: string | null): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orden_cambio')
    .update({ foto_uri: uri, updated_at: Date.now() })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'La foto solo se cambia mientras el extra es borrador.' };
  }
  return { ok: true };
}

/** URL firmada (1 hora). Corre con la sesión: la policy del bucket decide. */
export async function urlFotoExtra(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET_EXTRAS).createSignedUrl(uri, 60 * 60);
  return data?.signedUrl ?? null;
}

// ── Portal del cliente ───────────────────────────────────────────────────────

export interface ExtraPortal {
  id: string;
  folio: number;
  estado: Exclude<EstadoExtra, 'BORRADOR' | 'CANCELADA'>;
  enviadoEl: number | null;
  respondidoEl: number | null;
  respondidoPor: string | null;
  motivoRechazo: string | null;
  foto: SnapshotExtra;
  total: number;
  fotoUrl: string | null;
}

/**
 * Extras de una obra VISTOS POR EL CLIENTE. La RLS de 0036 ya deja pasar solo
 * los suyos y solo enviados/aprobados/rechazados; el filtro de estado aquí es
 * defensa en profundidad. Todo sale de la FOTO: el cliente ve lo que se le
 * mandó, no lo que haya en los renglones.
 */
export async function listExtrasObraCliente(obraId: string): Promise<ExtraPortal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orden_cambio')
    .select(
      'id, folio, estado, snapshot_json, total_enviado, enviado_at, respondido_at, respondido_nombre, motivo_rechazo, foto_uri',
    )
    .eq('obra_id', obraId)
    .in('estado', ['ENVIADA', 'APROBADA', 'RECHAZADA'])
    .is('deleted_at', null)
    .order('folio', { ascending: false });

  if (error || !data) return [];

  const extras: ExtraPortal[] = [];
  for (const o of data) {
    const foto = leerSnapshot(o.snapshot_json);
    if (!foto) continue;
    extras.push({
      id: o.id as string,
      folio: o.folio as number,
      estado: o.estado as ExtraPortal['estado'],
      enviadoEl: (o.enviado_at as number | null) ?? null,
      respondidoEl: (o.respondido_at as number | null) ?? null,
      respondidoPor: (o.respondido_nombre as string | null) ?? null,
      motivoRechazo: (o.motivo_rechazo as string | null) ?? null,
      foto,
      total: Number(o.total_enviado ?? foto.total),
      fotoUrl: await urlFotoExtra((o.foto_uri as string | null) ?? null),
    });
  }
  return extras;
}

/** Extras aprobados de una obra, con la sesión del CLIENTE (RLS de 0036). */
export async function listExtrasAprobadosCliente(
  obraId: string,
): Promise<{ data: ExtraAprobado[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orden_cambio')
    .select('id, folio, titulo, estado, total_enviado, respondido_at, deleted_at')
    .eq('obra_id', obraId)
    .eq('estado', 'APROBADA')
    .is('deleted_at', null)
    .order('folio', { ascending: true });
  if (error || !data) return { data: [], total: 0 };
  const r = aExtrasAprobados(data);
  return { data: r.data, total: r.total };
}

export async function responderExtra(
  id: string,
  aprobar: boolean,
  motivo: string | null,
): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('responder_orden_cambio', {
    p_id: id,
    p_aprobar: aprobar,
    p_motivo: motivo,
  });
  return deRpc(data, error, 'Ocurrió un error al registrar tu respuesta. Intenta de nuevo.');
}
