/**
 * Validación de FORMATO del RFC y del código postal (RF1b.2). No consulta al
 * SAT: solo evita los errores de dedo que hacen que una factura rebote.
 *
 * El RFC es:
 *   · persona moral: 3 letras + fecha AAMMDD + homoclave de 3  = 12
 *   · persona física: 4 letras + fecha AAMMDD + homoclave de 3 = 13
 * Los genéricos del SAT (público en general y extranjeros) son válidos como
 * RECEPTOR, nunca como emisor.
 */

import type { TipoPersona } from './catalogos';

export const RFC_PUBLICO_GENERAL = 'XAXX010101000';
export const RFC_EXTRANJERO = 'XEXX010101000';

const PATRON = /^([A-ZÑ&]{3,4})([0-9]{2})([0-9]{2})([0-9]{2})([A-Z0-9]{3})$/;

export type ResultadoRfc =
  | { ok: true; rfc: string; tipo: TipoPersona; generico: boolean }
  | { ok: false; error: string };

/** Mayúsculas, sin espacios ni guiones (así se copia de la constancia a veces). */
export function limpiarRfc(crudo: string): string {
  return crudo.toUpperCase().replace(/[\s-]/g, '');
}

function fechaValida(aa: string, mm: string, dd: string): boolean {
  const mes = Number(mm);
  const dia = Number(dd);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  // Año bisiesto: con dos dígitos no se sabe el siglo; 00 es bisiesto en 2000.
  const anio = Number(aa);
  const bisiesto = anio % 4 === 0;
  const dias = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  return dia <= dias;
}

export function validarRfc(crudo: string, opciones: { permitirGenerico?: boolean } = {}): ResultadoRfc {
  const rfc = limpiarRfc(crudo);
  if (rfc.length === 0) return { ok: false, error: 'Escribe el RFC.' };
  if (rfc.length !== 12 && rfc.length !== 13) {
    return {
      ok: false,
      error: `El RFC tiene ${rfc.length} caracteres: son 12 si es empresa (persona moral) y 13 si es persona física.`,
    };
  }
  const m = PATRON.exec(rfc);
  if (!m) {
    return {
      ok: false,
      error: 'El RFC no tiene el formato correcto: letras al inicio, luego la fecha (6 números) y 3 caracteres al final.',
    };
  }
  const generico = rfc === RFC_PUBLICO_GENERAL || rfc === RFC_EXTRANJERO;
  if (generico && opciones.permitirGenerico === false) {
    return { ok: false, error: 'El RFC genérico solo sirve para el cliente, no para quien factura.' };
  }
  if (!fechaValida(m[2], m[3], m[4])) {
    return { ok: false, error: 'La fecha dentro del RFC no existe. Revisa los 6 números del medio.' };
  }
  return { ok: true, rfc, tipo: m[1].length === 3 ? 'moral' : 'fisica', generico };
}

/** Tipo de persona por el largo del RFC, sin validar lo demás (null si no se sabe). */
export function tipoPersonaDeRfc(rfc: string | null | undefined): TipoPersona | null {
  const r = limpiarRfc(rfc ?? '');
  if (r.length === 12) return 'moral';
  if (r.length === 13) return 'fisica';
  return null;
}

export function validarCp(crudo: string): { ok: true; cp: string } | { ok: false; error: string } {
  const cp = crudo.trim();
  if (!/^[0-9]{5}$/.test(cp)) return { ok: false, error: 'El código postal son 5 números.' };
  return { ok: true, cp };
}

/** Razón social tal cual la constancia: se quitan espacios dobles y de los extremos. */
export function limpiarRazonSocial(crudo: string): string {
  return crudo.trim().replace(/\s+/g, ' ');
}

export function validarCorreo(crudo: string): { ok: true; correo: string } | { ok: false; error: string } {
  const correo = crudo.trim().toLowerCase();
  if (correo.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    return { ok: false, error: 'El correo no parece válido.' };
  }
  return { ok: true, correo };
}
