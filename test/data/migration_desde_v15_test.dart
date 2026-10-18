import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v15.dart' as v15;

/// Prueba el paso v15 → v16: las LISTAS DE MATERIAL llegan al móvil
/// (`lista_material`, `lista_material_renglon`, paridad con
/// `supabase/migrations/0050`).
///
/// Como en la v14 → v15 (la bitácora), son tablas nuevas: el riesgo es que la
/// migración toque lo que ya había o que las tablas nazcan sin el trigger
/// `mark_pending`, con lo que palomear un renglón en la obra nunca subiría.
///
/// El destino se lee de `db.schemaVersion`: ver `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('desde v15: nacen las listas de material, listas para sincronizar',
      () async {
    // 1. Base v15 con una obra que no debe moverse.
    final schema = await verifier.schemaAt(15);
    final oldDb = v15.DatabaseAtV15(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO obras (id, nombre, cliente, ubicacion, fecha_inicio, activa, sync_status) "
      "VALUES ('o1', 'Alfaro', 'Sr. Ramírez', 'Xalapa', 1786428000000, 1, 'synced')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. Lo que ya existía sigue ahí, sin marcarse para subir.
    final obra = await db
        .customSelect("SELECT nombre, sync_status FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(obra.read<String>('nombre'), 'Alfaro');
    expect(obra.read<String>('sync_status'), 'synced');

    // 4. Las tablas nuevas aceptan una lista con un renglón, con los defaults
    //    del servidor: abierta, PIEZA, sin palomear, sin medidas supuestas.
    const ahora = 1791000000000;
    await db.customStatement(
      "INSERT INTO lista_material (id, obra_id, titulo, fecha, created_at, "
      " updated_at, sync_status) "
      "VALUES ('l1', 'o1', 'Trabes', $ahora, $ahora, $ahora, 'synced')",
    );
    await db.customStatement(
      "INSERT INTO lista_material_renglon (id, lista_id, cantidad, created_at, "
      " updated_at, sync_status) "
      "VALUES ('r1', 'l1', 4, $ahora, $ahora, 'synced')",
    );

    final l = await db
        .customSelect("SELECT estado, plano FROM lista_material WHERE id = 'l1'")
        .getSingle();
    expect(l.read<String>('estado'), 'ABIERTA');
    expect(l.read<String>('plano'), '');

    final r = await db
        .customSelect(
            "SELECT tipo, largo, separacion_cm, marcado, marcado_por "
            "FROM lista_material_renglon WHERE id = 'r1'")
        .getSingle();
    expect(r.read<String>('tipo'), 'PIEZA');
    expect(r.read<double?>('largo'), isNull,
        reason: 'lo que el plano no da no se supone');
    expect(r.read<double?>('separacion_cm'), isNull);
    expect(r.read<bool>('marcado'), isFalse);
    expect(r.read<String?>('marcado_por'), isNull,
        reason: 'un uuid vacío lo rechazaría el servidor');

    // 5. Y las dos tienen el trigger de sync: sin él, nada subiría.
    for (final (tabla, set, id) in [
      ('lista_material', "titulo = 'Trabes N2'", 'l1'),
      ('lista_material_renglon', 'marcado = 1', 'r1'),
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
