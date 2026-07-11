'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

interface CanjeRPC {
  ok: boolean;
  empresa_id?: string;
  rol?: string;
  error?: string;
}

export async function canjearCodigo(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('canjear_codigo_vinculacion', {
    p_code: code,
  });

  if (error) {
    return { ok: false, error: 'Ocurrió un error al verificar el código. Intenta de nuevo.' };
  }

  const resultado = data as CanjeRPC;

  if (!resultado?.ok) {
    return {
      ok: false,
      error: resultado?.error ?? 'El código no es válido o ya fue utilizado.',
    };
  }

  revalidatePath('/cliente', 'layout');

  return { ok: true };
}
