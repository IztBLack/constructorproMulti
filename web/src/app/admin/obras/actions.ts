'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { fechaInputAMs } from '@/lib/data/tz';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function crearObra(formData: FormData): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const cliente = String(formData.get('cliente') ?? '').trim();
  const ubicacion = String(formData.get('ubicacion') ?? '').trim();
  const fechaInicioStr = String(formData.get('fecha_inicio') ?? '').trim();

  if (!nombre) {
    return { ok: false, error: 'El nombre de la obra es obligatorio.' };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const now = Date.now();
  const fechaInicio = fechaInicioStr ? fechaInputAMs(fechaInicioStr) : now;

  const supabase = await createClient();
  const { error } = await supabase.from('obras').insert({
    id: crypto.randomUUID(),
    empresa_id: empresaId,
    nombre,
    cliente: cliente,
    ubicacion: ubicacion,
    fecha_inicio: fechaInicio,
    activa: true,
    cotizacion_origen_id: null,
    pdf_config_json: null,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/obras');
  revalidatePath('/admin');
  return { ok: true };
}

export async function eliminarObra(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('obras')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/obras');
  revalidatePath('/admin');
  return { ok: true };
}

export async function alternarActivaObra(id: string, activa: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const now = Date.now();
  const { error } = await supabase
    .from('obras')
    .update({ activa, updated_at: now })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/obras');
  revalidatePath(`/admin/obras/${id}`);
  return { ok: true };
}
