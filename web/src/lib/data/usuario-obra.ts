import { createClient } from '@/lib/supabase/server';

/**
 * Obras asignadas a una persona (0042 `usuario_obra`, fase F6).
 *
 * El residente solo ve y escribe en sus obras (D4) y el colaborador con obra
 * escribe la bitácora de ellas. Lo que se puede leer lo decide la RLS: el admin
 * ve todas las asignaciones de su empresa; los demás, solo las suyas.
 */

export interface AsignacionObra {
  id: string;
  user_id: string;
  obra_id: string;
  desde: number;
  hasta: number | null;
}

/** Asignaciones vivas (sin borrar y vigentes). Para el admin: de toda la empresa. */
export async function listAsignaciones(): Promise<{ data: AsignacionObra[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('usuario_obra')
    .select('id, user_id, obra_id, desde, hasta')
    .is('deleted_at', null)
    .order('desde', { ascending: true });
  if (error) return { data: [], error: error.message };
  const ahora = Date.now();
  const vivas = ((data ?? []) as AsignacionObra[]).filter((a) => a.hasta == null || a.hasta > ahora);
  return { data: vivas, error: null };
}

/**
 * ¿El usuario actual tiene esta obra asignada? Usa el mismo helper que la RLS
 * (`auth_tiene_obra`). Si falla (0042 sin aplicar, sin red), responde false:
 * ante la duda, no se ofrece escribir.
 */
export async function tengoObraAsignada(obraId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('auth_tiene_obra', { p_obra: obraId });
  if (error) return false;
  return data === true;
}
