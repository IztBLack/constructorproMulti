'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { BUCKET_POSTVENTA } from '@/lib/data/postventa';
import { MAX_DESCRIPCION, MAX_UBICACION, MIN_DESCRIPCION, mensajeErrorPostventa } from '@/lib/postventa/garantia';

/**
 * El cliente reporta un problema de garantía desde su portal (0043).
 *
 * Toda la validación que importa la hace la base: la RPC `reportar_garantia`
 * (que el usuario sea el cliente de ESA obra y de la misma empresa) y las
 * policies de `garantia_foto` y del bucket `postventa` (su carpeta, su reporte,
 * mientras siga abierto). Aquí solo se limpia lo que llega del navegador.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

export interface Resultado {
  ok: boolean;
  error?: string;
}

export async function reportarProblemaAction(
  obraId: string,
  id: string,
  descripcion: string,
  ubicacion: string,
): Promise<Resultado> {
  if (!UUID.test(obraId) || !UUID.test(id)) return { ok: false, error: 'Datos inválidos.' };
  const d = String(descripcion ?? '').trim();
  if (d.length < MIN_DESCRIPCION) return { ok: false, error: 'Cuéntanos qué pasa (al menos unas palabras).' };
  if (d.length > MAX_DESCRIPCION) return { ok: false, error: `Máximo ${MAX_DESCRIPCION} letras.` };
  const u = String(ubicacion ?? '').trim().slice(0, MAX_UBICACION);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reportar_garantia', {
    p_id: id,
    p_obra_id: obraId,
    p_descripcion: d,
    p_ubicacion: u,
  });
  if (error) return { ok: false, error: 'No se pudo enviar el reporte. Intenta de nuevo.' };
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) return { ok: false, error: r?.error ?? 'No se pudo enviar el reporte.' };
  revalidatePath(`/cliente/obras/${obraId}`);
  return { ok: true };
}

async function empresaDeObra(obraId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('obras').select('empresa_id').eq('id', obraId).maybeSingle();
  return (data as { empresa_id?: string } | null)?.empresa_id ?? null;
}

export async function crearUrlFotoGarantia(
  obraId: string,
  reporteId: string,
  tipo: string,
  bytes: number,
): Promise<Resultado & { path?: string; token?: string }> {
  if (!UUID.test(obraId) || !UUID.test(reporteId)) return { ok: false, error: 'Datos inválidos.' };
  if (!TIPOS.includes(tipo)) return { ok: false, error: 'Solo fotos JPG, PNG o WEBP.' };
  if (!bytes || bytes <= 0 || bytes > MAX_BYTES) return { ok: false, error: 'La foto pasa de 10 MB.' };
  const empresaId = await empresaDeObra(obraId);
  if (!empresaId) return { ok: false, error: 'No autorizado.' };

  const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg';
  const path = `${empresaId}/${obraId}/${reporteId}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET_POSTVENTA).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'No se pudo preparar la subida.' };
  return { ok: true, path: data.path, token: data.token };
}

export async function registrarFotoGarantia(
  obraId: string,
  reporteId: string,
  path: string,
  tipo: string,
  bytes: number,
  orden: number,
): Promise<Resultado> {
  if (!UUID.test(obraId) || !UUID.test(reporteId)) return { ok: false, error: 'Datos inválidos.' };
  if (!TIPOS.includes(tipo)) return { ok: false, error: 'Tipo de foto inválido.' };
  const empresaId = await empresaDeObra(obraId);
  if (!empresaId || !path.startsWith(`${empresaId}/${obraId}/${reporteId}/`)) {
    return { ok: false, error: 'Ruta de foto inválida.' };
  }
  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('garantia_foto').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    reporte_id: reporteId,
    path,
    mime: tipo,
    bytes: Math.min(Math.max(Math.round(bytes), 1), MAX_BYTES),
    subida_por_cliente: true,
    orden,
    created_at: ahora,
    updated_at: ahora,
  });
  // El cliente no puede borrar del bucket (evidencia): si esto falla, el
  // archivo queda sin fila y nadie lo muestra.
  if (error) return { ok: false, error: mensajeErrorPostventa(error.message) };
  revalidatePath(`/cliente/obras/${obraId}`);
  return { ok: true };
}
