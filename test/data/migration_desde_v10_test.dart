import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v10.dart' as v10;

/// Prueba el paso v10 → v11: `cotizaciones.texto_final`, el párrafo final
/// editable del PDF (paridad con `supabase/migrations/0032`).
///
/// Es una migración chica —una columna nullable— pero se prueba igual, porque
/// lo que hay que garantizar no es que la columna aparezca, sino que **ninguna
/// cotización existente cambie**: NULL significa "usa el texto general", que es
/// exactamente lo que la app hacía antes de que esto existiera. Si la migración
/// pusiera un default, todas las cotizaciones viejas amanecerían con un texto
/// clavado que nadie escribió.
///
/// Cubre:
///  1. El esquema resultante coincide con el snapshot de la versión actual.
///  2. Las cotizaciones previas sobreviven íntegras y con `texto_final` NULL.
///  3. La columna acepta texto y escribir en una cotización no toca a las otras.
///
/// El destino se lee de `db.schemaVersion`: ver `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('desde v10: texto_final nace NULL y no toca las cotizaciones', () async {
    // 1. Base v10 con dos cotizaciones, una con IVA y otra sin él.
    final schema = await verifier.schemaAt(10);
    final oldDb = v10.DatabaseAtV10(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO cotizaciones "
      "(id, cliente, nombre_proyecto, ubicacion, fecha, estado, iva_enabled, "
      " iva_porcentaje, descuento, notas, sync_status) "
      "VALUES ('q1', 'Sr. Ramírez', 'Casa Ramírez', 'Xalapa', 1786428000000, "
      "'ACEPTADA', 1, 16.0, 0.0, 'Incluye material', 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO cotizaciones "
      "(id, cliente, nombre_proyecto, fecha, iva_enabled, iva_porcentaje, sync_status) "
      "VALUES ('q2', 'Obra Alfaro', 'Bardas', 1786428000000, 0, 8.0, 'synced')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. Las dos siguen ahí, con sus datos intactos.
    final filas = await db
        .customSelect(
          'SELECT id, cliente, nombre_proyecto, iva_enabled, iva_porcentaje, '
          'notas, texto_final FROM cotizaciones ORDER BY id',
        )
        .get();
    expect(filas.map((f) => f.read<String>('id')).toList(), ['q1', 'q2']);
    expect(filas.first.read<String>('cliente'), 'Sr. Ramírez');
    expect(filas.first.read<String>('notas'), 'Incluye material');
    expect(filas.last.read<double>('iva_porcentaje'), 8.0);

    // Y ninguna estrenó un párrafo que nadie escribió.
    for (final f in filas) {
      expect(
        f.read<String?>('texto_final'),
        isNull,
        reason: 'texto_final debe nacer NULL: NULL = usar el texto general',
      );
    }

    // 4. La columna guarda y lee texto sin perder nada por el camino.
    //
    //    NO se comprueban aquí los triggers de sync, a diferencia del test de
    //    v9→v10: aquella migración RECONSTRUÍA `colaboradores` (SQLite se lleva
    //    los triggers al recrear una tabla) y por eso los reinstalaba. Un
    //    `ALTER TABLE ADD COLUMN` no los toca, así que en un dispositivo real
    //    siguen intactos. La base de este arnés nace sin triggers —los instala
    //    `onCreate`, que aquí no corre—, de modo que afirmar algo sobre ellos
    //    mediría el arnés y no la app.
    await db.customStatement(
      "UPDATE cotizaciones SET texto_final = 'Precios firmes hasta el 30 de "
      "septiembre.' WHERE id = 'q1'",
    );
    final q1 = await db
        .customSelect("SELECT texto_final FROM cotizaciones WHERE id = 'q1'")
        .getSingle();
    expect(q1.read<String>('texto_final'), 'Precios firmes hasta el 30 de septiembre.');

    // Y la otra sigue sin texto propio: escribir en una no toca a la vecina.
    final q2 = await db
        .customSelect("SELECT texto_final FROM cotizaciones WHERE id = 'q2'")
        .getSingle();
    expect(q2.read<String?>('texto_final'), isNull);

    await db.close();
  });
}
