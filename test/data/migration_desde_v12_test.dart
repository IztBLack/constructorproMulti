import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v12.dart' as v12;

/// Prueba el paso v12 → v13: `obras.texto_final`, el párrafo final propio del
/// ESTADO DE CUENTA DEL CLIENTE (paridad con `supabase/migrations/0032`).
///
/// Es una columna nullable sin backfill, así que perder datos no es el riesgo.
/// Los dos que sí hay son más callados:
///
///  1. Que la obra que ya existía cambie de aspecto al actualizar. NULL tiene
///     que significar "usa el texto general", que es el comportamiento de
///     siempre: ninguna obra debería imprimir distinto por haber migrado.
///  2. Que la migración no avise de que esa columna nace en NULL **mientras el
///     servidor ya la tiene llena**. El sync empuja antes de traer, así que una
///     obra `pending` subiría ese NULL y borraría en Supabase el párrafo que
///     escribió la oficina desde la web. `AppDatabase.columnasPorLlenar` es lo
///     que lo evita, y si alguien la quita de la migración esta prueba cae.
///     Es la diferencia con la v10→v11: aquella columna también nacía en
///     Supabase, así que no había nada que rellenar.
///
/// El destino se lee de `db.schemaVersion`: ver `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  setUp(AppDatabase.columnasPorLlenar.clear);

  test('desde v12: la obra gana su párrafo final sin perder nada', () async {
    // 1. Base v12 con una obra y su nota, que no deben moverse.
    final schema = await verifier.schemaAt(12);
    final oldDb = v12.DatabaseAtV12(schema.newConnection());
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
      " texto_final, created_at, updated_at, sync_status) "
      "VALUES ('n1', 'o1', 'ORLANDO RAMOZ', 'MZ 2 LT 1', $antes, 'ABIERTA', "
      "'', 100, 'Lo acordado de palabra.', $antes, $antes, 'synced')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. Lo que ya existía sigue ahí, incluido el párrafo de la NOTA: la
    //    columna nueva es de `obras` y no debe rozar a las otras dos tablas que
    //    ya llevaban la suya.
    final obra = await db
        .customSelect("SELECT nombre, cliente, texto_final FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(obra.read<String>('nombre'), 'Alfaro');
    expect(obra.read<String>('cliente'), 'Sr. Ramírez');
    expect(
      obra.read<String?>('texto_final'),
      isNull,
      reason: 'NULL = "usa el texto general"; migrar no cambia ningún documento',
    );

    final nota = await db
        .customSelect("SELECT texto_final FROM nota_obra WHERE id = 'n1'")
        .getSingle();
    expect(nota.read<String?>('texto_final'), 'Lo acordado de palabra.');

    // 4. La columna guarda y lee texto sin perder nada por el camino, y
    //    escribir en una obra no toca a la vecina.
    //
    //    NO se comprueban aquí los triggers de sync, por lo mismo que explica
    //    `migration_desde_v10_test`: un `ALTER TABLE ADD COLUMN` no los toca, y
    //    la base de este arnés nace sin ellos —los instala `onCreate`, que aquí
    //    no corre—, así que afirmar algo mediría el arnés y no la app.
    await db.customStatement(
      "INSERT INTO obras (id, nombre, cliente, ubicacion, fecha_inicio, activa, "
      " created_at, updated_at, sync_status) "
      "VALUES ('o2', 'Casas Bienestar', '', 'Xalapa', $antes, 1, "
      "$antes, $antes, 'synced')",
    );
    await db.customStatement(
      "UPDATE obras SET texto_final = 'Le informamos su avance de pagos.' "
      "WHERE id = 'o1'",
    );
    final o1 = await db
        .customSelect("SELECT texto_final FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(o1.read<String>('texto_final'), 'Le informamos su avance de pagos.');
    final o2 = await db
        .customSelect("SELECT texto_final FROM obras WHERE id = 'o2'")
        .getSingle();
    expect(o2.read<String?>('texto_final'), isNull);

    await db.close();
  });

  test('desde v12: la migración avisa de que hay que rellenar la columna',
      () async {
    final schema = await verifier.schemaAt(12);
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // El aviso que SyncService atiende antes del primer push. Sin él, una obra
    // editada sin señal subiría su NULL encima del párrafo que la web ya tenía
    // escrito, y el cliente recibiría un estado de cuenta sin condiciones.
    expect(AppDatabase.columnasPorLlenar, contains('obras.texto_final'));

    await db.close();
  });
}
