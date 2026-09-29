// 0041 — Bitácora de obra con fotos + programa de obra.
//
// Qué se prueba (ver el encabezado de la migración):
//   · aislamiento entre empresas y "el padre es de la misma empresa" (0019);
//   · quién lee y quién escribe (admin, supervisor, contador, colaborador, cliente);
//   · el cierre a las 24 h lo pone la BASE: contenido y borrado bloqueados,
//     solo aclaraciones y `visible_cliente`; `created_at` no alarga la ventana;
//   · el cliente ve SOLO lo publicado de sus obras, con fotos y aclaraciones;
//   · Storage: carpetas por empresa/obra/entrada y fotos de una entrada cerrada.

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, dbMigrada, type Consultable } from './pglite/crear-db';
import {
  crearClienteConCuenta,
  crearEmpresaDePrueba,
  crearObra,
  idsVisibles,
  insertar,
  invitarConRol,
  type EmpresaDePrueba,
} from './pglite/escenarios';

const RLS = /row-level security/;
const CERRADA = /BITACORA_CERRADA/;
const LENTO = 60_000;
const HORA = 3_600_000;

function nuevaEntrada(
  empresaId: string,
  obraId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    empresa_id: empresaId,
    obra_id: obraId,
    fecha: Date.now(),
    tipo: 'AVANCE',
    texto: 'Se coló la losa del eje 3',
    ...extra,
  };
}

async function crearEntrada(
  c: Consultable,
  empresaId: string,
  obraId: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const fila = nuevaEntrada(empresaId, obraId, extra);
  await insertar(c, 'public.bitacora_entrada', fila, { returning: false });
  return fila.id as string;
}

/** Echa atrás el reloj de una entrada (como si hubiera llegado hace `horas`). */
async function envejecer(db: PGlite, entradaId: string, horas: number): Promise<void> {
  // El trigger no deja mover `registrada_en`: se apaga solo para este sembrado.
  await db.transaction(async (tx) => {
    await tx.exec('set local session_replication_role = replica');
    await tx.query(
      'update public.bitacora_entrada set registrada_en = registrada_en - $2 where id = $1',
      [entradaId, horas * HORA],
    );
  });
}

function rutaFoto(empresaId: string, obraId: string, entradaId: string): string {
  return `${empresaId}/${obraId}/${entradaId}/${randomUUID()}.jpg`;
}

describe('0041 bitácora y programa', () => {
  let db: PGlite;
  let a: EmpresaDePrueba;
  let b: EmpresaDePrueba;
  let obraA: string;
  let obraAOtroCliente: string;
  let obraB: string;
  let supervisorA: string;
  let colaboradorA: string;
  let contadorA: string;
  let clienteA: { userId: string; clienteId: string };

  beforeAll(async () => {
    db = await dbMigrada();
    a = await crearEmpresaDePrueba(db, 'Constructora A');
    b = await crearEmpresaDePrueba(db, 'Constructora B');
    supervisorA = await invitarConRol(db, a, 'supervisor');
    colaboradorA = await invitarConRol(db, a, 'colaborador');
    contadorA = await invitarConRol(db, a, 'contador');
    clienteA = await crearClienteConCuenta(db, a.empresaId);
    obraA = await crearObra(db, a.empresaId, { cliente_id: clienteA.clienteId });
    obraAOtroCliente = await crearObra(db, a.empresaId);
    obraB = await crearObra(db, b.empresaId);
  }, LENTO);

  // ── Aislamiento y roles ───────────────────────────────────────────────────

  it('el admin registra una entrada; la base sella autor y hora de registro', async () => {
    const futuro = Date.now() + 365 * 24 * HORA;
    const id = await comoUsuario(db, a.adminId, (tx) =>
      crearEntrada(tx, a.empresaId, obraA, { created_at: futuro, registrada_en: futuro }),
    );
    const r = await db.query<{ autor_id: string; registrada_en: string }>(
      'select autor_id, registrada_en from public.bitacora_entrada where id = $1',
      [id],
    );
    expect(r.rows[0].autor_id).toBe(a.adminId);
    // Ni `created_at` ni un `registrada_en` mandado desde fuera alargan la ventana.
    expect(Math.abs(Number(r.rows[0].registrada_en) - Date.now())).toBeLessThan(HORA);
  });

  it('la empresa B no ve la bitácora de A ni puede escribir con su empresa_id', async () => {
    const id = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
    const ve = await comoUsuario(db, b.adminId, (tx) =>
      idsVisibles(tx, 'public.bitacora_entrada', [id]),
    );
    expect(ve).toEqual([]);
    await expect(
      comoUsuario(db, b.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA)),
    ).rejects.toThrow(RLS);
  });

  it('no se cuelga una entrada de A bajo una obra de B (padre de otra empresa)', async () => {
    await expect(
      comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraB)),
    ).rejects.toThrow(RLS);
  });

  it('supervisor escribe; contador solo lee; colaborador ni lee ni escribe', async () => {
    const id = await comoUsuario(db, supervisorA, (tx) => crearEntrada(tx, a.empresaId, obraA));
    expect(
      await comoUsuario(db, contadorA, (tx) => idsVisibles(tx, 'public.bitacora_entrada', [id])),
    ).toEqual([id]);
    await expect(
      comoUsuario(db, contadorA, (tx) => crearEntrada(tx, a.empresaId, obraA)),
    ).rejects.toThrow(RLS);

    expect(
      await comoUsuario(db, colaboradorA, (tx) => idsVisibles(tx, 'public.bitacora_entrada', [id])),
    ).toEqual([]);
    await expect(
      comoUsuario(db, colaboradorA, (tx) => crearEntrada(tx, a.empresaId, obraA)),
    ).rejects.toThrow(RLS);
  });

  it('el supervisor edita las suyas, no las del admin; el admin edita cualquiera abierta', async () => {
    const delAdmin = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
    const delSup = await comoUsuario(db, supervisorA, (tx) => crearEntrada(tx, a.empresaId, obraA));

    const ajena = await comoUsuario(db, supervisorA, (tx) =>
      tx.query(`update public.bitacora_entrada set texto = 'x' where id = $1`, [delAdmin]),
    );
    expect(ajena.affectedRows).toBe(0);

    const propia = await comoUsuario(db, supervisorA, (tx) =>
      tx.query(`update public.bitacora_entrada set texto = 'corregido' where id = $1`, [delSup]),
    );
    expect(propia.affectedRows).toBe(1);

    const admin = await comoUsuario(db, a.adminId, (tx) =>
      tx.query(`update public.bitacora_entrada set clima = 'LLUVIA' where id = $1`, [delSup]),
    );
    expect(admin.affectedRows).toBe(1);
  });

  it('el supervisor no puede "adoptar" una entrada cambiando el autor', async () => {
    const id = await comoUsuario(db, supervisorA, (tx) => crearEntrada(tx, a.empresaId, obraA));
    await comoUsuario(db, supervisorA, (tx) =>
      tx.query(`update public.bitacora_entrada set autor_id = $2, autor_nombre = 'Otro' where id = $1`, [
        id,
        a.adminId,
      ]),
    );
    const r = await db.query<{ autor_id: string }>(
      'select autor_id from public.bitacora_entrada where id = $1',
      [id],
    );
    expect(r.rows[0].autor_id).toBe(supervisorA);
  });

  // ── Cierre a las 24 h ─────────────────────────────────────────────────────

  describe('cierre a las 24 h', () => {
    let cerrada: string;

    beforeAll(async () => {
      cerrada = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
      await envejecer(db, cerrada, 25);
    });

    it('a las 23 h todavía se edita', async () => {
      const id = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
      await envejecer(db, id, 23);
      const r = await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.bitacora_entrada set texto = 'a tiempo' where id = $1`, [id]),
      );
      expect(r.affectedRows).toBe(1);
    });

    it('pasadas 24 h la base rechaza cambiar el texto, la fecha o el personal', async () => {
      for (const set of [
        `texto = 'reescrito'`,
        `fecha = fecha - 86400000`,
        `personal_nombres = array['Nadie']`,
        `tipo = 'INCIDENCIA'`,
      ]) {
        await expect(
          comoUsuario(db, a.adminId, (tx) =>
            tx.query(`update public.bitacora_entrada set ${set} where id = $1`, [cerrada]),
          ),
        ).rejects.toThrow(CERRADA);
      }
    });

    it('ni se borra (lógico)', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          tx.query(`update public.bitacora_entrada set deleted_at = $2 where id = $1`, [
            cerrada,
            Date.now(),
          ]),
        ),
      ).rejects.toThrow(CERRADA);
    });

    it('ni se puede reabrir moviendo registrada_en', async () => {
      await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.bitacora_entrada set registrada_en = $2 where id = $1`, [
          cerrada,
          Date.now(),
        ]),
      );
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          tx.query(`update public.bitacora_entrada set texto = 'otra vez' where id = $1`, [cerrada]),
        ),
      ).rejects.toThrow(CERRADA);
    });

    it('sí se puede publicar o retirar del portal', async () => {
      const r = await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.bitacora_entrada set visible_cliente = true where id = $1`, [cerrada]),
      );
      expect(r.affectedRows).toBe(1);
    });

    it('se le agregan aclaraciones, que después no se editan', async () => {
      const acl = randomUUID();
      await comoUsuario(db, supervisorA, (tx) =>
        insertar(
          tx,
          'public.bitacora_aclaracion',
          { id: acl, empresa_id: a.empresaId, entrada_id: cerrada, texto: 'Fueron 3 m³, no 4' },
          { returning: false },
        ),
      );
      const r = await comoUsuario(db, supervisorA, (tx) =>
        tx.query(`update public.bitacora_aclaracion set texto = 'cambiado' where id = $1`, [acl]),
      );
      expect(r.affectedRows).toBe(0);
    });

    it('no acepta fotos nuevas', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.bitacora_foto',
            {
              id: randomUUID(),
              empresa_id: a.empresaId,
              entrada_id: cerrada,
              path: rutaFoto(a.empresaId, obraA, cerrada),
            },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(CERRADA);
    });

    it('aclaración de A colgada de una entrada de B: rechazada', async () => {
      const deB = await comoUsuario(db, b.adminId, (tx) => crearEntrada(tx, b.empresaId, obraB));
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.bitacora_aclaracion',
            { id: randomUUID(), empresa_id: a.empresaId, entrada_id: deB, texto: 'intruso' },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });
  });

  // ── Fotos ─────────────────────────────────────────────────────────────────

  describe('fotos', () => {
    it('la ruta debe caer en la carpeta de ESA entrada', async () => {
      const e1 = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
      const e2 = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
      const foto = (path: string) =>
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.bitacora_foto',
            { id: randomUUID(), empresa_id: a.empresaId, entrada_id: e1, path },
            { returning: false },
          ),
        );
      await foto(rutaFoto(a.empresaId, obraA, e1));
      await expect(foto(rutaFoto(a.empresaId, obraA, e2))).rejects.toThrow(RLS);
      await expect(foto(rutaFoto(b.empresaId, obraB, e1))).rejects.toThrow(RLS);
      await expect(foto(rutaFoto(a.empresaId, obraAOtroCliente, e1))).rejects.toThrow(RLS);
    });

    it('máximo 10 fotos vivas por entrada', async () => {
      const e = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
      await comoUsuario(db, a.adminId, async (tx) => {
        for (let i = 0; i < 10; i++) {
          await insertar(
            tx,
            'public.bitacora_foto',
            { id: randomUUID(), empresa_id: a.empresaId, entrada_id: e, path: rutaFoto(a.empresaId, obraA, e), orden: i },
            { returning: false },
          );
        }
      });
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.bitacora_foto',
            { id: randomUUID(), empresa_id: a.empresaId, entrada_id: e, path: rutaFoto(a.empresaId, obraA, e) },
            { returning: false },
          ),
        ),
      ).rejects.toThrow(/BITACORA_MAX_FOTOS/);
    });
  });

  // ── Cliente ───────────────────────────────────────────────────────────────

  describe('cliente del portal', () => {
    let publicada: string;
    let privada: string;
    let deOtraObra: string;
    let fotoPublicada: string;
    let fotoPrivada: string;
    let aclPublicada: string;
    let aclPrivada: string;

    beforeAll(async () => {
      await comoUsuario(db, a.adminId, async (tx) => {
        publicada = await crearEntrada(tx, a.empresaId, obraA, { visible_cliente: true });
        privada = await crearEntrada(tx, a.empresaId, obraA, { visible_cliente: false });
        deOtraObra = await crearEntrada(tx, a.empresaId, obraAOtroCliente, { visible_cliente: true });
        fotoPublicada = rutaFoto(a.empresaId, obraA, publicada);
        fotoPrivada = rutaFoto(a.empresaId, obraA, privada);
        for (const [entrada, path] of [
          [publicada, fotoPublicada],
          [privada, fotoPrivada],
        ]) {
          await tx.query(`insert into storage.objects (bucket_id, name) values ('bitacora', $1)`, [path]);
          await insertar(
            tx,
            'public.bitacora_foto',
            { id: randomUUID(), empresa_id: a.empresaId, entrada_id: entrada, path },
            { returning: false },
          );
        }
        aclPublicada = randomUUID();
        aclPrivada = randomUUID();
        await insertar(
          tx,
          'public.bitacora_aclaracion',
          { id: aclPublicada, empresa_id: a.empresaId, entrada_id: publicada, texto: 'Se corrige' },
          { returning: false },
        );
        await insertar(
          tx,
          'public.bitacora_aclaracion',
          { id: aclPrivada, empresa_id: a.empresaId, entrada_id: privada, texto: 'Interna' },
          { returning: false },
        );
      });
    });

    it('ve solo las entradas publicadas de SUS obras', async () => {
      const ve = await comoUsuario(db, clienteA.userId, (tx) =>
        idsVisibles(tx, 'public.bitacora_entrada', [publicada, privada, deOtraObra]),
      );
      expect(ve).toEqual([publicada]);
    });

    it('ve las aclaraciones y fotos de lo publicado, no de lo demás', async () => {
      const acl = await comoUsuario(db, clienteA.userId, (tx) =>
        idsVisibles(tx, 'public.bitacora_aclaracion', [aclPublicada, aclPrivada]),
      );
      expect(acl).toEqual([aclPublicada]);

      const fotos = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query<{ path: string }>('select path from public.bitacora_foto where entrada_id = any($1::uuid[])', [
          [publicada, privada],
        ]),
      );
      expect(fotos.rows.map((f) => f.path)).toEqual([fotoPublicada]);
    });

    it('en Storage abre solo el archivo de una foto publicada', async () => {
      const objetos = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query<{ name: string }>(
          `select name from storage.objects where bucket_id = 'bitacora' and name = any($1)`,
          [[fotoPublicada, fotoPrivada]],
        ),
      );
      expect(objetos.rows.map((o) => o.name)).toEqual([fotoPublicada]);
    });

    it('si se retira del portal, deja de verla (con todo y foto)', async () => {
      await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.bitacora_entrada set visible_cliente = false where id = $1`, [publicada]),
      );
      const ve = await comoUsuario(db, clienteA.userId, (tx) =>
        tx.query(`select name from storage.objects where bucket_id = 'bitacora' and name = $1`, [
          fotoPublicada,
        ]),
      );
      expect(ve.rows).toEqual([]);
      await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`update public.bitacora_entrada set visible_cliente = true where id = $1`, [publicada]),
      );
    });

    it('no escribe nada', async () => {
      await expect(
        comoUsuario(db, clienteA.userId, (tx) => crearEntrada(tx, a.empresaId, obraA)),
      ).rejects.toThrow(RLS);
    });
  });

  // ── Storage por carpeta ───────────────────────────────────────────────────

  describe('bucket bitacora', () => {
    const subir = (userId: string, path: string) =>
      comoUsuario(db, userId, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('bitacora', $1)`, [path]),
      );

    it('es privado y con límites de tamaño y tipo', async () => {
      const r = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'bitacora'`,
      );
      expect(r.rows[0].public).toBe(false);
      expect(Number(r.rows[0].file_size_limit)).toBe(10 * 1024 * 1024);
      expect(r.rows[0].allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    });

    it('sube en la carpeta de una entrada abierta de su empresa, y en ninguna otra', async () => {
      const e = await comoUsuario(db, supervisorA, (tx) => crearEntrada(tx, a.empresaId, obraA));
      await subir(supervisorA, rutaFoto(a.empresaId, obraA, e));
      // Carpeta de otra empresa.
      await expect(subir(supervisorA, rutaFoto(b.empresaId, obraA, e))).rejects.toThrow(RLS);
      // Entrada inventada.
      await expect(subir(supervisorA, rutaFoto(a.empresaId, obraA, randomUUID()))).rejects.toThrow(RLS);
      // Obra que no es la de la entrada.
      await expect(subir(supervisorA, rutaFoto(a.empresaId, obraAOtroCliente, e))).rejects.toThrow(RLS);
      // Contador y colaborador no suben.
      await expect(subir(contadorA, rutaFoto(a.empresaId, obraA, e))).rejects.toThrow(RLS);
      await expect(subir(colaboradorA, rutaFoto(a.empresaId, obraA, e))).rejects.toThrow(RLS);
      // La empresa B no sube a la carpeta de A.
      await expect(subir(b.adminId, rutaFoto(a.empresaId, obraA, e))).rejects.toThrow(RLS);
    });

    it('B no ve los archivos de A; el contador de A sí', async () => {
      const e = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
      const path = rutaFoto(a.empresaId, obraA, e);
      await subir(a.adminId, path);
      const cuenta = (userId: string) =>
        comoUsuario(db, userId, (tx) =>
          tx.query(`select 1 from storage.objects where bucket_id = 'bitacora' and name = $1`, [path]),
        ).then((r) => r.rows.length);
      expect(await cuenta(b.adminId)).toBe(0);
      expect(await cuenta(contadorA)).toBe(1);
      expect(await cuenta(colaboradorA)).toBe(0);
    });

    it('el archivo de una entrada cerrada no se borra ni se agrega', async () => {
      const e = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
      const path = rutaFoto(a.empresaId, obraA, e);
      await subir(a.adminId, path);
      await envejecer(db, e, 25);

      const borrado = await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`delete from storage.objects where bucket_id = 'bitacora' and name = $1`, [path]),
      );
      expect(borrado.affectedRows).toBe(0);
      await expect(subir(a.adminId, rutaFoto(a.empresaId, obraA, e))).rejects.toThrow(RLS);
    });

    it('mientras está abierta sí se puede quitar un archivo', async () => {
      const e = await comoUsuario(db, a.adminId, (tx) => crearEntrada(tx, a.empresaId, obraA));
      const path = rutaFoto(a.empresaId, obraA, e);
      await subir(a.adminId, path);
      const borrado = await comoUsuario(db, a.adminId, (tx) =>
        tx.query(`delete from storage.objects where bucket_id = 'bitacora' and name = $1`, [path]),
      );
      expect(borrado.affectedRows).toBe(1);
    });
  });

  // ── Programa de obra ──────────────────────────────────────────────────────

  describe('programa', () => {
    let partidaA: string;
    let partidaB: string;

    beforeAll(async () => {
      partidaA = randomUUID();
      partidaB = randomUUID();
      await insertar(db, 'public.obra_presupuesto', {
        id: partidaA,
        empresa_id: a.empresaId,
        obra_id: obraA,
        concepto: 'Cimentación',
      });
      await insertar(db, 'public.obra_presupuesto', {
        id: partidaB,
        empresa_id: b.empresaId,
        obra_id: obraB,
        concepto: 'Cimentación B',
      });
    });

    const partida = (extra: Record<string, unknown> = {}) => ({
      id: randomUUID(),
      empresa_id: a.empresaId,
      obra_id: obraA,
      concepto: 'Cimentación',
      fecha_inicio: Date.now(),
      fecha_fin: Date.now() + 7 * 24 * HORA,
      ...extra,
    });

    it('el supervisor programa una partida del presupuesto; contador lee; colaborador y cliente no', async () => {
      const fila = partida({ presupuesto_id: partidaA });
      await comoUsuario(db, supervisorA, (tx) =>
        insertar(tx, 'public.programa_partida', fila, { returning: false }),
      );
      const id = fila.id as string;
      for (const [quien, esperado] of [
        [contadorA, [id]],
        [a.adminId, [id]],
        [colaboradorA, []],
        [clienteA.userId, []],
        [b.adminId, []],
      ] as const) {
        expect(
          await comoUsuario(db, quien, (tx) => idsVisibles(tx, 'public.programa_partida', [id])),
        ).toEqual(esperado);
      }
      await expect(
        comoUsuario(db, contadorA, (tx) =>
          insertar(tx, 'public.programa_partida', partida(), { returning: false }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('no apunta a una partida del presupuesto de otra empresa ni a una obra ajena', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.programa_partida', partida({ presupuesto_id: partidaB }), {
            returning: false,
          }),
        ),
      ).rejects.toThrow(RLS);
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(tx, 'public.programa_partida', partida({ obra_id: obraB }), { returning: false }),
        ),
      ).rejects.toThrow(RLS);
    });

    it('no apunta a una partida de OTRA obra de la misma empresa', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.programa_partida',
            partida({ obra_id: obraAOtroCliente, presupuesto_id: partidaA }),
            { returning: false },
          ),
        ),
      ).rejects.toThrow(RLS);
    });

    it('la fecha de fin no puede ser antes del inicio', async () => {
      await expect(
        comoUsuario(db, a.adminId, (tx) =>
          insertar(
            tx,
            'public.programa_partida',
            partida({ fecha_inicio: Date.now(), fecha_fin: Date.now() - 24 * HORA }),
            { returning: false },
          ),
        ),
      ).rejects.toThrow(/programa_fechas_ok/);
    });

    it('se marca terminada y se borra (lógico)', async () => {
      const fila = partida();
      await comoUsuario(db, a.adminId, async (tx) => {
        await insertar(tx, 'public.programa_partida', fila, { returning: false });
        const t = await tx.query(`update public.programa_partida set terminada = true where id = $1`, [fila.id]);
        expect(t.affectedRows).toBe(1);
        const d = await tx.query(`update public.programa_partida set deleted_at = $2 where id = $1`, [
          fila.id,
          Date.now(),
        ]);
        expect(d.affectedRows).toBe(1);
      });
    });
  });
});
