import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v13.dart' as v13;

/// Prueba el paso v13 → v14: las dos opciones de impresión de la nota de obra
/// (`nota_obra.mostrar_para` y `nota_obra_renglon.mostrar_porcentaje`, paridad
/// con `supabase/migrations/0034`).
///
/// Lo que de verdad se vigila aquí NO es que las columnas existan —de eso ya se
/// encarga `migrateAndValidate`— sino los DEFAULTS, que es donde una migración
/// cambia documentos que ya se entregaron:
///
///  1. `mostrar_para` nace en TRUE: la nota que ya tenía nombre sigue
///     imprimiendo su apartado «Para» exactamente igual que ayer.
///  2. `mostrar_porcentaje` nace en FALSE, y eso SÍ cambia lo impreso a
///     propósito: las deducciones viejas dejan de enseñar el «− 4%». Es el
///     encargo del dueño, no un descuido, así que si alguien "arregla" el
///     default a true esta prueba tiene que caer.
///
/// A diferencia de la v12 → v13, aquí no hay nada que anotar en
/// `AppDatabase.columnasPorLlenar`: las dos columnas son NOT NULL con default,
/// así que `addColumn` no deja ni una fila en NULL y el relleno desde el
/// servidor —que filtra por `IS NULL`— no tendría a quién tocar.
///
/// El destino se lee de `db.schemaVersion`: ver `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  setUp(AppDatabase.columnasPorLlenar.clear);

  test('desde v13: la nota gana sus dos opciones de impresión sin perder nada',
      () async {
    // 1. Base v13 con una nota y sus dos renglones, tal como estaban.
    final schema = await verifier.schemaAt(13);
    final oldDb = v13.DatabaseAtV13(schema.newConnection());
    final antes = DateTime.now().millisecondsSinceEpoch;
    await oldDb.customStatement(
      "INSERT INTO obras (id, nombre, cliente, ubicacion, fecha_inicio, activa, "
      " created_at, updated_at, sync_status) "
      "VALUES ('o1', 'Alfaro', 'Sr. Ramírez', 'Xalapa', $antes, 1, "
      "$antes, $antes, 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO nota_obra "
      "(id, obra_id, destinatario, titulo, fecha, estado, notas, orden, "
      " created_at, updated_at, sync_status) "
      "VALUES ('n1', 'o1', 'ORLANDO RAMOZ', 'MZ 2 LT 1', $antes, 'ABIERTA', "
      "'', 100, $antes, $antes, 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO nota_obra_renglon "
      "(id, nota_id, tipo, etiqueta, monto_base, porcentaje, texto, orden, "
      " created_at, updated_at, sync_status) "
      "VALUES ('r1', 'n1', 'CONCEPTO', 'BASE DE TINACOS', 62000, 4, '', 100, "
      "$antes, $antes, 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO nota_obra_renglon "
      "(id, nota_id, tipo, etiqueta, monto_base, porcentaje, texto, orden, "
      " created_at, updated_at, sync_status) "
      "VALUES ('r2', 'n1', 'DEDUCCION', 'RETENCIÓN', 62000, 4, '', 200, "
      "$antes, $antes, 'synced')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. La nota conserva lo suyo y su apartado «Para» sigue encendido.
    final nota = await db
        .customSelect(
            "SELECT destinatario, titulo, mostrar_para FROM nota_obra "
            "WHERE id = 'n1'")
        .getSingle();
    expect(nota.read<String>('destinatario'), 'ORLANDO RAMOZ');
    expect(nota.read<String>('titulo'), 'MZ 2 LT 1');
    expect(
      nota.read<bool>('mostrar_para'),
      isTrue,
      reason: 'migrar no debe quitarle el encabezado a una nota que ya existía',
    );

    // 4. Los renglones conservan su cuenta y NINGUNO enseña ya el porcentaje:
    //    es el cambio que se pidió, y solo afecta a las DEDUCCION porque el
    //    resto de los tipos ignora la columna.
    final renglones = await db
        .customSelect(
            "SELECT id, monto_base, porcentaje, mostrar_porcentaje "
            "FROM nota_obra_renglon ORDER BY orden")
        .get();
    expect(renglones.map((r) => r.read<String>('id')), ['r1', 'r2']);
    for (final r in renglones) {
      expect(r.read<double>('monto_base'), 62000);
      expect(r.read<double>('porcentaje'), 4);
      expect(
        r.read<bool>('mostrar_porcentaje'),
        isFalse,
        reason: 'el default false ES el encargo: la deducción solo enseña el valor',
      );
    }

    // 5. Las columnas guardan y leen lo que se les pone, y una nota no se lleva
    //    por delante a la vecina.
    //
    //    NO se comprueban aquí los triggers de sync, por lo mismo que explica
    //    `migration_desde_v10_test`: un `ALTER TABLE ADD COLUMN` no los toca, y
    //    la base de este arnés nace sin ellos.
    await db.customStatement(
      "UPDATE nota_obra SET destinatario = '', mostrar_para = 0 WHERE id = 'n1'",
    );
    await db.customStatement(
      "UPDATE nota_obra_renglon SET mostrar_porcentaje = 1 WHERE id = 'r2'",
    );
    final n1 = await db
        .customSelect("SELECT mostrar_para FROM nota_obra WHERE id = 'n1'")
        .getSingle();
    expect(n1.read<bool>('mostrar_para'), isFalse);
    final r1 = await db
        .customSelect(
            "SELECT mostrar_porcentaje FROM nota_obra_renglon WHERE id = 'r1'")
        .getSingle();
    expect(r1.read<bool>('mostrar_porcentaje'), isFalse);
    final r2 = await db
        .customSelect(
            "SELECT mostrar_porcentaje FROM nota_obra_renglon WHERE id = 'r2'")
        .getSingle();
    expect(r2.read<bool>('mostrar_porcentaje'), isTrue);

    await db.close();
  });

  test('desde v13: no hay columnas que rellenar desde el servidor', () async {
    final schema = await verifier.schemaAt(13);
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // Ninguna de las dos columnas nace en NULL, así que anotarlas aquí sería
    // trabajo muerto: `_llenarColumnaNueva` filtra por `IS NULL` y no
    // encontraría ni una fila.
    expect(AppDatabase.columnasPorLlenar, isEmpty);

    await db.close();
  });
}
