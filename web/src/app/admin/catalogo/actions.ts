'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import catalogoBase from '@/lib/data/catalogo-base.json';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface ConceptoBase {
  clave: string;
  descripcion: string;
  unidad: string;
  precioUnitarioDefault: number;
  categoria: string;
}

/**
 * Carga el catálogo oficial (semilla de 239 conceptos, portado del móvil) para
 * la empresa, insertando SOLO las claves que aún no existen (dedup por clave,
 * como el móvil). Idempotente: correrlo de nuevo no duplica.
 */
export async function cargarCatalogoOficial(): Promise<ActionResult & { agregados?: number }> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();
  const { data: rows, error: readErr } = await supabase
    .from('catalogo_conceptos')
    .select('clave')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null);
  if (readErr) return { ok: false, error: readErr.message };

  const existentes = new Set(
    (rows ?? []).map((r) => String(r.clave ?? '').trim()).filter((c) => c.length > 0),
  );
  const now = Date.now();
  const vistos = new Set<string>();
  const filas = (catalogoBase as ConceptoBase[])
    .filter((c) => {
      const clave = c.clave.trim();
      if (!clave || existentes.has(clave) || vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .map((c) => ({
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      clave: c.clave.trim(),
      descripcion: c.descripcion,
      unidad: c.unidad,
      precio_unitario_default: c.precioUnitarioDefault,
      categoria: c.categoria,
      es_personalizado: false,
      created_at: now,
      updated_at: now,
    }));

  if (filas.length > 0) {
    const { error } = await supabase.from('catalogo_conceptos').insert(filas);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/admin/catalogo');
  return { ok: true, agregados: filas.length };
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
