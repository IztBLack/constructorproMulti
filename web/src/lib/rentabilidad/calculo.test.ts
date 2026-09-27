import { describe, expect, test } from 'vitest';
import type { Asistencia, Colaborador, Destajo, Puesto } from '@/lib/data/types';
import {
  calcularRentabilidad,
  margenObjetivoDe,
  ordenarComparativo,
  rayaCalculada,
  semaforoDe,
  totalesComparativo,
  type DatosRentabilidad,
  type FilaComparativo,
} from './calculo';
import { leerCategoriaCosto, renglonDeCosto } from './categorias';
import { puedeFijarMargen, puedeVerUtilidad } from '@/lib/auth/utilidad';

function datos(extra: Partial<DatosRentabilidad> = {}): DatosRentabilidad {
  return {
    presupuesto: 100_000,
    extrasAprobados: 0,
    movimientos: [],
    rayaCalculada: 0,
    notas: [],
    avance: null,
    margenObjetivo: 15,
    ...extra,
  };
}

const salida = (monto: number, categoria_costo: string | null = null, categoria = '') => ({
  tipo: 'SALIDA',
  monto,
  categoria,
  categoria_costo,
});
const entrada = (monto: number) => ({ tipo: 'ENTRADA', monto, categoria: 'Anticipo', categoria_costo: null });

describe('contratado = presupuesto + extras aprobados', () => {
  test('suma los extras como línea aparte', () => {
    const r = calcularRentabilidad(datos({ extrasAprobados: 12_500 }));
    expect(r.presupuesto).toBe(100_000);
    expect(r.extras).toBe(12_500);
    expect(r.contratado).toBe(112_500);
  });
});

describe('costo real', () => {
  test('salidas por categoría; lo no clasificado va a "Sin clasificar"', () => {
    const r = calcularRentabilidad(
      datos({
        movimientos: [
          salida(10_000, 'MATERIAL'),
          salida(2_000, 'INDIRECTO'),
          salida(500),
          entrada(50_000),
        ],
      }),
    );
    expect(r.salidasPorCategoria.MATERIAL).toBe(10_000);
    expect(r.salidasPorCategoria.INDIRECTO).toBe(2_000);
    expect(r.salidasPorCategoria.SIN_CLASIFICAR).toBe(500);
    expect(r.costoReal).toBe(12_500);
    expect(r.cobrado).toBe(50_000);
  });

  test('las entradas no son costo', () => {
    expect(calcularRentabilidad(datos({ movimientos: [entrada(1_000)] })).costoReal).toBe(0);
  });

  test('la raya que no se pasó a caja se suma como mano de obra', () => {
    const r = calcularRentabilidad(datos({ rayaCalculada: 30_000 }));
    expect(r.rayaSinCaja).toBe(30_000);
    expect(r.costoPorCategoria.MANO_OBRA).toBe(30_000);
    expect(r.costoReal).toBe(30_000);
  });

  test('NO cuenta dos veces la raya ya registrada en caja (categoría NOMINA)', () => {
    // 3 de 5 semanas pasadas a caja: 18,000 de 30,000.
    const r = calcularRentabilidad(
      datos({ rayaCalculada: 30_000, movimientos: [salida(18_000, null, 'NOMINA')] }),
    );
    expect(r.salidasPorCategoria.MANO_OBRA).toBe(18_000); // NOMINA sin clasificar = mano de obra
    expect(r.rayaSinCaja).toBe(12_000);
    expect(r.costoPorCategoria.MANO_OBRA).toBe(30_000);
    expect(r.costoReal).toBe(30_000);
  });

  test('si en caja se pagó MÁS raya de la calculada, manda la caja', () => {
    const r = calcularRentabilidad(
      datos({ rayaCalculada: 10_000, movimientos: [salida(12_000, 'MANO_OBRA', 'NOMINA')] }),
    );
    expect(r.rayaSinCaja).toBe(0);
    expect(r.costoReal).toBe(12_000);
  });

  test('notas: cuenta lo pagado a socios que no se ve en caja como subcontrato', () => {
    const r = calcularRentabilidad(
      datos({
        notas: [
          { estado: 'LIQUIDADA', total: 20_000, pagado: 20_000, saldo: 0 },
          { estado: 'ABIERTA', total: 15_000, pagado: 5_000, saldo: 10_000 },
        ],
      }),
    );
    expect(r.sociosSinCaja).toBe(25_000);
    expect(r.costoPorCategoria.SUBCONTRATO).toBe(25_000);
    expect(r.comprometidoNotas).toBe(10_000);
    expect(r.costoReal).toBe(25_000);
  });

  test('notas: NO cuenta dos veces lo que ya salió de caja como subcontrato', () => {
    const r = calcularRentabilidad(
      datos({
        notas: [{ estado: 'LIQUIDADA', total: 20_000, pagado: 20_000, saldo: 0 }],
        movimientos: [salida(20_000, 'SUBCONTRATO')],
      }),
    );
    expect(r.sociosSinCaja).toBe(0);
    expect(r.costoReal).toBe(20_000);
  });

  test('una nota liquidada cuenta por su total aunque sus renglones de pago no cuadren', () => {
    const r = calcularRentabilidad(
      datos({ notas: [{ estado: 'LIQUIDADA', total: 60_000, pagado: 59_520, saldo: 480 }] }),
    );
    expect(r.sociosSinCaja).toBe(60_000);
    expect(r.comprometidoNotas).toBe(0);
  });
});

describe('utilidad y margen', () => {
  test('utilidad = contratado − costo; margen sobre lo contratado', () => {
    const r = calcularRentabilidad(
      datos({ extrasAprobados: 20_000, movimientos: [salida(90_000, 'MATERIAL')] }),
    );
    expect(r.utilidad).toBe(30_000);
    expect(r.margen).toBe(25);
  });

  test('sin nada contratado no hay margen (no divide entre cero)', () => {
    const r = calcularRentabilidad(datos({ presupuesto: 0, movimientos: [salida(1_000)] }));
    expect(r.margen).toBeNull();
    expect(r.utilidad).toBe(-1_000);
    expect(r.semaforo).toBe('sin_datos');
  });

  test('redondea a centavos', () => {
    const r = calcularRentabilidad(
      datos({ presupuesto: 0.3, movimientos: [salida(0.1), salida(0.2)] }),
    );
    expect(r.costoReal).toBe(0.3);
    expect(r.utilidad).toBe(0);
  });
});

describe('proyección a término', () => {
  test('usa el avance de la obra si existe', () => {
    // 40% de avance y 36,000 gastados → terminaría en 90,000.
    const r = calcularRentabilidad(
      datos({ avance: 40, movimientos: [salida(36_000, 'MATERIAL'), entrada(80_000)] }),
    );
    expect(r.fuenteAvance).toBe('obra');
    expect(r.costoProyectado).toBe(90_000);
    expect(r.margenProyectado).toBe(10);
  });

  test('sin avance, usa lo cobrado contra lo contratado', () => {
    const r = calcularRentabilidad(
      datos({ movimientos: [salida(40_000, 'MATERIAL'), entrada(50_000)] }),
    );
    expect(r.fuenteAvance).toBe('cobrado');
    expect(r.avanceUsado).toBe(50);
    expect(r.costoProyectado).toBe(80_000);
    expect(r.margenProyectado).toBe(20);
  });

  test('sin avance ni cobros no se proyecta', () => {
    const r = calcularRentabilidad(datos({ movimientos: [salida(1_000, 'MATERIAL')] }));
    expect(r.fuenteAvance).toBe('ninguna');
    expect(r.costoProyectado).toBeNull();
    expect(r.semaforo).toBe('sin_datos');
  });

  test('lo comprometido con socios pone un piso a la proyección', () => {
    const r = calcularRentabilidad(
      datos({
        avance: 90,
        movimientos: [salida(45_000, 'MATERIAL')],
        notas: [{ estado: 'ABIERTA', total: 40_000, pagado: 0, saldo: 40_000 }],
      }),
    );
    // 45,000 / 0.9 = 50,000, pero ya se deben 40,000 a socios → 85,000.
    expect(r.costoProyectado).toBe(85_000);
  });

  test('el avance FÍSICO por partida (F3) manda sobre el manual y sobre lo cobrado', () => {
    // Manual dice 40 %, pero en campo se midió 60 %: 36,000 / 0.6 = 60,000.
    const r = calcularRentabilidad(
      datos({ avance: 40, avanceFisico: 60, movimientos: [salida(36_000, 'MATERIAL'), entrada(80_000)] }),
    );
    expect(r.fuenteAvance).toBe('partidas');
    expect(r.avanceUsado).toBe(60);
    expect(r.costoProyectado).toBe(60_000);
  });

  test('sin capturas por partida (null o 0) se sigue usando el manual', () => {
    for (const avanceFisico of [null, 0, undefined]) {
      const r = calcularRentabilidad(
        datos({ avance: 40, avanceFisico, movimientos: [salida(36_000, 'MATERIAL')] }),
      );
      expect(r.fuenteAvance).toBe('obra');
    }
  });

  test('el avance nunca pasa de 100', () => {
    const r = calcularRentabilidad(datos({ avance: 250, movimientos: [salida(10_000)] }));
    expect(r.avanceUsado).toBe(100);
    expect(r.costoProyectado).toBe(10_000);
  });
});

describe('semáforo contra el margen objetivo', () => {
  test.each([
    [20, 15, 'verde'],
    [15, 15, 'verde'],
    [12, 15, 'amarillo'],
    [10, 15, 'amarillo'],
    [9.99, 15, 'rojo'],
    [-1, 3, 'rojo'],
    [null, 15, 'sin_datos'],
  ] as const)('margen %s con objetivo %s → %s', (m, obj, esperado) => {
    expect(semaforoDe(m, obj)).toBe(esperado);
  });

  test('el objetivo de la obra manda sobre el de la empresa', () => {
    expect(margenObjetivoDe(20, 15)).toBe(20);
    expect(margenObjetivoDe(null, 12)).toBe(12);
    expect(margenObjetivoDe(undefined, undefined)).toBe(15);
    expect(margenObjetivoDe(0, 15)).toBe(0);
  });
});

describe('raya calculada (misma fórmula que la pestaña Nómina)', () => {
  const puesto: Puesto = { id: 'p1', nombre: 'Albañil', salario_dia_default: 400 } as Puesto;
  const colab = (id: string, tipo: 'DIA' | 'DESTAJO', sueldo: number | null = null) =>
    ({ id, nombre: id, puesto_id: 'p1', tipo_pago: tipo, salario_personalizado: sueldo }) as Colaborador;
  const asis = (colaborador_id: string, fraccion: number) =>
    ({ id: Math.random().toString(), colaborador_id, obra_id: 'o', fecha: 1, fraccion }) as Asistencia;
  const dest = (colaborador_id: string, monto: number) =>
    ({ id: Math.random().toString(), colaborador_id, obra_id: 'o', fecha: 1, monto }) as Destajo;

  test('día × sueldo y destajos, solo de quien trabajó en la obra', () => {
    const total = rayaCalculada({
      colaboradores: [colab('a', 'DIA'), colab('b', 'DIA', 500), colab('c', 'DESTAJO'), colab('ausente', 'DIA')],
      asistencias: [asis('a', 1), asis('a', 0.5), asis('b', 2)],
      destajos: [dest('c', 3_000)],
      puestos: [puesto],
    });
    // a: 1.5 × 400 = 600; b: 2 × 500 = 1000; c: 3000.
    expect(total).toBe(4_600);
  });
});

describe('categorías de costo', () => {
  test('lee solo la lista cerrada', () => {
    expect(leerCategoriaCosto('material')).toBe('MATERIAL');
    expect(leerCategoriaCosto('')).toBeNull();
    expect(leerCategoriaCosto('COMIDA')).toBeNull();
    expect(leerCategoriaCosto(null)).toBeNull();
  });

  test('lo clasificado a mano manda sobre NOMINA', () => {
    expect(renglonDeCosto({ categoria: 'NOMINA', categoria_costo: null })).toBe('MANO_OBRA');
    expect(renglonDeCosto({ categoria: 'NOMINA', categoria_costo: 'OTRO' })).toBe('OTRO');
    expect(renglonDeCosto({ categoria: 'Materiales', categoria_costo: null })).toBe('SIN_CLASIFICAR');
  });
});

describe('comparativo entre obras', () => {
  const fila = (nombre: string, d: Partial<DatosRentabilidad>): FilaComparativo => ({
    obraId: nombre,
    nombre,
    activa: true,
    r: calcularRentabilidad(datos(d)),
  });

  test('primero lo que está en riesgo, luego amarillo, verde y sin datos', () => {
    const filas = [
      fila('Verde', { avance: 50, movimientos: [salida(20_000, 'MATERIAL')] }),
      fila('SinDatos', {}),
      fila('Rojo', { avance: 50, movimientos: [salida(60_000, 'MATERIAL')] }),
      fila('Amarillo', { avance: 50, movimientos: [salida(44_000, 'MATERIAL')] }),
    ];
    expect(ordenarComparativo(filas).map((f) => f.nombre)).toEqual([
      'Rojo',
      'Amarillo',
      'Verde',
      'SinDatos',
    ]);
  });

  test('totales: margen de la cartera, no promedio de márgenes', () => {
    const t = totalesComparativo([
      fila('A', { presupuesto: 100_000, movimientos: [salida(90_000)] }),
      fila('B', { presupuesto: 300_000, movimientos: [salida(210_000)] }),
    ]);
    expect(t.contratado).toBe(400_000);
    expect(t.utilidad).toBe(100_000);
    expect(t.margen).toBe(25);
  });
});

describe('D1: quién ve la utilidad', () => {
  test('admin y contador sí; supervisor, colaborador y cliente no', () => {
    expect(puedeVerUtilidad('admin')).toBe(true);
    expect(puedeVerUtilidad('contador')).toBe(true);
    expect(puedeVerUtilidad('supervisor')).toBe(false);
    expect(puedeVerUtilidad('colaborador')).toBe(false);
    expect(puedeVerUtilidad('cliente')).toBe(false);
    expect(puedeVerUtilidad('residente')).toBe(false);
    expect(puedeVerUtilidad('')).toBe(false);
    expect(puedeVerUtilidad(null)).toBe(false);
  });

  test('solo el admin fija el margen', () => {
    expect(puedeFijarMargen('admin')).toBe(true);
    expect(puedeFijarMargen('contador')).toBe(false);
  });
});
