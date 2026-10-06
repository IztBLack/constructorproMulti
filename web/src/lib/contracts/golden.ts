/**
 * Cargador de los VECTORES DORADOS de `contracts/`.
 *
 * Los mismos JSON los lee `flutter test` desde `test/contracts/golden_loader.dart`.
 * Un caso escrito una vez se ejecuta dos veces —contra el TypeScript de la web
 * y contra el Dart del móvil— y si una plataforma se desvía fallan las dos
 * suites. El porqué de todo esto está en `contracts/README.md`.
 *
 * La regla de oro: **un caso nuevo se agrega en el JSON, no aquí**.
 *
 * Solo lo usan los `.test.ts`. Lee del disco con `node:fs` en vez de `import`
 * de JSON a propósito: los contratos viven FUERA de `web/`, y un import
 * relativo que sale del proyecto ata el bundler de Next a una carpeta que no le
 * corresponde. Aquí no hay bundler: vitest corre en Node.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Un caso del contrato: entrada, salida esperada y el porqué de su existencia. */
export interface CasoGolden<E, S> {
  /** Ruta lógica del contrato (`"notas-obra/totales-nota"`). */
  contrato: string;
  /** Identificador estable en kebab-case. Es el nombre del test. */
  nombre: string;
  /**
   * Por qué existe el caso. Se imprime junto al fallo: un número sin su
   * historia se borra en el primer refactor.
   */
  descripcion: string;
  entrada: E;
  esperado: S;
  /** Margen para comparar flotantes. Ausente = comparación exacta. */
  tolerancia?: number;
  /**
   * Lo que se le pasa a `test(...)` como nombre: el identificador, a secas.
   * La descripción no va aquí porque haría ilegible el listado de pruebas;
   * cuando un caso falla, su nombre lleva directo al objeto del JSON.
   */
  titulo: string;
}

export interface ArchivoGolden<E, S> {
  contrato: string;
  descripcion: string;
  casos: CasoGolden<E, S>[];
}

/**
 * Raíz del repositorio (la carpeta que contiene `contracts/`).
 *
 * Se busca subiendo desde ESTE archivo y no desde `process.cwd()`: vitest corre
 * desde `web/`, pero el cargador tiene que servir igual si alguien lanza las
 * pruebas desde la raíz del monorepo o desde el IDE.
 */
function raizRepo(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i += 1) {
    // Se busca `contracts/README.md` y no la carpeta a secas: ESTE archivo vive
    // dentro de una carpeta llamada `contracts`, y la primera vuelta del bucle
    // se quedaría con `web/src/lib` por raíz del repo.
    if (existsSync(join(dir, 'contracts', 'README.md'))) return dir;
    const padre = resolve(dir, '..');
    if (padre === dir) break;
    dir = padre;
  }
  throw new Error(
    `No se encontró la carpeta contracts/ subiendo desde ${fileURLToPath(import.meta.url)}.`,
  );
}

interface CasoCrudo {
  nombre: string;
  descripcion?: string;
  entrada: unknown;
  esperado: unknown;
  tolerancia?: number;
}

interface ArchivoCrudo {
  contrato?: string;
  descripcion?: string;
  casos?: CasoCrudo[];
}

/**
 * Carga `contracts/<ruta>.golden.json` (por ejemplo `"nomina/semana"`).
 *
 * Los tipos `E` (entrada) y `S` (esperado) los declara el test que lo consume,
 * al lado de sus expectativas: es donde de verdad se sabe qué forma tiene ese
 * contrato, y así un cambio en el JSON se ve como un error de tipos y no como
 * un `undefined` que pasa en verde.
 */
export function cargarContrato<E, S>(ruta: string): ArchivoGolden<E, S> {
  const archivo = join(raizRepo(), 'contracts', `${ruta}.golden.json`);
  if (!existsSync(archivo)) {
    throw new Error(`No existe el contrato ${archivo}`);
  }

  const crudo = JSON.parse(readFileSync(archivo, 'utf8')) as ArchivoCrudo;
  const contrato = crudo.contrato ?? ruta;
  const casos = (crudo.casos ?? []).map((c) => ({
    contrato,
    nombre: c.nombre,
    descripcion: c.descripcion ?? '',
    entrada: c.entrada as E,
    esperado: c.esperado as S,
    tolerancia: c.tolerancia,
    titulo: c.nombre,
  }));

  if (casos.length === 0) {
    // Un contrato vacío pasaría en verde sin probar nada, que es peor que no
    // tenerlo: parecería cubierto.
    throw new Error(`El contrato ${contrato} no tiene casos.`);
  }

  return { contrato, descripcion: crudo.descripcion ?? '', casos };
}

/**
 * ¿El número cae dentro de la tolerancia del caso? Sin tolerancia, la
 * comparación es exacta. Espeja `CasoGolden.coincide` del cargador de Dart.
 */
export function dentroDeTolerancia(
  actual: number,
  esperado: number,
  tolerancia?: number,
): boolean {
  return tolerancia === undefined
    ? actual === esperado
    : Math.abs(actual - esperado) <= tolerancia;
}
