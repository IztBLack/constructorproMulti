'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface ResultadoUsuario {
  ok: boolean;
  error?: string;
  /** Código generado, solo en `invitarUsuario`. */
  code?: string;
  expiresAt?: number;
}

/*
 * Las tres acciones delegan en RPCs `SECURITY DEFINER` de la migración 0018.
 *
 * Ninguna comprueba el rol aquí, y es a propósito: la comprobación vive DENTRO
 * de la RPC, que es la que también corre cuando la llamada no viene de esta
 * pantalla. Duplicarla en TypeScript daría la falsa sensación de que la barrera
 * está aquí, y crearía dos sitios que pueden desincronizarse. Lo que sí se hace
 * aquí es traducir la respuesta a algo que el usuario entienda.
 */

export async function invitarUsuario(formData: FormData): Promise<ResultadoUsuario> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const rol = String(formData.get('rol') ?? '');

  if (!nombre) return { ok: false, error: 'Escribe el nombre de la persona.' };
  if (rol !== 'supervisor' && rol !== 'colaborador') {
    return { ok: false, error: 'Elige un rol válido.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('invitar_usuario', {
    p_nombre: nombre,
    p_rol: rol,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo generar la invitación.' };

  revalidatePath('/admin/usuarios');
  return { ok: true, code: data.code as string, expiresAt: Number(data.expires_at) };
}

export async function cambiarRol(formData: FormData): Promise<ResultadoUsuario> {
  const userId = String(formData.get('user_id') ?? '');
  const rol = String(formData.get('rol') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cambiar_rol_usuario', {
    p_user_id: userId,
    p_rol: rol,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo cambiar el rol.' };

  revalidatePath('/admin/usuarios');
  return { ok: true };
}

export async function revocarAcceso(formData: FormData): Promise<ResultadoUsuario> {
  const userId = String(formData.get('user_id') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('revocar_acceso_usuario', {
    p_user_id: userId,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo quitar el acceso.' };

  revalidatePath('/admin/usuarios');
  return { ok: true };
}
