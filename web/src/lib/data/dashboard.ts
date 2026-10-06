/// Datos para el dashboard gerencial de /admin (solo lectura).
/// Pipeline y flujo de caja portados literal de `flujo_calculator.dart` y
/// `repositories_cotizacion.dart` (watchPipeline) del proyecto Flutter.

import { createClient } from '@/lib/supabase/server';
import type { Movimiento, Obra } from './types';
import { medianocheMx } from './tz';
import { traerTodo } from './paginado';

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

/** Construye el periodo mensual [inicio, fin) en epoch ms (zona México) para mes/año dados. */
export function periodoMensual(anio: number, mes: number): PeriodoMensual {
  const inicioMs = medianocheMx(anio, mes - 1, 1);
  const finMs = medianocheMx(mes === 12 ? anio + 1 : anio, mes === 12 ? 0 : mes, 1);
  return { mes, anio, inicioMs, finMs };
}

/** Construye el periodo anual [inicio, fin) en epoch ms para el año dado. */
export interface PeriodoAnual {
  anio: number;
  inicioMs: number;
  finMs: number;
}

export function periodoAnual(anio: number): PeriodoAnual {
  return { anio, inicioMs: medianocheMx(anio, 0, 1), finMs: medianocheMx(anio + 1, 0, 1) };
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
  // Paginado y no agregado en SQL a propósito: estas filas alimentan
  // `distribucionGasto`, que clasifica por el TEXTO de la categoría con reglas
  // que viven en TypeScript (y en Dart). Traer las filas de UN MES y clasificar
  // aquí mantiene esa regla en un solo sitio; agregar por categoría en SQL
  // obligaría a duplicar el criterio en un tercer lenguaje.
  return traerTodo<Movimiento>((desde, hasta) =>
    supabase
      .from('movimientos')
      .select('*')
      .gte('fecha', inicioMs)
      .lt('fecha', finMs)
      .is('deleted_at', null)
      .order('id')
      .range(desde, hasta)
      .returns<Movimiento[]>(),
  );
}

export interface FlujoObra {
  obraId: string;
  entradas: number;
  salidas: number;
}

/// Entradas y salidas acumuladas por obra — UNA FILA POR OBRA.
///
/// Sustituye a la lectura de todos los movimientos de la historia de la empresa
/// para sumarlos en memoria. El saldo no sale de aquí: lo calcula
/// `resumenFlujo`, que es el puerto de `flujo_calculator.dart` y la única
/// definición de "saldo = entradas − salidas" del lado web.
export async function flujoPorObra(): Promise<{ data: FlujoObra[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('flujo_por_obra');

  if (error) return { data: [], error: error.message };

  const filas = (data ?? []) as { obra_id: string; entradas: number; salidas: number }[];
  return {
    data: filas.map((f) => ({ obraId: f.obra_id, entradas: f.entradas, salidas: f.salidas })),
    error: null,
  };
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
  const estados = ['BORRADOR', 'ENVIADA'];

  const { data, error } = await supabase.rpc('subtotal_por_cotizacion', { p_estados: estados });

  if (error) return { value: 0, error: error.message };

  const filas = (data ?? []) as { iva_enabled: boolean; subtotal: number }[];
  return { value: aplicarIvaPipeline(filas), error: null };
}

/// La regla del pipeline, aislada para que sólo exista una vez: subtotal ×1.16
/// si la cotización lleva IVA, sin restar descuento (igual que `watchPipeline`
/// en el móvil). La base entrega el subtotal crudo; esta línea es el criterio.
function aplicarIvaPipeline(filas: { iva_enabled: boolean; subtotal: number }[]): number {
  return filas.reduce((total, f) => total + (f.iva_enabled ? f.subtotal * 1.16 : f.subtotal), 0);
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
  const { data, error } = await supabase.rpc('equipo_activo_por_obra');

  if (error) return { data: new Map(), error: error.message };

  const map = new Map<string, number>();
  for (const row of (data ?? []) as { obra_id: string; activos: number }[]) {
    map.set(row.obra_id, row.activos);
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

  const [{ data: flujo, error: flujoError }, { data: equipoPorObra, error: equipoError }] =
    await Promise.all([flujoPorObra(), contarEquipoActivoPorObra()]);

  if (flujoError) return { data: [], error: flujoError };
  if (equipoError) return { data: [], error: equipoError };

  const flujoPorId = new Map(flujo.map((f) => [f.obraId, f]));

  const result: ObraConSaldo[] = obrasList.map((obra) => {
    const f = flujoPorId.get(obra.id);
    // La resta vive aquí y no en SQL: "saldo = entradas − salidas" es la regla
    // de `flujo_calculator.dart`, y sólo puede tener una definición por
    // plataforma. La base agrega; el criterio se queda donde está probado.
    const saldo = f ? f.entradas - f.salidas : 0;
    return { obra, saldo, equipoActivo: equipoPorObra.get(obra.id) ?? 0 };
  });

  return { data: result, error: null };
}
