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

/**
 * Interruptor de una casilla. El cliente manda `'true'`/`'false'` explícito y no
 * la ausencia del campo —como haría un <form> nativo— porque estas acciones
 * reciben FormData armado a mano y por secciones: un campo ausente ahí no
 * significa "desmarcado", significa "esta tarjeta no habla de eso".
 */
function booleano(fd: FormData, campo: string, porDefecto: boolean): boolean {
  const bruto = String(fd.get(campo) ?? '').trim();
  if (bruto === '') return porDefecto;
  return bruto === 'true' || bruto === 'on' || bruto === '1';
}

function revalidar(obraId: string, notaId?: string) {
  revalidatePath(`/admin/obras/${obraId}/notas`);
  if (notaId) revalidatePath(`/admin/obras/${obraId}/notas/${notaId}`);
}

/**
 * Las tres tarjetas del editor son la misma fila, pero se guardan por separado:
 * cada una manda SOLO sus campos y se valida sola.
 *
 * Antes las tres mandaban el formulario entero por el mismo `parseNota`, así
 * que guardar la nota al pie exigía el destinatario —un campo de otra tarjeta—
 * y una nota sin nombre no dejaba guardar nada más.
 */
export type SeccionNota = 'datos' | 'cuentas' | 'pie';

type DatosNota = Pick<
  NotaInput,
  'destinatario' | 'colaborador_id' | 'titulo' | 'fecha' | 'estado' | 'mostrar_para'
>;

/**
 * El destinatario NO se valida: una nota puede nacer sin nombre y completarse
 * después (0034). Antes era obligatorio y eso obligaba a inventar un nombre
 * para poder apuntar un trato que se acababa de cerrar de palabra.
 */
function parseDatos(fd: FormData): DatosNota | { error: string } {
  const destinatario = texto(fd, 'destinatario');

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
    mostrar_para: booleano(fd, 'mostrar_para', true),
  };
}

function parseCuentas(fd: FormData): Pick<NotaInput, 'total_override' | 'saldo_override'> {
  return {
    total_override: numeroOpcional(fd, 'total_override'),
    saldo_override: numeroOpcional(fd, 'saldo_override'),
  };
}

function parsePie(fd: FormData): Pick<NotaInput, 'notas'> {
  return { notas: texto(fd, 'notas').slice(0, 2000) };
}

function parseSeccion(fd: FormData, seccion: SeccionNota): Partial<NotaInput> | { error: string } {
  if (seccion === 'cuentas') return parseCuentas(fd);
  if (seccion === 'pie') return parsePie(fd);
  return parseDatos(fd);
}

/** El alta sí arma la nota completa: nace con las tres partes de una vez. */
function parseNota(fd: FormData): NotaInput | { error: string } {
  const datos = parseDatos(fd);
  if ('error' in datos) return datos;

  return { ...datos, ...parseCuentas(fd), ...parsePie(fd) };
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
  seccion: SeccionNota,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseSeccion(formData, seccion);
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
      mostrar_porcentaje: false,
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
    // Solo las DEDUCCION esconden su cuenta, así que solo ellas guardan el
    // interruptor: cambiar de tipo lo apaga y no deja un ajuste invisible
    // esperando a que el renglón vuelva a ser deducción.
    mostrar_porcentaje: tipo === 'DEDUCCION' && booleano(fd, 'mostrar_porcentaje', false),
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
