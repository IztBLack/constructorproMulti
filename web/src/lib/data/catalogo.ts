import { createClient } from '@/lib/supabase/server';
import type { CatalogoConcepto } from './types';

export async function listCatalogoConceptos(): Promise<{
  data: CatalogoConcepto[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('catalogo_conceptos')
    .select('*')
    .is('deleted_at', null)
    .order('descripcion');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CatalogoConcepto[], error: null };
}

/// Busca conceptos del catálogo por clave o descripción (para autocompletar
/// partidas). Devuelve hasta `limite` coincidencias; sin query, los primeros.
export async function buscarCatalogoConceptos(
  query: string,
  limite = 8,
): Promise<{ data: CatalogoConcepto[]; error: string | null }> {
  const supabase = await createClient();
  // Saneo: `,` `(` `)` rompen la sintaxis de .or() de PostgREST.
  const q = query.trim().replace(/[,()]/g, ' ').trim();

  let req = supabase
    .from('catalogo_conceptos')
    .select('*')
    .is('deleted_at', null)
    .order('descripcion')
    .limit(limite);

  if (q.length > 0) req = req.or(`descripcion.ilike.%${q}%,clave.ilike.%${q}%`);

  const { data, error } = await req;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CatalogoConcepto[], error: null };
}

export async function getCatalogoConcepto(
  id: string,
): Promise<{ data: CatalogoConcepto | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('catalogo_conceptos')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as CatalogoConcepto | null, error: null };
}
