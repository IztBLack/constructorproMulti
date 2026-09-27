'use server';

import { revalidatePath } from 'next/cache';
import { responderExtra } from '@/lib/data/cambios';
import { LARGO_MOTIVO_RECHAZO } from '@/lib/cambios/extras';

/**
 * El cliente aprueba o rechaza un extra desde su portal.
 *
 * Toda la validación que importa la hace la RPC `responder_orden_cambio`
 * (0036): que el usuario sea el cliente de ESA obra, que el extra esté enviado y
 * que un rechazo traiga motivo. Aquí solo se limpia lo que llega del navegador.
 */
export async function responderExtraAction(
  obraId: string,
  extraId: string,
  aprobar: boolean,
  motivo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof aprobar !== 'boolean') return { ok: false, error: 'Respuesta no válida.' };
  const limpio = String(motivo ?? '').trim().slice(0, LARGO_MOTIVO_RECHAZO);
  if (!aprobar && !limpio) return { ok: false, error: 'Escribe por qué lo rechazas.' };

  const r = await responderExtra(extraId, aprobar, aprobar ? null : limpio);
  if (!r.ok) return r;

  revalidatePath(`/cliente/obras/${obraId}`);
  revalidatePath(`/cliente/obras/${obraId}/estado-cuenta`);
  revalidatePath('/cliente');
  return { ok: true };
}
