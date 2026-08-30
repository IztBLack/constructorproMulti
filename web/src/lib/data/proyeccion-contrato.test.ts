import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import {
  deserializarEscenario,
  proyeccionUtilizable,
  serializarEscenario,
  VERSION_ESQUEMA,
} from './proyeccion-contrato';

/// CONTRATO del escenario guardado, contra el fixture COMPARTIDO
/// `test/fixtures/proyeccion_v1.json`.
///
/// Su gemela del móvil es `test/logic/proyeccion_contrato_json_test.dart`, y lee
/// **este mismo archivo**. Ahí está la diferencia con el resto de pruebas de
/// paridad del proyecto (`notas-obra-calculo.test.ts`, `textos-finales.test.ts`),
/// que espejan los casos a mano: eso sirve para comparar RESULTADOS —si una
/// calculadora falla, su prueba lo grita—, pero no para comparar FORMATOS. Dos
/// pruebas espejadas pueden estar las dos en verde mientras cada lado escribe un
/// nombre de llave distinto, porque cada una lee lo que ella misma escribió. Con
/// un archivo único ese punto ciego desaparece: renombrar una llave de un lado
/// pone roja a la otra plataforma.
///
/// Ver `docs/PARIDAD_PROYECCION_WEB.md`.
const RUTA_FIXTURE = fileURLToPath(
  new URL('../../../../test/fixtures/proyeccion_v1.json', import.meta.url),
);

const crudo = JSON.parse(readFileSync(RUTA_FIXTURE, 'utf8')) as Record<
  string,
  unknown
>;

describe('el fixture compartido', () => {
  test('da la vuelta completa sin perder ni cambiar nada', () => {
    // Caza una llave renombrada, una que se perdió por el camino y un código de
    // enum que cambió de texto.
    expect(serializarEscenario(deserializarEscenario(crudo))).toEqual(crudo);
  });

  test('las llaves de primer nivel son exactamente estas trece', () => {
    // Una llave NUEVA que no esté aquí es una que el móvil no sabe leer: la
    // lista se toca a la vez que su gemela, o no se toca.
    expect(
      Object.keys(serializarEscenario(deserializarEscenario(crudo))).sort(),
    ).toEqual(
      [
        'v',
        'lunes',
        'participantes',
        'dias',
        'destajo',
        'salario',
        'sueldo',
        'plazas',
        'ajustes',
        'simular',
        'obraPorDia',
        'obraBase',
        'redondeo',
      ].sort(),
    );
  });

  test('ejercita de verdad cada rama del formato', () => {
    const e = deserializarEscenario(crudo);

    expect(e.participantes).toHaveLength(3);
    expect(Object.keys(e.plazas)).toHaveLength(1);
    expect(Object.keys(e.sueldoOverride)).toHaveLength(2);
    expect(e.ajustes).toHaveLength(3);
    expect(new Set(e.ajustes.map((a) => a.tipo))).toEqual(
      new Set(['DESTAJO', 'ANTICIPO', 'DESCUENTO']),
    );
    expect(e.redondeo.activo).toBe(true);
    expect(Object.keys(e.obraPorDia).length).toBeGreaterThan(0);
    expect(Object.keys(e.obraBase).length).toBeGreaterThan(0);
    expect(e.simularCompleta).toBe(true);
  });

  test('conserva lo que la web todavía no enseña', () => {
    // Plazas, sueldo capturado y redondeo no tienen pantalla en la web hasta la
    // Fase 4. Si el ida y vuelta los perdiera, abrir en la oficina un escenario
    // armado en la tableta y volver a guardarlo los borraría sin decir nada.
    const e = deserializarEscenario(crudo);

    expect(e.plazas['plaza:pl-1'].etiqueta).toBe('Maestro 1');
    expect(e.plazas['plaza:pl-1'].sueldo).toEqual({
      periodo: 'MENSUAL',
      monto: 15600,
      diasSemana: 7,
    });
    expect(e.sueldoOverride['c-camilo'].periodo).toBe('QUINCENAL');
    expect(e.redondeo).toEqual({
      activo: true,
      paso: 50,
      modo: 'ARRIBA',
      campos: ['RAYA', 'TOTAL'],
    });
  });
});

describe('un escenario mal formado no tumba la lista', () => {
  // La regla es SALTAR lo que no se entiende, nunca inventar un valor: en una
  // raya, una cifra ausente se ve; una cifra inventada, no.
  const conBasura = (llave: string, valor: unknown) => ({
    ...crudo,
    [llave]: valor,
  });

  test('un null donde iba un número se salta', () => {
    const e = deserializarEscenario(
      conBasura('destajo', { 'c-adrian': null, 'c-camilo': 300 }),
    );
    expect(e.destajoEstimado).toEqual({ 'c-camilo': 300 });
  });

  test('un texto donde iba un número se salta', () => {
    const e = deserializarEscenario(
      conBasura('salario', { 'c-adrian': 'seiscientos', 'c-camilo': 620.75 }),
    );
    expect(e.salarioOverride).toEqual({ 'c-camilo': 620.75 });
  });

  test('listas y mapas cambiados de tipo no lanzan', () => {
    expect(() =>
      deserializarEscenario(conBasura('participantes', 'c-adrian')),
    ).not.toThrow();
    expect(() => deserializarEscenario(conBasura('dias', 42))).not.toThrow();
    expect(() =>
      deserializarEscenario(conBasura('redondeo', 'ARRIBA')),
    ).not.toThrow();
    expect(() => deserializarEscenario(null)).not.toThrow();
  });

  test('un ajuste y una plaza sin id se saltan; los buenos se quedan', () => {
    const e = deserializarEscenario({
      ...crudo,
      ajustes: [{ tipo: 'DESTAJO', monto: 100 }, ...(crudo.ajustes as unknown[])],
      plazas: {
        'plaza:rota': { etiqueta: 'Sin id' },
        ...(crudo.plazas as Record<string, unknown>),
      },
    });

    expect(e.ajustes).toHaveLength(3);
    expect(Object.keys(e.plazas)).toEqual(['plaza:pl-1']);
  });

  test('el redondeo con campos basura conserva los que sí entiende', () => {
    const e = deserializarEscenario(
      conBasura('redondeo', {
        activo: true,
        paso: 'cincuenta',
        modo: 7,
        campos: ['RAYA', null, 'NO_EXISTE', 42],
      }),
    );

    expect(e.redondeo.paso).toBe(1);
    expect(e.redondeo.modo).toBe('CERCANO');
    expect(e.redondeo.campos).toEqual(['RAYA']);
  });
});

describe('el candado de versión', () => {
  test('la autoridad es la columna `esquema`, no la llave `v` del JSON', () => {
    expect(proyeccionUtilizable(VERSION_ESQUEMA)).toBe(true);
    expect(proyeccionUtilizable(VERSION_ESQUEMA + 1)).toBe(false);
  });
});
