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
    return { ok: false, error: 'Ocurrio un error al procesar tu respuesta. Intenta de nuevo.' };
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
