/**
 * Aritmética de las LISTAS DE MATERIAL (migración 0050, fase 1).
 *
 * Gemelo de `lib/domain/listas/listas_calculo.dart` (móvil): los dos tienen que
 * dar los MISMOS números —la lista se palomea en el celular y se imprime en la
 * oficina—. Los casos viven en `casos.json` y los leen las pruebas de las dos
 * plataformas.
 *
 * REGLA DEL MÓDULO: lo que se captura es lo que marca el plano. La app no
 * inventa medidas; solo hace cuentas con lo capturado. Por eso los resultados
 * (metros, estribos) no se guardan: se recalculan aquí.
 *
 * Módulo PURO (sin Supabase): lo importan las pantallas, el PDF y las pruebas.
 */

export type TipoRenglonLista = 'PIEZA' | 'LIBRE';
export type EstadoLista = 'ABIERTA' | 'CERRADA';

/** Espaciado del `orden` (convención de 0026: 100, 200, 300…). */
export const PASO_ORDEN_LISTA = 100;

/** Un tipo de una fase más nueva se trata como LIBRE: se enseña, no se calcula. */
export function tipoRenglonLista(s: unknown): TipoRenglonLista {
  return s === 'PIEZA' ? 'PIEZA' : 'LIBRE';
}

export function estadoLista(s: unknown): EstadoLista {
  return s === 'CERRADA' ? 'CERRADA' : 'ABIERTA';
}

/** Quién ve listas: lo mismo que abren las policies de 0050. */
const ROLES_VEN = ['admin', 'supervisor', 'residente', 'contador', 'compras', 'almacen'];
/** Quién crea, edita y palomea (contador, compras y almacén solo leen). */
const ROLES_EDITAN = ['admin', 'supervisor', 'residente'];

export function puedeVerListas(rol: string | null | undefined): boolean {
  return typeof rol === 'string' && ROLES_VEN.includes(rol);
}

export function puedeEditarListas(rol: string | null | undefined): boolean {
  return typeof rol === 'string' && ROLES_EDITAN.includes(rol);
}

/** Lo mínimo que la cuenta necesita de un renglón. */
export interface RenglonCalc {
  tipo: TipoRenglonLista;
  cantidad: number;
  largo: number | null;
  separacion_cm: number | null;
  marcado?: boolean;
}

/** Tolerancia para que 3.00 × 100 / 25 (= 11.999… en binario) cuente 12. */
const EPS = 1e-6;

export function redondear2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Metros lineales: cantidad × largo. Null si no es pieza o falta el largo. */
export function metrosLineales(r: RenglonCalc): number | null {
  if (r.tipo !== 'PIEZA' || r.largo == null) return null;
  return redondear2(r.cantidad * r.largo);
}

/**
 * Estribos de UNA pieza a separación fija: uno al arranque y uno por cada tramo
 * completo, ⌊L / s⌋ + 1. Es la cuenta del PDF que el dueño revisó (3.55 m @25
 * cm → 15). Null sin largo o sin separación.
 */
export function estribosPorPieza(largo: number | null, separacionCm: number | null): number | null {
  if (largo == null || separacionCm == null || separacionCm <= 0) return null;
  return Math.floor((largo * 100) / separacionCm + EPS) + 1;
}

/** Estribos de todo el renglón: por pieza × piezas. */
export function estribosTotales(r: RenglonCalc): number | null {
  const porPieza = estribosPorPieza(r.largo, r.separacion_cm);
  if (r.tipo !== 'PIEZA' || porPieza == null) return null;
  return porPieza * Math.round(r.cantidad);
}

export interface TotalesLista {
  renglones: number;
  marcados: number;
  /** Suma de cantidades de los PIEZA (lo suelto no son piezas). */
  piezas: number;
  metros: number;
  estribos: number;
}

export function totalesDe(renglones: readonly RenglonCalc[]): TotalesLista {
  let marcados = 0;
  let piezas = 0;
  let metros = 0;
  let estribos = 0;
  for (const r of renglones) {
    if (r.marcado) marcados++;
    if (r.tipo === 'PIEZA') piezas += r.cantidad;
    metros += metrosLineales(r) ?? 0;
    estribos += estribosTotales(r) ?? 0;
  }
  return {
    renglones: renglones.length,
    marcados,
    piezas: redondear2(piezas),
    metros: redondear2(metros),
    estribos,
  };
}

export function listaCompleta(t: TotalesLista): boolean {
  return t.renglones > 0 && t.marcados === t.renglones;
}

/** Las secciones en el orden en que aparecen, con sus renglones. */
export function agruparPorSeccion<T>(renglones: readonly T[], seccionDe: (r: T) => string): [string, T[]][] {
  const grupos = new Map<string, T[]>();
  for (const r of renglones) {
    const s = seccionDe(r).trim();
    const g = grupos.get(s);
    if (g) g.push(r);
    else grupos.set(s, [r]);
  }
  return [...grupos.entries()];
}

/** Número sin ceros de más: 4 → «4», 2.5 → «2.5», 10.45 → «10.45». */
export function numeroCorto(v: number): string {
  const r = redondear2(v);
  if (Number.isInteger(r)) return r.toFixed(0);
  return r.toFixed(2).replace(/0$/, '');
}

/** Medida con dos decimales fijos, como en el PDF: 3 → «3.00». */
export function metros2(v: number): string {
  return redondear2(v).toFixed(2);
}

/** «15 pzas · 92.90 m · 30 estribos», sin las partes en cero. */
export function resumenTotales(t: TotalesLista): string {
  return [
    t.piezas > 0 ? `${numeroCorto(t.piezas)} pzas` : '',
    t.metros > 0 ? `${metros2(t.metros)} m` : '',
    t.estribos > 0 ? `${t.estribos} estribos` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
