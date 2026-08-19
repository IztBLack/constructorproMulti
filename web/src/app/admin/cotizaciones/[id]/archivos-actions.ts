'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/// Tipos permitidos, igual que en `obras/[id]/comprobante-actions.ts`.
///
/// Es una LISTA BLANCA y va del lado del servidor. El `accept` del `<input>` en
/// `archivos-section.tsx` es una sugerencia para el selector de archivos, no una
/// barrera: quien mande el FormData a mano lo ignora. Sin esto se podía guardar
/// un `text/html` en el bucket y quedarse con una URL firmada que lo sirve.
const TIPOS_OK = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];

/// Sube un archivo adjunto a una cotización.
/// Lee el File del FormData, valida tamaño, sube al bucket y registra en archivos_cotizacion.
export async function subirArchivoAction(
  cotizacionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get('archivo') as File | null;

  if (!file || file.size === 0) {
    return { ok: false, error: 'Selecciona un archivo antes de subir.' };
  }

  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'El archivo supera el límite de 15 MB.' };
  }

  if (!TIPOS_OK.includes(file.type)) {
    return { ok: false, error: 'Solo imágenes (JPG, PNG, WEBP, HEIC) o PDF.' };
  }

  let empresaId: string;
  try {
    const empresa = await getEmpresaUsuario();
    empresaId = empresa.empresaId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  // Validar formato UUID de cotizacionId (evita segmentos raros en la ruta de
  // Storage) y verificar que la cotización pertenezca a la empresa del usuario.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(cotizacionId)) {
    return { ok: false, error: 'Cotización inválida.' };
  }

  const supabase = await createClient();

  const { data: cot } = await supabase
    .from('cotizaciones')
    .select('id')
    .eq('id', cotizacionId)
    .eq('empresa_id', empresaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cot) {
    return { ok: false, error: 'Cotización no encontrada.' };
  }

  // Construir la ruta: {empresa_id}/{cotizacion_id}/{uuid}-{nombreArchivo}
  const uuid = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${empresaId}/${cotizacionId}/${uuid}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('cotizaciones')
    // `file.type` ya pasó por TIPOS_OK, así que aquí no entra nada arbitrario.
    // El bucket lo vuelve a validar (migración 0028): esta es la primera de dos.
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    console.error('[subirArchivoAction] upload:', uploadError.message);
    return { ok: false, error: 'No se pudo subir el archivo. Intenta de nuevo.' };
  }

  const now = Date.now();
  const id = crypto.randomUUID();

  // `file.type` ya viene validado contra TIPOS_OK, así que aquí no hace falta
  // el respaldo por extensión que había antes.
  const tipo = file.type;

  const { error: dbError } = await supabase.from('archivos_cotizacion').insert({
    id,
    cotizacion_id: cotizacionId,
    empresa_id: empresaId,
    tipo,
    nombre: file.name,
    uri: path,
    fecha_agregado: now,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (dbError) {
    // Intentar limpiar el objeto ya subido para no dejar huérfanos
    await supabase.storage.from('cotizaciones').remove([path]);
    console.error('[subirArchivoAction] db:', dbError.message);
    return { ok: false, error: 'No se pudo registrar el archivo. Intenta de nuevo.' };
  }

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { ok: true };
}

/// Soft-delete la fila en archivos_cotizacion y borra el objeto del bucket.
export async function eliminarArchivoAction(
  id: string,
  uri: string,
  cotizacionId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();

  // Deriva el uri REAL desde la fila (por id, acotado por RLS a la empresa), en
  // vez de confiar en el `uri` que manda el cliente: así no se puede borrar del
  // bucket un objeto distinto al referenciado por `id`.
  const { data: fila } = await supabase
    .from('archivos_cotizacion')
    .select('uri')
    .eq('id', id)
    .maybeSingle();
  const uriReal = (fila?.uri as string | undefined) ?? uri;

  const { error: dbError } = await supabase
    .from('archivos_cotizacion')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null);

  if (dbError) {
    console.error('[eliminarArchivoAction] db:', dbError.message);
    return { ok: false, error: 'No se pudo eliminar el registro. Intenta de nuevo.' };
  }

  // Borrar el objeto del bucket (error no crítico; el registro ya está soft-deleted)
  await supabase.storage.from('cotizaciones').remove([uriReal]);

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { ok: true };
}

/// Genera una signed URL válida por 1 hora y la devuelve al cliente.
/// Se expone como Server Action para que el componente cliente pueda solicitarla sin exponer credenciales.
export async function obtenerUrlDescargaAction(
  uri: string,
): Promise<{ url: string | null; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from('cotizaciones')
    .createSignedUrl(uri, 60 * 60);

  if (error) {
    console.error('[obtenerUrlDescargaAction] signedUrl:', error.message);
    return { url: null, error: 'No se pudo generar el enlace de descarga.' };
  }
  return { url: data.signedUrl };
}
