import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v6.dart' as v6;

/// Prueba el salto DIRECTO v6 → v8 (varias versiones de una) contra los
/// snapshots de esquema. Cubre la ruta real de un usuario que no actualizó en
/// mucho tiempo: la app siempre migra hasta su `schemaVersion` actual, así que
/// abrir una base v6 corre en cadena los bloques v6→v7 y v7→v8.
///
/// Complementa a `migration_v8_test.dart` (que prueba el paso inmediato v7→v8 y
/// sus columnas nuevas). Aquí lo que importa es que un punto de partida LEJANO
/// llegue a v8 sin romper el esquema ni perder datos.
///
/// (Antes probaba v6→v7; se amplió a v8 al subir `schemaVersion`, porque
/// `migrateAndValidate` valida contra la versión actual de la app, no una
/// intermedia.)
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('v6 → v8: salto de varias versiones, esquema y datos intactos', () async {
    // 1. Base en el esquema v6 con datos previos (sin cuadrilla_id ni las
    //    columnas de tesorería de v8).
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

    // 2. Migra directo a v8 con la migración real de la app y valida el esquema
    //    resultante contra el snapshot v8 (corre v6→v7 y v7→v8 en cadena).
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, 8);

    // 3. Los datos viejos sobreviven los dos saltos.
    final asis = await db
        .customSelect("SELECT fraccion, cuadrilla_id FROM asistencias WHERE id = 'a1'")
        .getSingle();
    expect(asis.read<double>('fraccion'), 1.0);
    expect(asis.data['cuadrilla_id'], isNull); // columna de v7, NULL en filas viejas

    final obra = await db
        .customSelect("SELECT nombre FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(obra.read<String>('nombre'), 'Obra 1');

    // 4. Las tablas nuevas de AMBOS saltos quedan operativas: cuadrillas (v7) y
    //    obra_caja_nota (v8).
    await db.customStatement(
      "INSERT INTO cuadrillas (id, nombre, especialidad) VALUES ('q1', 'Fierreros', 'ACERO')",
    );
    await db.customStatement(
      "INSERT INTO obra_caja_nota (obra_id, nota) VALUES ('o1', 'conciliada')",
    );
    final nCuadrillas = await db
        .customSelect("SELECT COUNT(*) AS c FROM cuadrillas")
        .getSingle();
    expect(nCuadrillas.read<int>('c'), 1);
    final nota = await db
        .customSelect("SELECT nota FROM obra_caja_nota WHERE obra_id = 'o1'")
        .getSingle();
    expect(nota.read<String>('nota'), 'conciliada');

    await db.close();
  });
}
