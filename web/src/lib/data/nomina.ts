/// Lógica de nómina y asistencia (solo lectura), portada literal de
/// `nomina_calculator.dart` (NominaCalculator) del proyecto Flutter.
///
/// Reglas (contrato, NO modificar sin actualizar también el móvil):
/// - Semana: lunes 00:00:00.000 → domingo 23:59:59.999 (epoch ms, hora local).
/// - salarioDia = colaborador.salario_personalizado ?? puesto.salario_dia_default ?? 0
/// - tipo_pago === 'DIA':     totalPagar = Σ(asistencias.fraccion) × salarioDia
/// - tipo_pago === 'DESTAJO': totalPagar = Σ(destajos.monto)
/// - totalNomina = Σ totalPagar de todos los colaboradores

import { createClient } from '@/lib/supabase/server';
import type { Asistencia, Colaborador, Destajo, Puesto } from './types';

/** Inicio de la semana (lunes 00:00:00.000) que contiene `fecha`. */
export function getStartOfWeek(fecha: Date): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const isoWeekday = d.getDay() === 0 ? 7 : d.getDay(); // lunes=1 … domingo=7
  d.setDate(d.getDate() - (isoWeekday - 1));
  return d;
}

/** Fin de semana (domingo 23:59:59.999) a partir del inicio de semana. */
export function getEndOfWeek(startOfWeek: Date): Date {
  const start = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export interface SemanaRango {
  inicioMs: number;
  finMs: number;
}

/** Calcula el rango lunes→domingo (epoch ms) a partir de cualquier fecha ancla. */
export function semanaDe(ancla: Date): SemanaRango {
  const inicio = getStartOfWeek(ancla);
  const fin = getEndOfWeek(inicio);
  return { inicioMs: inicio.getTime(), finMs: fin.getTime() };
}

/** Desplaza la semana `dir` semanas (±1) a partir del inicio de semana actual. */
export function navegarSemana(inicioActualMs: number, dir: number): SemanaRango {
  const inicio = new Date(inicioActualMs);
  inicio.setDate(inicio.getDate() + dir * 7);
  return semanaDe(inicio);
}

export interface NominaItem {
  colaborador: Colaborador;
  puestoNombre: string;
  totalDias: number;
  totalDestajos: number;
  salarioBaseCalculado: number;
  totalPagar: number;
}

export interface NominaSummary {
  totalNomina: number;
  totalDia: number;
  totalDestajo: number;
  items: NominaItem[];
}

/** Porta `NominaCalculator.calcular` literal. */
export function calcularNomina(params: {
  colaboradores: Colaborador[];
  asistencias: Asistencia[];
  destajos: Destajo[];
  puestos: Puesto[];
}): NominaSummary {
  const { colaboradores, asistencias, destajos, puestos } = params;
  const puestoPorId = new Map(puestos.map((p) => [p.id, p]));

  let totalDia = 0;
  let totalDestajo = 0;
  const items: NominaItem[] = [];

  for (const worker of colaboradores) {
    const puesto = puestoPorId.get(worker.puesto_id ?? '');
    const puestoNombre = puesto?.nombre ?? 'Sin Puesto';
    const salarioDia = worker.salario_personalizado ?? puesto?.salario_dia_default ?? 0;

    if (worker.tipo_pago === 'DIA') {
      const sumFracciones = asistencias
        .filter((a) => a.colaborador_id === worker.id)
        .reduce((acc, a) => acc + a.fraccion, 0);
      const totalPagar = sumFracciones * salarioDia;
      totalDia += totalPagar;
      items.push({
        colaborador: worker,
        puestoNombre,
        totalDias: sumFracciones,
        totalDestajos: 0,
        salarioBaseCalculado: salarioDia,
        totalPagar,
      });
    } else {
      const sumDestajos = destajos
        .filter((d) => d.colaborador_id === worker.id)
        .reduce((acc, d) => acc + d.monto, 0);
      totalDestajo += sumDestajos;
      items.push({
        colaborador: worker,
        puestoNombre,
        totalDias: 0,
        totalDestajos: sumDestajos,
        salarioBaseCalculado: salarioDia,
        totalPagar: sumDestajos,
      });
    }
  }

  return {
    totalNomina: totalDia + totalDestajo,
    totalDia,
    totalDestajo,
    items,
  };
}

/// --- Lecturas -----------------------------------------------------------

/** Colaboradores activos asignados a una obra (vía `obra_colaborador`, sin fecha de salida). */
export async function listColaboradoresActivosObra(
  obraId: string,
): Promise<{ data: Colaborador[]; error: string | null }> {
  const supabase = await createClient();
  const { data: asignaciones, error: asigError } = await supabase
    .from('obra_colaborador')
    .select('colaborador_id')
    .eq('obra_id', obraId)
    .is('fecha_salida', null);

  if (asigError) return { data: [], error: asigError.message };

  const colaboradorIds = (asignaciones ?? []).map((a) => a.colaborador_id as string);
  if (colaboradorIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from('colaboradores')
    .select('*')
    .in('id', colaboradorIds)
    .is('deleted_at', null)
    .order('nombre');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Colaborador[], error: null };
}

export async function listAsistenciasObraRango(
  obraId: string,
  inicioMs: number,
  finMs: number,
): Promise<{ data: Asistencia[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('asistencias')
    .select('*')
    .eq('obra_id', obraId)
    .gte('fecha', inicioMs)
    .lte('fecha', finMs)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Asistencia[], error: null };
}

export async function listDestajosObraRango(
  obraId: string,
  inicioMs: number,
  finMs: number,
): Promise<{ data: Destajo[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('destajos')
    .select('*')
    .eq('obra_id', obraId)
    .gte('fecha', inicioMs)
    .lte('fecha', finMs)
    .is('deleted_at', null)
    .order('fecha', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Destajo[], error: null };
}

export async function listPuestosLite(): Promise<{ data: Puesto[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('puestos')
    .select('*')
    .is('deleted_at', null);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Puesto[], error: null };
}
