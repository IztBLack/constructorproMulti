// Cada `.from('tabla').select('a, b')` de la web pide columnas que EXISTEN en
// producción (`pglite/esquema-prod.json`).
//
// Por qué: PostgREST responde error si una columna no existe, y si quien llama no
// revisa ese error, la pantalla queda vacía en silencio. Así estuvo la proyección
// de nómina: pedía `obra_colaborador.fecha_entrada` (la columna es
// `fecha_ingreso`) y arrancaba sin participantes en todas las empresas.
//
// Es una revisión de texto, no un parser de TypeScript: cubre las listas simples
// de columnas, salta relaciones embebidas `rel(...)`, `*` y listas armadas con
// `${...}`. Lo que no entiende lo deja pasar; nunca da un falso positivo por eso.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Esquema = Record<string, string[]>;
const FOTO: Esquema = JSON.parse(readFileSync(new URL('./pglite/esquema-prod.json', import.meta.url), 'utf8'));
const COLUMNAS = new Map(Object.entries(FOTO).map(([t, cs]) => [t, new Set(cs)]));
const SRC = fileURLToPath(new URL('..', import.meta.url));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });
}

/** Quita lo que va entre paréntesis (relaciones embebidas, con anidación). */
function sinRelaciones(lista: string): string {
  let prof = 0;
  let out = '';
  for (const ch of lista) {
    if (ch === '(') prof++;
    else if (ch === ')') prof--;
    else if (prof === 0) out += ch;
  }
  return out;
}

export function columnasInexistentes(fuente: string): { tabla: string; columna: string; linea: number }[] {
  const pat = /\.from\(\s*'([a-z_]+)'\s*\)\s*\.select\(\s*(['`])([\s\S]*?)\2/g;
  const malas: { tabla: string; columna: string; linea: number }[] = [];
  for (const m of fuente.matchAll(pat)) {
    const [, tabla, , lista] = m;
    const conocidas = COLUMNAS.get(tabla);
    if (!conocidas || lista.includes('${')) continue;
    for (let parte of sinRelaciones(lista).split(',')) {
      parte = parte.trim();
      if (!parte || parte === '*') continue;
      if (parte.includes(':')) parte = parte.split(':', 2)[1].trim();
      parte = parte.split('::')[0].trim();
      if (!/^[a-z_][a-z0-9_]*$/.test(parte)) continue;
      if (conocidas.has(parte) || COLUMNAS.has(parte)) continue;
      malas.push({ tabla, columna: parte, linea: fuente.slice(0, m.index).split('\n').length });
    }
  }
  return malas;
}

describe('consultas de la web contra el esquema de producción', () => {
  it('detecta una columna que no existe (el caso de la proyección)', () => {
    const viejo = `supabase.from('obra_colaborador').select('colaborador_id, obra_id, fecha_entrada')`;
    expect(columnasInexistentes(viejo)).toEqual([
      { tabla: 'obra_colaborador', columna: 'fecha_entrada', linea: 1 },
    ]);
  });

  it('ninguna consulta de src/ pide una columna que producción no tiene', () => {
    const hallazgos = archivos(SRC).flatMap((f) =>
      columnasInexistentes(readFileSync(f, 'utf8')).map(
        (h) => `${f.slice(SRC.length)}:${h.linea}  ${h.tabla}.${h.columna}`,
      ),
    );
    expect(hallazgos).toEqual([]);
  });
});
