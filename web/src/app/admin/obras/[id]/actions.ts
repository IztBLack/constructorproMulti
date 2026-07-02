'use server';

import { revalidatePath } from 'next/cache';
import {
  actualizarMovimiento,
  actualizarObra,
  crearMovimiento,
  eliminarMovimiento,
  type MovimientoInput,
  type ObraInput,
} from '@/lib/data/obras';
import type { TipoMovimiento } from '@/lib/data/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function actualizarObraAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const cliente = String(formData.get('cliente') ?? '').trim();
  const ubicacion = String(formData.get('ubicacion') ?? '').trim();
  const fechaInicioStr = String(formData.get('fecha_inicio') ?? '').trim();

  if (!nombre) {
    return { ok: false, error: 'El nombre de la obra es obligatorio.' };
  }

  const fechaInicio = fechaInicioStr ? new Date(fechaInicioStr).getTime() : Date.now();
  if (!Number.isFinite(fechaInicio)) {
    return { ok: false, error: 'La fecha de inicio no es válida.' };
  }

  const input: ObraInput = { nombre, cliente, ubicacion, fechaInicio };

  const result = await actualizarObra(id, input);
  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/obras/${id}`);
  revalidatePath('/admin/obras');
  revalidatePath('/admin');
  return { ok: true };
}

const TIPOS_VALIDOS: TipoMovimiento[] = ['ENTRADA', 'SALIDA'];

function parseMovimientoFormData(
  formData: FormData,
  obraId: string,
): { input: MovimientoInput } | { error: string } {
  const tipo = String(formData.get('tipo') ?? '').trim();
  const fechaStr = String(formData.get('fecha') ?? '').trim();
  const categoria = String(formData.get('categoria') ?? '').trim();
  const concepto = String(formData.get('concepto') ?? '').trim();
  const montoStr = String(formData.get('monto') ?? '').trim();
  const metodoPago = String(formData.get('metodo_pago') ?? '').trim();
  const referencia = String(formData.get('referencia') ?? '').trim();

  if (!TIPOS_VALIDOS.includes(tipo as TipoMovimiento)) {
    return { error: 'El tipo de movimiento no es válido.' };
  }

  if (!concepto) {
    return { error: 'El concepto es obligatorio.' };
  }

  const monto = Number(montoStr);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: 'El monto debe ser un número mayor a cero.' };
  }

  const fecha = fechaStr ? new Date(fechaStr).getTime() : Date.now();
  if (!Number.isFinite(fecha)) {
    return { error: 'La fecha no es válida.' };
  }

  return {
    input: {
      obraId,
      fecha,
      tipo: tipo as TipoMovimiento,
      categoria,
      concepto,
      monto,
      metodoPago,
      referencia,
    },
  };
}

export async function crearMovimientoAction(
  obraId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseMovimientoFormData(formData, obraId);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  let result: { error: string | null };
  try {
    result = await crearMovimiento(parsed.input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/obras/${obraId}`);
  revalidatePath('/admin');
  return { ok: true };
}

export async function actualizarMovimientoAction(
  id: string,
  obraId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseMovimientoFormData(formData, obraId);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const result = await actualizarMovimiento(id, parsed.input);
  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/obras/${obraId}`);
  revalidatePath('/admin');
  return { ok: true };
}

export async function eliminarMovimientoAction(
  id: string,
  obraId: string,
): Promise<ActionResult> {
  const result = await eliminarMovimiento(id);
  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/obras/${obraId}`);
  revalidatePath('/admin');
  return { ok: true };
}
