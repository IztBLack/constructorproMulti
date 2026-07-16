'use server';

import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { generarCodigoNumerico } from '@/lib/data/codigo';

export interface GenerarCodigoResult {
  ok: boolean;
  code?: string;
  expiresAt?: number;
  error?: string;
}

export interface EstadoCodigoResult {
  usado: boolean;
  expirado: boolean;
}

/**
 * Invalida los códigos activos anteriores de la empresa, genera uno nuevo de
 * 6 dígitos y lo inserta en `codigos_vinculacion`. Expira en 10 minutos.
 * Reintenta hasta 5 veces si hay colisión de PK (código duplicado).
 */
export async function generarCodigoVinculacion(): Promise<GenerarCodigoResult> {
  let empresaId: string;
  try {
    ({ empresaId } = await getEmpresaUsuario());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  const supabase = await createClient();

  // Obtener el usuario autenticado para created_by.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'No hay sesión activa.' };
  }

  const now = Date.now();

  // Invalidar todos los códigos no usados anteriores de esta empresa.
  const { error: invalidarError } = await supabase
    .from('codigos_vinculacion')
    .update({ used_at: now })
    .eq('empresa_id', empresaId)
    .is('used_at', null);

  if (invalidarError) {
    console.error('[generarCodigoVinculacion] invalidar:', invalidarError.message);
    return { ok: false, error: 'No se pudieron invalidar códigos anteriores. Intenta de nuevo.' };
  }

  const expiresAt = now + 10 * 60 * 1000;
  const MAX_INTENTOS = 5;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    // Código aleatorio con CSPRNG (ver lib/data/codigo.ts).
    const code = generarCodigoNumerico();

    const { error: insertError } = await supabase.from('codigos_vinculacion').insert({
      code,
      empresa_id: empresaId,
      created_by: user.id,
      expires_at: expiresAt,
      used_at: null,
      used_by: null,
    });

    if (!insertError) {
      return { ok: true, code, expiresAt };
    }

    // Si es colisión de PK (código ya existe), reintentamos con uno nuevo.
    // Los códigos de error de Postgres para violación de PK/unique son '23505'.
    const esDuplicado =
      insertError.code === '23505' ||
      insertError.message.toLowerCase().includes('duplicate') ||
      insertError.message.toLowerCase().includes('unique');

    if (!esDuplicado || intento === MAX_INTENTOS) {
      console.error('[generarCodigoVinculacion] insert:', insertError.message);
      return { ok: false, error: 'No se pudo crear el código. Intenta de nuevo.' };
    }
    // Si es duplicado y quedan intentos, continúa el ciclo.
  }

  // Fallback — no debería alcanzarse.
  return { ok: false, error: 'No se pudo generar un código único. Intenta de nuevo.' };
}

/**
 * Consulta si un código ya fue canjeado (`used_at` no es null) o si ya expiró
 * (`expires_at` en el pasado).
 */
export async function verificarEstadoCodigo(code: string): Promise<EstadoCodigoResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('codigos_vinculacion')
    .select('expires_at, used_at')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    // Error real de consulta — registrar para diagnóstico pero no bloquear al usuario.
    console.error('[verificarEstadoCodigo] Error consultando código:', error.message);
    return { usado: false, expirado: false };
  }

  if (!data) {
    // Código no encontrado — asumir no usado y no expirado para no bloquear.
    return { usado: false, expirado: false };
  }

  const usado = data.used_at !== null;
  const expirado = Date.now() > data.expires_at;

  return { usado, expirado };
}
