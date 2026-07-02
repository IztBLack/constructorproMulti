'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function crearEmpresa(formData: FormData): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();

  if (!nombre) {
    return { ok: false, error: 'El nombre de la empresa es obligatorio.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'No hay sesión activa. Inicia sesión primero.' };
  }

  // Llamada RPC atómica — la función maneja creación + vinculación + deduplicación.
  const { data, error } = await supabase.rpc('crear_empresa', { p_nombre: nombre });

  if (error || !data?.ok) {
    return { ok: false, error: data?.error ?? error?.message ?? 'No se pudo crear la empresa.' };
  }

  redirect('/admin');
}
