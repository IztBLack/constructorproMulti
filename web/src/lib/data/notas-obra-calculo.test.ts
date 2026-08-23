import { describe, expect, test } from 'vitest';
import {
  calcularTotales,
  montoEfectivo,
  montoSugerido,
  type NotaObra,
  type RenglonNota,
  type TipoRenglon,
} from './notas-obra-calculo';

/// El caso guía es la nota REAL que originó la funcionalidad (Orlando Ramoz,
/// Casas Bienestar MZ 2 LT 1). Se prueba entera porque su gracia es justo que
/// el papel y la pantalla den los mismos números:
///
///   BASE DE TINACOS  123 000 | PRETIL 25 000 | RECORTE DE PUERTAS 8 400
///   TOTAL 156 400
///   PROYECCIÓN 11/AGOST/26: 62,000 − 4%(RETENCIÓN) = 60 000
///   156 400 − 60 000 = 90 400
///   LIQUIDADO: bases de tinacos, pretil y recorte de puertas

let n = 0;
function renglon(tipo: TipoRenglon, etiqueta: string, extra: Partial<RenglonNota> = {}): RenglonNota {
  n += 1;
  return {
    id: `r${n}`,
    nota_id: 'nota1',
    tipo,
    etiqueta,
    monto: null,
    monto_base: null,
    porcentaje: null,
    texto: '',
    fecha: null,
    orden: n * 100,
    ...extra,
  };
}

const notaBase: Pick<NotaObra, 'total_override' | 'saldo_override'> = {
  total_override: null,
  saldo_override: null,
};

const notaDeOrlando: RenglonNota[] = [
  renglon('CONCEPTO', 'BASE DE TINACOS', { monto: 123_000 }),
  renglon('CONCEPTO', 'PRETIL', { monto: 25_000 }),
  renglon('CONCEPTO', 'RECORTE DE PUERTAS (26)', { monto: 8_400 }),
  // El acuerdo fue 60,000 aunque 62,000 − 4% den 59,520: el monto fijado manda.
  renglon('PAGO', 'PROYECCIÓN 11/AGOST/26', {
    monto: 60_000,
    monto_base: 62_000,
    porcentaje: 4,
  }),
  renglon('TEXTO', 'LIQUIDADO', {
    texto: 'BASES DE TINACOS, PRETIL Y RECORTE DE PUERTAS',
  }),
];

describe('montoSugerido', () => {
  test('sin bruto no hay sugerencia: el monto se captura directo', () => {
    expect(montoSugerido('PAGO', null, 4)).toBeNull();
    expect(montoSugerido('PAGO', undefined, null)).toBeNull();
  });

  test('sin porcentaje el sugerido es el bruto', () => {
    expect(montoSugerido('PAGO', 62_000, null)).toBe(62_000);
  });

  test('un PAGO con retención vale lo que queda después de retener', () => {
    expect(montoSugerido('PAGO', 62_000, 4)).toBe(59_520);
  });

  test('una DEDUCCION con porcentaje vale la parte retenida, no el resto', () => {
    expect(montoSugerido('DEDUCCION', 100_000, 4)).toBe(4_000);
  });
});

describe('montoEfectivo', () => {
  test('un TEXTO nunca suma, aunque traiga monto', () => {
    expect(montoEfectivo(renglon('TEXTO', 'LIQUIDADO', { monto: 99_999 }))).toBe(0);
  });

  test('el monto fijado le gana al sugerido', () => {
    const r = renglon('PAGO', 'Proyección', { monto: 60_000, monto_base: 62_000, porcentaje: 4 });
    expect(montoEfectivo(r)).toBe(60_000);
  });

  test('sin monto fijado cae al sugerido', () => {
    const r = renglon('PAGO', 'Proyección', { monto: null, monto_base: 62_000, porcentaje: 4 });
    expect(montoEfectivo(r)).toBe(59_520);
  });

  test('sin monto ni bruto vale cero, no NaN', () => {
    expect(montoEfectivo(renglon('CONCEPTO', 'Vacío'))).toBe(0);
  });
});

describe('calcularTotales — la nota de Orlando', () => {
  const t = calcularTotales(notaBase, notaDeOrlando);

  test('el total es la suma de los conceptos', () => {
    expect(t.subtotal).toBe(156_400);
    expect(t.total).toBe(156_400);
    expect(t.totalFijado).toBe(false);
  });

  test('el saldo descuenta la proyección pagada', () => {
    expect(t.pagado).toBe(60_000);
    expect(t.saldo).toBe(96_400);
    expect(t.saldoFijado).toBe(false);
  });

  /// La nota de papel cierra en 90,400, pero 156,400 − 60,000 son 96,400: en el
  /// original faltan 6,000 sin explicar. No se "arregla" el dato ni se fuerza la
  /// fórmula — así se ve un caso REAL de por qué el saldo se puede fijar a mano.
  test('el 90,400 del papel es exactamente lo que resuelve el saldo fijado', () => {
    const conElNumeroDelPapel = calcularTotales(
      { total_override: null, saldo_override: 90_400 },
      notaDeOrlando,
    );
    expect(conElNumeroDelPapel.saldoCalculado).toBe(96_400);
    expect(conElNumeroDelPapel.saldo).toBe(90_400);
    expect(conElNumeroDelPapel.saldoFijado).toBe(true);
  });
});

describe('calcularTotales — deducciones y valores fijados', () => {
  test('las DEDUCCION restan del subtotal antes del total', () => {
    const t = calcularTotales(notaBase, [
      renglon('CONCEPTO', 'Trabajo', { monto: 100_000 }),
      renglon('DEDUCCION', 'Retención 4%', { monto_base: 100_000, porcentaje: 4 }),
    ]);
    expect(t.subtotal).toBe(100_000);
    expect(t.deducciones).toBe(4_000);
    expect(t.total).toBe(96_000);
  });

  test('el total fijado a mano pisa al calculado y arrastra al saldo', () => {
    const t = calcularTotales({ total_override: 160_000, saldo_override: null }, notaDeOrlando);
    expect(t.totalCalculado).toBe(156_400);
    expect(t.total).toBe(160_000);
    expect(t.totalFijado).toBe(true);
    // El saldo se mide contra el total que manda, no contra el calculado.
    expect(t.saldo).toBe(100_000);
  });

  test('el saldo fijado a mano pisa al calculado sin tocar el total', () => {
    const t = calcularTotales({ total_override: null, saldo_override: 90_000 }, notaDeOrlando);
    expect(t.total).toBe(156_400);
    expect(t.saldoCalculado).toBe(96_400);
    expect(t.saldo).toBe(90_000);
    expect(t.saldoFijado).toBe(true);
  });

  test('fijar el MISMO número que el cálculo no se marca como intervenido', () => {
    const t = calcularTotales({ total_override: 156_400, saldo_override: null }, notaDeOrlando);
    expect(t.totalFijado).toBe(false);
  });

  test('una nota vacía da ceros, no NaN', () => {
    const t = calcularTotales(notaBase, []);
    expect(t).toMatchObject({ subtotal: 0, deducciones: 0, total: 0, pagado: 0, saldo: 0 });
  });

  test('los centavos no arrastran cola binaria', () => {
    const t = calcularTotales(notaBase, [
      renglon('CONCEPTO', 'A', { monto: 0.1 }),
      renglon('CONCEPTO', 'B', { monto: 0.2 }),
    ]);
    expect(t.subtotal).toBe(0.3);
  });
});
