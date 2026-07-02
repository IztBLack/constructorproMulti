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
