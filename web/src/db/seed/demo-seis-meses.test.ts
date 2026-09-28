import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbMigrada } from '../pglite/crear-db';
import { crearEmpresaDePrueba, type EmpresaDePrueba } from '../pglite/escenarios';
import { generarDemo, type DemoGenerado } from './demo-seis-meses';

describe('demo de seis meses', () => {
  let db: PGlite;
  let emp: EmpresaDePrueba;
  let demo: DemoGenerado;

  beforeAll(async () => {
    db = await crearDbMigrada();
    emp = await crearEmpresaDePrueba(db, 'Prueba');
    demo = generarDemo({ userId: emp.adminId, empresaId: emp.empresaId });
    await db.exec(demo.sql);
  }, 180_000);

  it('corre sin errores', async () => {
    const r = await db.query<{ n: number }>('select count(*)::int as n from public.obras where empresa_id = $1', [emp.empresaId]);
    expect(r.rows[0].n).toBe(4);
  });
});
