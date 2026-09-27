'use client';

import { createClient } from '@/lib/supabase/client';
import { comprimirFoto } from '@/lib/imagen/comprimir';
import { BUCKET_BITACORA } from '@/lib/bitacora/bitacora';
import { crearUrlSubidaFoto, registrarFoto } from './actions';

/**
 * Sube fotos a una entrada: comprime en el navegador → pide URL firmada →
 * sube directo a Storage → registra la fila. Una por una, para que una foto
 * mala no tumbe a las demás, y devuelve cuántas entraron y qué falló.
 */
export async function subirFotosEntrada(
  obraId: string,
  entradaId: string,
  archivos: File[],
  ordenInicial: number,
  alAvanzar?: (hechas: number, total: number) => void,
): Promise<{ subidas: number; errores: string[] }> {
  const supabase = createClient();
  const errores: string[] = [];
  let subidas = 0;

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    alAvanzar?.(i, archivos.length);
    const lista = await comprimirFoto(archivo);
    if (!lista) {
      errores.push(`${archivo.name}: no es una foto JPG, PNG o WEBP.`);
      continue;
    }

    const prep = await crearUrlSubidaFoto(obraId, entradaId, lista.tipo, lista.blob.size);
    if (!prep.ok || !prep.path || !prep.token) {
      errores.push(`${archivo.name}: ${prep.error ?? 'no se pudo preparar la subida.'}`);
      continue;
    }

    const { error: upErr } = await supabase.storage
      .from(BUCKET_BITACORA)
      .uploadToSignedUrl(prep.path, prep.token, lista.blob, { contentType: lista.tipo });
    if (upErr) {
      errores.push(`${archivo.name}: no se pudo subir (${upErr.message}).`);
      continue;
    }

    const r = await registrarFoto(obraId, entradaId, prep.path, lista.tipo, lista.blob.size, ordenInicial + i);
    if (!r.ok) {
      errores.push(`${archivo.name}: ${r.error ?? 'no se pudo guardar.'}`);
      continue;
    }
    subidas++;
  }
  alAvanzar?.(archivos.length, archivos.length);
  return { subidas, errores };
}
