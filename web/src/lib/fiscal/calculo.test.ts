import { describe, expect, test } from 'vitest';
import {
  calcularParcialidad,
  centavos,
  desglosar,
  limiteComplemento,
  pareceAnticipo,
  sugerirMetodo,
  sugerirRetenciones,
} from './calculo';

const sinRet = { ivaPct: 16, retIsrPct: 0, retIvaPct: 0 };

describe('desglosar', () => {
  test('IVA incluido: lo cobrado es el total', () => {
    expect(desglosar(11600, { ivaModo: 'incluido', ...sinRet })).toMatchObject({
      subtotal: 10000,
      iva: 1600,
      total: 11600,
      diferencia: 0,
    });
  });

  test('montos que no dan exacto: el total cuadra al centavo', () => {
    for (const monto of [1000, 999.99, 12345.67, 0.01, 58000]) {
      const d = desglosar(monto, { ivaModo: 'incluido', ...sinRet });
      expect(d.total).toBe(centavos(monto));
      expect(d.iva).toBe(centavos(d.subtotal * 0.16));
    }
  });

  test('RESICO a empresa: 1.25% de ISR retenido, lo depositado es el total', () => {
    expect(
      desglosar(11475, { ivaModo: 'incluido', ivaPct: 16, retIsrPct: 1.25, retIvaPct: 0 }),
    ).toMatchObject({ subtotal: 10000, iva: 1600, retIsr: 125, total: 11475, diferencia: 0 });
  });

  test('IVA aparte: el monto es la base y el IVA va encima', () => {
    expect(desglosar(10000, { ivaModo: 'aparte', ...sinRet })).toMatchObject({
      subtotal: 10000,
      iva: 1600,
      total: 11600,
      diferencia: 0,
    });
  });

  test('sin IVA: ni IVA ni retención de IVA', () => {
    expect(
      desglosar(10000, { ivaModo: 'sin_iva', ivaPct: 16, retIsrPct: 0, retIvaPct: 10.6667 }),
    ).toMatchObject({ subtotal: 10000, iva: 0, retIva: 0, total: 10000, ivaPct: 0 });
  });

  test('frontera al 8%', () => {
    expect(desglosar(10800, { ivaModo: 'incluido', ivaPct: 8, retIsrPct: 0, retIvaPct: 0 })).toMatchObject({
      subtotal: 10000,
      iva: 800,
    });
  });

  test('monto negativo o cero no truena', () => {
    expect(desglosar(-5, { ivaModo: 'incluido', ...sinRet }).total).toBe(0);
  });
});

describe('sugerirRetenciones', () => {
  test('solo RESICO persona física cobrándole a una empresa', () => {
    expect(
      sugerirRetenciones({ regimen: '626', tipo: 'fisica' }, { tipo: 'moral', generico: false }).isrPct,
    ).toBe(1.25);
    expect(
      sugerirRetenciones({ regimen: '626', tipo: 'fisica' }, { tipo: 'fisica', generico: false }).isrPct,
    ).toBe(0);
    expect(
      sugerirRetenciones({ regimen: '601', tipo: 'moral' }, { tipo: 'moral', generico: false }).isrPct,
    ).toBe(0);
    expect(
      sugerirRetenciones({ regimen: '626', tipo: 'fisica' }, { tipo: 'moral', generico: true }).isrPct,
    ).toBe(0);
  });
});

describe('sugerirMetodo', () => {
  test('ya te pagaron todo → PUE con la forma del cobro', () => {
    expect(sugerirMetodo({ totalFactura: 1000, pagadoAlFacturar: 1000, formaDelCobro: '01' })).toMatchObject({
      metodo: 'PUE',
      forma: '01',
    });
  });
  test('falta dinero → PPD con forma 99', () => {
    expect(sugerirMetodo({ totalFactura: 1160, pagadoAlFacturar: 1000, formaDelCobro: '03' })).toMatchObject({
      metodo: 'PPD',
      forma: '99',
    });
  });
  test('PUE nunca lleva 99', () => {
    expect(sugerirMetodo({ totalFactura: 1, pagadoAlFacturar: 1, formaDelCobro: '99' }).forma).toBe('03');
  });
});

describe('calcularParcialidad', () => {
  const cobros = [
    { id: 'b', fecha: 200, monto: 58000 },
    { id: 'a', fecha: 100, monto: 58000 },
  ];
  test('ordena por fecha y va restando al total', () => {
    expect(calcularParcialidad('a', cobros, 116000)).toEqual({
      numero: 1,
      saldoAnterior: 116000,
      pagado: 58000,
      saldoInsoluto: 58000,
    });
    expect(calcularParcialidad('b', cobros, 116000)).toEqual({
      numero: 2,
      saldoAnterior: 58000,
      pagado: 58000,
      saldoInsoluto: 0,
    });
  });
  test('no paga más que el saldo', () => {
    expect(calcularParcialidad('b', cobros, 100000)?.pagado).toBe(42000);
    expect(calcularParcialidad('z', cobros, 1)).toBeNull();
  });
});

describe('otros', () => {
  test('pareceAnticipo', () => {
    expect(pareceAnticipo('ANTICIPO 50%')).toBe(true);
    expect(pareceAnticipo('Pago 2')).toBe(false);
  });
  test('límite del complemento: día 5 del mes siguiente (y cambio de año)', () => {
    expect(limiteComplemento(Date.UTC(2026, 8, 2, 18))).toBe('2026-10-05');
    expect(limiteComplemento(Date.UTC(2026, 11, 20, 18))).toBe('2027-01-05');
    // 31 de agosto a las 23:00 en México = 1 de sept. en UTC: cuenta agosto.
    expect(limiteComplemento(Date.UTC(2026, 8, 1, 5))).toBe('2026-09-05');
  });
});
