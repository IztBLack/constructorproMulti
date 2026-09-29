// 0047 — Herramienta: asignación permanente ("de planta").
//
// Qué se prueba (ver el encabezado de la migración):
//   · lo que ya existe (y lo que se inserta sin decir nada) queda como préstamo;
//   · permanente ⇒ sin fecha de regreso (CHECK), al crear y al convertir;
//   · mientras está abierta se convierte préstamo ↔ permanente; el contador no;
//   · una permanente cuenta como "el préstamo abierto" (una a la vez) y se
//     cierra igual (la herramienta queda en el estado en que regresó);
//   · candado SEG-M2: cerrada, ya no se cambia si fue préstamo o permanente
//     (ni junto con `deleted_at`), y la FK `on delete set null` sigue pasando;
//   · 0047 corre dos veces sin error y sin duplicar el CHECK.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { DIR_MIGRACIONES, comoUsuario, dbMigrada } from './pglite/crear-db';
import { asignarObra, crearEmpresaDePrueba, crearObra, insertar, invitarConRol, type EmpresaDePrueba } from './pglite/escenarios';

const LENTO = 60_000;
const CHECK = /herramienta_permanente_sin_regreso|check constraint/;

describe('0047 herramienta: asignación permanente', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let obraA: string;
  let supervisorA: string;
  let contadorA: string;
  let residenteA: string;

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db, 'Constructora A');
    supervisorA = await invitarConRol(db, a, 'supervisor');
    contadorA = await invitarConRol(db, a, 'contador');
    residenteA = await invitarConRol(db, a, 'residente');
    obraA = await crearObra(db, a.empresaId);
    await asignarObra(db, a, residenteA, obraA);
  }, LENTO);

  async function herramienta(): Promise<string> {
    const id = randomUUID();
    await insertar(db, 'public.herramienta', { id, empresa_id: a.empresaId, nombre: 'Camioneta', tipo: 'VEHICULO' });
    return id;
  }

  async function asignar(u: string, h: string, extra: Record<string, unknown> = {}): Promise<string> {
    const id = randomUUID();
    await comoUsuario(db, u, (tx) =>
      insertar(
        tx,
        'public.herramienta_asignacion',
        { id, empresa_id: a.empresaId, herramienta_id: h, obra_id: obraA, desde: 1000, ...extra },
        { returning: false },
      ),
    );
    return id;
  }

  async function fila(id: string) {
    const r = await db.query<{ permanente: boolean; devolver_antes: number | null; hasta: number | null }>(
      'select permanente, devolver_antes, hasta from public.herramienta_asignacion where id = $1',
      [id],
    );
    return r.rows[0];
  }

  it('sin decir nada es préstamo (default false, not null)', async () => {
    const id = await asignar(supervisorA, await herramienta(), { devolver_antes: 5000 });
    expect(await fila(id)).toMatchObject({ permanente: false });
    await expect(
      db.query('update public.herramienta_asignacion set permanente = null where id = $1', [id]),
    ).rejects.toThrow(/null value|not-null/);
  }, LENTO);

  it('permanente no lleva fecha de regreso: ni al crear ni al convertir', async () => {
    const h = await herramienta();
    await expect(asignar(supervisorA, h, { permanente: true, devolver_antes: 5000 })).rejects.toThrow(CHECK);
    const id = await asignar(supervisorA, h, { permanente: true });
    expect(await fila(id)).toMatchObject({ permanente: true, devolver_antes: null });
    await expect(
      comoUsuario(db, supervisorA, (tx) =>
        tx.query('update public.herramienta_asignacion set devolver_antes = 9000 where id = $1', [id]),
      ),
    ).rejects.toThrow(CHECK);
  }, LENTO);

  it('abierta se convierte préstamo ↔ permanente; el contador no la toca', async () => {
    const id = await asignar(supervisorA, await herramienta(), { devolver_antes: 5000 });
    // Sin quitar la fecha, no se vuelve permanente.
    await expect(
      comoUsuario(db, supervisorA, (tx) =>
        tx.query('update public.herramienta_asignacion set permanente = true where id = $1', [id]),
      ),
    ).rejects.toThrow(CHECK);
    await comoUsuario(db, a.adminId, (tx) =>
      tx.query('update public.herramienta_asignacion set permanente = true, devolver_antes = null where id = $1', [id]),
    );
    expect(await fila(id)).toMatchObject({ permanente: true, devolver_antes: null });
    await comoUsuario(db, supervisorA, (tx) =>
      tx.query('update public.herramienta_asignacion set permanente = false, devolver_antes = 7000 where id = $1', [id]),
    );
    expect(await fila(id)).toMatchObject({ permanente: false, devolver_antes: 7000 });

    const r = await comoUsuario(db, contadorA, (tx) =>
      tx.query('update public.herramienta_asignacion set permanente = true, devolver_antes = null where id = $1', [id]),
    );
    expect(r.affectedRows).toBe(0);
    expect(await fila(id)).toMatchObject({ permanente: false });

    // RLS sin cambios: el residente de ESA obra ya podía editar el préstamo
    // abierto (0044), así que también puede convertirlo (documentado en 0047).
    await comoUsuario(db, residenteA, (tx) =>
      tx.query('update public.herramienta_asignacion set permanente = true, devolver_antes = null where id = $1', [id]),
    );
    expect(await fila(id)).toMatchObject({ permanente: true });
  }, LENTO);

  it('una permanente cuenta como "el préstamo abierto" y se cierra igual que un préstamo', async () => {
    const h = await herramienta();
    const id = await asignar(supervisorA, h, { permanente: true });
    await expect(asignar(supervisorA, h, { desde: 2000 })).rejects.toThrow(/uq_herramienta_asignacion_abierta|duplicate key/);
    await comoUsuario(db, supervisorA, (tx) =>
      tx.query(
        `update public.herramienta_asignacion set hasta = 5000, estado_regreso = 'REPARACION', recibio_nombre = 'Beto' where id = $1`,
        [id],
      ),
    );
    const e = await db.query<{ estado: string }>('select estado from public.herramienta where id = $1', [h]);
    expect(e.rows[0].estado).toBe('REPARACION');
    expect(await fila(id)).toMatchObject({ permanente: true, hasta: 5000 });
    // Ya regresó: se puede volver a prestar.
    await asignar(supervisorA, h, { desde: 6000 });
  }, LENTO);

  it('SEG-M2: cerrada, ya no se cambia si fue préstamo o permanente (tampoco junto con deleted_at)', async () => {
    const id = await asignar(supervisorA, await herramienta(), { permanente: true });
    await comoUsuario(db, supervisorA, (tx) =>
      tx.query(`update public.herramienta_asignacion set hasta = 5000, estado_regreso = 'BUENO' where id = $1`, [id]),
    );
    for (const sql of [
      'update public.herramienta_asignacion set permanente = false where id = $1',
      'update public.herramienta_asignacion set permanente = false, deleted_at = 1 where id = $1',
    ]) {
      await expect(comoUsuario(db, a.adminId, (tx) => tx.query(sql, [id]))).rejects.toThrow(/HERRAMIENTA_HISTORIAL/);
    }
    // Ni el superusuario (el candado es un trigger, no RLS).
    await expect(
      db.query('update public.herramienta_asignacion set permanente = false where id = $1', [id]),
    ).rejects.toThrow(/HERRAMIENTA_HISTORIAL/);
    expect(await fila(id)).toMatchObject({ permanente: true });
  }, LENTO);

  it('la FK on delete set null de la obra sigue pasando por el candado con una permanente cerrada', async () => {
    const obra = await crearObra(db, a.empresaId);
    const h = await herramienta();
    const id = randomUUID();
    await insertar(db, 'public.herramienta_asignacion', {
      id, empresa_id: a.empresaId, herramienta_id: h, obra_id: obra, desde: 1000,
      permanente: true, hasta: 2000, estado_regreso: 'BUENO',
    });
    await db.query('delete from public.obras where id = $1', [obra]);
    const r = await db.query<{ obra_id: string | null; permanente: boolean }>(
      'select obra_id, permanente from public.herramienta_asignacion where id = $1', [id]);
    expect(r.rows[0]).toEqual({ obra_id: null, permanente: true });
  }, LENTO);

  it('0047 corre dos veces sin error y sin duplicar el CHECK', async () => {
    const sql = readFileSync(join(DIR_MIGRACIONES, '0047_herramienta_permanente.sql'), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
    });
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_constraint
        where conname = 'herramienta_permanente_sin_regreso' and conrelid = 'public.herramienta_asignacion'::regclass`,
    );
    expect(r.rows[0].n).toBe(1);
  }, LENTO);
});
