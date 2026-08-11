'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaUsuario } from './empresa';
import { setOrdenModo, type OrdenModo } from './empresa-config';

/**
 * Server actions del ORDEN PERSONALIZADO (paridad móvil, migración 0026).
 *
 * - [reordenarAction] escribe la columna `orden` de una lista reordenable. Esa
 *   posición se sincroniza al móvil por el pull/push normal (es columna común).
 * - [setOrdenModoAction] guarda el MODO (nombre|personalizado) en
 *   `empresa_config.ui_orden`, global por empresa.
 *
 * RLS (policies de 0014/0015/0017) exige admin/supervisor para escribir; el
 * cliente Supabase del servidor ya corre con la sesión del usuario.
 */

/** Separación entre posiciones (deja huecos para insertar sin renumerar). */
const PASO = 100;

/** Solo estas tablas se pueden reordenar: la clave llega del cliente y NO debe
 *  poder apuntar a una tabla arbitraria. */
const TABLAS_REORDENABLES = new Set<string>([
  'cuadrillas',
  'cuadrilla_miembro',
  'colaboradores',
  'obras',
  'cotizaciones',
  'puestos',
  'catalogo_conceptos',
]);

/** Columnas PK aceptadas por tabla (evita `eq()` sobre columnas arbitrarias). */
const PK_COLS: Record<string, string[]> = {
  cuadrillas: ['id'],
  cuadrilla_miembro: ['cuadrilla_id', 'colaborador_id'],
  colaboradores: ['id'],
  obras: ['id'],
  cotizaciones: ['id'],
  puestos: ['id'],
  catalogo_conceptos: ['id'],
};

// Nota: un archivo 'use server' solo debe EXPORTAR funciones async. El tipo del
// parámetro se declara local (no exportado) a propósito.
interface ReordenarInput {
  tabla: string;
  /** PKs en el nuevo orden. Cada elemento son los valores de [PK_COLS] en orden. */
  pks: (string | number)[][];
  /** Ruta a revalidar tras escribir (opcional). */
  revalidate?: string;
}

export async function reordenarAction(
  input: ReordenarInput,
): Promise<{ ok: boolean; error?: string }> {
  const { tabla, pks } = input;
  if (!TABLAS_REORDENABLES.has(tabla)) {
    return { ok: false, error: 'Lista no reordenable.' };
  }
  const pkCols = PK_COLS[tabla];

  const { empresaId } = await getEmpresaUsuario();
  const supabase = await createClient();
  const now = Date.now();

  for (let i = 0; i < pks.length; i++) {
    const fila = pks[i];
    if (!Array.isArray(fila) || fila.length !== pkCols.length) {
      return { ok: false, error: 'PK inválida en el reordenamiento.' };
    }
    let q = supabase
      .from(tabla)
      .update({ orden: (i + 1) * PASO, updated_at: now })
      .eq('empresa_id', empresaId);
    for (let j = 0; j < pkCols.length; j++) {
      q = q.eq(pkCols[j], fila[j]);
    }
    const { error } = await q;
    if (error) return { ok: false, error: error.message };
  }

  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

export async function setOrdenModoAction(
  listKey: string,
  modo: OrdenModo,
  revalidate?: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await setOrdenModo(listKey, modo);
  if (r.ok && revalidate) revalidatePath(revalidate);
  return { ok: r.ok, error: r.error };
}
