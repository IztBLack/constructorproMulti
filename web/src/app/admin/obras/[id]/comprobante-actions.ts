'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';

const BUCKET = 'comprobantes';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, igual que el límite del bucket
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export interface ResultadoComprobante {
  ok: boolean;
  error?: string;
}

/**
 * Sube el comprobante de un movimiento al bucket privado y guarda su ruta en
 * `movimientos.comprobante_uri`.
 *
 * Quién puede: solo oficina (admin/supervisor/contador). Lo impone la policy del
 * bucket (0024) y la comprobación de rol de abajo es solo para dar un mensaje
 * entendible en vez de un error crudo de Storage.
 *
 * La ruta empieza con el empresa_id porque la policy valida el rol contra ese
 * primer segmento (`storage.foldername(name)[1]`). No es cosmético: es la línea
 * que impide que la empresa A lea comprobantes de la B.
 */
export async function subirComprobante(
  obraId: string,
  movimientoId: string,
  formData: FormData,
): Promise<ResultadoComprobante> {
  const file = formData.get('comprobante') as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: 'Elige un archivo.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'El archivo pasa de 10 MB.' };
  }
  if (!TIPOS_OK.includes(file.type)) {
    return { ok: false, error: 'Solo imágenes (JPG, PNG, WEBP) o PDF.' };
  }

  let empresaId: string;
  let rol: string;
  try {
    ({ empresaId, rol } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
  if (!['admin', 'supervisor', 'contador'].includes(rol)) {
    return { ok: false, error: 'No tienes permiso para subir comprobantes.' };
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const path = `${empresaId}/${obraId}/${movimientoId}-${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    return { ok: false, error: `No se pudo subir: ${upErr.message}` };
  }

  const { error: dbErr } = await supabase
    .from('movimientos')
    .update({ comprobante_uri: path, updated_at: Date.now() })
    .eq('id', movimientoId);

  if (dbErr) {
    // Si no se pudo enlazar, se borra el objeto para no dejar basura huérfana.
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: dbErr.message };
  }

  revalidatePath(`/admin/obras/${obraId}`);
  return { ok: true };
}

/** Quita el comprobante: borra el objeto y limpia la columna. */
export async function quitarComprobante(
  obraId: string,
  movimientoId: string,
  uri: string,
): Promise<ResultadoComprobante> {
  const supabase = await createClient();

  // Se limpia la columna primero: si el borrado del objeto falla, al menos no
  // queda una referencia a algo que ya no debería mostrarse.
  const { error: dbErr } = await supabase
    .from('movimientos')
    .update({ comprobante_uri: null, updated_at: Date.now() })
    .eq('id', movimientoId);
  if (dbErr) return { ok: false, error: dbErr.message };

  await supabase.storage.from(BUCKET).remove([uri]);

  revalidatePath(`/admin/obras/${obraId}`);
  return { ok: true };
}

/** URL firmada (1 hora) para ver un comprobante. Null si falla. */
export async function urlComprobante(uri: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(uri, 60 * 60);
  return data?.signedUrl ?? null;
}
