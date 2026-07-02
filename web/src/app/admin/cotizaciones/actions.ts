'use server';

import { revalidatePath } from 'next/cache';
import {
  actualizarCotizacion,
  actualizarPartida,
  actualizarSeccion,
  crearCotizacion,
  crearPartida,
  crearSeccion,
  eliminarCotizacion,
  eliminarPartida,
  eliminarSeccion,
} from '@/lib/data/cotizaciones';
import type { EstadoCotizacion } from '@/lib/data/types';

export interface ActionResult {
  error: string | null;
}

function parseFecha(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

function leerCotizacionDeFormData(formData: FormData) {
  const fechaRaw = String(formData.get('fecha') ?? '');
  const descuentoRaw = String(formData.get('descuento') ?? '0');
  const ubicacion = String(formData.get('ubicacion') ?? '').trim();
  const notas = String(formData.get('notas') ?? '').trim();

  return {
    cliente: String(formData.get('cliente') ?? '').trim(),
    nombre_proyecto: String(formData.get('nombre_proyecto') ?? '').trim(),
    ubicacion: ubicacion.length > 0 ? ubicacion : null,
    fecha: parseFecha(fechaRaw),
    estado: String(formData.get('estado') ?? 'BORRADOR') as EstadoCotizacion,
    iva_enabled: formData.get('iva_enabled') === 'on',
    descuento: Number.parseFloat(descuentoRaw) || 0,
    notas: notas.length > 0 ? notas : null,
  };
}

export async function crearCotizacionAction(
  formData: FormData,
): Promise<ActionResult & { id: string | null }> {
  const input = leerCotizacionDeFormData(formData);

  if (!input.cliente || !input.nombre_proyecto) {
    return { id: null, error: 'Cliente y nombre del proyecto son obligatorios.' };
  }

  const { id, error } = await crearCotizacion(input);
  if (error) return { id: null, error };

  revalidatePath('/admin/cotizaciones');
  return { id, error: null };
}

export async function actualizarCotizacionAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const input = leerCotizacionDeFormData(formData);

  if (!input.cliente || !input.nombre_proyecto) {
    return { error: 'Cliente y nombre del proyecto son obligatorios.' };
  }

  const { error } = await actualizarCotizacion(id, input);
  if (error) return { error };

  revalidatePath('/admin/cotizaciones');
  revalidatePath(`/admin/cotizaciones/${id}`);
  return { error: null };
}

export async function eliminarCotizacionAction(id: string): Promise<ActionResult> {
  const { error } = await eliminarCotizacion(id);
  if (error) return { error };

  revalidatePath('/admin/cotizaciones');
  return { error: null };
}

export async function crearSeccionAction(
  cotizacionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const ordenRaw = String(formData.get('orden') ?? '0');

  if (!nombre) return { error: 'El nombre de la sección es obligatorio.' };

  const { error } = await crearSeccion({
    cotizacion_id: cotizacionId,
    nombre,
    orden: Number.parseInt(ordenRaw, 10) || 0,
  });
  if (error) return { error };

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { error: null };
}

export async function actualizarSeccionAction(
  id: string,
  cotizacionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const ordenRaw = String(formData.get('orden') ?? '0');

  if (!nombre) return { error: 'El nombre de la sección es obligatorio.' };

  const { error } = await actualizarSeccion(id, {
    nombre,
    orden: Number.parseInt(ordenRaw, 10) || 0,
  });
  if (error) return { error };

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { error: null };
}

export async function eliminarSeccionAction(
  id: string,
  cotizacionId: string,
): Promise<ActionResult> {
  const { error } = await eliminarSeccion(id);
  if (error) return { error };

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { error: null };
}

function leerPartidaDeFormData(formData: FormData) {
  const clave = String(formData.get('clave') ?? '').trim();
  const unidad = String(formData.get('unidad') ?? '').trim();
  const cantidadRaw = String(formData.get('cantidad') ?? '0');
  const precioRaw = String(formData.get('precio_unitario') ?? '0');
  const ordenRaw = String(formData.get('orden') ?? '0');

  return {
    clave: clave.length > 0 ? clave : null,
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    unidad: unidad.length > 0 ? unidad : null,
    cantidad: Number.parseFloat(cantidadRaw) || 0,
    precio_unitario: Number.parseFloat(precioRaw) || 0,
    orden: Number.parseInt(ordenRaw, 10) || 0,
  };
}

export async function crearPartidaAction(
  seccionId: string,
  cotizacionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const input = leerPartidaDeFormData(formData);

  if (!input.descripcion) return { error: 'La descripción es obligatoria.' };

  const { error } = await crearPartida({ seccion_id: seccionId, ...input });
  if (error) return { error };

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { error: null };
}

export async function actualizarPartidaAction(
  id: string,
  cotizacionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const input = leerPartidaDeFormData(formData);

  if (!input.descripcion) return { error: 'La descripción es obligatoria.' };

  const { error } = await actualizarPartida(id, input);
  if (error) return { error };

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { error: null };
}

export async function eliminarPartidaAction(
  id: string,
  cotizacionId: string,
): Promise<ActionResult> {
  const { error } = await eliminarPartida(id);
  if (error) return { error };

  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  return { error: null };
}
