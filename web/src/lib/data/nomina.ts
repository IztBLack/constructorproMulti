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
import { partesTz, medianocheMx, sumarDiasCalendario, siguienteMedianocheMx, DIA_MS } from './tz';

export interface SemanaRango {
  inicioMs: number;
  finMs: number;
}

/**
 * Rango lunes 00:00:00.000 → domingo 23:59:59.999 (epoch ms) de la semana que
 * contiene el instante `ancla`, calculado en zona **México** (no en la zona del
 * servidor). Así coincide con las fechas de asistencia que guarda el móvil.
 */
export function semanaDe(ancla: Date): SemanaRango {
  const p = partesTz(ancla.getTime());
  // Retrocede al lunes en calendario (weekday: 1=lunes … 7=domingo).
  const lunes = sumarDiasCalendario(p.year, p.month, p.day, -(p.weekday - 1));
  const inicioMs = medianocheMx(lunes.y, lunes.m0, lunes.d);
  const domingo = sumarDiasCalendario(lunes.y, lunes.m0, lunes.d, 6);
  const finMs = medianocheMx(domingo.y, domingo.m0, domingo.d) + DIA_MS - 1;
  return { inicioMs, finMs };
}

/** Desplaza la semana `dir` semanas (±1) a partir del inicio de semana actual. */
export function navegarSemana(inicioActualMs: number, dir: number): SemanaRango {
  const p = partesTz(inicioActualMs);
  const destino = sumarDiasCalendario(p.year, p.month, p.day, dir * 7);
  // Ancla al mediodía de México de ese día para caer sin ambigüedad en la semana.
  return semanaDe(new Date(medianocheMx(destino.y, destino.m0, destino.d) + 12 * 3600 * 1000));
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

/**
 * Colaboradores asignados a una obra (vía `obra_colaborador`).
 *
 * Con `vigentesDesdeMs` la consulta es **consciente de la fecha**: devuelve a
 * quien estaba asignado en ese momento, no solo a quien lo está hoy. Sin ese
 * parámetro conserva el comportamiento viejo ("asignados ahora mismo").
 *
 * Hace falta porque al mover a alguien de obra se le cierra la asignación
 * anterior. Con el filtro de solo `fecha_salida is null`, esa persona
 * desaparecería de la obra vieja **también en las semanas pasadas**, cuando sí
 * trabajó ahí, y no se podría corregir una asistencia anterior.
 *
 * `fecha_salida` marca el día en que la persona DEJA de pertenecer a la obra:
 * ese día ya no cuenta como suyo (convención observada en los datos: en las 9
 * asignaciones cerradas, nadie trabajó el día de su salida). Por eso la
 * comparación es contra la medianoche del día siguiente — así además se ignora
 * la hora de reloj con la que se guardaron las filas viejas.
 */
export async function listColaboradoresActivosObra(
  obraId: string,
  vigentesDesdeMs?: number,
): Promise<{ data: Colaborador[]; error: string | null }> {
  const supabase = await createClient();
  const base = supabase.from('obra_colaborador').select('colaborador_id').eq('obra_id', obraId);
  const { data: asignaciones, error: asigError } =
    vigentesDesdeMs === undefined
      ? await base.is('fecha_salida', null)
      : await base.or(
          `fecha_salida.is.null,fecha_salida.gte.${siguienteMedianocheMx(vigentesDesdeMs)}`,
        );

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
