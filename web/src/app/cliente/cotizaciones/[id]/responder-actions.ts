'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

interface RespuestaRPC {
  ok: boolean;
  estado?: 'ACEPTADA' | 'RECHAZADA';
  error?: string;
}

export async function responderCotizacion(
  cotizacionId: string,
  aceptar: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('cliente_responder_cotizacion', {
    p_cotizacion_id: cotizacionId,
    p_aceptar: aceptar,
  });

  if (error) {
    return { ok: false, error: 'Ocurrió un error al procesar tu respuesta. Intenta de nuevo.' };
  }

  const resultado = data as RespuestaRPC;

  if (!resultado?.ok) {
    return {
      ok: false,
      error: resultado?.error ?? 'No fue posible registrar tu respuesta.',
    };
  }

  revalidatePath('/cliente/cotizaciones/' + cotizacionId);
  revalidatePath('/cliente');

  return { ok: true };
}

interface AprobarRPC {
  ok: boolean;
  error?: string;
}

/// El cliente aprueba los cambios que el contratista hizo después de que él
/// aceptó (vuelve a congelar la foto). Solo válido si la cotización es suya y
/// está ACEPTADA (lo valida el RPC `cliente_aprobar_cambios`).
export async function aprobarCambios(
  cotizacionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('cliente_aprobar_cambios', {
    p_cotizacion_id: cotizacionId,
  });

  if (error) {
    return { ok: false, error: 'Ocurrió un error al aprobar los cambios. Intenta de nuevo.' };
  }

  const resultado = data as AprobarRPC;

  if (!resultado?.ok) {
    return { ok: false, error: resultado?.error ?? 'No fue posible aprobar los cambios.' };
  }

  revalidatePath('/cliente/cotizaciones/' + cotizacionId);
  revalidatePath('/cliente');

  return { ok: true };
}
