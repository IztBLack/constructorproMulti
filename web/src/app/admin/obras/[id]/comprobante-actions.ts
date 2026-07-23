'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';

const BUCKET = 'comprobantes';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, igual que el límite del bucket
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ROLES_OFICINA = ['admin', 'supervisor', 'contador'];

export interface ResultadoComprobante {
  ok: boolean;
  error?: string;
}

export interface UrlSubidaComprobante {
  ok: boolean;
  error?: string;
  path?: string;
  token?: string;
}

/**
 * Paso 1 de la subida: valida el permiso y devuelve una URL de subida FIRMADA
 * para que el navegador suba el archivo DIRECTO a Storage.
 *
 * Por qué directo y no por el Server Action: el cuerpo de un Server Action está
 * limitado a ~1 MB (y Vercel corta el request a 4.5 MB), así que una foto de
 * comprobante de varios MB dejaba la subida colgada. Con este esquema el archivo
 * NO pasa por el servidor: solo viajan el nombre, el tipo y el tamaño para poder
 * firmar la ruta y validar.
 *
 * La ruta empieza con el empresa_id porque la policy del bucket (0024) valida el
 * rol contra ese primer segmento. Se construye aquí, en el servidor, para que el
 * cliente no pueda apuntar a la carpeta de otra empresa.
 */
export async function crearUrlSubidaComprobante(
  obraId: string,
  movimientoId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<UrlSubidaComprobante> {
  if (!fileSize || fileSize === 0) {
    return { ok: false, error: 'Elige un archivo.' };
  }
  if (fileSize > MAX_BYTES) {
    return { ok: false, error: 'El archivo pasa de 10 MB.' };
  }
  if (!TIPOS_OK.includes(fileType)) {
    return { ok: false, error: 'Solo imágenes (JPG, PNG, WEBP) o PDF.' };
  }

  let empresaId: string;
  let rol: string;
  try {
    ({ empresaId, rol } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
  if (!ROLES_OFICINA.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para subir comprobantes.' };
  }

  const supabase = await createClient();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const path = `${empresaId}/${obraId}/${movimientoId}-${crypto.randomUUID()}-${safeName}`;

  // La firma corre con la sesión del usuario, así que la policy INSERT del bucket
  // sigue siendo la barrera real: si no es oficina de esta empresa, falla aquí.
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: `No se pudo preparar la subida: ${error?.message ?? 'desconocido'}` };
  }
  return { ok: true, path: data.path, token: data.token };
}

/**
 * Paso 2: una vez que el navegador subió el archivo a `path`, enlaza esa ruta al
 * movimiento en la base.
 *
 * Revalida el rol y que la ruta caiga DENTRO de la carpeta de esta empresa/obra,
 * para que un cliente manipulado no pueda enlazar una ruta arbitraria (la SELECT
 * policy ya la aislaría por empresa, pero no se deja pasar de largo).
 */
export async function registrarComprobante(
  obraId: string,
  movimientoId: string,
  path: string,
): Promise<ResultadoComprobante> {
  let empresaId: string;
  let rol: string;
  try {
    ({ empresaId, rol } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
  if (!ROLES_OFICINA.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para subir comprobantes.' };
  }
  if (!path.startsWith(`${empresaId}/${obraId}/`)) {
    return { ok: false, error: 'Ruta de comprobante inválida.' };
  }

  const supabase = await createClient();
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
