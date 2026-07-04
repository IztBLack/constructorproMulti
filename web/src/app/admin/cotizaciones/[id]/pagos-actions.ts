'use server';

import { revalidatePath } from 'next/cache';
import {
  actualizarPago,
  crearPago,
  eliminarPago,
  type ActualizarPagoInput,
  type NuevoPagoInput,
} from '@/lib/data/pagos';
import { fechaInputAMs } from '@/lib/data/tz';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const METODOS_VALIDOS = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'OTRO'];

function parsePagoFormData(
  formData: FormData,
  cotizacionId: string,
): { input: NuevoPagoInput } | { error: string } {
  const fechaStr = String(formData.get('fecha') ?? '').trim();
  const montoStr = String(formData.get('monto') ?? '').trim();
  const metodo = String(formData.get('metodo') ?? '').trim();
  const concepto = String(formData.get('concepto') ?? '').trim();
  const referencia = String(formData.get('referencia') ?? '').trim();

  if (!concepto) {
    return { error: 'El concepto es obligatorio.' };
  }

  if (!metodo || !METODOS_VALIDOS.includes(metodo)) {
    return { error: 'El método de pago no es válido.' };
  }

  const monto = Number(montoStr);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: 'El monto debe ser un número mayor a cero.' };
  }

  const fecha = fechaStr ? fechaInputAMs(fechaStr) : Date.now();
  if (!Number.isFinite(fecha)) {
    return { error: 'La fecha no es válida.' };
  }

  return {
    input: {
      cotizacion_id: cotizacionId,
      fecha,
      monto,
      metodo,
      concepto,
      referencia,
    },
  };
}

export async function crearPagoAction(
  cotizacionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parsePagoFormData(formData, cotizacionId);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  let result: { id: string | null; error: string | null };
  try {
    result = await crearPago(parsed.input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { ok: true };
}

export async function actualizarPagoAction(
  id: string,
  cotizacionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parsePagoFormData(formData, cotizacionId);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const updateInput: ActualizarPagoInput = {
    fecha: parsed.input.fecha,
    monto: parsed.input.monto,
    metodo: parsed.input.metodo,
    concepto: parsed.input.concepto,
    referencia: parsed.input.referencia,
  };

  let result: { error: string | null };
  try {
    result = await actualizarPago(id, updateInput);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { ok: true };
}

export async function eliminarPagoAction(
  id: string,
  cotizacionId: string,
): Promise<ActionResult> {
  let result: { error: string | null };
  try {
    result = await eliminarPago(id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { ok: true };
}
