'use server';

import { revalidatePath } from 'next/cache';
import {
  actualizarNotaObra,
  actualizarRenglon,
  crearNotaObra,
  crearRenglon,
  eliminarNotaObra,
  eliminarRenglon,
  reordenarRenglones,
  PASO_ORDEN,
  type NotaInput,
  type RenglonInput,
} from '@/lib/data/notas-obra';
import type { EstadoNota, TipoRenglon } from '@/lib/data/notas-obra-calculo';
import { fechaInputAMs } from '@/lib/data/tz';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ESTADOS: EstadoNota[] = ['ABIERTA', 'LIQUIDADA'];
const TIPOS: TipoRenglon[] = ['CONCEPTO', 'DEDUCCION', 'PAGO', 'TEXTO'];

/**
 * Campo numérico opcional. Vacío es `null` a propósito, no 0: `null` significa
 * "usa el cálculo" y 0 significa "vale cero". Confundirlos dejaría toda nota
 * recién creada con el total clavado en cero.
 */
function numeroOpcional(fd: FormData, campo: string): number | null {
  const bruto = String(fd.get(campo) ?? '').trim();
  if (bruto === '') return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? '').trim();
}

function revalidar(obraId: string, notaId?: string) {
  revalidatePath(`/admin/obras/${obraId}/notas`);
  if (notaId) revalidatePath(`/admin/obras/${obraId}/notas/${notaId}`);
}

function parseNota(fd: FormData): NotaInput | { error: string } {
  const destinatario = texto(fd, 'destinatario');
  if (!destinatario) return { error: 'Escribe a nombre de quién va la nota.' };

  const estadoBruto = texto(fd, 'estado');
  const estado = (ESTADOS as string[]).includes(estadoBruto)
    ? (estadoBruto as EstadoNota)
    : 'ABIERTA';

  const fechaStr = texto(fd, 'fecha');
  const fecha = fechaStr ? fechaInputAMs(fechaStr) : Date.now();
  if (!Number.isFinite(fecha)) return { error: 'La fecha no es válida.' };

  const colaboradorId = texto(fd, 'colaborador_id');

  return {
    destinatario,
    colaborador_id: colaboradorId || null,
    titulo: texto(fd, 'titulo'),
    fecha,
    estado,
    total_override: numeroOpcional(fd, 'total_override'),
    saldo_override: numeroOpcional(fd, 'saldo_override'),
    notas: texto(fd, 'notas').slice(0, 2000),
  };
}

export async function crearNotaAction(
  obraId: string,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  const parsed = parseNota(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const cuantasHay = Number(formData.get('cuantas_hay') ?? 0);
  const orden = (Number.isFinite(cuantasHay) ? cuantasHay + 1 : 1) * PASO_ORDEN;

  const { id, error } = await crearNotaObra(obraId, parsed, orden);
  if (error) return { ok: false, error };

  revalidar(obraId);
  return { ok: true, id: id ?? undefined };
}

export async function actualizarNotaAction(
  obraId: string,
  notaId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseNota(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const resultado = await actualizarNotaObra(notaId, parsed);
  if (!resultado.ok) return resultado;

  revalidar(obraId, notaId);
  return { ok: true };
}

export async function eliminarNotaAction(
  obraId: string,
  notaId: string,
): Promise<ActionResult> {
  const resultado = await eliminarNotaObra(notaId);
  if (!resultado.ok) return resultado;

  revalidar(obraId, notaId);
  return { ok: true };
}

function parseRenglon(fd: FormData): RenglonInput | { error: string } {
  const tipoBruto = texto(fd, 'tipo');
  const tipo = (TIPOS as string[]).includes(tipoBruto) ? (tipoBruto as TipoRenglon) : 'CONCEPTO';

  const etiqueta = texto(fd, 'etiqueta');
  if (!etiqueta) return { error: 'El renglón necesita un concepto.' };

  const fechaStr = texto(fd, 'fecha');
  const fecha = fechaStr ? fechaInputAMs(fechaStr) : null;
  if (fecha !== null && !Number.isFinite(fecha)) return { error: 'La fecha del renglón no es válida.' };

  const ordenBruto = Number(fd.get('orden') ?? 0);

  // Un TEXTO no lleva importe: se limpian los tres campos para que un cambio de
  // tipo no deje montos fantasma sumando desde un renglón que ya no suma.
  if (tipo === 'TEXTO') {
    return {
      tipo,
      etiqueta,
      monto: null,
      monto_base: null,
      porcentaje: null,
      texto: texto(fd, 'texto'),
      fecha,
      orden: Number.isFinite(ordenBruto) ? ordenBruto : 0,
    };
  }

  return {
    tipo,
    etiqueta,
    monto: numeroOpcional(fd, 'monto'),
    monto_base: numeroOpcional(fd, 'monto_base'),
    porcentaje: numeroOpcional(fd, 'porcentaje'),
    texto: texto(fd, 'texto'),
    fecha,
    orden: Number.isFinite(ordenBruto) ? ordenBruto : 0,
  };
}

export async function crearRenglonAction(
  obraId: string,
  notaId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseRenglon(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const resultado = await crearRenglon(notaId, parsed);
  if (!resultado.ok) return resultado;

  revalidar(obraId, notaId);
  return { ok: true };
}

export async function actualizarRenglonAction(
  obraId: string,
  notaId: string,
  renglonId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseRenglon(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const resultado = await actualizarRenglon(renglonId, parsed);
  if (!resultado.ok) return resultado;

  revalidar(obraId, notaId);
  return { ok: true };
}

export async function eliminarRenglonAction(
  obraId: string,
  notaId: string,
  renglonId: string,
): Promise<ActionResult> {
  const resultado = await eliminarRenglon(renglonId);
  if (!resultado.ok) return resultado;

  revalidar(obraId, notaId);
  return { ok: true };
}

export async function reordenarRenglonesAction(
  obraId: string,
  notaId: string,
  ids: string[],
): Promise<ActionResult> {
  const resultado = await reordenarRenglones(ids);
  if (!resultado.ok) return resultado;

  revalidar(obraId, notaId);
  return { ok: true };
}
