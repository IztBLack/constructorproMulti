'use server';

import { revalidatePath } from 'next/cache';
import { guardarNotaCaja } from '@/lib/data/caja-nota';

export async function guardarNotaCajaAction(
  obraId: string,
  nota: string,
): Promise<{ ok: boolean; error?: string }> {
  const resultado = await guardarNotaCaja(obraId, nota);
  if (resultado.ok) {
    revalidatePath(`/admin/obras/${obraId}`);
  }
  return resultado;
}
