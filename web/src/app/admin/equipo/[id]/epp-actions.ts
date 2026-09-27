'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { BUCKET_SEGURIDAD } from '@/lib/data/seguridad';
import { fechaInputAMs } from '@/lib/data/tz';
import { limpiarArticulo } from '@/lib/seguridad/epp';

/**
 * Entrega de EPP a un colaborador (0043, NOM-017-STPS-2024 num. 5.12). La RLS
 * exige admin/supervisor, colaborador y obra de la misma empresa, y que la
 * evidencia caiga en la carpeta `<empresa>/epp/<entrega>/`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

export interface Resultado {
  ok: boolean;
  error?: string;
}

async function oficina(): Promise<{ empresaId: string } | { error: string }> {
  try {
    const { empresaId, rol } = await getEmpresaUsuario();
    if (rol !== 'admin' && rol !== 'supervisor') return { error: 'Solo el administrador o un supervisor.' };
    return { empresaId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }
}

function mensaje(msg: string): string {
  if (/row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/check constraint/i.test(msg)) return 'Algún dato no es válido.';
  return 'No se pudo guardar. Intenta de nuevo.';
}

export interface EntregaInput {
  id: string;
  articulo: string;
  cantidad: number;
  fecha: string;
  obraId: string | null;
  entregoNombre: string;
  notas: string;
}

export async function registrarEntregaEpp(colaboradorId: string, input: EntregaInput): Promise<Resultado> {
  const q = await oficina();
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(input.id) || !UUID.test(colaboradorId)) return { ok: false, error: 'Identificador inválido.' };
  const articulo = limpiarArticulo(input.articulo);
  if (!articulo) return { ok: false, error: 'Escribe qué se entregó.' };
  if (!Number.isInteger(input.cantidad) || input.cantidad < 1 || input.cantidad > 1000) {
    return { ok: false, error: 'La cantidad no es válida.' };
  }
  if (!FECHA.test(input.fecha)) return { ok: false, error: 'Elige el día.' };
  if (input.obraId !== null && !UUID.test(input.obraId)) return { ok: false, error: 'Obra inválida.' };

  const supabase = await createClient();
  const ahora = Date.now();
  const { error } = await supabase.from('epp_entrega').insert({
    id: input.id,
    empresa_id: q.empresaId,
    colaborador_id: colaboradorId,
    obra_id: input.obraId,
    articulo,
    cantidad: input.cantidad,
    fecha: fechaInputAMs(input.fecha),
    entrego_nombre: String(input.entregoNombre ?? '').trim().slice(0, 120),
    notas: String(input.notas ?? '').trim().slice(0, 500),
    created_at: ahora,
    updated_at: ahora,
  });
  if (error && error.code !== '23505') return { ok: false, error: mensaje(error.message) };
  revalidatePath(`/admin/equipo/${colaboradorId}`);
  return { ok: true };
}

export async function crearUrlEvidenciaEpp(
  entregaId: string,
  tipo: string,
  bytes: number,
): Promise<Resultado & { path?: string; token?: string }> {
  const q = await oficina();
  if ('error' in q) return { ok: false, error: q.error };
  if (!UUID.test(entregaId)) return { ok: false, error: 'Entrega inválida.' };
  if (!TIPOS.includes(tipo)) return { ok: false, error: 'Solo imágenes JPG, PNG o WEBP.' };
  if (!bytes || bytes <= 0 || bytes > MAX_BYTES) return { ok: false, error: 'El archivo pasa de 10 MB o está vacío.' };
  const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg';
  const path = `${q.empresaId}/epp/${entregaId}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET_SEGURIDAD).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'No se pudo preparar la subida.' };
  return { ok: true, path: data.path, token: data.token };
}

export async function ligarEvidenciaEpp(
  colaboradorId: string,
  entregaId: string,
  path: string,
  tipo: 'FIRMA' | 'FOTO',
): Promise<Resultado> {
  const q = await oficina();
  if ('error' in q) return { ok: false, error: q.error };
  if (tipo !== 'FIRMA' && tipo !== 'FOTO') return { ok: false, error: 'Tipo inválido.' };
  if (!path.startsWith(`${q.empresaId}/epp/${entregaId}/`)) return { ok: false, error: 'Ruta inválida.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('epp_entrega')
    .update({ evidencia_path: path, evidencia_tipo: tipo, updated_at: Date.now() })
    .eq('id', entregaId)
    .eq('colaborador_id', colaboradorId);
  if (error) {
    await supabase.storage.from(BUCKET_SEGURIDAD).remove([path]);
    return { ok: false, error: mensaje(error.message) };
  }
  revalidatePath(`/admin/equipo/${colaboradorId}`);
  return { ok: true };
}

export async function quitarEntregaEpp(colaboradorId: string, entregaId: string): Promise<Resultado> {
  const q = await oficina();
  if ('error' in q) return { ok: false, error: q.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('epp_entrega')
    .update({ deleted_at: Date.now(), updated_at: Date.now() })
    .eq('id', entregaId)
    .eq('colaborador_id', colaboradorId)
    .select('id');
  if (error) return { ok: false, error: mensaje(error.message) };
  if (!data || data.length === 0) return { ok: false, error: 'No se encontró la entrega.' };
  revalidatePath(`/admin/equipo/${colaboradorId}`);
  return { ok: true };
}
