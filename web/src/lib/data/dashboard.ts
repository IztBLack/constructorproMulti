/// Datos para el dashboard gerencial de /admin (solo lectura).
/// Pipeline y flujo de caja portados literal de `flujo_calculator.dart` y
/// `repositories_cotizacion.dart` (watchPipeline) del proyecto Flutter.

import { createClient } from '@/lib/supabase/server';
import type { Movimiento, Obra } from './types';

export interface PeriodoMensual {
  /** 1-12 */
  mes: number;
  anio: number;
  inicioMs: number;
  finMs: number;
}

const MESES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function nombreMes(mes: number): string {
  return MESES[mes] ?? '';
}

/** Construye el periodo mensual [inicio, fin) en epoch ms para mes/año dados. */
export function periodoMensual(anio: number, mes: number): PeriodoMensual {
  const inicio = new Date(anio, mes - 1, 1);
  const fin = new Date(anio, mes, 1);
  return { mes, anio, inicioMs: inicio.getTime(), finMs: fin.getTime() };
}

/** Construye el periodo anual [inicio, fin) en epoch ms para el año dado. */
export interface PeriodoAnual {
  anio: number;
  inicioMs: number;
  finMs: number;
}

export function periodoAnual(anio: number): PeriodoAnual {
  const inicio = new Date(anio, 0, 1);
  const fin = new Date(anio + 1, 0, 1);
  return { anio, inicioMs: inicio.getTime(), finMs: fin.getTime() };
}

/** Desplaza un periodo mensual `dir` meses (±1). */
export function navegarMes(anio: number, mes: number, dir: number): PeriodoMensual {
  const d = new Date(anio, mes - 1 + dir, 1);
  return periodoMensual(d.getFullYear(), d.getMonth() + 1);
}

export interface ResumenCaja {
  totalEntradas: number;
  totalSalidas: number;
  saldo: number;
}

/** Porta `FlujoCalculator.resumen`: saldo = Σ entradas − Σ salidas. */
export function resumenFlujo(movimientos: Movimiento[]): ResumenCaja {
  let entradas = 0;
  let salidas = 0;
  for (const m of movimientos) {
    if (m.tipo === 'ENTRADA') entradas += m.monto;
    else salidas += m.monto;
  }
  return { totalEntradas: entradas, totalSalidas: salidas, saldo: entradas - salidas };
}

/** Todos los movimientos de la empresa (todas las obras) en un rango [inicioMs, finMs). */
export async function listMovimientosEmpresaRango(
  inicioMs: number,
  finMs: number,
): Promise<{ data: Movimiento[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .gte('fecha', inicioMs)
    .lt('fecha', finMs)
    .is('deleted_at', null);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Movimiento[], error: null };
}

/** Todos los movimientos de la empresa, sin filtro de fecha (para saldo histórico por obra). */
export async function listMovimientosEmpresa(): Promise<{
  data: Movimiento[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('movimientos').select('*').is('deleted_at', null);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Movimiento[], error: null };
}

export interface DistribucionGasto {
  nomina: number;
  material: number;
  otros: number;
  total: number;
}

/** Agrupa las SALIDAS de un periodo por categoría (nómina/material/otros), flexible con el texto. */
export function distribucionGasto(movimientos: Movimiento[]): DistribucionGasto {
  let nomina = 0;
  let material = 0;
  let otros = 0;

  for (const m of movimientos) {
    if (m.tipo !== 'SALIDA') continue;
    const cat = (m.categoria ?? '').trim().toUpperCase();
    if (cat.includes('NOMINA') || cat.includes('NÓMINA')) {
      nomina += m.monto;
    } else if (cat.includes('MATERIAL')) {
      material += m.monto;
    } else {
      otros += m.monto;
    }
  }

  return { nomina, material, otros, total: nomina + material + otros };
}

/** KPI Pipeline: Σ (cantidad×precio_unitario de partidas) ×1.16 si iva_enabled,
 *  de las cotizaciones en estado BORRADOR o ENVIADA. Sin restar descuento
 *  (igual que `watchPipeline` en el móvil). */
export async function calcularPipeline(): Promise<{ value: number; error: string | null }> {
  const supabase = await createClient();

  const { data: cotizaciones, error: cotError } = await supabase
    .from('cotizaciones')
    .select('id, iva_enabled')
    .in('estado', ['BORRADOR', 'ENVIADA'])
    .is('deleted_at', null);

  if (cotError) return { value: 0, error: cotError.message };
  const cots = (cotizaciones ?? []) as { id: string; iva_enabled: boolean }[];
  if (cots.length === 0) return { value: 0, error: null };

  const cotIds = cots.map((c) => c.id);

  const { data: secciones, error: secError } = await supabase
    .from('secciones')
    .select('id, cotizacion_id')
    .in('cotizacion_id', cotIds)
    .is('deleted_at', null);

  if (secError) return { value: 0, error: secError.message };
  const seccionesList = (secciones ?? []) as { id: string; cotizacion_id: string }[];
  const seccionIds = seccionesList.map((s) => s.id);

  let partidas: { seccion_id: string; cantidad: number; precio_unitario: number }[] = [];
  if (seccionIds.length > 0) {
    const { data: partidasData, error: partError } = await supabase
      .from('partidas')
      .select('seccion_id, cantidad, precio_unitario')
      .in('seccion_id', seccionIds)
      .is('deleted_at', null);

    if (partError) return { value: 0, error: partError.message };
    partidas = (partidasData ?? []) as typeof partidas;
  }

  const seccionToCotizacion = new Map(seccionesList.map((s) => [s.id, s.cotizacion_id]));
  const subtotalPorCotizacion = new Map<string, number>();
  for (const c of cots) subtotalPorCotizacion.set(c.id, 0);

  for (const p of partidas) {
    const cotId = seccionToCotizacion.get(p.seccion_id);
    if (!cotId) continue;
    const actual = subtotalPorCotizacion.get(cotId) ?? 0;
    subtotalPorCotizacion.set(cotId, actual + p.cantidad * p.precio_unitario);
  }

  let total = 0;
  for (const c of cots) {
    const subtotal = subtotalPorCotizacion.get(c.id) ?? 0;
    total += c.iva_enabled ? subtotal * 1.16 : subtotal;
  }

  return { value: total, error: null };
}

export interface ObraConSaldo {
  obra: Obra;
  saldo: number;
  equipoActivo: number;
}

/** Conteo de colaboradores activos (sin fecha_salida) por obra. */
export async function contarEquipoActivoPorObra(): Promise<{
  data: Map<string, number>;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('obra_colaborador')
    .select('obra_id')
    .is('fecha_salida', null);

  if (error) return { data: new Map(), error: error.message };

  const map = new Map<string, number>();
  for (const row of (data ?? []) as { obra_id: string }[]) {
    map.set(row.obra_id, (map.get(row.obra_id) ?? 0) + 1);
  }
  return { data: map, error: null };
}

/** Saldo histórico (todas las fechas) y equipo activo de cada obra activa. */
export async function listObrasConSaldo(): Promise<{ data: ObraConSaldo[]; error: string | null }> {
  const supabase = await createClient();
  const { data: obras, error: obrasError } = await supabase
    .from('obras')
    .select('*')
    .eq('activa', true)
    .is('deleted_at', null)
    .order('nombre');

  if (obrasError) return { data: [], error: obrasError.message };
  const obrasList = (obras ?? []) as Obra[];

  const [{ data: movimientos, error: movError }, { data: equipoPorObra, error: equipoError }] =
    await Promise.all([listMovimientosEmpresa(), contarEquipoActivoPorObra()]);

  if (movError) return { data: [], error: movError };
  if (equipoError) return { data: [], error: equipoError };

  const result: ObraConSaldo[] = obrasList.map((obra) => {
    const movsObra = movimientos.filter((m) => m.obra_id === obra.id);
    const { saldo } = resumenFlujo(movsObra);
    return { obra, saldo, equipoActivo: equipoPorObra.get(obra.id) ?? 0 };
  });

  return { data: result, error: null };
}
