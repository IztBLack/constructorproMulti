import { describe, expect, test } from 'vitest';
import { SELECT_CON_SUELDO, aplanarSueldo, aplanarSueldos } from './colaborador-sueldo';
import { calcularNomina } from './nomina-calculo';
import { asistencia, puesto } from './_fixtures';

/// El puente entre la tabla `colaborador_sueldo` (migración 0027) y el resto de
/// la app, que espera un `Colaborador` con el sueldo dentro.
///
/// Lo que se prueba aquí no es cosmético: de estos defaults depende que, cuando
/// la RLS le niegue el sueldo a alguien, la nómina caiga al salario del puesto
/// en vez de pagar cero.

const base = {
  id: 'c1',
  empresa_id: 'e1',
  nombre: 'Enrique',
  puesto_id: 'p1',
  tipo_pago: 'DIA' as const,
  telefono: null,
  contacto_nombre: null,
  contacto_telefono: null,
  contacto_parentesco: null,
  activo: true,
  created_at: 0,
  updated_at: 0,
  server_updated_at: null,
  deleted_at: null,
};

const sueldo = {
  salario_personalizado: 700,
  periodo_pago: 'MENSUAL' as const,
  salario_periodo: 18200,
  dias_semana: 6,
};

describe('aplanarSueldo', () => {
  test('acepta el embebido como objeto', () => {
    const r = aplanarSueldo({ ...base, colaborador_sueldo: sueldo });

    expect(r.salario_personalizado).toBe(700);
    expect(r.salario_periodo).toBe(18200);
    expect(r.periodo_pago).toBe('MENSUAL');
    expect(r.dias_semana).toBe(6);
  });

  test('acepta el embebido como arreglo de un elemento', () => {
    // PostgREST devuelve el 1-a-1 de una u otra forma según cómo resuelva la
    // relación, y la diferencia no se nota hasta producción.
    const r = aplanarSueldo({ ...base, colaborador_sueldo: [sueldo] });

    expect(r.salario_personalizado).toBe(700);
    expect(r.dias_semana).toBe(6);
  });

  test('el embebido no se queda dentro del objeto aplanado', () => {
    const r = aplanarSueldo({ ...base, colaborador_sueldo: sueldo });
    expect(r).not.toHaveProperty('colaborador_sueldo');
  });

  test('los campos que no son de sueldo pasan intactos', () => {
    const r = aplanarSueldo({ ...base, colaborador_sueldo: sueldo });

    expect(r.id).toBe('c1');
    expect(r.nombre).toBe('Enrique');
    expect(r.tipo_pago).toBe('DIA');
    expect(r.activo).toBe(true);
  });

  /// El caso que de verdad importa: quien no tiene permiso para ver sueldos
  /// recibe el embebido VACÍO (la policy de 0027 le filtra las filas), no un
  /// error. Tiene que quedar igual que «sin sueldo capturado».
  test.each([
    ['sin la clave', {}],
    ['con el embebido en null', { colaborador_sueldo: null }],
    ['con el embebido como arreglo vacío', { colaborador_sueldo: [] }],
  ])('%s → null y los defaults de la tabla', (_caso, extra) => {
    const r = aplanarSueldo({ ...base, ...extra });

    expect(r.salario_personalizado).toBeNull();
    expect(r.salario_periodo).toBeNull();
    // Los mismos defaults que la tabla, para que la interfaz de edición no
    // arranque en blanco ni divida entre cero.
    expect(r.periodo_pago).toBe('MENSUAL');
    expect(r.dias_semana).toBe(6);
  });
});

describe('aplanarSueldos', () => {
  test('tolera null y undefined en vez de reventar', () => {
    expect(aplanarSueldos(null)).toEqual([]);
    expect(aplanarSueldos(undefined)).toEqual([]);
  });

  test('aplana la lista completa', () => {
    const r = aplanarSueldos([
      { ...base, colaborador_sueldo: sueldo },
      { ...base, id: 'c2', nombre: 'Martín', colaborador_sueldo: null },
    ]);

    expect(r.map((c) => c.salario_personalizado)).toEqual([700, null]);
  });
});

describe('SELECT_CON_SUELDO', () => {
  test('pide las cuatro columnas de sueldo por el embebido', () => {
    expect(SELECT_CON_SUELDO).toContain('colaborador_sueldo(');
    for (const col of [
      'salario_personalizado',
      'periodo_pago',
      'salario_periodo',
      'dias_semana',
    ]) {
      expect(SELECT_CON_SUELDO).toContain(col);
    }
  });
});

/// La consecuencia de todo lo anterior, medida en pesos.
describe('efecto en la nómina cuando no hay permiso', () => {
  test('sin sueldo se paga el salario del puesto, no cero', () => {
    const puestos = [puesto('p1', 'Albañil', 550)];
    const sinPermiso = aplanarSueldo({ ...base, colaborador_sueldo: [] });

    const r = calcularNomina({
      colaboradores: [sinPermiso],
      asistencias: [asistencia('c1', 1)],
      destajos: [],
      puestos,
    });

    expect(r.items[0].salarioBaseCalculado).toBe(550);
    expect(r.totalNomina).toBe(550);
  });

  test('con sueldo, el personalizado pisa al del puesto', () => {
    const puestos = [puesto('p1', 'Albañil', 550)];
    const conPermiso = aplanarSueldo({ ...base, colaborador_sueldo: sueldo });

    const r = calcularNomina({
      colaboradores: [conPermiso],
      asistencias: [asistencia('c1', 1)],
      destajos: [],
      puestos,
    });

    expect(r.items[0].salarioBaseCalculado).toBe(700);
  });
});
