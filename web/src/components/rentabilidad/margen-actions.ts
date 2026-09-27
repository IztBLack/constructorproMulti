'use server';

import { revalidatePath } from 'next/cache';
import { moduloActivo } from '@/lib/data/modulos';
import { guardarMargenEmpresa, guardarMargenObra } from '@/lib/data/rentabilidad';

export interface ResultadoMargen {
  ok: boolean;
  error?: string;
  aviso?: string;
}

/** "15", "15.5", "15,5" → número. Vacío → null. Basura → NaN. */
function leerMargen(fd: FormData): number | null {
  const bruto = String(fd.get('margen_objetivo') ?? '').trim().replace(',', '.').replace('%', '');
  if (bruto === '') return null;
  return Number(bruto);
}

/**
 * Margen objetivo de UNA obra. Vacío = volver al de la empresa. El permiso (solo
 * admin) lo revisan `guardarMargenObra` y la RLS de `obra_margen_objetivo`.
 */
export async function guardarMargenObraAction(obraId: string, fd: FormData): Promise<ResultadoMargen> {
  if (!(await moduloActivo('rentabilidad'))) {
    return { ok: false, error: 'La utilidad por obra está apagada en tu empresa.' };
  }
  const margen = leerMargen(fd);
  if (margen !== null && !Number.isFinite(margen)) {
    return { ok: false, error: 'Escribe un porcentaje, por ejemplo 15.' };
  }
  const r = await guardarMargenObra(obraId, margen);
  if (!r.ok) return r;
  revalidatePath(`/admin/obras/${obraId}/utilidad`);
  revalidatePath('/admin/rentabilidad');
  return {
    ok: true,
    aviso: margen === null ? 'Esta obra vuelve a usar el margen de la empresa.' : 'Margen de la obra guardado.',
  };
}

/** Margen objetivo por defecto de la empresa (Ajustes → Operación). Solo admin. */
export async function guardarMargenEmpresaAction(fd: FormData): Promise<ResultadoMargen> {
  const margen = leerMargen(fd);
  if (margen === null || !Number.isFinite(margen)) {
    return { ok: false, error: 'Escribe un porcentaje, por ejemplo 15.' };
  }
  const r = await guardarMargenEmpresa(margen);
  if (!r.ok) return r;
  revalidatePath('/admin/ajustes');
  revalidatePath('/admin/rentabilidad');
  revalidatePath('/admin/obras', 'layout');
  return { ok: true, aviso: 'Margen objetivo guardado. Se aplica a las obras que no tienen uno propio.' };
}
