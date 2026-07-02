'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function parsePuestoFormData(
  formData: FormData,
): { input: { nombre: string; salarioDiaDefault: number } } | { error: string } {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const salarioStr = String(formData.get('salario_dia_default') ?? '').trim();

  if (!nombre) {
    return { error: 'El nombre del puesto es obligatorio.' };
  }

  const salarioDiaDefault = salarioStr ? Number(salarioStr) : 0;
  if (!Number.isFinite(salarioDiaDefault) || salarioDiaDefault < 0) {
    return { error: 'El salario debe ser un número mayor o igual a cero.' };
  }

  return { input: { nombre, salarioDiaDefault } };
}

export async function crearPuesto(formData: FormData): Promise<ActionResult> {
  const parsed = parsePuestoFormData(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const now = Date.now();
  const supabase = await createClient();
  const { error } = await supabase.from('puestos').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    nombre: parsed.input.nombre,
    salario_dia_default: parsed.input.salarioDiaDefault,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/puestos');
  revalidatePath('/admin/equipo');
  return { ok: true };
}

export async function actualizarPuesto(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = parsePuestoFormData(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const now = Date.now();
  const supabase = await createClient();
  const { error } = await supabase
    .from('puestos')
    .update({
      nombre: parsed.input.nombre,
      salario_dia_default: parsed.input.salarioDiaDefault,
      updated_at: now,
    })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/puestos');
  revalidatePath('/admin/equipo');
  return { ok: true };
}

export async function eliminarPuesto(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('puestos')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/puestos');
  revalidatePath('/admin/equipo');
  return { ok: true };
}
