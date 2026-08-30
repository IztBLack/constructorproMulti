import { describe, expect, test } from 'vitest';

import {
  calcularProyeccion,
  conEtiquetaDePlaza,
  conPlazas,
  conSueldo,
  escenarioVacio,
  esPlaza,
  plazasComoColaboradores,
  sinParticipante,
  type SueldoProyectado,
} from './proyeccion-nomina';
import { salarioDiarioDesdePeriodo } from './salario';
import { colaborador, puesto } from './_fixtures';
import { medianocheMx } from './tz';

/// Prueba de PARIDAD con `test/logic/proyeccion_plazas_test.dart`: mismos casos
/// y mismos números.
///
/// Una PLAZA es un puesto sin cubrir —«4 × Maestro a $3,600»— que sirve para
/// preguntar cuánto costaría contratarlos. No existe en el catálogo y muere con
/// el escenario, pero dentro de él se comporta como una persona más: tiene días,
/// sueldo, obra y ajustes. Esa es justo la propiedad que hay que sujetar, porque
/// es fácil que un cálculo la trate distinto sin querer.

const lunes = medianocheMx(2026, 7, 24);
const puestos = [puesto('pM', 'Maestro', 500), puesto('pA', 'Ayudante', 350)];

const semanal3600: SueldoProyectado = {
  periodo: 'SEMANAL',
  monto: 3600,
  diasSemana: 6,
};

describe('el sueldo capturado', () => {
  test('deriva el diario con la única fórmula del proyecto', () => {
    // 3,600 / 6 = 600 exacto.
    expect(salarioDiarioDesdePeriodo(3600, 'SEMANAL', 6)).toBe(600);
    // 3,500 / 6 = 583.333… → 583.33, el caso que destapa todo lo demás.
    expect(salarioDiarioDesdePeriodo(3500, 'SEMANAL', 6)).toBe(583.33);
    // Base anualizada: 52 semanas → 24 quincenas y 12 meses.
    expect(salarioDiarioDesdePeriodo(7600, 'QUINCENAL', 5)).toBe(701.54);
    expect(salarioDiarioDesdePeriodo(15600, 'MENSUAL', 6)).toBe(600);
  });

  test('sin monto no hay diario', () => {
    expect(salarioDiarioDesdePeriodo(0, 'SEMANAL', 6)).toBeNull();
    expect(salarioDiarioDesdePeriodo(null, 'SEMANAL', 6)).toBeNull();
  });
});

describe('conSueldo', () => {
  test('escribe el capturado y el derivado a la vez', () => {
    // Separarlos es la manera segura de que un día queden en desacuerdo y la
    // ficha enseñe $3,600 semanales mientras la tabla cobra un diario viejo.
    const e = conSueldo(escenarioVacio(lunes), 'c1', semanal3600);

    expect(e.sueldoOverride.c1).toEqual(semanal3600);
    expect(e.salarioOverride.c1).toBe(600);
  });

  test('quitarlo limpia los dos mapas', () => {
    const con = conSueldo(escenarioVacio(lunes), 'c1', semanal3600);
    const sin = conSueldo(con, 'c1', null);

    expect(sin.sueldoOverride.c1).toBeUndefined();
    expect(sin.salarioOverride.c1).toBeUndefined();
  });

  test('sobre una plaza también actualiza su ficha', () => {
    // La plaza y su sueldo son la misma cosa vista desde dos sitios; dejarlas
    // separadas las desincroniza al guardar.
    const { estado, nuevas } = conPlazas(escenarioVacio(lunes), {
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 1,
      sueldo: semanal3600,
      obraId: 'o1',
      dias: [0, 1, 2, 3, 4, 5],
    });
    const id = nuevas[0].id;

    const subido = conSueldo(estado, id, {
      periodo: 'SEMANAL',
      monto: 4200,
      diasSemana: 6,
    });

    expect(subido.plazas[id].sueldo.monto).toBe(4200);
    expect(subido.salarioOverride[id]).toBe(700);
  });
});

describe('conPlazas', () => {
  test('mete la plaza como participante, con sus días y su diario', () => {
    const { estado, nuevas } = conPlazas(escenarioVacio(lunes), {
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 1,
      sueldo: semanal3600,
      obraId: 'o1',
      dias: [0, 1, 2, 3, 4, 5],
    });
    const id = nuevas[0].id;

    expect(esPlaza(id)).toBe(true);
    expect(estado.participantes).toEqual([id]);
    expect(estado.diasProyectados[id]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(estado.salarioOverride[id]).toBe(600);
    expect(estado.obraBase[id]).toBe('o1');
    expect(nuevas[0].etiqueta).toBe('Maestro 1');
  });

  test('las plazas del mismo puesto se numeran sin repetirse', () => {
    // Dos «Maestro 1» en la lista dejarían de poder distinguirse.
    const primera = conPlazas(escenarioVacio(lunes), {
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 2,
      sueldo: semanal3600,
      obraId: null,
      dias: [0],
    });
    expect(primera.nuevas.map((p) => p.etiqueta)).toEqual(['Maestro 1', 'Maestro 2']);

    const segunda = conPlazas(primera.estado, {
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 1,
      sueldo: semanal3600,
      obraId: null,
      dias: [0],
    });
    expect(segunda.nuevas[0].etiqueta).toBe('Maestro 3');

    // La numeración es por PUESTO: un ayudante no hereda el conteo del maestro.
    const otro = conPlazas(segunda.estado, {
      puestoId: 'pA',
      puestoNombre: 'Ayudante',
      cuantas: 1,
      sueldo: semanal3600,
      obraId: null,
      dias: [0],
    });
    expect(otro.nuevas[0].etiqueta).toBe('Ayudante 1');
  });

  test('el calculador la trata como a cualquiera', () => {
    const { estado, nuevas } = conPlazas(escenarioVacio(lunes), {
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 2,
      sueldo: semanal3600,
      obraId: 'o1',
      dias: [0, 1, 2, 3, 4, 5],
    });

    const r = calcularProyeccion({
      estado,
      // Las plazas se disfrazan de colaborador: el calculador solo arma
      // renglones de los participantes que encuentra en esta lista.
      colaboradores: plazasComoColaboradores(estado),
      puestos,
      obraPorColaborador: {},
    });

    // 2 plazas × 6 días × 600.
    expect(r.total).toBeCloseTo(7200, 3);
    expect(r.renglones).toHaveLength(2);
    expect(r.renglones.map((x) => x.colaborador.id).sort()).toEqual(
      nuevas.map((p) => p.id).sort(),
    );
  });

  test('convive con gente de verdad en el mismo escenario', () => {
    const base = {
      ...escenarioVacio(lunes),
      participantes: ['c1'],
      diasProyectados: { c1: [0, 1, 2, 3, 4, 5] },
    };
    const { estado } = conPlazas(base, {
      puestoId: 'pA',
      puestoNombre: 'Ayudante',
      cuantas: 1,
      sueldo: { periodo: 'SEMANAL', monto: 2100, diasSemana: 6 },
      obraId: 'o1',
      dias: [0, 1, 2, 3, 4, 5],
    });

    const r = calcularProyeccion({
      estado,
      colaboradores: [
        colaborador('c1', 'Juan', { puestoId: 'pM' }),
        ...plazasComoColaboradores(estado),
      ],
      puestos,
      obraPorColaborador: { c1: 'o1' },
    });

    // Juan: 6 × 500 = 3,000. La plaza: 6 × 350 = 2,100.
    expect(r.total).toBeCloseTo(5100, 3);
    expect(r.renglones).toHaveLength(2);
  });
});

describe('conEtiquetaDePlaza', () => {
  test('renombrar no le mueve el sueldo', () => {
    // Que de paso se recalculara algo sería una sorpresa cara.
    const { estado, nuevas } = conPlazas(escenarioVacio(lunes), {
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 1,
      sueldo: semanal3600,
      obraId: null,
      dias: [0],
    });
    const id = nuevas[0].id;

    const renombrada = conEtiquetaDePlaza(estado, id, 'El de los acabados');

    expect(renombrada.plazas[id].etiqueta).toBe('El de los acabados');
    expect(renombrada.plazas[id].sueldo).toEqual(semanal3600);
    expect(renombrada.salarioOverride[id]).toBe(600);
    expect(renombrada.diasProyectados[id]).toEqual([0]);
  });

  test('una plaza que no está en el escenario se ignora', () => {
    const e = escenarioVacio(lunes);
    expect(conEtiquetaDePlaza(e, 'plaza:no-existe', 'X')).toBe(e);
  });
});

describe('sinParticipante', () => {
  test('quitar una plaza se lleva su ficha y su sueldo', () => {
    // Dejarla sería un renglón fantasma que reaparece al guardar.
    const { estado, nuevas } = conPlazas(escenarioVacio(lunes), {
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 1,
      sueldo: semanal3600,
      obraId: 'o1',
      dias: [0, 1],
    });
    const id = nuevas[0].id;

    const sin = sinParticipante(estado, id);

    expect(sin.participantes).toEqual([]);
    expect(sin.plazas[id]).toBeUndefined();
    expect(sin.sueldoOverride[id]).toBeUndefined();
    expect(sin.salarioOverride[id]).toBeUndefined();
    expect(sin.diasProyectados[id]).toBeUndefined();
    expect(sin.obraBase[id]).toBeUndefined();
  });
});
