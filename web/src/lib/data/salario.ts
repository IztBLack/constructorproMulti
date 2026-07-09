/// Cálculo del salario diario a partir del sueldo por periodo.
///
/// Regla de negocio: el usuario captura el sueldo SEMANAL, QUINCENAL o MENSUAL y
/// los días trabajados por semana de su empresa (5, 6 o 7). El salario diario
/// (colaborador.salario_personalizado, que consume la nómina) NO se edita: se
/// deriva aquí y solo se muestra como referencia.
///
/// Base anualizada: 52 semanas → 12 meses (52/12) o 24 quincenas (52/24).
///   6 días/semana → Semanal ÷6, Quincenal ÷13, Mensual ÷26.
///   5 días/semana → ÷5, ÷10.83, ÷21.67.   7 días/semana → ÷7, ÷15.17, ÷30.33.

import type { PeriodoPago } from './types';

export const PERIODO_PAGO_LABEL: Record<PeriodoPago, string> = {
  SEMANAL: 'Semanal',
  QUINCENAL: 'Quincenal',
  MENSUAL: 'Mensual',
};

/// Etiqueta del campo de monto según el periodo elegido.
export const SUELDO_PERIODO_LABEL: Record<PeriodoPago, string> = {
  SEMANAL: 'Sueldo semanal',
  QUINCENAL: 'Sueldo quincenal',
  MENSUAL: 'Sueldo mensual',
};

export const DIAS_SEMANA_OPCIONES = [5, 6, 7] as const;

export function esPeriodoPago(v: string): v is PeriodoPago {
  return v === 'SEMANAL' || v === 'QUINCENAL' || v === 'MENSUAL';
}

/// Días trabajados que abarca un periodo, según los días/semana de la empresa.
export function diasDelPeriodo(periodo: PeriodoPago, diasSemana: number): number {
  switch (periodo) {
    case 'SEMANAL':
      return diasSemana;
    case 'QUINCENAL':
      return (diasSemana * 52) / 24;
    case 'MENSUAL':
      return (diasSemana * 52) / 12;
  }
}

/// Salario diario (redondeado a centavos) derivado del sueldo del periodo.
/// Devuelve null si no hay monto válido (> 0).
export function salarioDiarioDesdePeriodo(
  montoPeriodo: number | null | undefined,
  periodo: PeriodoPago,
  diasSemana: number,
): number | null {
  if (montoPeriodo == null || !(montoPeriodo > 0)) return null;
  const dias = diasDelPeriodo(periodo, diasSemana);
  if (!(dias > 0)) return null;
  return Math.round((montoPeriodo / dias) * 100) / 100;
}
