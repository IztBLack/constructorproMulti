import { describe, expect, test } from 'vitest';

import {
  aCompleta,
  aFilaEscritura,
  aResumen,
  nombrePropuesto,
  seEntiende,
  type FilaProyeccion,
} from './proyeccion-guardada';
import { VERSION_ESQUEMA, serializarEscenario } from './proyeccion-contrato';
import { escenarioVacio } from './proyeccion-nomina';

/// La fila guardada: lo que se lee de ella y lo que se escribe en ella.
///
/// Lo que se está protegiendo es que **una fila mala no pueda tumbar la lista**.
/// La pantalla pinta veinte de estas; si una guardada por una versión más nueva
/// —o con el texto corrupto— lanzara al mapearla, se llevaría por delante a las
/// otras diecinueve, que están perfectamente bien.

// Lunes 17 de agosto de 2026, 00:00 en México. Es el mismo instante que usa
// el fixture compartido `test/fixtures/proyeccion_v1.json`.
const lunes = 1786946400000;

function fila(p: Partial<FilaProyeccion> = {}): FilaProyeccion {
  return {
    id: 'p1',
    nombre: 'Simulación del 17 de agosto',
    lunes_millis: lunes,
    obra_filtro: 'o1',
    escenario: JSON.stringify(serializarEscenario(escenarioVacio(lunes))),
    esquema: VERSION_ESQUEMA,
    total_snapshot: 42300,
    personas_snapshot: 11,
    notas: '',
    updated_at: 1786950000000,
    ...p,
  };
}

describe('aResumen', () => {
  test('los nulos de la base no se cuelan a la pantalla', () => {
    // PostgREST devuelve null donde la columna admite null; la lista pinta
    // estos campos directo, y un «null» impreso es un error visible.
    const r = aResumen(
      fila({
        nombre: null,
        obra_filtro: null,
        esquema: null,
        total_snapshot: null,
        personas_snapshot: null,
        notas: null,
        updated_at: null,
      }),
    );

    expect(r.nombre).toBe('');
    expect(r.obraFiltro).toBe('');
    expect(r.esquema).toBe(1);
    expect(r.totalSnapshot).toBe(0);
    expect(r.personasSnapshot).toBe(0);
    expect(r.notas).toBe('');
    expect(r.updatedAt).toBe(0);
  });
});

describe('el candado de versión', () => {
  test('una fila de esta versión, o anterior, se entiende', () => {
    expect(seEntiende(aResumen(fila({ esquema: VERSION_ESQUEMA })))).toBe(true);
    expect(seEntiende(aResumen(fila({ esquema: 0 })))).toBe(true);
  });

  test('una fila de una versión más nueva NO se entiende', () => {
    expect(seEntiende(aResumen(fila({ esquema: VERSION_ESQUEMA + 1 })))).toBe(false);
  });

  test('se decide por la COLUMNA, sin llegar a parsear el texto', () => {
    // El escenario es basura ilegible a propósito: si el candado dependiera de
    // parsearlo, esto lanzaría en vez de devolver null.
    expect(
      aCompleta(fila({ esquema: VERSION_ESQUEMA + 1, escenario: 'no es json' })),
    ).toBeNull();
  });
});

describe('aCompleta', () => {
  test('devuelve el escenario listo para la pantalla', () => {
    const c = aCompleta(fila());
    expect(c).not.toBeNull();
    expect(c!.estado.lunesMs).toBe(lunes);
    expect(c!.nombre).toBe('Simulación del 17 de agosto');
  });

  test('un JSON corrupto devuelve null en vez de lanzar', () => {
    expect(aCompleta(fila({ escenario: '{roto' }))).toBeNull();
    expect(aCompleta(fila({ escenario: null }))).not.toBeNull();
  });
});

describe('aFilaEscritura', () => {
  test('el `esquema` sale de la constante, no de quien llama', () => {
    // Dejar que se pasara desde fuera permitiría guardar una fila mintiendo
    // sobre con qué formato se escribió, que es justo lo que el candado lee.
    const f = aFilaEscritura({
      nombre: '  Con espacios  ',
      estado: escenarioVacio(lunes),
      obraFiltro: '',
      totalSnapshot: 100,
      personasSnapshot: 2,
    });

    expect(f.esquema).toBe(VERSION_ESQUEMA);
    expect(f.nombre).toBe('Con espacios');
    expect(f.lunes_millis).toBe(lunes);
  });

  test('lo que se escribe se puede volver a leer igual', () => {
    const estado = {
      ...escenarioVacio(lunes),
      participantes: ['c1', 'plaza:p1'],
      salarioOverride: { c1: 620.75 },
      obraBase: { c1: 'o9' },
    };
    const escrito = aFilaEscritura({
      nombre: 'Ida y vuelta',
      estado,
      obraFiltro: 'o1',
      totalSnapshot: 0,
      personasSnapshot: 0,
    });

    const leido = aCompleta(fila({ escenario: escrito.escenario }));
    expect(leido!.estado).toEqual(estado);
  });
});

describe('nombrePropuesto', () => {
  test('propone la fecha del lunes en español', () => {
    expect(nombrePropuesto(lunes, [])).toBe('Simulación del 17 de agosto');
  });

  test('numera en vez de repetir un nombre que ya está', () => {
    // Una lista con tres «Simulación del 17 de agosto» no se puede leer.
    const uno = nombrePropuesto(lunes, ['Simulación del 17 de agosto']);
    expect(uno).toBe('Simulación del 17 de agosto (2)');

    expect(
      nombrePropuesto(lunes, ['Simulación del 17 de agosto', uno]),
    ).toBe('Simulación del 17 de agosto (3)');
  });
});
