import { createClient } from '@/lib/supabase/server';
import type { Puesto } from './types';

export async function listPuestos(): Promise<{ data: Puesto[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('puestos')
    .select('*')
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Puesto[], error: null };
}

export async function getPuesto(id: string): Promise<{ data: Puesto | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('puestos')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as Puesto | null, error: null };
}
