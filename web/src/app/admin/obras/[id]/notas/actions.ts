'use server';

import { revalidatePath } from 'next/cache';
import {
  leerDeLista,
  leerFecha,
  leerNumeroOpcional,
  type FuenteFormData,
} from '@/lib/validacion/campos';
import type { Resultado } from '@/lib/validacion/resultado';
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
function numeroOpcional(
  fd: FuenteFormData,
  campo: string,
  etiqueta: string,
): Resultado<number | null> {
  return leerNumeroOpcional(fd, campo, { etiqueta });
}

function texto(fd: FuenteFormData, campo: string): string {
  return String(fd.get(campo) ?? '').trim();
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
  'destinatario' | 'colaborador_id' | 'titulo' | 'fecha' | 'estado'
>;

function parseDatos(fd: FuenteFormData): DatosNota | { error: string } {
  const destinatario = texto(fd, 'destinatario');
  if (!destinatario) return { error: 'Escribe a nombre de quién va la nota.' };

  // Un estado desconocido ya no cae a 'ABIERTA' en silencio: una nota liquidada
  // que reapareciera como abierta por un valor mal escrito es una deuda que
  // vuelve a existir sin que nadie lo decida.
  const estado = leerDeLista(fd, 'estado', ESTADOS, {
    etiqueta: 'El estado de la nota',
    porDefecto: 'ABIERTA',
  });
  if (!estado.ok) return { error: estado.error };

  // `fechaInputAMs` no valida: deja que `Date.UTC` normalice, así que un
  // '2026-02-30' se guardaba como 2 de marzo sin protestar.
  const fecha = leerFecha(fd, 'fecha', {
    porDefecto: Date.now,
    mensaje: 'La fecha no es válida.',
  });
  if (!fecha.ok) return { error: fecha.error };

  const colaboradorId = texto(fd, 'colaborador_id');

  return {
    destinatario,
    colaborador_id: colaboradorId || null,
    titulo: texto(fd, 'titulo'),
    fecha: fecha.valor,
    estado: estado.valor,
  };
}

/// Los dos montos que el dueño puede FIJAR A MANO cuando la aritmética de la
/// nota no coincide con lo que se acordó de palabra.
///
/// EL AGUJERO QUE ESTO CIERRA. Antes, un valor mal escrito se convertía en
/// `null` — y `null` aquí no significa "cero", significa "usa el cálculo". O
/// sea: escribir mal el total acordado no daba error, **borraba el total
/// acordado** y la nota volvía en silencio al número calculado, que es
/// justamente el que el dueño estaba corrigiendo. Vacío sigue significando
/// "usa el cálculo"; escrito y mal ahora se avisa.
function parseCuentas(
  fd: FuenteFormData,
): Pick<NotaInput, 'total_override' | 'saldo_override'> | { error: string } {
  const total = numeroOpcional(fd, 'total_override', 'El total');
  if (!total.ok) return { error: total.error };

  const saldo = numeroOpcional(fd, 'saldo_override', 'El saldo');
  if (!saldo.ok) return { error: saldo.error };

  return { total_override: total.valor, saldo_override: saldo.valor };
}

function parsePie(fd: FuenteFormData): Pick<NotaInput, 'notas'> {
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

  const cuentas = parseCuentas(fd);
  if ('error' in cuentas) return cuentas;

  return { ...datos, ...cuentas, ...parsePie(fd) };
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
      texto: texto(fd, 'texto'),
      fecha,
      orden: Number.isFinite(ordenBruto) ? ordenBruto : 0,
    };
  }

  // Los tres montos del renglón: un valor mal escrito ya no se convierte en
  // `null`. En una deducción por porcentaje, ese null hacía que el renglón
  // dejara de restar y el saldo de la nota subiera sin que nadie lo hubiera
  // tocado.
  const monto = numeroOpcional(fd, 'monto', 'El monto');
  if (!monto.ok) return { error: monto.error };

  const montoBase = numeroOpcional(fd, 'monto_base', 'El monto base');
  if (!montoBase.ok) return { error: montoBase.error };

  const porcentaje = numeroOpcional(fd, 'porcentaje', 'El porcentaje');
  if (!porcentaje.ok) return { error: porcentaje.error };

  return {
    tipo,
    etiqueta,
    monto: monto.valor,
    monto_base: montoBase.valor,
    porcentaje: porcentaje.valor,
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
