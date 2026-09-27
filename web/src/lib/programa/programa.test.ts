import { describe, expect, test } from 'vitest';
import { medianocheMx } from '@/lib/data/tz';
import {
  avanceProgramado,
  diasDeAtraso,
  duracionDias,
  estadoPartida,
  geometriaBarra,
  posicionHoy,
  rangoPrograma,
  validarPartidaPrograma,
} from './programa';

const dia = (d: number) => medianocheMx(2026, 8, d); // septiembre 2026
const HORA = 3_600_000;

describe('estado de una partida', () => {
  const p = { fecha_inicio: dia(10), fecha_fin: dia(20), terminada: false };

  test('por empezar, en curso, vencida', () => {
    expect(estadoPartida(p, dia(9) + 20 * HORA)).toBe('por_empezar');
    expect(estadoPartida(p, dia(10) + HORA)).toBe('en_curso');
    // El día de fin todavía no está vencida, aunque sea de noche.
    expect(estadoPartida(p, dia(20) + 23 * HORA)).toBe('en_curso');
    expect(estadoPartida(p, dia(21) + HORA)).toBe('vencida');
  });

  test('terminada gana aunque esté pasada de fecha', () => {
    expect(estadoPartida({ ...p, terminada: true }, dia(30))).toBe('terminada');
  });

  test('días de atraso', () => {
    expect(diasDeAtraso(p, dia(20) + 10 * HORA)).toBe(0);
    expect(diasDeAtraso(p, dia(21) + HORA)).toBe(1);
    expect(diasDeAtraso(p, dia(25) + HORA)).toBe(5);
    expect(diasDeAtraso({ ...p, terminada: true }, dia(25))).toBe(0);
  });

  test('duración cuenta el primer y el último día', () => {
    expect(duracionDias(p)).toBe(11);
    expect(duracionDias({ fecha_inicio: dia(10), fecha_fin: dia(10) })).toBe(1);
  });

  test('avance programado reparte parejo', () => {
    const q = { fecha_inicio: dia(1), fecha_fin: dia(10) }; // 10 días
    expect(avanceProgramado(q, dia(1))).toBe(0);
    expect(avanceProgramado(q, dia(6))).toBe(50);
    expect(avanceProgramado(q, dia(11))).toBe(100);
  });
});

describe('barras', () => {
  const partidas = [
    { fecha_inicio: dia(1), fecha_fin: dia(10) },
    { fecha_inicio: dia(11), fecha_fin: dia(20) },
  ];

  test('rango y geometría en % del rango', () => {
    const r = rangoPrograma(partidas)!;
    expect(r.inicio).toBe(dia(1));
    expect(r.fin).toBe(dia(21));
    expect(geometriaBarra(partidas[0], r)).toEqual({ left: 0, width: 50 });
    expect(geometriaBarra(partidas[1], r)).toEqual({ left: 50, width: 50 });
  });

  test('sin partidas no hay rango', () => {
    expect(rangoPrograma([])).toBeNull();
  });

  test('línea de hoy', () => {
    const r = rangoPrograma(partidas)!;
    expect(posicionHoy(r, dia(11))).toBe(50);
    expect(posicionHoy(r, dia(25))).toBeNull();
  });
});

describe('validación', () => {
  test('pide concepto y fechas en orden', () => {
    expect(validarPartidaPrograma({ concepto: ' ', fecha_inicio: dia(1), fecha_fin: dia(2) })).toMatch(/partida/);
    expect(validarPartidaPrograma({ concepto: 'Losa', fecha_inicio: dia(2), fecha_fin: dia(1) })).toMatch(/antes/);
    expect(validarPartidaPrograma({ concepto: 'Losa', fecha_inicio: dia(1), fecha_fin: dia(1) })).toBeNull();
  });
});
