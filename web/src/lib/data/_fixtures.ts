/// Constructores de entidades para las pruebas.
///
/// Existen porque los tipos de `types.ts` espejan las filas de Postgres al
/// completo (empresa_id, created_at, sync…) y una prueba de nómina que tuviera
/// que escribir esos ocho campos por colaborador sería ilegible: lo relevante
/// —el sueldo, la fracción, el tipo de pago— quedaría enterrado.
///
/// Solo los usan los `.test.ts`; no se importan desde la app.

import type {
  Asistencia,
  Colaborador,
  Destajo,
  PeriodoPago,
  Puesto,
  TipoPago,
} from './types';

const AUDITORIA = {
  empresa_id: 'e1',
  created_at: 0,
  updated_at: 0,
  server_updated_at: null,
  deleted_at: null,
} as const;

export function puesto(
  id: string,
  nombre: string,
  salarioDiaDefault: number,
): Puesto {
  return { ...AUDITORIA, id, nombre, salario_dia_default: salarioDiaDefault };
}

export function colaborador(
  id: string,
  nombre: string,
  opciones: {
    puestoId?: string | null;
    tipoPago?: TipoPago;
    salarioPersonalizado?: number | null;
    periodoPago?: PeriodoPago;
    salarioPeriodo?: number | null;
    diasSemana?: number;
  } = {},
): Colaborador {
  return {
    ...AUDITORIA,
    id,
    nombre,
    puesto_id: opciones.puestoId ?? null,
    tipo_pago: opciones.tipoPago ?? 'DIA',
    telefono: null,
    contacto_nombre: null,
    contacto_telefono: null,
    contacto_parentesco: null,
    activo: true,
    salario_personalizado: opciones.salarioPersonalizado ?? null,
    periodo_pago: opciones.periodoPago ?? 'SEMANAL',
    salario_periodo: opciones.salarioPeriodo ?? null,
    dias_semana: opciones.diasSemana ?? 6,
  };
}

export function asistencia(
  colaboradorId: string,
  fraccion: number,
  opciones: { obraId?: string; fecha?: number } = {},
): Asistencia {
  return {
    ...AUDITORIA,
    id: `a-${colaboradorId}-${fraccion}-${opciones.fecha ?? 0}-${Math.random()}`,
    colaborador_id: colaboradorId,
    obra_id: opciones.obraId ?? 'o1',
    fecha: opciones.fecha ?? 0,
    fraccion,
  };
}

export function destajo(
  colaboradorId: string,
  monto: number,
  opciones: { obraId?: string; fecha?: number } = {},
): Destajo {
  return {
    ...AUDITORIA,
    id: `d-${colaboradorId}-${monto}-${opciones.fecha ?? 0}-${Math.random()}`,
    colaborador_id: colaboradorId,
    obra_id: opciones.obraId ?? 'o1',
    fecha: opciones.fecha ?? 0,
    concepto: null,
    monto,
  };
}
