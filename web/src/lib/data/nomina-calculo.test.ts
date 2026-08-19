import { describe, expect, test } from 'vitest';
import { calcularNomina, navegarSemana, semanaDe } from './nomina-calculo';
import { asistencia, colaborador, destajo, puesto } from './_fixtures';
import { partesTz } from './tz';

/// Prueba de PARIDAD con `test/logic/nomina_calculator_test.dart`.
///
/// Los casos y los NÚMEROS son los mismos que los del móvil a propósito: esta
/// fórmula está duplicada en Dart y en TypeScript, y el riesgo real no es que
/// una de las dos esté mal por su cuenta, sino que dejen de coincidir. Si
/// cambias un número aquí, cámbialo allá o esto deja de probar lo que dice.
///
/// Contrato (de `nomina-calculo.ts`):
///   salarioDia = salario_personalizado ?? puesto.salario_dia_default ?? 0
///   DIA:     totalPagar = Σ(fracciones) × salarioDia
///   DESTAJO: totalPagar = Σ(montos)

const puestos = [
  puesto('p1', 'Albañil', 550),
  puesto('p2', 'Maestro', 800),
];

describe('calcularNomina — tipo DIA', () => {
  test('suma fracciones × salario del puesto', () => {
    // 1 + 1 + 0.5 = 2.5 días × 550 = 1375
    const r = calcularNomina({
      colaboradores: [colaborador('c1', 'Juan', { puestoId: 'p1' })],
      asistencias: [asistencia('c1', 1), asistencia('c1', 1), asistencia('c1', 0.5)],
      destajos: [],
      puestos,
    });

    expect(r.items).toHaveLength(1);
    expect(r.items[0].totalDias).toBe(2.5);
    expect(r.items[0].totalPagar).toBe(1375);
    expect(r.totalDia).toBe(1375);
    expect(r.totalDestajo).toBe(0);
    expect(r.totalNomina).toBe(1375);
  });

  test('salario_personalizado tiene prioridad sobre el del puesto', () => {
    const r = calcularNomina({
      colaboradores: [
        colaborador('c1', 'Juan', { puestoId: 'p1', salarioPersonalizado: 700 }),
      ],
      asistencias: [asistencia('c1', 1)],
      destajos: [],
      puestos,
    });

    expect(r.items[0].salarioBaseCalculado).toBe(700);
    expect(r.items[0].totalPagar).toBe(700);
  });

  test('puesto inexistente → salario 0 y "Sin Puesto"', () => {
    const r = calcularNomina({
      colaboradores: [colaborador('c1', 'X', { puestoId: 'zzz' })],
      asistencias: [asistencia('c1', 1)],
      destajos: [],
      puestos,
    });

    expect(r.items[0].puestoNombre).toBe('Sin Puesto');
    expect(r.items[0].totalPagar).toBe(0);
  });

  test('las asistencias de OTRA persona no suman a la de esta', () => {
    const r = calcularNomina({
      colaboradores: [colaborador('c1', 'Juan', { puestoId: 'p1' })],
      asistencias: [asistencia('c1', 1), asistencia('c2', 1)],
      destajos: [],
      puestos,
    });

    expect(r.items[0].totalDias).toBe(1);
    expect(r.totalNomina).toBe(550);
  });
});

describe('calcularNomina — tipo DESTAJO', () => {
  test('suma montos de destajos', () => {
    const r = calcularNomina({
      colaboradores: [
        colaborador('c2', 'Pedro', { puestoId: 'p1', tipoPago: 'DESTAJO' }),
      ],
      asistencias: [],
      destajos: [destajo('c2', 1200), destajo('c2', 800)],
      puestos,
    });

    expect(r.items[0].totalDestajos).toBe(2000);
    expect(r.items[0].totalPagar).toBe(2000);
    expect(r.totalDestajo).toBe(2000);
  });

  test('a quien cobra a destajo no se le pagan las asistencias', () => {
    // Es la regla que separa los dos tipos de pago: si se sumaran las dos cosas,
    // alguien de destajo que además pasó lista cobraría dos veces.
    const r = calcularNomina({
      colaboradores: [
        colaborador('c2', 'Pedro', { puestoId: 'p1', tipoPago: 'DESTAJO' }),
      ],
      asistencias: [asistencia('c2', 1), asistencia('c2', 1)],
      destajos: [destajo('c2', 500)],
      puestos,
    });

    expect(r.items[0].totalDias).toBe(0);
    expect(r.items[0].totalPagar).toBe(500);
    expect(r.totalDia).toBe(0);
  });
});

describe('calcularNomina — mixto', () => {
  test('totalNomina = totalDia + totalDestajo', () => {
    const r = calcularNomina({
      colaboradores: [
        colaborador('c1', 'Juan', { puestoId: 'p2' }),
        colaborador('c2', 'Pedro', { puestoId: 'p1', tipoPago: 'DESTAJO' }),
      ],
      asistencias: [asistencia('c1', 1)], // 800
      destajos: [destajo('c2', 500)],
      puestos,
    });

    expect(r.totalDia).toBe(800);
    expect(r.totalDestajo).toBe(500);
    expect(r.totalNomina).toBe(1300);
  });

  test('sin nadie, todo en cero (y no revienta)', () => {
    const r = calcularNomina({
      colaboradores: [],
      asistencias: [],
      destajos: [],
      puestos,
    });

    expect(r.items).toHaveLength(0);
    expect(r.totalNomina).toBe(0);
  });
});

/// La semana se calcula en calendario de MÉXICO, no en la zona del proceso.
/// `vitest.config.ts` fija `TZ=Europe/Madrid` justo para que estas pruebas
/// fallen si alguien vuelve a apoyarse en el reloj del servidor.
describe('semanaDe (lunes → domingo, calendario de México)', () => {
  /// Instante de referencia expresado como hora de México: el helper toma un
  /// `Date`, así que hay que fabricarlo desde UTC. México es UTC−6 todo el año.
  const enMexico = (
    y: number,
    m: number,
    d: number,
    h = 0,
    min = 0,
  ): Date => new Date(Date.UTC(y, m - 1, d, h + 6, min));

  test('un miércoles cae en el lunes de esa semana', () => {
    // 2026-06-17 es miércoles → lunes 2026-06-15.
    const { inicioMs } = semanaDe(enMexico(2026, 6, 17, 14, 30));
    const p = partesTz(inicioMs);

    expect([p.year, p.month + 1, p.day]).toEqual([2026, 6, 15]);
    expect(p.weekday).toBe(1);
    expect([p.hour, p.minute, p.second]).toEqual([0, 0, 0]);
  });

  test('el domingo pertenece a la semana que empezó el lunes anterior', () => {
    // 2026-06-21 es domingo → lunes 2026-06-15.
    const { inicioMs } = semanaDe(enMexico(2026, 6, 21));
    const p = partesTz(inicioMs);

    expect([p.year, p.month + 1, p.day]).toEqual([2026, 6, 15]);
  });

  test('el fin de semana es el domingo a las 23:59:59.999', () => {
    const { inicioMs, finMs } = semanaDe(enMexico(2026, 6, 17));
    const p = partesTz(finMs);

    expect(p.weekday).toBe(7);
    expect(p.day).toBe(21);
    expect([p.hour, p.minute, p.second]).toEqual([23, 59, 59]);
    // Exactamente 7 días menos 1 ms: sin huecos ni solapes entre semanas.
    expect(finMs - inicioMs).toBe(7 * 86_400_000 - 1);
  });

  test('el lunes a las 00:00 ya es su propia semana, no la anterior', () => {
    // El caso frontera: pasar lista a primera hora del lunes.
    const lunes = enMexico(2026, 6, 15, 0, 0);
    const { inicioMs } = semanaDe(lunes);

    expect(inicioMs).toBe(lunes.getTime());
  });

  test('una noche de México sigue siendo el mismo día, aunque en UTC ya sea otro', () => {
    // 2026-06-21 23:00 en México = 2026-06-22 05:00 UTC. Calculado en UTC, ese
    // instante caería en LUNES y arrancaría la semana siguiente: la asistencia
    // del domingo por la noche se iría a la raya equivocada.
    const { inicioMs } = semanaDe(enMexico(2026, 6, 21, 23, 0));
    const p = partesTz(inicioMs);

    expect([p.year, p.month + 1, p.day]).toEqual([2026, 6, 15]);
  });
});

describe('navegarSemana', () => {
  test('−1 y +1 vuelven al punto de partida', () => {
    const { inicioMs } = semanaDe(new Date(Date.UTC(2026, 5, 17, 20)));
    const anterior = navegarSemana(inicioMs, -1);
    const vuelta = navegarSemana(anterior.inicioMs, 1);

    expect(vuelta.inicioMs).toBe(inicioMs);
  });

  test('+1 avanza exactamente 7 días', () => {
    const { inicioMs } = semanaDe(new Date(Date.UTC(2026, 5, 17, 20)));
    const siguiente = navegarSemana(inicioMs, 1);

    expect(siguiente.inicioMs - inicioMs).toBe(7 * 86_400_000);
    expect(partesTz(siguiente.inicioMs).weekday).toBe(1);
  });

  test('cruzar el cambio de año no rompe el lunes', () => {
    // 2026-12-28 es lunes; +1 semana debe dar 2027-01-04, también lunes.
    const { inicioMs } = semanaDe(new Date(Date.UTC(2026, 11, 30, 18)));
    const siguiente = navegarSemana(inicioMs, 1);
    const p = partesTz(siguiente.inicioMs);

    expect([p.year, p.month + 1, p.day]).toEqual([2027, 1, 4]);
    expect(p.weekday).toBe(1);
  });
});
