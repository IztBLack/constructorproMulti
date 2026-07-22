'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Canjea un código de invitación para unirse a una empresa que ya existe.
 *
 * ESTE ERA EL ESLABÓN QUE FALTABA. Hasta ahora `/onboarding` solo ofrecía "crear
 * empresa", así que un supervisor invitado que se registraba en la web acababa
 * creando una SEGUNDA EMPRESA VACÍA en vez de unirse a la de su jefe. Por eso el
 * sistema no tenía ni un supervisor: no faltaba la pantalla de invitar, faltaba
 * la de aceptar.
 *
 * El código se normaliza a mayúsculas y sin espacios porque llega dictado por
 * teléfono o pegado desde WhatsApp, y nadie lo escribe con el formato exacto.
 */
export async function canjearInvitacion(formData: FormData): Promise<ActionResult> {
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  if (!code) {
    return { ok: false, error: 'Escribe el código que te compartieron.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'No hay sesión activa. Inicia sesión primero.' };
  }

  const { data, error } = await supabase.rpc('canjear_codigo_vinculacion', { p_code: code });

  if (error || !data?.ok) {
    return {
      ok: false,
      error: data?.error ?? error?.message ?? 'El código no es válido o ya expiró.',
    };
  }

  // El destino depende del rol con el que entra: un cliente no pinta nada en el
  // panel de oficina, y el middleware lo devolvería de todas formas.
  redirect(data.rol === 'cliente' ? '/cliente' : '/admin');
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
