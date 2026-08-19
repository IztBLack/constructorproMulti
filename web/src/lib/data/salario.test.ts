import { describe, expect, test } from 'vitest';
import { diasDelPeriodo, esPeriodoPago, salarioDiarioDesdePeriodo } from './salario';

/// El sueldo capturado es SEMANAL, QUINCENAL o MENSUAL; el salario diario —el
/// número que después multiplica la nómina— se deriva de aquí y no se edita a
/// mano. Un error en esta división no se ve en pantalla: se ve en el sobre.
///
/// Base anualizada: 52 semanas → 24 quincenas o 12 meses.
///   6 días/semana → Semanal ÷6, Quincenal ÷13, Mensual ÷26.

describe('diasDelPeriodo', () => {
  test('semanal son los días de la semana, tal cual', () => {
    expect(diasDelPeriodo('SEMANAL', 5)).toBe(5);
    expect(diasDelPeriodo('SEMANAL', 6)).toBe(6);
    expect(diasDelPeriodo('SEMANAL', 7)).toBe(7);
  });

  test('quincenal y mensual con 6 días/semana dan 13 y 26 exactos', () => {
    // Es el caso de la empresa: son los dos números redondos de la tabla y los
    // que hacen que el sueldo mensual ÷ 26 dé el diario que la gente espera.
    expect(diasDelPeriodo('QUINCENAL', 6)).toBe(13);
    expect(diasDelPeriodo('MENSUAL', 6)).toBe(26);
  });

  test('con 5 y 7 días/semana la base sigue siendo 52 semanas', () => {
    expect(diasDelPeriodo('QUINCENAL', 5)).toBeCloseTo(10.833, 3);
    expect(diasDelPeriodo('MENSUAL', 5)).toBeCloseTo(21.667, 3);
    expect(diasDelPeriodo('QUINCENAL', 7)).toBeCloseTo(15.167, 3);
    expect(diasDelPeriodo('MENSUAL', 7)).toBeCloseTo(30.333, 3);
  });
});

describe('salarioDiarioDesdePeriodo', () => {
  test('semanal ÷ días de la semana', () => {
    expect(salarioDiarioDesdePeriodo(3300, 'SEMANAL', 6)).toBe(550);
  });

  test('mensual ÷ 26 con 6 días/semana', () => {
    expect(salarioDiarioDesdePeriodo(14300, 'MENSUAL', 6)).toBe(550);
  });

  test('quincenal ÷ 13 con 6 días/semana', () => {
    expect(salarioDiarioDesdePeriodo(7150, 'QUINCENAL', 6)).toBe(550);
  });

  test('redondea a centavos, no a pesos', () => {
    // 10000 / 26 = 384.615384… → 384.62. Truncar a pesos le quitaría a la
    // persona hasta un peso por día, unos 26 al mes.
    expect(salarioDiarioDesdePeriodo(10000, 'MENSUAL', 6)).toBe(384.62);
  });

  test('sin monto, o con monto no positivo, devuelve null', () => {
    // null y no 0: `calcularNomina` trata 0 como un salario real y pagaría
    // cero; null deja que caiga al salario del puesto.
    expect(salarioDiarioDesdePeriodo(null, 'MENSUAL', 6)).toBeNull();
    expect(salarioDiarioDesdePeriodo(undefined, 'MENSUAL', 6)).toBeNull();
    expect(salarioDiarioDesdePeriodo(0, 'MENSUAL', 6)).toBeNull();
    expect(salarioDiarioDesdePeriodo(-100, 'MENSUAL', 6)).toBeNull();
  });

  test('con 0 días/semana devuelve null en vez de dividir entre cero', () => {
    expect(salarioDiarioDesdePeriodo(3300, 'SEMANAL', 0)).toBeNull();
  });
});

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
