import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v6.dart' as v6;

/// Prueba la migración v6 → v7 (cuadrillas) contra los snapshots de esquema.
/// Garantiza que la actualización NO rompe a usuarios en producción:
/// 1. El esquema resultante coincide EXACTAMENTE con el snapshot v7.
/// 2. Los datos previos (obras, asistencias) sobreviven la migración.
/// 3. La columna nueva `cuadrilla_id` queda NULL en las filas viejas.
/// 4. Las tablas nuevas quedan operativas tras migrar.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('v6 → v7: migra esquema y preserva datos existentes', () async {
    // 1. Base en el esquema v6 con datos previos (sin cuadrilla_id).
    final schema = await verifier.schemaAt(6);
    final oldDb = v6.DatabaseAtV6(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO obras (id, nombre, fecha_inicio) VALUES ('o1', 'Obra 1', 0)",
    );
    await oldDb.customStatement(
      "INSERT INTO asistencias (id, colaborador_id, obra_id, fecha, fraccion) "
      "VALUES ('a1', 'c1', 'o1', 100, 1.0)",
    );
    await oldDb.close();

    // 2. Migra a v7 con la migración real de la app y valida el esquema
    //    resultante contra el snapshot v7 (createTable + addColumn correctos).
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, 7);

    // 3. Los datos viejos sobreviven; la columna nueva quedó NULL.
    final asis = await db
        .customSelect("SELECT fraccion, cuadrilla_id FROM asistencias WHERE id = 'a1'")
        .getSingle();
    expect(asis.read<double>('fraccion'), 1.0);
    expect(asis.data['cuadrilla_id'], isNull);

    final obra = await db
        .customSelect("SELECT nombre FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(obra.read<String>('nombre'), 'Obra 1');

    // 4. Las tablas nuevas quedan operativas.
    await db.customStatement(
      "INSERT INTO cuadrillas (id, nombre, especialidad) VALUES ('q1', 'Fierreros', 'ACERO')",
    );
    final n = await db
        .customSelect("SELECT COUNT(*) AS c FROM cuadrillas")
        .getSingle();
    expect(n.read<int>('c'), 1);

    await db.close();
  });
}
