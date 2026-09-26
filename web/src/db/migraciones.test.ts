// Las migraciones de `supabase/migrations/` aplicadas sobre un Postgres REAL en
// memoria (PGlite), y el escenario base de RLS: aislamiento entre empresas,
// cliente sin SALIDAS (0010/0019) y colaborador sin notas de obra (0031).
//
// Cómo agregar tests de RLS para una migración nueva: `src/db/pglite/README.md`.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  REEMPLAZOS,
  aplicarMigraciones,
  comoAnonimo,
  comoUsuario,
  crearDbConShim,
  dbMigrada,
  listarMigraciones,
} from './pglite/crear-db';
import {
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearMovimiento,
  crearNotaObra,
  crearObra,
  crearUsuario,
  idsVisibles,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

// Levantar PGlite (WASM) tarda un par de segundos; en máquinas lentas, más.
const LENTO = 60_000;
const RLS = /row-level security/;

describe('migraciones', () => {
  it(
    'aplican todas, en orden, sobre Postgres real',
    async () => {
      const db = await crearDbConShim();
      const aplicadas = await aplicarMigraciones(db);
      expect(aplicadas).toEqual(listarMigraciones());
      expect(aplicadas.length).toBeGreaterThanOrEqual(34);
      await db.close();
    },
    LENTO,
  );

  it('cada reemplazo textual documenta su porqué', () => {
    for (const r of REEMPLAZOS) expect(r.porque.trim().length).toBeGreaterThan(20);
  });

  it(
    'toda tabla de public tiene RLS activado',
    async () => {
      // Red de seguridad para las migraciones que vienen: una tabla nueva sin
      // `enable row level security` queda abierta a cualquier sesión (los roles
      // de Supabase tienen GRANT sobre todo `public`).
      const db = await dbMigrada();
      const r = await db.query<{ tabla: string }>(
        `select c.relname as tabla
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
          order by 1`,
      );
      expect(r.rows.map((x) => x.tabla)).toEqual([]);
    },
    LENTO,
  );
});

describe('RLS base', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraAClienteId: string;
  let obraAOtra: string;
  let obraB: string;
  let clienteA: { userId: string; clienteId: string };
  let supervisorA: string;
  let colaboradorA: string;
  let contadorA: string;

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db, 'Constructora A');
    b = await crearEmpresaDePrueba(db, 'Constructora B');

    supervisorA = await invitarConRol(db, a, 'supervisor');
    colaboradorA = await invitarConRol(db, a, 'colaborador');
    contadorA = await invitarConRol(db, a, 'contador');
    clienteA = await crearClienteConCuenta(db, a.empresaId);

    // Las obras las da de alta cada admin con SU sesión: de paso se prueba la
    // policy de insert de obras (0014).
    obraA = await comoUsuario(db, a.adminId, (tx) =>
      crearObra(tx, a.empresaId, { cliente_id: clienteA.clienteId }),
    );
    obraAClienteId = clienteA.clienteId;
    obraAOtra = await comoUsuario(db, a.adminId, (tx) => crearObra(tx, a.empresaId));
    obraB = await comoUsuario(db, b.adminId, (tx) => crearObra(tx, b.empresaId));
  }, LENTO);

  describe('aislamiento entre empresas', () => {
    it('crear_empresa deja al usuario como admin y siembra el catálogo base', async () => {
      const r = await comoUsuario(db, a.adminId, (tx) =>
        tx.query<{ rol: string; conceptos: number }>(
          `select (select rol from public.usuarios_empresa where user_id = auth.uid()) as rol,
                  (select count(*)::int from public.catalogo_conceptos where empresa_id = $1) as conceptos`,
          [a.empresaId],
        ),
      );
      expect(r.rows[0]).toEqual({ rol: 'admin', conceptos: 10 });
    });

    it('el admin de A no lee las obras de B (ni B las de A)', async () => {
      const todas = [obraA, obraAOtra, obraB];
      const veA = await comoUsuario(db, a.adminId, (tx) => idsVisibles(tx, 'public.obras', todas));
      const veB = await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.obras', todas));
      expect(veA.sort()).toEqual([obraA, obraAOtra].sort());
      expect(veB).toEqual([obraB]);
    });

    it('el admin de A no ve la empresa B ni a sus miembros', async () => {
      const r = await comoUsuario(db, a.adminId, (tx) =>
        tx.query<{ empresas: number; miembros: number }>(
          `select (select count(*)::int from public.empresas where id = $1) as empresas,
                  (select count(*)::int from public.usuarios_empresa where empresa_id = $1) as miembros`,
          [b.empresaId],
        ),
      );
      expect(r.rows[0]).toEqual({ empresas: 0, miembros: 0 });
    });

    it('el admin de A no puede dar de alta una obra con el empresa_id de B', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) => crearObra(tx, b.empresaId)),
      ).rejects.toThrow(RLS);
    });

    it('ya no hay auto-alta como admin de una empresa ajena (0018 A.1)', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          tx.query('insert into public.usuarios_empresa (user_id, empresa_id, rol) values (auth.uid(), $1, $2)', [
            b.empresaId,
            'admin',
          ]),
        ),
      ).rejects.toThrow(RLS);
    });

    it('sin sesión (anon) no se ve ninguna obra', async () => {
      const ve = await comoAnonimo(db, (tx) => idsVisibles(tx, 'public.obras', [obraA, obraB]));
      expect(ve).toEqual([]);
    });
  });

  describe('cliente del portal (0010 / 0019)', () => {
    it('ve SUS obras y nada más', async () => {
      const ve = await comoUsuario(db, clienteA.userId, (tx) =>
        idsVisibles(tx, 'public.obras', [obraA, obraAOtra, obraB]),
      );
      expect(ve).toEqual([obraA]);
      expect(obraAClienteId).toBe(clienteA.clienteId);
    });

    it('ve las ENTRADAS de su obra y NUNCA las SALIDAS', async () => {
      const entrada = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obraA, tipo: 'ENTRADA' });
      const salida = await crearMovimiento(db, { empresaId: a.empresaId, obraId: obraA, tipo: 'SALIDA' });
      const deOtraObra = await crearMovimiento(db, {
        empresaId: a.empresaId,
        obraId: obraAOtra,
        tipo: 'ENTRADA',
      });

      const ve = await comoUsuario(db, clienteA.userId, (tx) =>
        idsVisibles(tx, 'public.movimientos', [entrada, salida, deOtraObra]),
      );
      expect(ve).toEqual([entrada]);

      // El staff de la misma empresa sí ve las tres.
      const staff = await comoUsuario(db, supervisorA, (tx) =>
        idsVisibles(tx, 'public.movimientos', [entrada, salida, deOtraObra]),
      );
      expect(staff.sort()).toEqual([entrada, salida, deOtraObra].sort());
    });

    it('una ENTRADA sembrada por otra empresa en su obra no le aparece (ataque de 0019 §2)', async () => {
      // Supervisor de B escribe con empresa_id = B (pasa su with check) sobre
      // la obra del cliente de A. El cliente de A no debe verla.
      const supervisorB = await invitarConRol(db, b, 'supervisor');
      const falsa = await comoUsuario(db, supervisorB, (tx) =>
        crearMovimiento(tx, { empresaId: b.empresaId, obraId: obraA, tipo: 'ENTRADA' }),
      );
      const ve = await comoUsuario(db, clienteA.userId, (tx) =>
        idsVisibles(tx, 'public.movimientos', [falsa]),
      );
      expect(ve).toEqual([]);
    });

    it('no puede escribir en la caja', async () => {
      await expect(
        comoUsuario(db, clienteA.userId, (tx) =>
          crearMovimiento(tx, { empresaId: a.empresaId, obraId: obraA, tipo: 'ENTRADA' }),
        ),
      ).rejects.toThrow(RLS);
    });
  });

  describe('notas de obra (0031)', () => {
    let nota: string;

    beforeAll(async () => {
      nota = await comoUsuario(db, a.adminId, (tx) =>
        crearNotaObra(tx, { empresaId: a.empresaId, obraId: obraA }),
      );
    });

    it('admin, supervisor y contador la leen', async () => {
      for (const quien of [a.adminId, supervisorA, contadorA]) {
        const ve = await comoUsuario(db, quien, (tx) => idsVisibles(tx, 'public.nota_obra', [nota]));
        expect(ve).toEqual([nota]);
      }
    });

    it('el colaborador NO la ve ni puede crear una', async () => {
      const ve = await comoUsuario(db, colaboradorA, (tx) => idsVisibles(tx, 'public.nota_obra', [nota]));
      expect(ve).toEqual([]);
      await expect(
        comoUsuario(db, colaboradorA, (tx) => crearNotaObra(tx, { empresaId: a.empresaId, obraId: obraA })),
      ).rejects.toThrow(RLS);
    });

    it('el cliente NO la ve', async () => {
      const ve = await comoUsuario(db, clienteA.userId, (tx) => idsVisibles(tx, 'public.nota_obra', [nota]));
      expect(ve).toEqual([]);
    });

    it('el contador la lee pero no la escribe', async () => {
      await expect(
        comoUsuario(db, contadorA, (tx) => crearNotaObra(tx, { empresaId: a.empresaId, obraId: obraA })),
      ).rejects.toThrow(RLS);
    });

    it('el supervisor sí puede crear una', async () => {
      const otra = await comoUsuario(db, supervisorA, (tx) =>
        crearNotaObra(tx, { empresaId: a.empresaId, obraId: obraA }),
      );
      expect(otra).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('no se puede colgar una nota de A bajo una obra de B (padre de otra empresa)', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) => crearNotaObra(tx, { empresaId: a.empresaId, obraId: obraB })),
      ).rejects.toThrow(RLS);
    });

    it('el admin de B no ve la nota de A', async () => {
      const ve = await comoUsuario(db, b.adminId, (tx) => idsVisibles(tx, 'public.nota_obra', [nota]));
      expect(ve).toEqual([]);
    });
  });

  describe('storage: comprobantes solo para oficina (0024)', () => {
    const subir = (quien: string, empresaId: string) =>
      comoUsuario(db, quien, (tx) =>
        insertar(tx, 'storage.objects', {
          bucket_id: 'comprobantes',
          name: `${empresaId}/${randomUUID()}.jpg`,
        }),
      );

    it('el contador sube un comprobante de su empresa', async () => {
      await expect(subir(contadorA, a.empresaId)).resolves.toBeTruthy();
    });

    it('el colaborador no, ni nadie en la carpeta de otra empresa', async () => {
      await expect(subir(colaboradorA, a.empresaId)).rejects.toThrow(RLS);
      await expect(subir(a.adminId, b.empresaId)).rejects.toThrow(RLS);
    });
  });

  // El cuerpo de una función plpgsql no se valida al crearla: un nombre mal
  // escrito solo truena al EJECUTARLA. Por eso las RPC de alta se llaman aquí.
  describe('RPC de usuarios (0018 / 0022 / 0025)', () => {
    it('listar_usuarios_empresa: el admin ve a su gente (con correo) y a nadie de otra empresa', async () => {
      const c = await crearEmpresaDePrueba(db);
      const sup = await invitarConRol(db, c, 'supervisor');
      const r = await comoUsuario(db, c.adminId, (tx) =>
        tx.query<{ user_id: string; email: string; rol: string }>(
          'select user_id::text, email, rol from public.listar_usuarios_empresa()',
        ),
      );
      expect(r.rows.map((x) => [x.user_id, x.rol]).sort()).toEqual(
        [
          [c.adminId, 'admin'],
          [sup, 'supervisor'],
        ].sort(),
      );
      expect(r.rows.every((x) => x.email.endsWith('@prueba.test'))).toBe(true);
    });

    it('listar_usuarios_empresa: un supervisor no puede', async () => {
      await expect(
        comoUsuario(db, supervisorA, (tx) => tx.query('select * from public.listar_usuarios_empresa()')),
      ).rejects.toThrow(/Solo un administrador/);
    });

    it('invitar_socio + canjear_invitacion_por_correo dan un segundo admin', async () => {
      const c = await crearEmpresaDePrueba(db);
      const correo = `socio-${Date.now()}@prueba.test`;
      const inv = await comoUsuario(db, c.adminId, (tx) =>
        tx.query<{ r: { ok: boolean } }>('select public.invitar_socio($1, $2) as r', ['Socio', correo]),
      );
      expect(inv.rows[0].r.ok).toBe(true);

      const socio = await crearUsuario(db, { email: correo });
      const canje = await comoUsuario(db, socio, (tx) =>
        tx.query<{ r: { ok: boolean; rol: string; empresa_id: string } }>(
          'select public.canjear_invitacion_por_correo() as r',
        ),
      );
      expect(canje.rows[0].r).toMatchObject({ ok: true, rol: 'admin', empresa_id: c.empresaId });
    });

    it('sin sesión no se puede invitar (execute revocado a anon)', async () => {
      await expect(
        comoAnonimo(db, (tx) => tx.query(`select public.invitar_usuario('x', 'colaborador')`)),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
