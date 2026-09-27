import { describe, expect, test } from 'vitest';
import { medianocheMx } from '@/lib/data/tz';
import { clienteAgregaFotos, estadoGarantia, mensajeErrorPostventa, reporteAbierto } from './garantia';

const HORA = 3_600_000;
const dia = (y: number, m: number, d: number, h = 12) => medianocheMx(y, m - 1, d) + h * HORA;

describe('vencimiento de garantía', () => {
  const entrega = medianocheMx(2025, 9, 15); // 15-oct-2025

  test('sin fecha de entrega no se sabe', () => {
    expect(estadoGarantia(null, dia(2026, 1, 1))).toEqual({ estado: 'SIN_DATOS', vence: null, diasRestantes: null });
    expect(estadoGarantia({ entrega_fecha: null, meses: 12 }, dia(2026, 1, 1)).estado).toBe('SIN_DATOS');
  });

  test('vigente, por vencer (30 días o menos) y vencida', () => {
    const g = { entrega_fecha: entrega, meses: 12 };
    expect(estadoGarantia(g, dia(2026, 3, 1))).toMatchObject({ estado: 'VIGENTE', vence: medianocheMx(2026, 9, 15) });
    expect(estadoGarantia(g, dia(2026, 9, 15)).estado).toBe('POR_VENCER');
    expect(estadoGarantia(g, dia(2026, 9, 15)).diasRestantes).toBe(30);
    // El día del vencimiento todavía está cubierto.
    expect(estadoGarantia(g, dia(2026, 10, 15, 23))).toMatchObject({ estado: 'POR_VENCER', diasRestantes: 0 });
    expect(estadoGarantia(g, dia(2026, 10, 16, 0))).toMatchObject({ estado: 'VENCIDA', diasRestantes: -1 });
  });

  test('cero meses: cubre solo el día de la entrega', () => {
    const g = { entrega_fecha: entrega, meses: 0 };
    expect(estadoGarantia(g, dia(2025, 10, 15)).estado).toBe('POR_VENCER');
    expect(estadoGarantia(g, dia(2025, 10, 16)).estado).toBe('VENCIDA');
  });

  test('estados del reporte', () => {
    expect(reporteAbierto('PROGRAMADO')).toBe(true);
    expect(reporteAbierto('RESUELTO')).toBe(false);
    expect(clienteAgregaFotos('EN_REVISION')).toBe(true);
    expect(clienteAgregaFotos('PROGRAMADO')).toBe(false);
  });

  test('traduce errores de la base', () => {
    expect(mensajeErrorPostventa('violates check constraint "garantia_no_procede_con_respuesta"')).toContain('por qué');
    expect(mensajeErrorPostventa('GARANTIA_MAX_FOTOS')).toContain('8');
  });
});
