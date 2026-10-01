/**
 * La guía no se puede quedar atrás de la app. Esta prueba falla el build si una
 * tarjeta apunta a una pantalla que ya no existe, a un `data-guia` que nadie
 * pinta, o si un módulo disponible se queda sin tarjeta.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULOS, esClaveModulo } from '@/lib/modulos';
import { MAZOS, VERSION_GUIA } from './contenido';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const tarjetas = MAZOS.flatMap((m) => m.tarjetas);

/** Todos los .ts/.tsx de src salvo pruebas (ahí las anclas solo se nombran). */
function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivosFuente(ruta, acc);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) acc.push(ruta);
  }
  return acc;
}

// Fuera `lib/guia/`: ahí las anclas se NOMBRAN, no se pintan. Solo interesan
// los renglones con `data-guia`: el valor puede ir literal (`data-guia="x"`) o
// en una expresión (`data-guia={nuevo ? 'x' : undefined}`).
const renglonesConAncla = archivosFuente(SRC)
  .filter((f) => !relative(SRC, f).replaceAll('\\', '/').startsWith('lib/guia/'))
  .flatMap((f) => readFileSync(f, 'utf8').split('\n'))
  .filter((r) => r.includes('data-guia='));

const anclaPintada = (ancla: string) =>
  renglonesConAncla.some((r) => r.includes(`"${ancla}"`) || r.includes(`'${ancla}'`));

describe('contenido de la guía', () => {
  it('tiene versión y mazos', () => {
    expect(VERSION_GUIA).toBeGreaterThan(0);
    expect(MAZOS.length).toBeGreaterThan(0);
  });

  it('ids de tarjeta y claves de mazo únicos', () => {
    const ids = tarjetas.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const claves = MAZOS.map((m) => m.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('cada tarjeta tiene frente y de 2 a 5 pasos', () => {
    for (const t of tarjetas) {
      expect(t.titulo.trim(), t.id).not.toBe('');
      expect(t.resumen.trim(), t.id).not.toBe('');
      expect(t.pasos.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.pasos.length, t.id).toBeLessThanOrEqual(5);
      for (const p of t.pasos) expect(p.trim(), t.id).not.toBe('');
    }
  });

  it('los módulos existen', () => {
    for (const t of tarjetas) {
      if (t.modulo !== null) expect(esClaveModulo(t.modulo), t.id).toBe(true);
    }
  });

  it('cada destino es una pantalla que existe', () => {
    for (const t of tarjetas) {
      if (!t.destino) continue;
      const { href } = t.destino;
      expect(href, t.id).toMatch(/^\/(admin|campo)(\/|$)/);
      expect(href, `${t.id}: sin query ni ancla`).not.toMatch(/[?#]/);
      const pagina = join(SRC, 'app', ...href.split('/').filter(Boolean), 'page.tsx');
      expect(existsSync(pagina), `${t.id} → ${href}`).toBe(true);
    }
  });

  it('cada ancla existe como data-guia en el código', () => {
    for (const t of tarjetas) {
      const ancla = t.destino?.ancla;
      if (!ancla) continue;
      expect(anclaPintada(ancla), `${t.id}: data-guia="${ancla}"`).toBe(true);
    }
  });

  it('ningún módulo disponible se queda sin tarjeta', () => {
    const conTarjeta = new Set(tarjetas.map((t) => t.modulo));
    const faltan = MODULOS.filter((m) => m.disponible && !conTarjeta.has(m.clave)).map((m) => m.clave);
    expect(faltan).toEqual([]);
  });
});
