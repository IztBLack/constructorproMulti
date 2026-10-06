import { describe, expect, test } from 'vitest';
import { diasDelPeriodo, esPeriodoPago, salarioDiarioDesdePeriodo } from './salario';
import { cargarContrato, dentroDeTolerancia } from '../contracts/golden';
import type { PeriodoPago } from './types';

/// Prueba de PARIDAD contra los vectores dorados de `contracts/nomina/`, que
/// lee también `test/logic/salario_periodo_test.dart`.
///
/// El sueldo capturado es SEMANAL, QUINCENAL o MENSUAL; el salario diario —el
/// número que después multiplica la nómina— se deriva de aquí y no se edita a
/// mano. Un error en esta división no se ve en pantalla: se ve en el sobre. Y
/// como el mismo colaborador se da de alta indistintamente desde la web o desde
/// el celular, los dos tienen que dividir igual.

describe('contrato nomina/dias-del-periodo', () => {
  const contrato = cargarContrato<
    { periodo: PeriodoPago; diasSemana: number },
    { dias: number }
  >('nomina/dias-del-periodo');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      const dias = diasDelPeriodo(caso.entrada.periodo, caso.entrada.diasSemana);

      expect(
        dentroDeTolerancia(dias, caso.esperado.dias, caso.tolerancia),
        `${caso.descripcion} (dio ${dias}, se esperaba ${caso.esperado.dias})`,
      ).toBe(true);
    });
  }
});

describe('contrato nomina/salario-diario', () => {
  const contrato = cargarContrato<
    { montoPeriodo: number | null; periodo: PeriodoPago; diasSemana: number },
    { salarioDiario: number | null }
  >('nomina/salario-diario');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      const diario = salarioDiarioDesdePeriodo(
        caso.entrada.montoPeriodo,
        caso.entrada.periodo,
        caso.entrada.diasSemana,
      );

      if (caso.esperado.salarioDiario === null) {
        expect(diario, caso.descripcion).toBeNull();
      } else {
        expect(
          diario !== null && dentroDeTolerancia(diario, caso.esperado.salarioDiario, caso.tolerancia),
          `${caso.descripcion} (dio ${diario}, se esperaba ${caso.esperado.salarioDiario})`,
        ).toBe(true);
      }
    });
  }
});

/// Fuera del contrato: cosas que un JSON no puede decir.
describe('salarioDiarioDesdePeriodo — lo que no cabe en el contrato', () => {
  test('un monto undefined se comporta como null', () => {
    // El contrato expresa el `null` del dominio; `undefined` es de JavaScript y
    // llega de un campo que el formulario todavía no tocó.
    expect(salarioDiarioDesdePeriodo(undefined, 'MENSUAL', 6)).toBeNull();
  });
});

/// Fuera del contrato: en Dart el periodo se parsea desde una cadena
/// (`periodoPagoFromCode`) y aquí lo garantiza el compilador; este guardia es
/// para lo que entra por el formulario, y no tiene espejo en el móvil.
describe('esPeriodoPago', () => {
  test('acepta los tres periodos y nada más', () => {
    expect(esPeriodoPago('SEMANAL')).toBe(true);
    expect(esPeriodoPago('QUINCENAL')).toBe(true);
    expect(esPeriodoPago('MENSUAL')).toBe(true);
    expect(esPeriodoPago('semanal')).toBe(false);
    expect(esPeriodoPago('DIARIO')).toBe(false);
    expect(esPeriodoPago('')).toBe(false);
  });
});
