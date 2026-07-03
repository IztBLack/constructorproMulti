'use server';

import { revalidatePath } from 'next/cache';
import {
  actualizarCliente,
  crearCliente,
  eliminarCliente,
  generarCodigoAccesoCliente,
} from '@/lib/data/clientes';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface CodigoResult {
  ok: boolean;
  code?: string;
  expiresAt?: number;
  error?: string;
}

function leerClienteDeFormData(formData: FormData) {
  return {
    nombre: String(formData.get('nombre') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    telefono: String(formData.get('telefono') ?? '').trim(),
  };
}

export async function crearClienteAction(formData: FormData): Promise<ActionResult & { id: string | null }> {
  const input = leerClienteDeFormData(formData);

  if (!input.nombre) {
    return { ok: false, id: null, error: 'El nombre del cliente es obligatorio.' };
  }

  let id: string | null;
  let error: string | null;

  try {
    ({ id, error } = await crearCliente(input));
  } catch (e) {
    return { ok: false, id: null, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  if (error) return { ok: false, id: null, error };

  revalidatePath('/admin/clientes');
  return { ok: true, id };
}

export async function actualizarClienteAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const input = leerClienteDeFormData(formData);

  if (!input.nombre) {
    return { ok: false, error: 'El nombre del cliente es obligatorio.' };
  }

  const { error } = await actualizarCliente(id, input);
  if (error) return { ok: false, error };

  revalidatePath('/admin/clientes');
  revalidatePath(`/admin/clientes/${id}`);
  return { ok: true };
}

export async function eliminarClienteAction(id: string): Promise<ActionResult> {
  const { error } = await eliminarCliente(id);
  if (error) return { ok: false, error };

  revalidatePath('/admin/clientes');
  return { ok: true };
}

export async function generarCodigoAccesoClienteAction(clienteId: string): Promise<CodigoResult> {
  const result = await generarCodigoAccesoCliente(clienteId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/clientes/${clienteId}`);
  return { ok: true, code: result.code, expiresAt: result.expiresAt };
}
