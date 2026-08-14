/// Cálculo PURO de nómina. Sin Supabase, sin `server-only`: este archivo lo
/// importan tanto el servidor como el navegador.
///
/// Vive separado de `nomina.ts` porque aquel abre el cliente de Supabase de
/// servidor, y con un solo módulo mixto el bundler arrastra ese cliente al
/// navegador en cuanto un componente de cliente necesita la fórmula — que es
/// justo lo que hace la tabla de proyección, recalculando en cada toque.
///
/// Portado literal de `nomina_calculator.dart` (NominaCalculator) del proyecto
/// Flutter. Reglas (contrato, NO modificar sin actualizar también el móvil):
/// - Semana: lunes 00:00:00.000 → domingo 23:59:59.999 (epoch ms, hora local).
/// - salarioDia = colaborador.salario_personalizado ?? puesto.salario_dia_default ?? 0
/// - tipo_pago === 'DIA':     totalPagar = Σ(asistencias.fraccion) × salarioDia
/// - tipo_pago === 'DESTAJO': totalPagar = Σ(destajos.monto)
/// - totalNomina = Σ totalPagar de todos los colaboradores

import type { Asistencia, Colaborador, Destajo, Puesto } from './types';
import { partesTz, medianocheMx, sumarDiasCalendario, DIA_MS } from './tz';

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
