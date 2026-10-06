import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v14.dart' as v14;

/// Prueba el paso v14 → v15: la BITÁCORA DE OBRA llega al móvil
/// (`bitacora_entrada`, `bitacora_foto`, `bitacora_aclaracion`, paridad con
/// `supabase/migrations/0041` y `0042`).
///
/// Como en la v11 → v12 (las notas), son tablas nuevas: el riesgo no es perder
/// datos sino que (1) la migración toque lo que ya había y (2) las tablas nazcan
/// sin el trigger `mark_pending`, con lo que una entrada escrita en la obra
/// nunca subiría — justo la evidencia que la bitácora existe para guardar.
///
/// El destino se lee de `db.schemaVersion`: ver `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('desde v14: nace la bitácora y queda lista para sincronizar', () async {
    // 1. Base v14 con datos previos que no deben moverse.
    final schema = await verifier.schemaAt(14);
    final oldDb = v14.DatabaseAtV14(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO obras (id, nombre, cliente, ubicacion, fecha_inicio, activa, sync_status) "
      "VALUES ('o1', 'Alfaro', 'Sr. Ramírez', 'Xalapa', 1786428000000, 1, 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO nota_obra "
      "(id, obra_id, destinatario, titulo, fecha, estado, notas, orden, "
      " mostrar_para, created_at, updated_at, sync_status) "
      "VALUES ('n1', 'o1', 'ORLANDO', 'MZ 2', 1786428000000, 'ABIERTA', '', 100, "
      " 0, 1, 1, 'synced')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. Lo que ya existía sigue ahí, sin marcarse para subir.
    final nota = await db
        .customSelect(
            "SELECT titulo, mostrar_para, sync_status FROM nota_obra WHERE id = 'n1'")
        .getSingle();
    expect(nota.read<String>('titulo'), 'MZ 2');
    expect(nota.read<bool>('mostrar_para'), isFalse);
    expect(nota.read<String>('sync_status'), 'synced');

    // 4. Las tablas nuevas aceptan una entrada con su foto y su aclaración, con
    //    los defaults del servidor: sin publicar, sin sellos, nombres en '[]'.
    const ahora = 1791000000000;
    await db.customStatement(
      "INSERT INTO bitacora_entrada (id, obra_id, fecha, texto, created_at, "
      " updated_at, sync_status) "
      "VALUES ('e1', 'o1', 1790985600000, 'Colado de losa', $ahora, $ahora, "
      " 'synced')",
    );
    await db.customStatement(
      "INSERT INTO bitacora_foto (id, entrada_id, path, created_at, updated_at, "
      " sync_status) "
      "VALUES ('f1', 'e1', 'emp/o1/e1/f1.jpg', $ahora, $ahora, 'synced')",
    );
    await db.customStatement(
      "INSERT INTO bitacora_aclaracion (id, entrada_id, texto, created_at, "
      " updated_at, sync_status) "
      "VALUES ('a1', 'e1', 'Fue en la losa del 2o nivel', $ahora, $ahora, "
      " 'synced')",
    );

    final e = await db
        .customSelect(
            "SELECT tipo, clima, personal_nombres, visible_cliente, autor_nombre, "
            "registrada_en FROM bitacora_entrada WHERE id = 'e1'")
        .getSingle();
    expect(e.read<String>('tipo'), 'AVANCE');
    expect(e.read<String>('clima'), '');
    expect(e.read<String>('personal_nombres'), '[]');
    expect(e.read<bool>('visible_cliente'), isFalse,
        reason: 'nace sin publicar al cliente, como en la web');
    expect(e.read<String>('autor_nombre'), '');
    expect(e.read<int>('registrada_en'), 0,
        reason: '0 = todavía no llega al servidor (cuenta como abierta)');

    final f = await db
        .customSelect("SELECT mime, orden FROM bitacora_foto WHERE id = 'f1'")
        .getSingle();
    expect(f.read<String>('mime'), 'image/jpeg');
    expect(f.read<int>('orden'), 0);

    // 5. Y las tres tienen el trigger de sync: sin él, nada subiría.
    for (final (tabla, set, id) in [
      ('bitacora_entrada', "texto = 'Colado de losa N2'", 'e1'),
      ('bitacora_foto', 'orden = 1', 'f1'),
      ('bitacora_aclaracion', "texto = 'x'", 'a1'),
    ]) {
      await db.customStatement("UPDATE $tabla SET $set WHERE id = '$id'");
      final tras = await db
          .customSelect("SELECT sync_status FROM $tabla WHERE id = '$id'")
          .getSingle();
      expect(tras.read<String>('sync_status'), 'pending',
          reason: 'sin el trigger, $tabla no subiría nunca');
    }

    await db.close();
  });
}
