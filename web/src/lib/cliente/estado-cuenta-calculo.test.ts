import { describe, expect, test } from 'vitest';
import { totalesEstadoCuenta } from './estado-cuenta-calculo';

describe('estado de cuenta con extras (RF1.4)', () => {
  test('los extras aprobados suman al costo total como línea aparte', () => {
    const t = totalesEstadoCuenta({
      partidas: [
        { cantidad: 344, precio_unitario: 14_500 },
        { cantidad: 1, precio_unitario: 450_000 },
      ],
      extras: [{ total: 8_500 }, { total: 1_500.5 }],
      entradas: [{ monto: 1_000_000 }],
    });
    expect(t.presupuesto).toBe(5_438_000);
    expect(t.totalExtras).toBe(10_000.5);
    expect(t.costoTotal).toBe(5_448_000.5);
    expect(t.pendiente).toBe(4_448_000.5);
    expect(t.pagadoPct).toBe(18);
  });

  test('sin extras queda igual que antes', () => {
    const t = totalesEstadoCuenta({
      partidas: [{ cantidad: 1, precio_unitario: 100 }],
      extras: [],
      entradas: [{ monto: 40 }],
    });
    expect(t).toEqual({
      presupuesto: 100,
      totalExtras: 0,
      costoTotal: 100,
      recibido: 40,
      pendiente: 60,
      pagadoPct: 40,
    });
  });

  test('sin costo, el porcentaje pagado es 0 y nunca pasa de 100', () => {
    expect(totalesEstadoCuenta({ partidas: [], extras: [], entradas: [{ monto: 5 }] }).pagadoPct).toBe(0);
    expect(
      totalesEstadoCuenta({
        partidas: [{ cantidad: 1, precio_unitario: 10 }],
        extras: [],
        entradas: [{ monto: 50 }],
      }).pagadoPct,
    ).toBe(100);
  });
});
