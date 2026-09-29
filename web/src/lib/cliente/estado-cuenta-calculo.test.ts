import { describe, expect, test } from 'vitest';
import { muestraIva, separarIvaCobrado, totalesEstadoCuenta } from './estado-cuenta-calculo';

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
      recibidoSinIva: 40,
      ivaCobrado: 0,
      tasaIva: 0,
      pendiente: 60,
      pagadoPct: 40,
      estimacionesPorCobrar: 0,
      fondoGarantiaRetenido: 0,
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

describe('estado de cuenta con estimaciones (F3)', () => {
  test('lo autorizado sin cobrar y el fondo retenido van aparte; el costo no cambia', () => {
    const t = totalesEstadoCuenta({
      partidas: [{ cantidad: 1, precio_unitario: 100_000 }],
      extras: [],
      entradas: [{ monto: 30_000 }],
      estimaciones: [
        { estado: 'COBRADA', neto: 20_000, fondo_garantia: 1_000 },
        { estado: 'AUTORIZADA', neto: 15_000.55, fondo_garantia: 800 },
        { estado: 'ENVIADA', neto: 9_000, fondo_garantia: 500 },
        { estado: 'RECHAZADA', neto: 99_999, fondo_garantia: 9_999 },
        { estado: 'BORRADOR', neto: 1, fondo_garantia: 1 },
      ],
    });
    expect(t.costoTotal).toBe(100_000);
    expect(t.pendiente).toBe(70_000);
    expect(t.estimacionesPorCobrar).toBe(15_000.55);
    expect(t.fondoGarantiaRetenido).toBe(2_300);
  });
});

describe('IVA cobrado: cada entrada se parte en base + IVA', () => {
  const partidas = [{ cantidad: 1, precio_unitario: 4_862_550 }];

  test('obra sin IVA: nada cambia (sin tasa, con tasa 0 o con una tasa inválida)', () => {
    const base = totalesEstadoCuenta({ partidas, extras: [], entradas: [{ monto: 1_692_167.4 }] });
    for (const iva of [undefined, null, { tasaPct: 0 }, { tasaPct: -5 }, { tasaPct: Number.NaN }, { tasaPct: 250 }]) {
      const t = totalesEstadoCuenta({ partidas, extras: [], entradas: [{ monto: 1_692_167.4 }], iva });
      expect(t).toEqual(base);
      expect(t.recibidoSinIva).toBe(1_692_167.4);
      expect(t.ivaCobrado).toBe(0);
      expect(t.tasaIva).toBe(0);
      expect(muestraIva(t)).toBe(false);
    }
  });

  test('el caso real: anticipo "30 % más IVA" sobre una base de $1,458,765', () => {
    const t = totalesEstadoCuenta({
      partidas,
      extras: [],
      entradas: [{ id: 'anticipo', monto: 1_692_167.4 }],
      iva: { tasaPct: 16 },
    });
    expect(t.costoTotal).toBe(4_862_550);
    expect(t.recibido).toBe(1_692_167.4);
    expect(t.recibidoSinIva).toBe(1_458_765);
    expect(t.ivaCobrado).toBe(233_402.4);
    expect(t.pendiente).toBe(3_403_785);
    expect(t.pagadoPct).toBe(30);
    expect(t.tasaIva).toBe(16);
    expect(muestraIva(t)).toBe(true);
  });

  test('tasa de 8 % (frontera norte)', () => {
    const s = separarIvaCobrado([{ monto: 108 }, { monto: 54_000 }], { tasaPct: 8 });
    expect(s).toEqual({ conIva: 54_108, base: 50_100, iva: 4_008 });
  });

  test('redondeo por entrada, al centavo, y base + IVA = recibido exacto', () => {
    // 100 / 1.16 = 86.2068… → 86.21 y 13.79 de IVA, en cada una.
    const s = separarIvaCobrado([{ monto: 100 }, { monto: 100 }, { monto: 100 }], { tasaPct: 16 });
    expect(s).toEqual({ conIva: 300, base: 258.63, iva: 41.37 });
    // Un centavo no alcanza para IVA: todo es base.
    expect(separarIvaCobrado([{ monto: 0.01 }], { tasaPct: 16 })).toEqual({ conIva: 0.01, base: 0.01, iva: 0 });
    // 1.00 / 1.16 = 0.862 → 0.86
    expect(separarIvaCobrado([{ monto: 1 }], { tasaPct: 16 })).toEqual({ conIva: 1, base: 0.86, iva: 0.14 });
    // Montos que en binario no son exactos no pierden centavos.
    expect(separarIvaCobrado([{ monto: 0.1 + 0.2 }], { tasaPct: 16 }).conIva).toBe(0.3);
  });

  test('2,000 listas al azar: base + IVA = recibido al centavo y el IVA de cada entrada es el más cercano', () => {
    let semilla = 7;
    const azar = () => {
      semilla = (semilla * 1_103_515_245 + 12_345) % 2_147_483_648;
      return semilla / 2_147_483_648;
    };
    for (let i = 0; i < 2_000; i++) {
      const tasa = [16, 8, 10.5, 0.0001][i % 4];
      const entradas = Array.from({ length: 1 + Math.floor(azar() * 6) }, () => ({
        monto: Math.round(azar() * 5_000_000_00) / 100,
      }));
      const s = separarIvaCobrado(entradas, { tasaPct: tasa });
      const totalC = entradas.reduce((a, e) => a + Math.round(e.monto * 100), 0);
      expect(Math.round(s.base * 100) + Math.round(s.iva * 100)).toBe(totalC);
      expect(Math.round(s.conIva * 100)).toBe(totalC);
      // Con una sola entrada, la base es la más cercana a monto / (1 + t).
      if (entradas.length === 1) {
        const exacta = (entradas[0].monto * 100) / (1 + tasa / 100);
        expect(Math.abs(Math.round(s.base * 100) - exacta)).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
  });

  test('una devolución (entrada negativa) resta base e IVA', () => {
    expect(separarIvaCobrado([{ monto: 1_160 }, { monto: -116 }], { tasaPct: 16 })).toEqual({
      conIva: 1_044,
      base: 900,
      iva: 144,
    });
  });
});

describe('IVA cobrado con estimaciones (F3): no se adivina, se toma de la estimación', () => {
  // Contrato 100,000 sin IVA, anticipo 30,000 + IVA. Estimación: bruto 50,000,
  // amortiza 15,000 → subtotal 35,000, IVA 5,600, total 40,600, fondo 2,500 →
  // neto 38,100.
  const partidas = [{ cantidad: 1, precio_unitario: 100_000 }];
  const iva = {
    tasaPct: 16,
    estimacionesCobradas: [{ movimientoId: 'est-1', iva: 5_600, neto: 38_100 }],
  };

  test('la entrada de la estimación lleva el IVA de la estimación, sin contar doble', () => {
    const t = totalesEstadoCuenta({
      partidas,
      extras: [],
      entradas: [
        { id: 'anticipo', monto: 34_800 },
        { id: 'est-1', monto: 38_100 },
      ],
      estimaciones: [{ estado: 'COBRADA', neto: 38_100, fondo_garantia: 2_500 }],
      iva,
    });
    expect(t.recibido).toBe(72_900);
    expect(t.ivaCobrado).toBe(4_800 + 5_600);
    expect(t.recibidoSinIva).toBe(30_000 + 32_500);
    // Lo que falta incluye el fondo de garantía retenido (2,500), como antes.
    expect(t.pendiente).toBe(37_500);
    expect(t.fondoGarantiaRetenido).toBe(2_500);
    expect(t.pagadoPct).toBe(63);
    // Dividir el neto entre 1.16 le habría quitado de menos al IVA.
    expect(separarIvaCobrado([{ monto: 38_100 }], { tasaPct: 16 }).iva).toBeLessThan(5_600);
  });

  test('si la entrada no fue por el neto completo, el IVA en la misma proporción', () => {
    expect(separarIvaCobrado([{ id: 'est-1', monto: 19_050 }], iva)).toEqual({
      conIva: 19_050,
      base: 16_250,
      iva: 2_800,
    });
    // Nunca más IVA que la entrada.
    const raro = separarIvaCobrado([{ id: 'x', monto: 10 }], {
      tasaPct: 16,
      estimacionesCobradas: [{ movimientoId: 'x', iva: 50, neto: 5 }],
    });
    expect(raro).toEqual({ conIva: 10, base: 0, iva: 10 });
  });

  test('una estimación sin IVA deja su entrada entera como base aunque la obra cobre IVA', () => {
    const s = separarIvaCobrado([{ id: 'e0', monto: 1_000 }], {
      tasaPct: 16,
      estimacionesCobradas: [{ movimientoId: 'e0', iva: 0, neto: 1_000 }],
    });
    expect(s).toEqual({ conIva: 1_000, base: 1_000, iva: 0 });
  });

  test('el IVA de una estimación cobrada se respeta aunque la obra hoy diga sin IVA', () => {
    const t = totalesEstadoCuenta({
      partidas,
      extras: [],
      entradas: [{ id: 'est-1', monto: 38_100 }, { id: 'otra', monto: 1_000 }],
      iva: { tasaPct: 0, estimacionesCobradas: iva.estimacionesCobradas },
    });
    expect(t.ivaCobrado).toBe(5_600);
    expect(t.recibidoSinIva).toBe(33_500);
    expect(muestraIva(t)).toBe(true);
  });
});
