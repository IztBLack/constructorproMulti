import { describe, expect, test } from 'vitest';
import {
  calcularTotales,
  montoEfectivo,
  montoSugerido,
  type RenglonNota,
  type TipoRenglon,
} from './notas-obra-calculo';
import { cargarContrato } from '../contracts/golden';

/// Prueba de PARIDAD contra los vectores dorados de `contracts/notas-obra/`,
/// que lee también `test/logic/notas_obra_calculo_test.dart`.
///
/// La misma nota se abre desde la oficina y desde el celular, y que cada lado
/// calcule un saldo distinto es un problema con un socio enfrente, no un
/// detalle. El caso guía de `totales-nota` es la nota REAL que originó la
/// funcionalidad (Orlando Ramoz, Casas Bienestar MZ 2 LT 1), con su descuadre
/// de 6,000 y todo: es el motivo de que el saldo se pueda fijar a mano.

/** Un renglón del contrato, completado con lo que la aritmética no mira. */
let n = 0;
function renglonDe(r: {
  tipo: TipoRenglon;
  monto: number | null;
  montoBase: number | null;
  porcentaje: number | null;
}): RenglonNota {
  n += 1;
  return {
    id: `r${n}`,
    nota_id: 'nota1',
    tipo: r.tipo,
    etiqueta: '',
    monto: r.monto,
    monto_base: r.montoBase,
    porcentaje: r.porcentaje,
    texto: '',
    fecha: null,
    orden: n * 100,
  };
}

describe('contrato notas-obra/monto-sugerido', () => {
  const contrato = cargarContrato<
    { tipo: TipoRenglon; montoBase: number | null; porcentaje: number | null },
    { monto: number | null }
  >('notas-obra/monto-sugerido');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      expect(
        montoSugerido(caso.entrada.tipo, caso.entrada.montoBase, caso.entrada.porcentaje),
        caso.descripcion,
      ).toBe(caso.esperado.monto);
    });
  }
});

describe('contrato notas-obra/monto-efectivo', () => {
  const contrato = cargarContrato<
    {
      tipo: TipoRenglon;
      monto: number | null;
      montoBase: number | null;
      porcentaje: number | null;
    },
    { monto: number }
  >('notas-obra/monto-efectivo');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      expect(montoEfectivo(renglonDe(caso.entrada)), caso.descripcion).toBe(caso.esperado.monto);
    });
  }
});

describe('contrato notas-obra/totales-nota', () => {
  const contrato = cargarContrato<
    {
      totalOverride: number | null;
      saldoOverride: number | null;
      renglones: {
        tipo: TipoRenglon;
        monto: number | null;
        montoBase: number | null;
        porcentaje: number | null;
      }[];
    },
    {
      subtotal: number;
      deducciones: number;
      totalCalculado: number;
      total: number;
      pagado: number;
      saldoCalculado: number;
      saldo: number;
      totalFijado: boolean;
      saldoFijado: boolean;
    }
  >('notas-obra/totales-nota');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      const t = calcularTotales(
        {
          total_override: caso.entrada.totalOverride,
          saldo_override: caso.entrada.saldoOverride,
        },
        caso.entrada.renglones.map(renglonDe),
      );

      expect(t, caso.descripcion).toEqual(caso.esperado);
    });
  }
});

/// Fuera del contrato: `undefined` es de JavaScript, no del dominio, y no se
/// puede escribir en un JSON. En Dart ni siquiera existe la distinción.
describe('montoSugerido — lo que no cabe en el contrato', () => {
  test('un bruto undefined se comporta como null', () => {
    expect(montoSugerido('PAGO', undefined, null)).toBeNull();
  });

  test('un porcentaje undefined se comporta como ausente', () => {
    expect(montoSugerido('PAGO', 62_000, undefined)).toBe(62_000);
  });
});
