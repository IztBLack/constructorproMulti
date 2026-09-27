import { describe, expect, test } from 'vitest';
import {
  esEditable,
  importeRenglon,
  leerSnapshot,
  nombreExtra,
  totalExtra,
  totalExtrasAprobados,
  totalRenglones,
  type EstadoExtra,
} from './extras';

describe('totales de un extra', () => {
  test('importe y total redondeados a centavos', () => {
    expect(importeRenglon({ cantidad: 3, precio_unitario: 0.1 })).toBe(0.3);
    expect(
      totalRenglones([
        { cantidad: 10, precio_unitario: 850 },
        { cantidad: 4, precio_unitario: 125.5 },
      ]),
    ).toBe(9002);
  });

  test('un renglón con basura no suma', () => {
    expect(totalRenglones([{ cantidad: Number.NaN, precio_unitario: 5 }])).toBe(0);
  });

  test('enviado: manda la foto, aunque los renglones vivos digan otra cosa', () => {
    expect(
      totalExtra({
        total_enviado: 9002,
        renglones: [
          { id: '1', orden_cambio_id: 'x', concepto: 'a', unidad: '', cantidad: 1, precio_unitario: 1, orden: 0 },
        ],
      }),
    ).toBe(9002);
  });

  test('borrador: suma los renglones', () => {
    expect(
      totalExtra({
        total_enviado: null,
        renglones: [
          { id: '1', orden_cambio_id: 'x', concepto: 'a', unidad: '', cantidad: 2, precio_unitario: 50, orden: 0 },
        ],
      }),
    ).toBe(100);
  });
});

describe('totalExtrasAprobados (lo que suma al estado de cuenta)', () => {
  const o = (estado: EstadoExtra, total: number | null, deleted_at: number | null = null) => ({
    estado,
    total_enviado: total,
    deleted_at,
  });

  test('solo aprobados y vivos', () => {
    expect(
      totalExtrasAprobados([
        o('APROBADA', 1000),
        o('APROBADA', 250.5),
        o('ENVIADA', 9999),
        o('RECHAZADA', 5000),
        o('CANCELADA', 7000),
        o('BORRADOR', null),
        o('APROBADA', 300, 123),
      ]),
    ).toBe(1250.5);
  });
});

describe('leerSnapshot', () => {
  test('lee la foto de la base', () => {
    const s = leerSnapshot({
      folio: 3,
      titulo: 'Barda',
      motivo: 'Lo pidió el cliente',
      fecha: 10,
      foto_uri: null,
      renglones: [{ concepto: 'Barda', unidad: 'm2', cantidad: 10, precio_unitario: 850, importe: 8500 }],
      total: 8500,
    });
    expect(s?.total).toBe(8500);
    expect(s?.renglones[0].importe).toBe(8500);
  });

  test('acepta texto JSON y tolera basura sin lanzar', () => {
    expect(leerSnapshot('{"total": "12.5", "renglones": [null, 3]}')?.total).toBe(12.5);
    expect(leerSnapshot('{"total": "12.5", "renglones": [null, 3]}')?.renglones).toEqual([]);
    expect(leerSnapshot('no es json')).toBeNull();
    expect(leerSnapshot(null)).toBeNull();
    expect(leerSnapshot([1])).toBeNull();
  });
});

describe('presentación', () => {
  test('nombre del extra', () => {
    expect(nombreExtra({ folio: 2, titulo: '  Barda ' })).toBe('Extra 2 · Barda');
    expect(nombreExtra({ folio: 2, titulo: '' })).toBe('Extra 2');
  });

  test('solo el borrador se edita', () => {
    expect(esEditable({ estado: 'BORRADOR' })).toBe(true);
    expect(esEditable({ estado: 'ENVIADA' })).toBe(false);
    expect(esEditable({ estado: 'APROBADA' })).toBe(false);
  });
});
