'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Fija la fracción de asistencia de un colaborador en una obra para un día
 * (epoch ms = medianoche local del día). Porta `AsistenciaRepository.setFraccion`
 * del móvil: busca la fila por (obra, colaborador, fecha) y la actualiza; si no
 * existe la inserta. Nunca duplica (hay UNIQUE colaborador_id+obra_id+fecha).
 * Guarda incluso fracción 0 (ausencia explícita), igual que el móvil.
 */
export async function guardarAsistencia(
  obraId: string,
  colaboradorId: string,
  fecha: number,
  fraccion: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();

  // Busca cualquier fila existente (incluso soft-borrada) para ese día.
  const { data: existente, error: selError } = await supabase
    .from('asistencias')
    .select('id')
    .eq('obra_id', obraId)
    .eq('colaborador_id', colaboradorId)
    .eq('fecha', fecha)
    .maybeSingle();

  if (selError) return { ok: false, error: selError.message };

  if (existente) {
    const { error } = await supabase
      .from('asistencias')
      .update({ fraccion, deleted_at: null, updated_at: now })
      .eq('id', existente.id);
    if (error) return { ok: false, error: error.message };
  } else {
    let empresaId: string;
    try {
      ({ empresaId } = await getEmpresaUsuario());
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
    }

    const { error } = await supabase.from('asistencias').insert({
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      colaborador_id: colaboradorId,
      obra_id: obraId,
      fecha,
      fraccion,
      created_at: now,
      updated_at: now,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/obras/${obraId}/asistencia`);
  return { ok: true };
}
