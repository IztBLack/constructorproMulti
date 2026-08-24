import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v11.dart' as v11;

/// Prueba el paso v11 → v12: las NOTAS DE OBRA llegan al móvil
/// (`nota_obra` y `nota_obra_renglon`, paridad con `supabase/migrations/0031`).
///
/// Son dos tablas nuevas, así que el riesgo no es perder datos sino dos cosas
/// más silenciosas:
///
///  1. Que la migración se lleve por delante algo de lo que ya había. Se
///     comprueba que la obra y su cotización sobreviven intactas.
///  2. Que las tablas nazcan SIN el trigger `mark_pending`. `createTable` no lo
///     instala, y sin él una nota escrita en el celular nunca se marcaría
///     `pending` y no subiría jamás al servidor — el trato quedaría solo en ese
///     teléfono, que es justo lo contrario de para lo que existe la nota.
///
/// El destino se lee de `db.schemaVersion`: ver `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('desde v11: nacen las notas y quedan listas para sincronizar', () async {
    // 1. Base v11 con datos previos que no deben moverse.
    final schema = await verifier.schemaAt(11);
    final oldDb = v11.DatabaseAtV11(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO obras (id, nombre, cliente, ubicacion, fecha_inicio, activa, sync_status) "
      "VALUES ('o1', 'Alfaro', 'Sr. Ramírez', 'Xalapa', 1786428000000, 1, 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO cotizaciones "
      "(id, cliente, nombre_proyecto, fecha, iva_enabled, iva_porcentaje, sync_status) "
      "VALUES ('q1', 'Sr. Ramírez', 'Casa Ramírez', 1786428000000, 1, 16.0, 'synced')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. Lo que ya existía sigue ahí.
    final obra = await db
        .customSelect("SELECT nombre, cliente FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(obra.read<String>('nombre'), 'Alfaro');
    final cot = await db
        .customSelect("SELECT nombre_proyecto FROM cotizaciones WHERE id = 'q1'")
        .getSingle();
    expect(cot.read<String>('nombre_proyecto'), 'Casa Ramírez');

    // 4. Las tablas nuevas existen y aceptan una nota con sus renglones.
    final ahora = DateTime.now().millisecondsSinceEpoch;
    await db.customStatement(
      "INSERT INTO nota_obra "
      "(id, obra_id, destinatario, titulo, fecha, estado, notas, orden, "
      " created_at, updated_at, sync_status) "
      "VALUES ('n1', 'o1', 'ORLANDO RAMOZ', 'MZ 2 LT 1', $ahora, 'ABIERTA', "
      "'', 100, $ahora, $ahora, 'synced')",
    );
    await db.customStatement(
      "INSERT INTO nota_obra_renglon "
      "(id, nota_id, tipo, etiqueta, monto, texto, orden, created_at, "
      " updated_at, sync_status) "
      "VALUES ('r1', 'n1', 'CONCEPTO', 'BASE DE TINACOS', 123000, '', 100, "
      "$ahora, $ahora, 'synced')",
    );

    final nota = await db
        .customSelect(
            "SELECT destinatario, estado, total_override FROM nota_obra WHERE id = 'n1'")
        .getSingle();
    expect(nota.read<String>('destinatario'), 'ORLANDO RAMOZ');
    expect(nota.read<String>('estado'), 'ABIERTA');
    // Los totales nacen sin fijar: NULL = "usa el calculado".
    expect(nota.read<double?>('total_override'), isNull);

    final renglon = await db
        .customSelect("SELECT monto, tipo FROM nota_obra_renglon WHERE id = 'r1'")
        .getSingle();
    expect(renglon.read<double>('monto'), 123000);
    expect(renglon.read<String>('tipo'), 'CONCEPTO');

    // 5. Y los triggers de sync quedaron instalados en las dos: sin esto, el
    //    trato se quedaría guardado solo en este teléfono.
    await db.customStatement(
      "UPDATE nota_obra SET titulo = 'MZ 2 LT 3' WHERE id = 'n1'",
    );
    final trasNota = await db
        .customSelect("SELECT sync_status FROM nota_obra WHERE id = 'n1'")
        .getSingle();
    expect(
      trasNota.read<String>('sync_status'),
      'pending',
      reason: 'sin el trigger, la nota no subiría nunca',
    );

    await db.customStatement(
      "UPDATE nota_obra_renglon SET monto = 125000 WHERE id = 'r1'",
    );
    final trasRenglon = await db
        .customSelect("SELECT sync_status FROM nota_obra_renglon WHERE id = 'r1'")
        .getSingle();
    expect(trasRenglon.read<String>('sync_status'), 'pending');

    await db.close();
  });
}
