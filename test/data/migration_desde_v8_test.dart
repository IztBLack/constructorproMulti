import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v8.dart' as v8;

/// Prueba el paso v8 → v9 (orden personalizado, paridad con la web 0026), que es
/// EXACTAMENTE la migración que corre en el teléfono de cada usuario al instalar
/// la v1.0.7 encima de una versión anterior.
///
/// Esta prueba no existía cuando se subió `schemaVersion` a 9: se generó el
/// código pero no el snapshot, así que la migración llegó a producción sin una
/// sola verificación. Cubre las dos mitades del bloque `if (from < 9)`:
///
/// 1. La columna `orden` se agrega a las SIETE tablas reordenables y las filas
///    previas quedan en 0 (el default), no en NULL — de eso depende que la lista
///    no se desordene sola al actualizar.
/// 2. Los triggers de sync se REINSTALAN. Es la mitad fácil de olvidar: sin ella
///    mover una fila de lugar no marcaría `pending` y la posición nueva jamás
///    subiría a la nube.
///
/// El destino se lee de `db.schemaVersion` en vez de escribirlo a mano: ver la
/// explicación en `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  /// Las 7 tablas a las que `if (from < 9)` le agrega `orden`.
  const reordenables = [
    'cuadrillas',
    'cuadrilla_miembro',
    'colaboradores',
    'obras',
    'cotizaciones',
    'puestos',
    'catalogo_conceptos',
  ];

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('desde v8: agrega `orden` a las 7 tablas y preserva datos', () async {
    // 1. Base en el esquema v8 con datos previos (sin la columna `orden`).
    //    `sync_status = 'synced'` a propósito: es el estado de una fila que ya
    //    subió a la nube, y es el único punto de partida desde el que se puede
    //    observar que el trigger la vuelve a marcar `pending`.
    final schema = await verifier.schemaAt(8);
    final oldDb = v8.DatabaseAtV8(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO obras (id, nombre, fecha_inicio, sync_status) "
      "VALUES ('o1', 'Casas Bienestar', 0, 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO puestos (id, nombre) VALUES ('p1', 'Albañil')",
    );
    await oldDb.customStatement(
      "INSERT INTO colaboradores (id, nombre, puesto_id, tipo_pago) "
      "VALUES ('c1', 'Enrique', 'p1', 'DIA')",
    );
    await oldDb.customStatement(
      "INSERT INTO cuadrillas (id, nombre, especialidad) "
      "VALUES ('q1', 'Fierreros', 'ACERO')",
    );
    await oldDb.customStatement(
      "INSERT INTO cuadrilla_miembro (cuadrilla_id, colaborador_id, fecha_ingreso) "
      "VALUES ('q1', 'c1', 0)",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante
    //    contra el snapshot de la versión actual.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. `orden` existe en las 7 tablas, es INTEGER y su default es 0.
    for (final tabla in reordenables) {
      final col = await db
          .customSelect(
            "SELECT type, dflt_value FROM pragma_table_info('$tabla') "
            "WHERE name = 'orden'",
          )
          .getSingleOrNull();
      expect(col, isNotNull, reason: '$tabla se quedó sin la columna `orden`');
      expect(col!.read<String>('type').toUpperCase(), 'INTEGER');
      expect(
        int.parse(col.read<String>('dflt_value')),
        0,
        reason: '$tabla: el default de `orden` no es 0',
      );
    }

    // 4. Las filas que ya existían quedan en orden 0, no en NULL. Si quedaran en
    //    NULL, el `ORDER BY orden` de las listas las mandaría al azar al final.
    for (final (tabla, where) in const [
      ('obras', "id = 'o1'"),
      ('puestos', "id = 'p1'"),
      ('colaboradores', "id = 'c1'"),
      ('cuadrillas', "id = 'q1'"),
      ('cuadrilla_miembro', "cuadrilla_id = 'q1' AND colaborador_id = 'c1'"),
    ]) {
      final fila = await db
          .customSelect('SELECT orden FROM $tabla WHERE $where')
          .getSingle();
      expect(fila.read<int>('orden'), 0, reason: '$tabla no quedó en orden 0');
    }

    // 5. Los datos de negocio sobreviven intactos.
    final obra = await db
        .customSelect("SELECT nombre FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(obra.read<String>('nombre'), 'Casas Bienestar');
    final miembro = await db
        .customSelect(
          "SELECT colaborador_id FROM cuadrilla_miembro WHERE cuadrilla_id = 'q1'",
        )
        .getSingle();
    expect(miembro.read<String>('colaborador_id'), 'c1');

    // 6. Los triggers reinstalados marcan `pending` al reordenar. Esta es la
    //    razón por la que la migración vuelve a instalarlos: sin el trigger, la
    //    posición nueva se guardaría solo en el teléfono y nunca subiría.
    await db.customStatement("UPDATE obras SET orden = 3 WHERE id = 'o1'");
    final tras = await db
        .customSelect("SELECT orden, sync_status FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(tras.read<int>('orden'), 3);
    expect(
      tras.read<String>('sync_status'),
      'pending',
      reason: 'el trigger de sync no se reinstaló tras la migración',
    );

    await db.close();
  });
}
