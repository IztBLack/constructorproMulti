'use server';

import { revalidatePath } from 'next/cache';
import { responderEstimacion } from '@/lib/data/estimaciones';
import { LARGO_MOTIVO_RECHAZO } from '@/lib/estimaciones/tipos';

/**
 * El cliente autoriza o rechaza una estimación desde su portal.
 *
 * Toda la validación que importa la hace la RPC `responder_estimacion` (0039):
 * que el usuario sea el cliente de ESA obra, que esté enviada y que un rechazo
 * traiga motivo. Aquí solo se limpia lo que llega del navegador.
 */
export async function responderEstimacionAction(
  obraId: string,
  estimacionId: string,
  autorizar: boolean,
  motivo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof autorizar !== 'boolean') return { ok: false, error: 'Respuesta no válida.' };
  if (!/^[0-9a-f-]{36}$/i.test(estimacionId)) return { ok: false, error: 'Estimación no válida.' };
  const limpio = String(motivo ?? '').trim().slice(0, LARGO_MOTIVO_RECHAZO);
  if (!autorizar && !limpio) return { ok: false, error: 'Escribe por qué la rechazas.' };

  const r = await responderEstimacion(estimacionId, autorizar, autorizar ? null : limpio);
  if (!r.ok) return r;

  revalidatePath(`/cliente/obras/${obraId}`);
  revalidatePath('/cliente');
  return { ok: true };
}
