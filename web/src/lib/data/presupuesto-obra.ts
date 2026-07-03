import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import type { PartidaPresupuesto } from './types';

export type { PartidaPresupuesto };

export interface PartidaPresupuestoInput {
  obraId: string;
  concepto: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  orden: number;
}

export async function listPresupuestoObra(
  obraId: string,
): Promise<{ data: PartidaPresupuesto[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obra_presupuesto')
    .select('*')
    .eq('obra_id', obraId)
    .is('deleted_at', null)
    .order('orden', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as PartidaPresupuesto[], error: null };
}

export async function crearPartidaPresupuesto(
  input: PartidaPresupuestoInput,
): Promise<{ error: string | null }> {
  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase.from('obra_presupuesto').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    obra_id: input.obraId,
    concepto: input.concepto,
    unidad: input.unidad,
    cantidad: input.cantidad,
    precio_unitario: input.precio_unitario,
    orden: input.orden,
    created_at: now,
    updated_at: now,
  });

  if (error) return { error: error.message };
  return { error: null };
}

export async function actualizarPartidaPresupuesto(
  id: string,
  input: Omit<PartidaPresupuestoInput, 'obraId'>,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('obra_presupuesto')
    .update({
      concepto: input.concepto,
      unidad: input.unidad,
      cantidad: input.cantidad,
      precio_unitario: input.precio_unitario,
      orden: input.orden,
      updated_at: now,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function eliminarPartidaPresupuesto(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const now = Date.now();

  const { error } = await supabase
    .from('obra_presupuesto')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

/** Costo total = Σ (cantidad × precio_unitario) de todas las partidas. */
export function costoTotal(partidas: PartidaPresupuesto[]): number {
  return partidas.reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0);
}
