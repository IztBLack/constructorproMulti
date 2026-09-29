// El PGlite migrado tiene que tener EXACTAMENTE las tablas y columnas de
// producción. Si no, las pruebas corren contra un esquema que no existe allá
// (la carga del demo falló así: el harness aplicaba la escotilla 0030).
//
// `pglite/esquema-prod.json` es una foto del esquema `public` de producción:
// solo nombres de tablas y columnas (de information_schema.columns vía la
// Management API), sin datos. Cómo actualizarla, en su README.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dbMigrada } from './pglite/crear-db';

type Esquema = Record<string, string[]>;

const FOTO: Esquema = JSON.parse(readFileSync(new URL('./pglite/esquema-prod.json', import.meta.url), 'utf8'));

/** Diferencias legibles: "tabla.columna solo en X". Vacío = iguales. */
export function diferenciasEsquema(repo: Esquema, prod: Esquema): string[] {
  const out: string[] = [];
  const tablas = [...new Set([...Object.keys(repo), ...Object.keys(prod)])].sort();
  for (const t of tablas) {
    if (!prod[t]) {
      out.push(`tabla ${t}: está en el repo (PGlite) y NO en producción`);
      continue;
    }
    if (!repo[t]) {
      out.push(`tabla ${t}: está en producción y NO en el repo (PGlite)`);
      continue;
    }
    const p = new Set(prod[t]);
    const r = new Set(repo[t]);
    for (const c of repo[t]) if (!p.has(c)) out.push(`${t}.${c}: está en el repo (PGlite) y NO en producción`);
    for (const c of prod[t]) if (!r.has(c)) out.push(`${t}.${c}: está en producción y NO en el repo (PGlite)`);
  }
  return out;
}

/**
 * Diferencias YA diagnosticadas que no se arreglan desde aquí (no se toca
 * producción desde el repo). Cada una lleva su porqué. La prueba falla si
 * aparece una diferencia NUEVA y también si una de estas desaparece (para que
 * la lista no se quede vieja cuando alguien la resuelva).
 */
export const DIFERENCIAS_CONOCIDAS: readonly { diferencia: string; porque: string }[] = [
  {
    diferencia: 'tabla proyeccion_guardada: está en producción y NO en el repo (PGlite)',
    porque:
      'La crea `supabase/migrations/0034_proyeccion_guardada.sql`, que solo existe en la rama ' +
      '`bulk-collab-salary` (= origin/claude/bulk-collaborators-salary-edit-49glwi, commits 8caa9cb y ' +
      '8e65966 "la 0034 en producción"), sin mergear a main ni a la rama de integración. Choca de número ' +
      'con `0034_nota_para_y_porcentaje.sql`. Al mergear esa rama hay que renumerarla (p. ej. 0046) y ' +
      'entonces sale de esta lista.',
  },
  // ── Migraciones del repo PENDIENTES DE APLICAR en producción ──────────────
  // La foto es de producción real: no se edita a mano para "adelantarla". Cada
  // migración nueva que agrega columnas entra aquí hasta que se aplique; al
  // aplicarla y volver a tomar la foto (README), esta prueba avisa que la
  // diferencia ya no existe y se borra la entrada.
  // (0047 herramienta_asignacion.permanente: aplicada en prod el 2026-09-28 y
  // foto retomada; ya no es diferencia.)
];

describe('esquema de producción', () => {
  it('la foto tiene forma de tabla → columnas', () => {
    expect(Object.keys(FOTO).length).toBeGreaterThan(50);
    for (const cols of Object.values(FOTO)) expect(cols.length).toBeGreaterThan(0);
  });

  it('el PGlite migrado tiene las mismas tablas y columnas que producción', async () => {
    const db = await dbMigrada();
    const r = await db.query<{ t: string; c: string }>(
      `select c.table_name as t, c.column_name as c
         from information_schema.columns c
         join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
        where c.table_schema = 'public' and x.table_type = 'BASE TABLE'`,
    );
    const repo: Esquema = {};
    for (const f of r.rows) (repo[f.t] ??= []).push(f.c);
    const conocidas = new Set(DIFERENCIAS_CONOCIDAS.map((d) => d.diferencia));
    const encontradas = diferenciasEsquema(repo, FOTO);
    // Nuevas: algo cambió de un lado y no del otro (¿otra escotilla? ¿una
    // migración sin aplicar en producción? ¿algo aplicado a mano?).
    expect(encontradas.filter((d) => !conocidas.has(d)), 'diferencias nuevas prod ↔ repo').toEqual([]);
    // Resueltas: quítalas de DIFERENCIAS_CONOCIDAS.
    expect([...conocidas].filter((d) => !encontradas.includes(d)), 'diferencias conocidas que ya no existen').toEqual([]);
  }, 60_000);

  it('cada diferencia conocida explica su porqué', () => {
    for (const d of DIFERENCIAS_CONOCIDAS) expect(d.porque.length).toBeGreaterThan(40);
  });

  it('sin la escotilla 0030, colaboradores ya no trae las columnas de sueldo (como producción)', () => {
    for (const c of ['salario_personalizado', 'periodo_pago', 'salario_periodo', 'dias_semana']) {
      expect(FOTO.colaboradores).not.toContain(c);
      expect(FOTO.colaborador_sueldo).toContain(c);
    }
  });
});
