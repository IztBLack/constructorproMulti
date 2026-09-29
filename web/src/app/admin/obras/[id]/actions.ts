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
import {
  crearPartidaPresupuesto,
  actualizarPartidaPresupuesto,
  eliminarPartidaPresupuesto,
} from '@/lib/data/presupuesto-obra';
import type { TipoMovimiento } from '@/lib/data/types';
import { getContratoObra, guardarContratoObra } from '@/lib/data/estimaciones';
import { getEmpresaUsuario } from '@/lib/data/empresa';
import { fechaInputAMs } from '@/lib/data/tz';
import { leerCategoriaCosto } from '@/lib/rentabilidad/categorias';

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
  const clienteIdRaw = String(formData.get('cliente_id') ?? '').trim();
  const ubicacion = String(formData.get('ubicacion') ?? '').trim();
  const fechaInicioStr = String(formData.get('fecha_inicio') ?? '').trim();
  const avanceStr = String(formData.get('avance') ?? '0').trim();

  if (!nombre) {
    return { ok: false, error: 'El nombre de la obra es obligatorio.' };
  }

  const fechaInicio = fechaInicioStr ? fechaInputAMs(fechaInicioStr) : Date.now();
  if (!Number.isFinite(fechaInicio)) {
    return { ok: false, error: 'La fecha de inicio no es válida.' };
  }

  const avance = Math.min(100, Math.max(0, Math.round(Number(avanceStr) || 0)));

  const input: ObraInput = {
    nombre,
    cliente,
    cliente_id: clienteIdRaw || null,
    ubicacion,
    fechaInicio,
    avance,
  };

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
  const nombre = String(formData.get('nombre') ?? '').trim();
  // Solo si el formulario trae el selector (módulo de utilidad prendido). Si no
  // viene, no se toca la columna: apagar el módulo no borra la clasificación.
  const traeCategoriaCosto = formData.has('categoria_costo');
  const categoriaCosto = leerCategoriaCosto(formData.get('categoria_costo'));

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

  const fecha = fechaStr ? fechaInputAMs(fechaStr) : Date.now();
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
      nombre,
      // Una ENTRADA no es costo: nunca lleva categoría de costo.
      ...(traeCategoriaCosto ? { categoriaCosto: tipo === 'SALIDA' ? categoriaCosto : null } : {}),
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

// ── Presupuesto por partidas ────────────────────────────────────────────────

function parsePartidaFormData(
  formData: FormData,
  obraId: string,
): { input: { obraId: string; concepto: string; unidad: string; cantidad: number; precio_unitario: number; orden: number } } | { error: string } {
  const concepto = String(formData.get('concepto') ?? '').trim();
  const unidad = String(formData.get('unidad') ?? '').trim();
  const cantidadStr = String(formData.get('cantidad') ?? '').trim();
  const precioStr = String(formData.get('precio_unitario') ?? '').trim();
  const ordenStr = String(formData.get('orden') ?? '0').trim();

  if (!concepto) {
    return { error: 'El concepto de la partida es obligatorio.' };
  }

  const cantidad = Number(cantidadStr);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return { error: 'La cantidad debe ser un número mayor a cero.' };
  }

  const precio_unitario = Number(precioStr);
  if (!Number.isFinite(precio_unitario) || precio_unitario < 0) {
    return { error: 'El precio unitario no es válido.' };
  }

  const orden = Number(ordenStr) || 0;

  return {
    input: {
      obraId,
      concepto,
      unidad,
      cantidad,
      precio_unitario,
      orden,
    },
  };
}

export async function crearPartidaPresupuestoAction(
  obraId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parsePartidaFormData(formData, obraId);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  let result: { error: string | null };
  try {
    result = await crearPartidaPresupuesto(parsed.input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de autenticación.' };
  }

  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/obras/${obraId}`);
  return { ok: true };
}

export async function actualizarPartidaPresupuestoAction(
  id: string,
  obraId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parsePartidaFormData(formData, obraId);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const result = await actualizarPartidaPresupuesto(id, {
    concepto: parsed.input.concepto,
    unidad: parsed.input.unidad,
    cantidad: parsed.input.cantidad,
    precio_unitario: parsed.input.precio_unitario,
    orden: parsed.input.orden,
  });

  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/obras/${obraId}`);
  return { ok: true };
}

export async function eliminarPartidaPresupuestoAction(
  id: string,
  obraId: string,
): Promise<ActionResult> {
  const result = await eliminarPartidaPresupuesto(id);
  if (result.error) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/obras/${obraId}`);
  return { ok: true };
}

/**
 * Fija o corrige el IVA con que cobra la obra (IVA-2). Vive en
 * `obra_contrato.iva_pct` (0039), el mismo que usan sus estimaciones: una sola
 * tasa por obra. Se guarda la fila COMPLETA del contrato con lo que ya tenía
 * (nunca upsert parcial, RT7); si la obra no tenía contrato, nace uno sin
 * anticipo ni retenciones, que no cambia nada más. Solo el admin (RLS de 0039).
 */
export async function guardarIvaObraAction(obraId: string, pctTexto: string): Promise<ActionResult> {
  const limpio = pctTexto.trim().replace('%', '').replace(',', '.').trim();
  const pct = limpio === '' ? 0 : Number(limpio);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { ok: false, error: 'El IVA va de 0 a 100 %. Pon 0 si esta obra se cobra sin IVA.' };
  }
  const rol = await getEmpresaUsuario()
    .then((e) => e.rol)
    .catch(() => '');
  if (rol !== 'admin') return { ok: false, error: 'Solo el administrador cambia el IVA de la obra.' };

  const { data, error } = await getContratoObra(obraId);
  if (error) return { ok: false, error: `No se pudo leer el contrato de la obra: ${error}` };
  const r = await guardarContratoObra(obraId, { ...data.contrato, ivaPct: Math.round(pct * 10_000) / 10_000 });
  if (!r.ok) return { ok: false, error: r.error ?? 'No se pudo guardar el IVA.' };

  revalidatePath(`/admin/obras/${obraId}`);
  revalidatePath(`/admin/obras/${obraId}/estimaciones`);
  revalidatePath(`/admin/obras/${obraId}/utilidad`);
  revalidatePath('/admin/rentabilidad');
  return { ok: true };
}
