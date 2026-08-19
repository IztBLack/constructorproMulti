/// Lectura del sueldo, que desde la migración 0027 vive en `colaborador_sueldo`
/// y no en `colaboradores`.
///
/// El motivo es de PERMISOS, no de modelado: la RLS de Postgres filtra filas y
/// no columnas, así que mientras el sueldo estuviera dentro de `colaboradores`
/// no había forma de dejar que el rol `colaborador` leyera los nombres de sus
/// compañeros —los necesita para el pase de lista— sin dejarle leer también lo
/// que cobran. Con la tabla aparte, su policy le niega la lectura entera.
///
/// Aquí se vuelven a juntar para el resto de la app: `calcularNomina` y la
/// proyección esperan un `Colaborador` con `salario_personalizado`, y no tiene
/// sentido propagar la partición por toda la capa de cálculo. **El aplanado no
/// es la barrera** — la barrera es la policy: si quien consulta no tiene
/// permiso, PostgREST devuelve el embebido vacío y los campos quedan en null,
/// que es exactamente el caso «sin sueldo capturado» y cae al salario del
/// puesto.

import type { Colaborador, PeriodoPago } from './types';

export interface SueldoEmbebido {
  salario_personalizado: number | null;
  periodo_pago: PeriodoPago;
  salario_periodo: number | null;
  dias_semana: number;
}

/// Columnas a pedir en cualquier `select` de `colaboradores` que necesite el
/// sueldo. Es un embebido de PostgREST: viaja en la misma consulta gracias a la
/// FK `colaborador_sueldo.colaborador_id → colaboradores.id`.
export const SELECT_CON_SUELDO =
  '*, colaborador_sueldo(salario_personalizado, periodo_pago, salario_periodo, dias_semana)';

type FilaConSueldo = Record<string, unknown> & {
  colaborador_sueldo?: SueldoEmbebido | SueldoEmbebido[] | null;
};

/// Aplana el embebido a los campos que el resto de la app espera.
///
/// PostgREST devuelve el embebido de un 1-a-1 como objeto o como arreglo de un
/// elemento según cómo resuelva la relación, así que se aceptan los dos.
export function aplanarSueldo(fila: FilaConSueldo): Colaborador {
  const { colaborador_sueldo: crudo, ...resto } = fila;
  const sueldo = Array.isArray(crudo) ? crudo[0] : crudo;

  return {
    ...(resto as Omit<Colaborador, keyof SueldoEmbebido>),
    salario_personalizado: sueldo?.salario_personalizado ?? null,
    periodo_pago: sueldo?.periodo_pago ?? 'MENSUAL',
    salario_periodo: sueldo?.salario_periodo ?? null,
    dias_semana: sueldo?.dias_semana ?? 6,
  } as Colaborador;
}

export function aplanarSueldos(filas: FilaConSueldo[] | null | undefined): Colaborador[] {
  return (filas ?? []).map(aplanarSueldo);
}
