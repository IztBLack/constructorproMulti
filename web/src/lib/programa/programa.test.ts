import { describe, expect, test } from 'vitest';
import { medianocheMx } from '@/lib/data/tz';
import type { ConceptoContrato } from '@/lib/estimaciones/tipos';
import {
  avanceProgramado,
  avanceRealPartida,
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

describe('programado vs real (RF4.7, avance de F3)', () => {
  const p = { fecha_inicio: dia(10), fecha_fin: dia(19), terminada: false }; // 10 días
  const HORA_ = 3_600_000;

  test('va atrás si el real está más de 10 puntos abajo del programado, antes de vencer', () => {
    // Día 15 a mediodía: programado ≈ 55 %.
    const hoy = dia(15) + 12 * HORA_;
    expect(avanceProgramado(p, hoy)).toBe(55);
    expect(estadoPartida(p, hoy, 40)).toBe('retrasada');
    expect(estadoPartida(p, hoy, 50)).toBe('en_curso');
    expect(estadoPartida(p, hoy, null)).toBe('en_curso');
  });

  test('con 100 % real se da por terminada sola, aunque haya vencido', () => {
    expect(estadoPartida(p, dia(25), 100)).toBe('terminada');
    expect(estadoPartida(p, dia(25), 90)).toBe('vencida');
  });

  test('si empezó antes de lo programado, va en curso', () => {
    expect(estadoPartida(p, dia(5), 10)).toBe('en_curso');
    expect(estadoPartida(p, dia(5), 0)).toBe('por_empezar');
  });

  test('el real sale de la partida del presupuesto o de su sección', () => {
    const c = (id: string, seccion: string, cantidad: number, precio: number): ConceptoContrato => ({
      clave: `p:${id}`,
      origen: 'presupuesto',
      id,
      concepto: id,
      unidad: 'm2',
      seccion,
      cantidad,
      precioUnitario: precio,
      orden: 0,
    });
    const conceptos = [c('a', 'Losa', 10, 100), c('b', 'Losa', 10, 300), c('z', 'Acabados', 1, 1)];
    const ej = new Map([['p:a', 10]]);
    expect(avanceRealPartida({ presupuesto_id: 'a', seccion: 'Losa' }, conceptos, ej, true)).toBe(100);
    expect(avanceRealPartida({ presupuesto_id: null, seccion: 'Losa' }, conceptos, ej, true)).toBe(25);
    expect(avanceRealPartida({ presupuesto_id: null, seccion: null }, conceptos, ej, true)).toBeNull();
    // Partida borrada del presupuesto o obra sin capturas: no se compara.
    expect(avanceRealPartida({ presupuesto_id: 'x', seccion: null }, conceptos, ej, true)).toBeNull();
    expect(avanceRealPartida({ presupuesto_id: 'a', seccion: null }, conceptos, new Map(), false)).toBeNull();
  });
});
