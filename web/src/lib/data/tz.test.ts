import { describe, expect, test } from 'vitest';
import {
  fechaInputAMs,
  medianocheMx,
  msAFechaInput,
  partesTz,
  siguienteMedianocheMx,
  sumarDiasCalendario,
} from './tz';

/// Este módulo no tiene gemelo en Dart y es el que más silenciosamente puede
/// mover dinero de sitio: Vercel corre en UTC y el móvil guarda las asistencias
/// a medianoche de México. Un día de diferencia mete la raya del domingo en la
/// semana siguiente.
///
/// `vitest.config.mts` fija `TZ=Europe/Madrid` a propósito: ni la zona del
/// servidor (UTC) ni la de México. Si alguna de estas funciones se apoyara en el
/// reloj del proceso, estas pruebas lo dirían.
///
/// México dejó el horario de verano en 2022: UTC−6 todo el año.

const UTC_MENOS_6 = 6 * 3_600_000;

describe('partesTz', () => {
  test('traduce un instante UTC al calendario de México', () => {
    // 2026-06-22 05:00 UTC = 2026-06-21 23:00 en México.
    const p = partesTz(Date.UTC(2026, 5, 22, 5, 0, 0));

    expect([p.year, p.month + 1, p.day]).toEqual([2026, 6, 21]);
    expect(p.hour).toBe(23);
    expect(p.weekday).toBe(7); // domingo
  });

  test('weekday va de 1 (lunes) a 7 (domingo)', () => {
    // 2026-06-15 es lunes.
    for (let i = 0; i < 7; i++) {
      const p = partesTz(Date.UTC(2026, 5, 15 + i, 12));
      expect(p.weekday).toBe(i + 1);
    }
  });

  test('la medianoche de México se lee como hora 0, no como 24', () => {
    const p = partesTz(medianocheMx(2026, 5, 15));
    expect(p.hour).toBe(0);
    expect(p.day).toBe(15);
  });
});

describe('medianocheMx', () => {
  test('devuelve las 00:00 de México, que en UTC son las 06:00', () => {
    expect(medianocheMx(2026, 5, 15)).toBe(Date.UTC(2026, 5, 15, 6));
  });

  test('el resultado siempre se relee como la misma fecha calendario', () => {
    // La comprobación que de verdad importa: da igual el mes, el resultado tiene
    // que caer en el día pedido y a las 00:00 leído en México.
    for (const [m0, d] of [[0, 1], [2, 15], [5, 21], [9, 31], [11, 25]] as const) {
      const p = partesTz(medianocheMx(2026, m0, d));
      expect([p.month, p.day, p.hour, p.minute]).toEqual([m0, d, 0, 0]);
    }
  });

  test('dos días seguidos están exactamente a 24 horas', () => {
    // México ya no cambia de hora, así que no hay días de 23 ni de 25.
    const a = medianocheMx(2026, 3, 5);
    const b = medianocheMx(2026, 3, 6);
    expect(b - a).toBe(86_400_000);
  });
});

describe('msAFechaInput / fechaInputAMs', () => {
  test('ida y vuelta conserva el día', () => {
    const ms = medianocheMx(2026, 7, 3);
    expect(msAFechaInput(ms)).toBe('2026-08-03');
    expect(fechaInputAMs('2026-08-03')).toBe(ms);
  });

  test('una hora tardía de México NO adelanta el día del input', () => {
    // 2026-06-21 23:30 México = 2026-06-22 05:30 UTC. Formateado en UTC saldría
    // el 22 y el selector de fecha abriría en el día equivocado.
    const ms = Date.UTC(2026, 5, 22, 5, 30);
    expect(msAFechaInput(ms)).toBe('2026-06-21');
  });

  test('una cadena vacía o inválida cae a "ahora" en vez de a NaN', () => {
    // No es lo ideal, pero es el contrato actual y una fecha NaN se propagaría
    // silenciosamente a una consulta.
    const antes = Date.now();
    for (const v of [null, undefined, '', 'no-es-fecha']) {
      const r = fechaInputAMs(v);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(antes);
    }
  });
});

describe('siguienteMedianocheMx', () => {
  test('desde cualquier hora del día, da la medianoche del día siguiente', () => {
    const dia = medianocheMx(2026, 5, 30);
    const tarde = dia + 14 * 3_600_000 + 30 * 60_000; // 14:30 de ese día

    expect(siguienteMedianocheMx(dia)).toBe(medianocheMx(2026, 6, 1));
    expect(siguienteMedianocheMx(tarde)).toBe(medianocheMx(2026, 6, 1));
  });

  test('cruza el fin de mes y el fin de año', () => {
    expect(siguienteMedianocheMx(medianocheMx(2026, 0, 31))).toBe(medianocheMx(2026, 1, 1));
    expect(siguienteMedianocheMx(medianocheMx(2026, 11, 31))).toBe(medianocheMx(2027, 0, 1));
  });

  test('es el corte que evita contar a alguien el día en que ya salió', () => {
    // El caso de `obra_colaborador.fecha_salida`: se escribe con `Date.now()`,
    // así que una salida del 30-jun a las 14:30 es MAYOR que la medianoche del
    // 30-jun. Comparar contra la medianoche del día siguiente lo resuelve.
    const dia30 = medianocheMx(2026, 5, 30);
    const salida = dia30 + 14 * 3_600_000 + 30 * 60_000;

    expect(salida > dia30).toBe(true); // el filtro ingenuo la dejaría pasar
    expect(salida >= siguienteMedianocheMx(dia30)).toBe(false); // el bueno, no
  });
});

describe('sumarDiasCalendario', () => {
  test('suma y resta días cruzando meses y años', () => {
    expect(sumarDiasCalendario(2026, 0, 31, 1)).toEqual({ y: 2026, m0: 1, d: 1 });
    expect(sumarDiasCalendario(2026, 11, 31, 1)).toEqual({ y: 2027, m0: 0, d: 1 });
    expect(sumarDiasCalendario(2026, 0, 1, -1)).toEqual({ y: 2025, m0: 11, d: 31 });
  });

  test('febrero de un año bisiesto tiene 29', () => {
    // 2028 es bisiesto; 2026 no.
    expect(sumarDiasCalendario(2028, 1, 28, 1)).toEqual({ y: 2028, m0: 1, d: 29 });
    expect(sumarDiasCalendario(2026, 1, 28, 1)).toEqual({ y: 2026, m0: 2, d: 1 });
  });

  test('retroceder al lunes desde cualquier día de la semana', () => {
    // Es la operación exacta que hace `semanaDe`.
    for (let i = 0; i < 7; i++) {
      const p = partesTz(Date.UTC(2026, 5, 15 + i, 12) + UTC_MENOS_6);
      const lunes = sumarDiasCalendario(p.year, p.month, p.day, -(p.weekday - 1));
      expect([lunes.y, lunes.m0, lunes.d]).toEqual([2026, 5, 15]);
    }
  });
});
