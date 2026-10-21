// Gemelos TS de las listas de material contra los MISMOS casos que la prueba
// de Dart (`test/domain/listas/listas_test.dart`): si la web y el móvil leen
// distinto una nota o dan otros metros, falla aquí o allá.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estribosPorPieza, numeroCorto, metros2, tipoRenglonLista, totalesDe, agruparPorSeccion } from './calculo';
import { leerNotaMaterial } from './leer-nota';

interface Casos {
  lectura: {
    nombre: string;
    texto: string;
    renglones: {
      seccion: string;
      tipo: string;
      cantidad: number;
      largo: number | null;
      separacionCm: number | null;
      unidad: string;
      descripcion: string;
      nota: string;
      conDuda: boolean;
    }[];
  }[];
  estribos: { largo: number; separacionCm: number | null; porPieza: number | null }[];
  totales: {
    nombre: string;
    renglones: { tipo: string; cantidad: number; largo: number | null; separacionCm: number | null; marcado: boolean }[];
    esperado: { renglones: number; marcados: number; piezas: number; metros: number; estribos: number };
  }[];
}

const casos = JSON.parse(readFileSync(new URL('./casos.json', import.meta.url), 'utf8')) as Casos;

describe('leerNotaMaterial', () => {
  for (const c of casos.lectura) {
    it(c.nombre, () => {
      const leidos = leerNotaMaterial(c.texto);
      expect(leidos).toHaveLength(c.renglones.length);
      c.renglones.forEach((e, i) => {
        const r = leidos[i];
        expect({
          seccion: r.seccion,
          tipo: r.tipo,
          cantidad: r.cantidad,
          largo: r.largo,
          separacionCm: r.separacionCm,
          unidad: r.unidad,
          descripcion: r.descripcion,
          nota: r.nota,
          conDuda: r.duda != null,
        }, `renglón ${i} («${r.linea}»)`).toEqual(e);
      });
    });
  }

  it('nada se descarta: una línea incomprensible queda para revisar', () => {
    const r = leerNotaMaterial('Trabes\nestribo 25');
    expect(r).toHaveLength(1);
    expect(r[0].duda).not.toBeNull();
    expect(r[0].descripcion).toBe('estribo 25');
  });
});

describe('estribosPorPieza', () => {
  for (const c of casos.estribos) {
    it(`${c.largo} m @${c.separacionCm}`, () => {
      expect(estribosPorPieza(c.largo, c.separacionCm)).toBe(c.porPieza);
    });
  }
});

describe('totalesDe', () => {
  for (const c of casos.totales) {
    it(c.nombre, () => {
      const t = totalesDe(
        c.renglones.map((r) => ({
          tipo: tipoRenglonLista(r.tipo),
          cantidad: r.cantidad,
          largo: r.largo,
          separacion_cm: r.separacionCm,
          marcado: r.marcado,
        })),
      );
      expect(t).toEqual(c.esperado);
    });
  }
});

describe('formato y agrupado', () => {
  it('numeroCorto y metros2', () => {
    expect(numeroCorto(4)).toBe('4');
    expect(numeroCorto(2.5)).toBe('2.5');
    expect(numeroCorto(10.45)).toBe('10.45');
    expect(metros2(3)).toBe('3.00');
  });

  it('agruparPorSeccion respeta el orden de aparición', () => {
    const g = agruparPorSeccion(['Trabes:a', 'Pasillo:b', 'Trabes:c'], (s) => s.split(':')[0]);
    expect(g.map(([s]) => s)).toEqual(['Trabes', 'Pasillo']);
    expect(g[0][1]).toEqual(['Trabes:a', 'Trabes:c']);
  });
});
