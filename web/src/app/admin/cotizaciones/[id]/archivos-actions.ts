'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

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

  let empresaId: string;
  try {
    const empresa = await getEmpresaUsuario();
    empresaId = empresa.empresaId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  // Construir la ruta: {empresa_id}/{cotizacion_id}/{uuid}-{nombreArchivo}
  const uuid = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${empresaId}/${cotizacionId}/${uuid}-${safeName}`;

  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from('cotizaciones')
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return { ok: false, error: `Error al subir el archivo: ${uploadError.message}` };
  }

  const now = Date.now();
  const id = crypto.randomUUID();

  // Determinar el tipo: preferir mime-type, si está vacío usar extensión
  const tipo = file.type || (file.name.split('.').pop() ?? 'application/octet-stream');

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
    return { ok: false, error: `Error al registrar el archivo: ${dbError.message}` };
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

  const { error: dbError } = await supabase
    .from('archivos_cotizacion')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null);

  if (dbError) {
    return { ok: false, error: `No se pudo eliminar el registro: ${dbError.message}` };
  }

  // Borrar el objeto del bucket (error no crítico; el registro ya está soft-deleted)
  await supabase.storage.from('cotizaciones').remove([uri]);

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

  if (error) return { url: null, error: error.message };
  return { url: data.signedUrl };
}
