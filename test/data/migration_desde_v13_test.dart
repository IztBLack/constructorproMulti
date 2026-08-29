import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v13.dart' as v13;

/// Prueba el paso v13 → v14: las PROYECCIONES GUARDADAS llegan al móvil
/// (`proyeccion_guardada`).
///
/// Es una tabla nueva, así que el riesgo no es perder datos sino tres cosas más
/// silenciosas:
///
///  1. Que la migración se lleve por delante algo de lo que ya había. Se
///     comprueba que la obra y el párrafo final que estrenó la v13 sobreviven.
///  2. Que la tabla nazca SIN el trigger `mark_pending`. `createTable` no lo
///     instala, y sin él renombrar una proyección no se marcaría `pending`: el
///     día que la tabla entre al sync (Supabase 0034), los cambios se quedarían
///     en ese teléfono para siempre.
///  3. Que los defaults no nazcan bien. `esquema` tiene que valer 1 y los dos
///     snapshots 0, porque la lista los pinta sin recalcular y un NULL ahí se
///     vería como una proyección de \$0.
///
/// El destino se lee de `db.schemaVersion`: ver `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  setUp(AppDatabase.columnasPorLlenar.clear);

  test('desde v13: nacen las proyecciones guardadas y quedan listas para '
      'sincronizar', () async {
    // 1. Base v13 con datos previos que no deben moverse.
    final schema = await verifier.schemaAt(13);
    final oldDb = v13.DatabaseAtV13(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO obras (id, nombre, cliente, ubicacion, fecha_inicio, activa, "
      "texto_final, sync_status) "
      "VALUES ('o1', 'Boticaria', 'Sr. Ramírez', 'Xalapa', 1786428000000, 1, "
      "'Gracias por su preferencia.', 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO colaboradores (id, nombre, puesto_id, tipo_pago, activo, sync_status) "
      "VALUES ('c1', 'Juan Pérez Loera', 'p1', 'DIA', 1, 'synced')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. Lo que ya existía sigue ahí, párrafo final incluido.
    final obra = await db
        .customSelect(
            "SELECT nombre, texto_final FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(obra.read<String>('nombre'), 'Boticaria');
    expect(obra.read<String>('texto_final'), 'Gracias por su preferencia.');
    final colab = await db
        .customSelect("SELECT nombre FROM colaboradores WHERE id = 'c1'")
        .getSingle();
    expect(colab.read<String>('nombre'), 'Juan Pérez Loera');

    // 4. La tabla nueva existe, acepta una proyección y sus defaults nacen bien.
    final ahora = DateTime.now().millisecondsSinceEpoch;
    await db.customStatement(
      "INSERT INTO proyeccion_guardada "
      "(id, nombre, lunes_millis, escenario, created_at, updated_at, sync_status) "
      "VALUES ('pr1', 'Simulación 20 de mayo', 1786428000000, "
      "'{\"v\":1,\"lunes\":1786428000000,\"participantes\":[\"c1\"]}', "
      "$ahora, $ahora, 'synced')",
    );

    final guardada = await db
        .customSelect("SELECT * FROM proyeccion_guardada WHERE id = 'pr1'")
        .getSingle();
    expect(guardada.read<String>('nombre'), 'Simulación 20 de mayo');
    expect(guardada.read<int>('lunes_millis'), 1786428000000);
    expect(guardada.read<int>('esquema'), 1,
        reason: 'el default del formato del JSON es la versión 1');
    expect(guardada.read<double>('total_snapshot'), 0);
    expect(guardada.read<int>('personas_snapshot'), 0);
    expect(guardada.read<String>('obra_filtro'), '');
    expect(guardada.read<String>('notas'), '');
    expect(guardada.read<int?>('deleted_at'), isNull);

    // 5. El trigger quedó instalado: renombrar la marca `pending`. Sin esto, la
    //    proyección nunca subiría cuando la tabla entre al sync.
    await db.customStatement(
      "UPDATE proyeccion_guardada SET nombre = 'Simulación con 4 maestros' "
      "WHERE id = 'pr1'",
    );
    final tras = await db
        .customSelect(
            "SELECT sync_status, updated_at FROM proyeccion_guardada WHERE id = 'pr1'")
        .getSingle();
    expect(tras.read<String>('sync_status'), 'pending',
        reason: 'sin el trigger, la proyección no subiría nunca');
    expect(tras.read<int>('updated_at'), greaterThanOrEqualTo(ahora));

    // 6. Una tabla nueva no lleva columnas que el servidor ya tenga llenas, así
    //    que este paso NO debe apuntar nada en la cola de relleno.
    expect(AppDatabase.columnasPorLlenar, isEmpty);

    await db.close();
  });
}
