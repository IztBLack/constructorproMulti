/**
 * Lectura SEGURA de campos de un `FormData`.
 *
 * El patrón que había repartido por las Server Actions era
 * `Number(String(formData.get('monto') ?? '').trim())`, y ese patrón miente de
 * tres maneras distintas:
 *
 *   1. `formData.get` puede devolver un `File`. `String(File)` da la cadena
 *      "[object File]", que se guarda tan campante como nombre o concepto.
 *   2. `Number('abc')` es `NaN`, y `NaN` sobrevive a casi cualquier `if`: no es
 *      menor que nada ni mayor que nada. Un sueldo `NaN` acaba en la base.
 *   3. `Number('')` es `0`. Un campo vacío se vuelve un cero con toda la
 *      apariencia de un dato capturado.
 *
 * Aquí cada lectura devuelve `Resultado<T>`: o el valor ya limpio, o un mensaje
 * en español listo para enseñarse. La RLS protege el aislamiento entre
 * empresas; esto protege de la basura que escribe el propio usuario.
 */

import { medianocheMx, partesTz } from '@/lib/data/tz';
import { invalido, valido, type Resultado } from './resultado';

/**
 * Lo mínimo que se necesita de un `FormData` para leerlo. Que sea una interfaz
 * y no `FormData` a secas es lo que permite probar las validaciones con un
 * objeto plano, sin montar un DOM ni una petición.
 */
export interface FuenteFormData {
  get(campo: string): FormDataEntryValue | null;
}

/** Opciones comunes a todos los lectores. */
interface OpcionesBase {
  /**
   * Nombre humano del campo, con artículo, tal como aparece en el mensaje:
   * "El monto", "La fecha de inicio". Si falta, se usa el nombre técnico.
   */
  etiqueta?: string;
  /**
   * Mensaje que sustituye a CUALQUIER error de este campo. Sirve para conservar
   * palabra por palabra los avisos que la interfaz ya enseñaba.
   */
  mensaje?: string;
}

export interface OpcionesTexto extends OpcionesBase {
  /** Longitud máxima permitida. Pasarse es un error. */
  max?: number;
  /**
   * Recorte silencioso a esta longitud, sin error. Es distinto de `max`: aquí
   * el exceso se tira, no se rechaza. Solo para campos donde eso ya era el
   * comportamiento vivo (las observaciones de una nota).
   */
  recortarA?: number;
}

export interface OpcionesNumero extends OpcionesBase {
  /** Mínimo permitido (inclusive, salvo `minEstricto`). */
  min?: number;
  /** Máximo permitido, inclusive. */
  max?: number;
  /** Con `true`, `min` se lee como "estrictamente mayor que". */
  minEstricto?: boolean;
}

export interface OpcionesLista<T extends string> extends OpcionesBase {
  /**
   * Valor para cuando el campo NO viene (o viene vacío). Ojo: un valor presente
   * pero desconocido siempre es error. Caer al valor por omisión cuando alguien
   * manda basura es justo cómo se acababa guardando "MIXTA" en cuadrillas que
   * el usuario jamás marcó como mixtas.
   */
  porDefecto?: T;
}

function nombreDe(campo: string, opciones: OpcionesBase): string {
  return opciones.etiqueta ?? `El campo «${campo}»`;
}

function error<T>(opciones: OpcionesBase, mensaje: string): Resultado<T> {
  return invalido(opciones.mensaje ?? mensaje);
}

/**
 * Texto crudo del campo, ya con `trim`. Ausente es cadena vacía; un `File` es
 * error, porque no hay conversión honesta de un archivo a texto.
 */
function leerCrudo(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesBase,
): Resultado<string> {
  const bruto = fuente.get(campo);
  if (bruto === null || bruto === undefined) return valido('');
  if (typeof bruto !== 'string') {
    return error(opciones, `${nombreDe(campo, opciones)} no es un texto válido.`);
  }
  return valido(bruto.trim());
}

function aplicarLimites(
  campo: string,
  texto: string,
  opciones: OpcionesTexto,
): Resultado<string> {
  const recortado = opciones.recortarA !== undefined ? texto.slice(0, opciones.recortarA) : texto;
  if (opciones.max !== undefined && recortado.length > opciones.max) {
    return error(
      opciones,
      `${nombreDe(campo, opciones)} no puede pasar de ${opciones.max} caracteres.`,
    );
  }
  return valido(recortado);
}

// ── Texto ───────────────────────────────────────────────────────────────────

/** Texto obligatorio. Vacío o solo espacios es error. */
export function leerTexto(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesTexto = {},
): Resultado<string> {
  const crudo = leerCrudo(fuente, campo, opciones);
  if (!crudo.ok) return crudo;
  if (crudo.valor === '') {
    return error(opciones, `${nombreDe(campo, opciones)} es obligatorio.`);
  }
  return aplicarLimites(campo, crudo.valor, opciones);
}

/** Texto opcional. Ausente, vacío o solo espacios dan cadena vacía. */
export function leerTextoOpcional(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesTexto = {},
): Resultado<string> {
  const crudo = leerCrudo(fuente, campo, opciones);
  if (!crudo.ok) return crudo;
  return aplicarLimites(campo, crudo.valor, opciones);
}

// ── Números ─────────────────────────────────────────────────────────────────

/**
 * Decimal en notación de máquina y nada más: opcional signo, dígitos, punto
 * decimal y exponente.
 *
 * Es más estricto que `Number()` a propósito. `Number` acepta 'Infinity',
 * '0x1f' y ' ' (que da 0); ninguna de las tres es algo que alguien haya
 * TECLEADO queriendo decir un monto. Rechazar '1,500' también es deliberado:
 * en unos sitios son mil quinientos y en otros uno con cinco, y adivinar el
 * separador de miles de un sueldo no es una apuesta que valga la pena.
 */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function convertirNumero(
  campo: string,
  texto: string,
  opciones: OpcionesNumero,
): Resultado<number> {
  const nombre = nombreDe(campo, opciones);
  if (!DECIMAL.test(texto)) {
    return error(opciones, `${nombre} debe ser un número (sin comas ni símbolos).`);
  }

  const n = Number(texto);
  // El regex ya descarta 'NaN' e 'Infinity' escritos a mano, pero no un
  // '1e999', que sí es notación válida y desborda a Infinity al convertirse.
  if (!Number.isFinite(n)) {
    return error(opciones, `${nombre} debe ser un número (sin comas ni símbolos).`);
  }

  if (opciones.min !== undefined) {
    if (opciones.minEstricto ? !(n > opciones.min) : n < opciones.min) {
      return error(
        opciones,
        opciones.minEstricto
          ? `${nombre} debe ser mayor que ${opciones.min}.`
          : `${nombre} no puede ser menor que ${opciones.min}.`,
      );
    }
  }

  if (opciones.max !== undefined && n > opciones.max) {
    return error(opciones, `${nombre} no puede ser mayor que ${opciones.max}.`);
  }

  return valido(n);
}

/** Número finito obligatorio. */
export function leerNumero(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesNumero = {},
): Resultado<number> {
  const crudo = leerCrudo(fuente, campo, opciones);
  if (!crudo.ok) return crudo;
  if (crudo.valor === '') {
    return error(opciones, `${nombreDe(campo, opciones)} es obligatorio.`);
  }
  return convertirNumero(campo, crudo.valor, opciones);
}

/**
 * Número finito opcional. Vacío es `null`, NO cero: en este dominio `null`
 * suele significar "usa el cálculo" o "sin sueldo propio", y confundirlo con
 * cero deja notas cuadradas en cero y rayas sin dinero.
 */
export function leerNumeroOpcional(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesNumero = {},
): Resultado<number | null> {
  const crudo = leerCrudo(fuente, campo, opciones);
  if (!crudo.ok) return crudo;
  if (crudo.valor === '') return valido(null);
  return convertirNumero(campo, crudo.valor, opciones);
}

function exigirEntero(
  campo: string,
  n: number,
  opciones: OpcionesNumero,
): Resultado<number> {
  if (!Number.isInteger(n)) {
    return error(opciones, `${nombreDe(campo, opciones)} debe ser un número entero.`);
  }
  return valido(n);
}

/** Entero obligatorio. */
export function leerEntero(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesNumero = {},
): Resultado<number> {
  const n = leerNumero(fuente, campo, opciones);
  if (!n.ok) return n;
  return exigirEntero(campo, n.valor, opciones);
}

/** Entero opcional. Vacío es `null`. */
export function leerEnteroOpcional(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesNumero = {},
): Resultado<number | null> {
  const n = leerNumeroOpcional(fuente, campo, opciones);
  if (!n.ok || n.valor === null) return n;
  return exigirEntero(campo, n.valor, opciones);
}

// ── Fechas ──────────────────────────────────────────────────────────────────

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'YYYY-MM-DD' → epoch ms de esa medianoche en México.
 *
 * Valida de verdad, que es lo que `fechaInputAMs` no hace: aquella devuelve
 * `Date.now()` ante cualquier basura y deja que `Date.UTC` normalice de más, así
 * que un '2025-13-45' se guardaba —sin una sola queja— como 14 de febrero de
 * 2026. Aquí se comprueba que el día exista comparando el resultado contra la
 * fecha que se pidió.
 */
function convertirFecha(
  campo: string,
  texto: string,
  opciones: OpcionesBase,
): Resultado<number> {
  const nombre = nombreDe(campo, opciones);
  const m = FECHA_ISO.exec(texto);
  if (!m) return error(opciones, `${nombre} no es válida.`);

  const y = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2999 || mes < 1 || mes > 12 || d < 1 || d > 31) {
    return error(opciones, `${nombre} no es válida.`);
  }

  const ms = medianocheMx(y, mes - 1, d);
  if (!Number.isFinite(ms)) return error(opciones, `${nombre} no es válida.`);

  // El 30 de febrero se convierte sin protestar, pero sale del otro lado siendo
  // 1 o 2 de marzo. Si no coincide con lo que se pidió, es que no existía.
  const p = partesTz(ms);
  if (p.year !== y || p.month !== mes - 1 || p.day !== d) {
    return error(opciones, `${nombre} no es válida.`);
  }

  return valido(ms);
}

export interface OpcionesFecha extends OpcionesBase {
  /**
   * Valor cuando el campo viene vacío. Se pasa como función porque el uso
   * habitual es `Date.now`, y evaluarlo al declarar las opciones lo congelaría.
   */
  porDefecto?: () => number;
}

/** Fecha obligatoria en 'YYYY-MM-DD' → epoch ms (medianoche de México). */
export function leerFecha(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesFecha = {},
): Resultado<number> {
  const crudo = leerCrudo(fuente, campo, opciones);
  if (!crudo.ok) return crudo;
  if (crudo.valor === '') {
    if (opciones.porDefecto) return valido(opciones.porDefecto());
    return error(opciones, `${nombreDe(campo, opciones)} es obligatoria.`);
  }
  return convertirFecha(campo, crudo.valor, opciones);
}

/** Fecha opcional. Vacía es `null`; una fecha escrita pero imposible es error. */
export function leerFechaOpcional(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesBase = {},
): Resultado<number | null> {
  const crudo = leerCrudo(fuente, campo, opciones);
  if (!crudo.ok) return crudo;
  if (crudo.valor === '') return valido(null);
  return convertirFecha(campo, crudo.valor, opciones);
}

// ── Booleanos y listas cerradas ─────────────────────────────────────────────

const VERDADEROS = new Set(['on', 'true', '1', 'si', 'sí']);
const FALSOS = new Set(['off', 'false', '0', 'no']);

/**
 * Casilla de verificación. Un checkbox sin marcar NO se envía, así que ausente
 * es `false`; marcado llega como 'on'. Se aceptan además las formas que manda
 * un formulario armado a mano ('true'/'1').
 */
export function leerBooleano(
  fuente: FuenteFormData,
  campo: string,
  opciones: OpcionesBase = {},
): Resultado<boolean> {
  const crudo = leerCrudo(fuente, campo, opciones);
  if (!crudo.ok) return crudo;
  if (crudo.valor === '') return valido(false);

  const v = crudo.valor.toLowerCase();
  if (VERDADEROS.has(v)) return valido(true);
  if (FALSOS.has(v)) return valido(false);
  return error(opciones, `${nombreDe(campo, opciones)} no es un sí o un no.`);
}

/**
 * Valor de una lista cerrada (el `<select>` de la interfaz, un enum de la base).
 *
 * Un valor desconocido es SIEMPRE error, aunque haya `porDefecto`. Sustituirlo
 * en silencio guarda un dato que nadie eligió y que después nadie sabe explicar.
 */
export function leerDeLista<T extends string>(
  fuente: FuenteFormData,
  campo: string,
  valores: readonly T[],
  opciones: OpcionesLista<T> = {},
): Resultado<T> {
  const crudo = leerCrudo(fuente, campo, opciones);
  if (!crudo.ok) return crudo;

  if (crudo.valor === '') {
    if (opciones.porDefecto !== undefined) return valido(opciones.porDefecto);
    return error(opciones, `${nombreDe(campo, opciones)} es obligatorio.`);
  }

  const encontrado = valores.find((v) => v === crudo.valor);
  if (encontrado === undefined) {
    return error(opciones, `${nombreDe(campo, opciones)} no es un valor válido.`);
  }
  return valido(encontrado);
}
