/**
 * El recorrido no se puede quedar atrás de la app ni volverse peligroso. Esta
 * prueba falla el build si un paso apunta a una pantalla o un `data-guia` que
 * ya no existen, si rompe las reglas de seguridad (nada que guarde, nada en la
 * asistencia), o si se cuela lenguaje de juego (decisión de Mario: tono
 * profesional, sin niveles, misiones, rangos ni sellos).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAVES_MODULO, esClaveModulo } from '@/lib/modulos';
import { ALCANCES, minutosDe, rutaCoincide, temasPara, totalPasos } from './motor';
import { TEMAS } from './temas';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const APP = join(SRC, 'app');

function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) archivos(r, acc);
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) acc.push(r);
  }
  return acc;
}

// Renglones con `data-guia` fuera de `lib/guia/` (ahí solo se nombran).
const renglones = archivos(SRC)
  .filter((f) => !relative(SRC, f).replaceAll('\\', '/').startsWith('lib/guia/'))
  .flatMap((f) => readFileSync(f, 'utf8').split('\n'))
  .filter((r) => r.includes('data-guia'));
const anclaPintada = (a: string) => renglones.some((r) => r.includes(`"${a}"`) || r.includes(`'${a}'`));

/** ¿Hay una `page.tsx` para este patrón? `*` equivale a una carpeta `[param]`. */
function paginaExiste(patron: string, dir = APP, segs = patron.split('/').filter(Boolean)): boolean {
  if (segs.length === 0) return existsSync(join(dir, 'page.tsx'));
  if (!existsSync(dir)) return false;
  const [s, ...resto] = segs;
  const hijos = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
  const candidatos = s === '*' ? hijos.filter((n) => /^\[.+\]$/.test(n)) : hijos.filter((n) => n === s);
  // Los grupos de rutas `(x)` no cuentan como segmento.
  const grupos = hijos.filter((n) => /^\(.+\)$/.test(n));
  return (
    candidatos.some((c) => paginaExiste(patron, join(dir, c), resto)) ||
    grupos.some((g) => paginaExiste(patron, join(dir, g), segs))
  );
}

const pasos = TEMAS.flatMap((t) => t.pasos.map((p) => ({ tema: t, p })));
const JUEGO = /\b(nivel(es)?|misi[oó]n(es)?|rango|sellos?|insignias?|puntos|medallas?|logros?)\b/i;

describe('temas del recorrido', () => {
  it('ids únicos de tema y de paso dentro de cada tema', () => {
    const ids = TEMAS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMAS) {
      const ps = t.pasos.map((p) => p.id);
      expect(new Set(ps).size, t.id).toBe(ps.length);
      expect(t.pasos.length, t.id).toBeGreaterThan(0);
    }
  });

  it('módulos válidos', () => {
    for (const t of TEMAS) if (t.modulo !== null) expect(esClaveModulo(t.modulo), t.id).toBe(true);
  });

  it('cada tema arranca en una pantalla concreta que existe, y su primer paso es ahí', () => {
    for (const t of TEMAS) {
      expect(t.inicio, t.id).not.toContain('*');
      expect(paginaExiste(t.inicio), `${t.id}: ${t.inicio}`).toBe(true);
      expect(rutaCoincide(t.inicio, t.pasos[0].ruta), `${t.id}: el primer paso no es en ${t.inicio}`).toBe(true);
    }
  });

  it('cada ruta de paso existe y está dentro del panel', () => {
    for (const { tema, p } of pasos) {
      expect(p.ruta, `${tema.id}/${p.id}`).toMatch(/^\/admin(\/|$)/);
      expect(paginaExiste(p.ruta), `${tema.id}/${p.id}: ${p.ruta}`).toBe(true);
    }
  });

  it('cada ancla existe como data-guia en el código', () => {
    for (const { tema, p } of pasos) {
      if (p.objetivo && 'ancla' in p.objetivo) {
        expect(anclaPintada(p.objetivo.ancla), `${tema.id}/${p.id}: data-guia="${p.objetivo.ancla}"`).toBe(true);
      }
    }
  });

  it('reglas de seguridad', () => {
    for (const { tema, p } of pasos) {
      const id = `${tema.id}/${p.id}`;
      // Tocar, escribir y bloqueado necesitan algo señalado.
      if (p.accion !== 'leer') expect(p.objetivo, id).toBeDefined();
      if (p.accion === 'escribir') expect(p.ejemplo?.trim(), id).toBeTruthy();
      // La asistencia escribe en una cola sin conexión: solo se explica.
      if (/asistencia/.test(p.ruta)) expect(['leer', 'bloqueado'], id).toContain(p.accion);
      // Dentro de una obra, la cuenta puede no tener ninguna: vista de ejemplo obligatoria.
      if (p.ruta.startsWith('/admin/obras/*')) expect(p.maqueta, `${id}: falta maqueta`).toBeDefined();
    }
  });

  it('tono profesional: sin lenguaje de juego', () => {
    for (const t of TEMAS) {
      expect(`${t.titulo} ${t.descripcion}`, t.id).not.toMatch(JUEGO);
      for (const p of t.pasos) expect(`${p.titulo} ${p.texto}`, `${t.id}/${p.id}`).not.toMatch(JUEGO);
    }
  });

  it('cada alcance tiene temas y una duración razonable con todo prendido', () => {
    const tope = { esencial: 15, diaria: 35, completo: 75 } as const;
    for (const a of ALCANCES) {
      const temas = temasPara(TEMAS, a.clave, CLAVES_MODULO, 'admin');
      expect(temas.length, a.clave).toBeGreaterThan(0);
      expect(minutosDe(totalPasos(temas)), a.clave).toBeLessThanOrEqual(tope[a.clave]);
    }
  });
});
