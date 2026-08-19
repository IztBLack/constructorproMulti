import { describe, expect, test } from 'vitest';
import {
  calcularProyeccion,
  fechaDelDia,
  indiceDiaSemana,
  obraBaseEfectiva,
  participantesDeObra,
  signoAjuste,
  sinParticipante,
  type AjusteProyeccion,
  type ProyeccionEstado,
} from './proyeccion-nomina';
import { calcularNomina } from './nomina-calculo';
import { asistencia, colaborador, destajo, puesto } from './_fixtures';
import { medianocheMx } from './tz';

/// Prueba de PARIDAD con `test/logic/proyeccion_nomina_test.dart`. Mismos casos,
/// mismos números: la fórmula está duplicada en Dart y en TypeScript y el riesgo
/// real es que dejen de coincidir, no que una falle sola.
///
/// El contrato que se fija aquí:
///  1. Una proyección SIN ajustes da exactamente lo mismo que `calcularNomina`
///     con esas asistencias. Es la razón de existir del diseño: si alguien mete
///     una segunda fórmula de nómina aquí, el último test de este archivo cae.
///  2. Lo capturado manda y no se puede pisar con una palomita.
///  3. Los ajustes se reparten sin perder ni inventar centavos.

// Lunes 10 de agosto de 2026, 00:00 de México.
const lunes = medianocheMx(2026, 7, 10);

const puestos = [puesto('pAlb', 'Albañil', 700), puesto('pAyu', 'Ayudante', 500)];

const albanil = colaborador('c1', 'Marcos', { puestoId: 'pAlb' });
const ayudante = colaborador('c2', 'Ramiro', { puestoId: 'pAyu' });
const destajista = colaborador('c3', 'Acabados', {
  puestoId: 'pAlb',
  tipoPago: 'DESTAJO',
});
const colaboradores = [albanil, ayudante, destajista];

function escenario(p: Partial<ProyeccionEstado> = {}): ProyeccionEstado {
  return {
    lunesMs: lunes,
    participantes: ['c1'],
    diasProyectados: {},
    destajoEstimado: {},
    salarioOverride: {},
    ajustes: [],
    simularCompleta: false,
    obraPorDia: {},
    obraBase: {},
    ...p,
  };
}

function ajuste(
  tipo: AjusteProyeccion['tipo'],
  monto: number,
  p: Partial<AjusteProyeccion> = {},
): AjusteProyeccion {
  return {
    id: 'a1',
    tipo,
    destino: 'COLABORADOR',
    destinoId: 'c1',
    monto,
    nota: '',
    reparto: 'PARTES_IGUALES',
    ...p,
  };
}

describe('proyección sin nada capturado', () => {
  test('días completos × salario del puesto', () => {
    const r = calcularProyeccion({
      estado: escenario({ diasProyectados: { c1: [0, 1, 2, 3, 4] } }),
      colaboradores,
      puestos,
    });

    expect(r.renglones).toHaveLength(1);
    expect(r.renglones[0].diasProyectados).toBe(5);
    expect(r.renglones[0].fraccionCapturada).toBe(0);
    expect(r.renglones[0].total).toBe(3500); // 5 × 700
    expect(r.total).toBe(3500);
    expect(r.totalCapturado).toBe(0);
    expect(r.totalProyectado).toBe(3500);
    expect(r.diasHombre).toBe(5);
  });

  test('el override de salario pisa al del puesto sin tocar el catálogo', () => {
    const r = calcularProyeccion({
      estado: escenario({
        diasProyectados: { c1: [0, 1] },
        salarioOverride: { c1: 900 },
      }),
      colaboradores,
      puestos,
    });

    expect(r.renglones[0].salarioDia).toBe(900);
    expect(r.total).toBe(1800);
    // El catálogo sigue intacto: el objeto original no se mutó.
    expect(albanil.salario_personalizado).toBeNull();
  });

  test('totales por día: cuánto cuesta cada columna y cuánta gente cuenta', () => {
    const r = calcularProyeccion({
      estado: escenario({
        participantes: ['c1', 'c2'],
        diasProyectados: { c1: [0, 1], c2: [0] },
      }),
      colaboradores,
      puestos,
    });

    expect(r.totalPorDia[0]).toBe(1200); // 700 + 500
    expect(r.totalPorDia[1]).toBe(700);
    expect(r.totalPorDia[2]).toBe(0);
    expect(r.personasPorDia[0]).toBe(2);
    expect(r.personasPorDia[1]).toBe(1);
    expect(r.total).toBe(1900);
  });

  test('sin días proyectados el total es cero, no un error', () => {
    const r = calcularProyeccion({ estado: escenario(), colaboradores, puestos });
    expect(r.total).toBe(0);
    expect(r.renglones).toHaveLength(1);
  });

  test('un participante que ya no existe en el catálogo se ignora', () => {
    const r = calcularProyeccion({
      estado: escenario({ participantes: ['c1', 'fantasma'] }),
      colaboradores,
      puestos,
    });

    expect(r.renglones).toHaveLength(1);
    expect(r.renglones[0].colaborador.id).toBe('c1');
  });
});

describe('lo capturado manda', () => {
  test('las fracciones capturadas se respetan tal cual', () => {
    const r = calcularProyeccion({
      estado: escenario(),
      colaboradores,
      puestos,
      asistenciasReales: [asistencia('c1', 0.5, { fecha: lunes })],
    });

    expect(r.renglones[0].fraccionCapturada).toBe(0.5);
    expect(r.renglones[0].total).toBe(350); // 0.5 × 700
    expect(r.totalCapturado).toBe(350);
  });

  test('proyectar un día ya capturado NO lo duplica ni lo sube a día completo', () => {
    // El caso que más dinero puede inventar: media jornada capturada y alguien
    // que palomea ese mismo día en la proyección.
    const r = calcularProyeccion({
      estado: escenario({ diasProyectados: { c1: [0] } }),
      colaboradores,
      puestos,
      asistenciasReales: [asistencia('c1', 0.5, { fecha: lunes })],
    });

    expect(r.renglones[0].fraccionCapturada).toBe(0.5);
    expect(r.renglones[0].diasProyectados).toBe(0);
    expect(r.total).toBe(350);
  });

  test('las asistencias de otra semana no se cuelan', () => {
    const semanaPasada = medianocheMx(2026, 7, 3);
    const r = calcularProyeccion({
      estado: escenario(),
      colaboradores,
      puestos,
      asistenciasReales: [asistencia('c1', 1, { fecha: semanaPasada })],
    });

    expect(r.renglones[0].fraccionCapturada).toBe(0);
    expect(r.total).toBe(0);
  });

  test('simularCompleta ignora lo capturado y deja mover todo', () => {
    const r = calcularProyeccion({
      estado: escenario({
        simularCompleta: true,
        diasProyectados: { c1: [0, 1] },
      }),
      colaboradores,
      puestos,
      asistenciasReales: [asistencia('c1', 0.5, { fecha: lunes })],
    });

    expect(r.renglones[0].fraccionCapturada).toBe(0);
    expect(r.renglones[0].diasProyectados).toBe(2);
    expect(r.total).toBe(1400);
  });
});

describe('destajo', () => {
  test('el monto estimado es el total de la semana, no días × salario', () => {
    const r = calcularProyeccion({
      estado: escenario({
        participantes: ['c3'],
        destajoEstimado: { c3: 12000 },
      }),
      colaboradores,
      puestos,
    });

    expect(r.renglones[0].esDestajista).toBe(true);
    expect(r.renglones[0].total).toBe(12000);
    expect(r.totalDestajo).toBe(12000);
    expect(r.totalDia).toBe(0);
  });

  test('sin estimación se usa lo ya capturado', () => {
    const r = calcularProyeccion({
      estado: escenario({ participantes: ['c3'] }),
      colaboradores,
      puestos,
      destajosReales: [destajo('c3', 4500, { fecha: lunes })],
    });

    expect(r.renglones[0].total).toBe(4500);
    expect(r.renglones[0].destajoCapturado).toBe(4500);
  });

  test('estimar por DEBAJO de lo capturado se marca en vez de corregirse solo', () => {
    // Corregirlo en silencio escondería un error de captura; marcarlo obliga a
    // que alguien lo mire.
    const r = calcularProyeccion({
      estado: escenario({
        participantes: ['c3'],
        destajoEstimado: { c3: 1000 },
      }),
      colaboradores,
      puestos,
      destajosReales: [destajo('c3', 5000, { fecha: lunes })],
    });

    expect(r.renglones[0].destajoIncongruente).toBe(true);
  });
});

describe('ajustes', () => {
  test('un destajo extra suma a quien cobra por día', () => {
    const r = calcularProyeccion({
      estado: escenario({
        diasProyectados: { c1: [0, 1] },
        ajustes: [ajuste('DESTAJO', 1500)],
      }),
      colaboradores,
      puestos,
    });

    expect(r.renglones[0].ajustes).toBe(1500);
    expect(r.renglones[0].total).toBe(2900); // 1400 + 1500
    expect(r.totalAjustes).toBe(1500);
    expect(r.total).toBe(2900);
  });

  test('anticipo y descuento restan, con el monto capturado en positivo', () => {
    const r = calcularProyeccion({
      estado: escenario({
        diasProyectados: { c1: [0, 1, 2, 3, 4] },
        ajustes: [
          ajuste('ANTICIPO', 1000, { id: 'a1' }),
          ajuste('DESCUENTO', 250, { id: 'a2' }),
        ],
      }),
      colaboradores,
      puestos,
    });

    expect(r.totalAjustes).toBe(-1250);
    expect(r.total).toBe(2250); // 3500 − 1250
  });

  test('también aplican a un destajista', () => {
    const r = calcularProyeccion({
      estado: escenario({
        participantes: ['c3'],
        destajoEstimado: { c3: 10000 },
        ajustes: [ajuste('ANTICIPO', 3000, { destinoId: 'c3' })],
      }),
      colaboradores,
      puestos,
    });

    expect(r.renglones[0].total).toBe(7000);
  });

  test('un ajuste de cuadrilla se reparte solo entre los que están', () => {
    const r = calcularProyeccion({
      estado: escenario({
        participantes: ['c1', 'c2'],
        ajustes: [
          ajuste('DESTAJO', 1000, { destino: 'CUADRILLA', destinoId: 'cuad1' }),
        ],
      }),
      colaboradores,
      puestos,
      // c3 también está en la cuadrilla, pero no participa en el escenario.
      cuadrillaPorColaborador: { c1: 'cuad1', c2: 'cuad1', c3: 'cuad1' },
    });

    expect(r.renglones[0].ajustes).toBe(500);
    expect(r.renglones[1].ajustes).toBe(500);
    expect(r.totalAjustes).toBe(1000);
    expect(r.lineasCuadrilla[0].repartido).toBe(true);
    // Ya vive dentro de los renglones; contarlo otra vez lo duplicaría.
    expect(r.lineasCuadrilla[0].montoConSigno).toBe(0);
  });

  test('los centavos que no dividen no se pierden ni se inventan', () => {
    const r = calcularProyeccion({
      estado: escenario({
        participantes: ['c1', 'c2', 'c3'],
        ajustes: [
          ajuste('DESTAJO', 1000, { destino: 'CUADRILLA', destinoId: 'cuad1' }),
        ],
      }),
      colaboradores,
      puestos,
      cuadrillaPorColaborador: { c1: 'cuad1', c2: 'cuad1', c3: 'cuad1' },
    });

    // 1000 / 3 = 333.333…  →  333.34 + 333.33 + 333.33 = 1000.00 exacto.
    expect(r.renglones[0].ajustes).toBeCloseTo(333.34, 3);
    expect(r.renglones[1].ajustes).toBeCloseTo(333.33, 3);
    expect(r.renglones[2].ajustes).toBeCloseTo(333.33, 3);
    expect(r.totalAjustes).toBeCloseTo(1000, 3);
  });

  test('reparto «a la cuadrilla» queda como renglón aparte', () => {
    const r = calcularProyeccion({
      estado: escenario({
        participantes: ['c1', 'c2'],
        ajustes: [
          ajuste('DESTAJO', 8000, {
            destino: 'CUADRILLA',
            destinoId: 'cuad1',
            reparto: 'A_LA_CUADRILLA',
          }),
        ],
      }),
      colaboradores,
      puestos,
      cuadrillaPorColaborador: { c1: 'cuad1', c2: 'cuad1' },
    });

    expect(r.renglones.every((x) => x.ajustes === 0)).toBe(true);
    expect(r.lineasCuadrilla[0].montoConSigno).toBe(8000);
    expect(r.lineasCuadrilla[0].repartido).toBe(false);
    expect(r.total).toBe(8000);
  });

  test('un ajuste dirigido a alguien fuera del escenario se reporta, no se suma', () => {
    const r = calcularProyeccion({
      estado: escenario({
        participantes: ['c1'],
        ajustes: [ajuste('DESTAJO', 4000, { destinoId: 'c2' })],
      }),
      colaboradores,
      puestos,
    });

    expect(r.ajustesIgnorados).toHaveLength(1);
    expect(r.totalAjustes).toBe(0);
    expect(r.total).toBe(0);
  });
});

describe('signoAjuste', () => {
  test('el destajo suma y los otros dos restan', () => {
    // El signo lo pone el TIPO, nunca el monto: así no existe el «descuento de
    // −500» que en realidad sumaría.
    expect(signoAjuste('DESTAJO')).toBe(1);
    expect(signoAjuste('ANTICIPO')).toBe(-1);
    expect(signoAjuste('DESCUENTO')).toBe(-1);
  });
});

describe('sinParticipante', () => {
  test('borra TODO lo que colgaba de esa persona', () => {
    // Si se agrega un campo por persona a ProyeccionEstado y no se limpia aquí,
    // este test es el que lo caza: quitar a alguien le dejaba una obra fantasma.
    const estado = escenario({
      participantes: ['c1', 'c2'],
      diasProyectados: { c1: [0], c2: [1] },
      destajoEstimado: { c1: 100, c2: 200 },
      salarioOverride: { c1: 900, c2: 800 },
      obraPorDia: { c1: { 0: 'oX' }, c2: { 1: 'oY' } },
      obraBase: { c1: 'oX', c2: 'oY' },
      ajustes: [ajuste('ANTICIPO', 500, { destinoId: 'c1' })],
    });

    const r = sinParticipante(estado, 'c1');

    expect(r.participantes).toEqual(['c2']);
    for (const campo of [
      'diasProyectados',
      'destajoEstimado',
      'salarioOverride',
      'obraPorDia',
      'obraBase',
    ] as const) {
      expect(r[campo]).not.toHaveProperty('c1');
      expect(r[campo]).toHaveProperty('c2');
    }
    // Un anticipo colgando de alguien que ya no está sumaría sin que se vea.
    expect(r.ajustes).toHaveLength(0);
  });
});

describe('obras: base efectiva y filtro', () => {
  test('la obra del escenario pisa a la del sistema', () => {
    const estado = escenario({ obraBase: { c1: 'oEscenario' } });
    const efectiva = obraBaseEfectiva(estado, { c1: 'oSistema', c2: 'oOtra' });

    expect(efectiva.c1).toBe('oEscenario');
    expect(efectiva.c2).toBe('oOtra');
  });

  test('al filtrar una obra aparece quien llegó prestado, no solo los de casa', () => {
    const estado = escenario({
      participantes: ['c1', 'c2'],
      obraPorDia: { c1: { 3: 'oAlfaro' } }, // el jueves se lo prestan a Alfaro
    });

    expect(participantesDeObra(estado, { c1: 'oBotica', c2: 'oBotica' }, 'oAlfaro'))
      .toEqual(['c1']);
    // Y sin filtro salen todos.
    expect(participantesDeObra(estado, { c1: 'oBotica', c2: 'oBotica' }, null))
      .toEqual(['c1', 'c2']);
  });
});

describe('fechas de la semana', () => {
  test('indiceDiaSemana ubica cada día y deja fuera lo que no cae en la semana', () => {
    expect(indiceDiaSemana(lunes, lunes)).toBe(0);
    expect(indiceDiaSemana(lunes, medianocheMx(2026, 7, 16))).toBe(6); // domingo
    expect(indiceDiaSemana(lunes, medianocheMx(2026, 7, 17))).toBeNull();
    expect(indiceDiaSemana(lunes, medianocheMx(2026, 7, 9))).toBeNull();
  });

  test('una hora tardía del domingo sigue siendo el índice 6', () => {
    // 23:30 del domingo de México ya es lunes en UTC: calculado en UTC se
    // saldría de la semana y ese día no sumaría a la raya.
    const domingoNoche = medianocheMx(2026, 7, 16) + 23 * 3_600_000 + 30 * 60_000;
    expect(indiceDiaSemana(lunes, domingoNoche)).toBe(6);
  });

  test('fechaDelDia es la inversa de indiceDiaSemana', () => {
    for (let i = 0; i < 7; i++) {
      expect(indiceDiaSemana(lunes, fechaDelDia(lunes, i))).toBe(i);
    }
  });
});

/// El test que justifica el diseño entero: la proyección NO tiene fórmula de
/// nómina propia, traduce el escenario a asistencias sintéticas y llama al mismo
/// `calcularNomina` que produce la raya real. Si alguien mete aquí una segunda
/// fórmula, este test se cae.
describe('paridad con la nómina real', () => {
  test('sin ajustes, la proyección da lo mismo que calcularNomina', () => {
    const dias = [0, 1, 2, 3, 4];
    const proyeccion = calcularProyeccion({
      estado: escenario({
        participantes: ['c1', 'c2'],
        diasProyectados: { c1: dias, c2: [0, 1] },
      }),
      colaboradores,
      puestos,
    });

    // Las mismas jornadas, pero capturadas de verdad.
    const nomina = calcularNomina({
      colaboradores: [albanil, ayudante],
      asistencias: [
        ...dias.map(() => asistencia('c1', 1)),
        ...[0, 1].map(() => asistencia('c2', 1)),
      ],
      destajos: [],
      puestos,
    });

    expect(proyeccion.total).toBe(nomina.totalNomina);
  });
});
