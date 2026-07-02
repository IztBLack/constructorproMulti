'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function parseConceptoFormData(formData: FormData): { input: {
  clave: string;
  descripcion: string;
  unidad: string;
  precioUnitarioDefault: number;
  categoria: string;
} } | { error: string } {
  const clave = String(formData.get('clave') ?? '').trim();
  const descripcion = String(formData.get('descripcion') ?? '').trim();
  const unidad = String(formData.get('unidad') ?? '').trim();
  const precioStr = String(formData.get('precio_unitario_default') ?? '').trim();
  const categoria = String(formData.get('categoria') ?? '').trim();

  if (!descripcion) {
    return { error: 'La descripción es obligatoria.' };
  }

  const precioUnitarioDefault = precioStr ? Number(precioStr) : 0;
  if (!Number.isFinite(precioUnitarioDefault) || precioUnitarioDefault < 0) {
    return { error: 'El precio unitario debe ser un número mayor o igual a cero.' };
  }

  return { input: { clave, descripcion, unidad, precioUnitarioDefault, categoria } };
}

export async function crearConcepto(formData: FormData): Promise<ActionResult> {
  const parsed = parseConceptoFormData(formData);
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
  const { error } = await supabase.from('catalogo_conceptos').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    clave: parsed.input.clave,
    descripcion: parsed.input.descripcion,
    unidad: parsed.input.unidad,
    precio_unitario_default: parsed.input.precioUnitarioDefault,
    categoria: parsed.input.categoria,
    es_personalizado: true,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/catalogo');
  return { ok: true };
}

export async function actualizarConcepto(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = parseConceptoFormData(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const now = Date.now();
  const supabase = await createClient();
  const { error } = await supabase
    .from('catalogo_conceptos')
    .update({
      clave: parsed.input.clave,
      descripcion: parsed.input.descripcion,
      unidad: parsed.input.unidad,
      precio_unitario_default: parsed.input.precioUnitarioDefault,
      categoria: parsed.input.categoria,
      updated_at: now,
    })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/catalogo');
  return { ok: true };
}

export async function eliminarConcepto(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('catalogo_conceptos')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/catalogo');
  return { ok: true };
}
