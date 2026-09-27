import { createClient } from '@/lib/supabase/server';
import { ordenarPrograma, type PartidaPrograma } from '@/lib/programa/programa';

export type { PartidaPrograma };

/**
 * Lectura del PROGRAMA DE OBRA (migración 0041). La RLS decide: oficina
 * (admin, supervisor, contador) lee; el resto recibe una lista vacía.
 */
export async function listProgramaObra(
  obraId: string,
): Promise<{ data: PartidaPrograma[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('programa_partida')
    .select('id, obra_id, presupuesto_id, seccion, concepto, fecha_inicio, fecha_fin, terminada, orden')
    .eq('obra_id', obraId)
    .is('deleted_at', null);

  if (error) return { data: [], error: error.message };
  const filas = ((data ?? []) as PartidaPrograma[]).map((p) => ({
    ...p,
    fecha_inicio: Number(p.fecha_inicio),
    fecha_fin: Number(p.fecha_fin),
  }));
  return { data: ordenarPrograma(filas), error: null };
}
