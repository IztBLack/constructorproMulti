/**
 * Los íconos de ayuda: textos cortos, sin lenguaje de juego, y ninguno
 * huérfano (escrito aquí pero sin colocar en ninguna pantalla).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AYUDAS } from './ayudas';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) archivos(r, acc);
    else if (/\.tsx$/.test(n)) acc.push(r);
  }
  return acc;
}

const fuentes = archivos(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
const JUEGO = /\b(nivel(es)?|misi[oó]n(es)?|rango|sellos?|insignias?|puntos|medallas?|logros?)\b/i;

describe('ayudas', () => {
  const entradas = Object.entries(AYUDAS);

  it('textos breves y completos', () => {
    for (const [clave, a] of entradas) {
      expect(a.titulo.trim(), clave).not.toBe('');
      expect(a.texto.trim(), clave).not.toBe('');
      expect(a.texto.length, `${clave}: ${a.texto.length} caracteres`).toBeLessThanOrEqual(260);
    }
  });

  it('tono profesional: sin lenguaje de juego', () => {
    for (const [clave, a] of entradas) expect(`${a.titulo} ${a.texto}`, clave).not.toMatch(JUEGO);
  });

  it('cada ayuda está colocada en alguna pantalla', () => {
    const sinUsar = entradas.map(([c]) => c).filter((c) => !fuentes.includes(`clave="${c}"`));
    expect(sinUsar).toEqual([]);
  });
});
