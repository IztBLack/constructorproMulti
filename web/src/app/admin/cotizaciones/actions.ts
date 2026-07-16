'use server';

import { revalidatePath } from 'next/cache';
import {
  actualizarCotizacion,
  actualizarPartida,
  actualizarSeccion,
  cambiarEstadoCotizacion,
  convertirCotizacionEnObra,
  crearCotizacion,
  crearPartida,
  crearSeccion,
  eliminarCotizacion,
  eliminarPartida,
  eliminarSeccion,
  enviarCotizacion,
} from '@/lib/data/cotizaciones';
import { buscarCatalogoConceptos } from '@/lib/data/catalogo';
import type { EstadoCotizacion } from '@/lib/data/types';
import { fechaInputAMs } from '@/lib/data/tz';

export interface ConceptoCatalogo {
  id: string;
  clave: string;
  descripcion: string;
  unidad: string;
  precio: number;
}

/// Autocompletado de partidas: busca conceptos del catálogo por clave/descripción.
export async function buscarCatalogoAction(query: string): Promise<ConceptoCatalogo[]> {
  const { data } = await buscarCatalogoConceptos(query);
  return data.map((c) => ({
    id: c.id,
    clave: c.clave ?? '',
    descripcion: c.descripcion,
    unidad: c.unidad ?? '',
    precio: c.precio_unitario_default,
  }));
}

export interface ActionResult {
  error: string | null;
}

function parseFecha(value: string): number {
  return fechaInputAMs(value);
}

function leerCotizacionDeFormData(formData: FormData) {
  const fechaRaw = String(formData.get('fecha') ?? '');
  const descuentoRaw = String(formData.get('descuento') ?? '0');
  const ubicacion = String(formData.get('ubicacion') ?? '').trim();
  const notas = String(formData.get('notas') ?? '').trim();
  const clienteIdRaw = String(formData.get('cliente_id') ?? '').trim();

  return {
    cliente: String(formData.get('cliente') ?? '').trim(),
    cliente_id: clienteIdRaw.length > 0 ? clienteIdRaw : null,
    nombre_proyecto: String(formData.get('nombre_proyecto') ?? '').trim(),
    ubicacion: ubicacion.length > 0 ? ubicacion : null,
    fecha: parseFecha(fechaRaw),
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

export async function enviarCotizacionAction(id: string): Promise<ActionResult> {
  const { error } = await enviarCotizacion(id);
  if (error) return { error };

  revalidatePath('/admin/cotizaciones');
  revalidatePath(`/admin/cotizaciones/${id}`);
  return { error: null };
}

export async function cambiarEstadoCotizacionAction(
  id: string,
  nuevo: EstadoCotizacion,
): Promise<ActionResult> {
  const { error } = await cambiarEstadoCotizacion(id, nuevo);
  if (error) return { error };

  revalidatePath('/admin/cotizaciones');
  revalidatePath(`/admin/cotizaciones/${id}`);
  return { error: null };
}

export async function convertirCotizacionEnObraAction(
  id: string,
): Promise<ActionResult & { obraId?: string }> {
  const { obraId, error } = await convertirCotizacionEnObra(id);
  if (error) return { error };

  revalidatePath('/admin/cotizaciones');
  revalidatePath(`/admin/cotizaciones/${id}`);
  revalidatePath('/admin/obras');
  return { error: null, obraId: obraId ?? undefined };
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
