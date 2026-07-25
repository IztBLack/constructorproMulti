'use server';

import { revalidatePath } from 'next/cache';
import { crearMovimiento } from '@/lib/data/obras';
import { crearDestajo, eliminarDestajo, nominaYaRegistrada } from '@/lib/data/nomina';
import { formatDate } from '@/lib/data/format';

export interface ActionResult {
  error: string | null;
}

/**
 * Registra la nómina de la semana como UNA salida de caja (categoría NOMINA),
 * como el móvil. Se agrega un guardarraíl que el móvil no tiene: no permite
 * registrar dos veces la misma semana.
 */
export async function registrarNominaEnCajaAction(
  obraId: string,
  inicioMs: number,
  finMs: number,
  total: number,
): Promise<ActionResult> {
  if (!(total > 0)) return { error: 'No hay nómina que registrar en esta semana.' };

  const concepto = `Nómina ${formatDate(inicioMs)} – ${formatDate(finMs)}`;
  if (await nominaYaRegistrada(obraId, concepto)) {
    return { error: 'La nómina de esta semana ya está registrada en la caja.' };
  }

  const { error } = await crearMovimiento({
    obraId,
    fecha: Date.now(),
    tipo: 'SALIDA',
    categoria: 'NOMINA',
    concepto,
    monto: total,
    metodoPago: 'Efectivo',
    referencia: '',
    nombre: '',
  });
  if (error) return { error };

  revalidatePath(`/admin/obras/${obraId}`);
  revalidatePath(`/admin/obras/${obraId}/nomina`);
  return { error: null };
}

export async function crearDestajoAction(
  obraId: string,
  colaboradorId: string,
  fecha: number,
  concepto: string,
  monto: number,
): Promise<ActionResult> {
  const c = concepto.trim();
  if (!c) return { error: 'Escribe el concepto del destajo.' };
  if (!(monto > 0)) return { error: 'El monto debe ser mayor que cero.' };

  const { error } = await crearDestajo({ obraId, colaboradorId, fecha, concepto: c, monto });
  if (error) return { error };

  revalidatePath(`/admin/obras/${obraId}/nomina`);
  return { error: null };
}

export async function eliminarDestajoAction(id: string, obraId: string): Promise<ActionResult> {
  const { error } = await eliminarDestajo(id);
  if (error) return { error };

  revalidatePath(`/admin/obras/${obraId}/nomina`);
  return { error: null };
}
