import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v9.dart' as v9;

/// Prueba el paso v9 → v10: el SUELDO sale de `colaboradores` a su propia tabla
/// `colaborador_sueldo` (paridad con `supabase/migrations/0027`).
///
/// Es la migración más delicada que ha tenido la app: no agrega una columna,
/// **mueve datos de dinero y reconstruye una tabla con datos del usuario**. Si
/// la copia se pierde, la nómina de todo el mundo cae al salario del puesto sin
/// avisar — el tipo de error que solo se nota el sábado, al pagar.
///
/// Cubre:
///  1. El esquema resultante coincide con el snapshot de la versión actual.
///  2. El sueldo de cada quien llega íntegro a la tabla nueva (los cuatro
///     campos, no solo el diario).
///  3. Quien NO tenía sueldo capturado no genera fila. Sin fila = sin sueldo,
///     y crear filas vacías las subiría al servidor en el primer push.
///  4. El resto de `colaboradores` sobrevive la reconstrucción de la tabla.
///  5. Los triggers de sync siguen vivos DESPUÉS de reconstruirla — SQLite se
///     los lleva por delante al recrear la tabla, y sin ellos editar a alguien
///     dejaría de marcarlo `pending` y no volvería a subir nunca.
///
/// El destino se lee de `db.schemaVersion`: ver `migration_desde_v7_test.dart`.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('desde v9: el sueldo se muda a colaborador_sueldo sin perderse', () async {
    // 1. Base v9 con tres casos: sueldo completo, solo diario (fila anterior a
    //    la v4, que nunca capturó periodo) y sin sueldo ninguno.
    final schema = await verifier.schemaAt(9);
    final oldDb = v9.DatabaseAtV9(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO puestos (id, nombre, salario_dia_default) VALUES ('p1', 'Albañil', 550)",
    );
    await oldDb.customStatement(
      "INSERT INTO colaboradores "
      "(id, nombre, puesto_id, tipo_pago, salario_personalizado, periodo_pago, "
      " salario_periodo, dias_semana, telefono, sync_status) "
      "VALUES ('c1', 'Enrique', 'p1', 'DIA', 700.0, 'MENSUAL', 18200.0, 6, "
      "'55-1234', 'synced')",
    );
    await oldDb.customStatement(
      "INSERT INTO colaboradores "
      "(id, nombre, puesto_id, tipo_pago, salario_personalizado) "
      "VALUES ('c2', 'Martín', 'p1', 'DIA', 600.0)",
    );
    await oldDb.customStatement(
      "INSERT INTO colaboradores (id, nombre, puesto_id, tipo_pago) "
      "VALUES ('c3', 'Marcos', 'p1', 'DESTAJO')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante.
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. El sueldo completo llega entero.
    final c1 = await db
        .customSelect(
          'SELECT salario_personalizado, periodo_pago, salario_periodo, dias_semana '
          "FROM colaborador_sueldo WHERE colaborador_id = 'c1'",
        )
        .getSingle();
    expect(c1.read<double>('salario_personalizado'), 700.0);
    expect(c1.read<String>('periodo_pago'), 'MENSUAL');
    expect(c1.read<double>('salario_periodo'), 18200.0);
    expect(c1.read<int>('dias_semana'), 6);

    // La fila que solo tenía el diario también se muda, con los defaults.
    final c2 = await db
        .customSelect(
          'SELECT salario_personalizado, periodo_pago, dias_semana '
          "FROM colaborador_sueldo WHERE colaborador_id = 'c2'",
        )
        .getSingle();
    expect(c2.read<double>('salario_personalizado'), 600.0);
    expect(c2.read<String>('periodo_pago'), 'MENSUAL');
    expect(c2.read<int>('dias_semana'), 6);

    // 4. Quien no tenía sueldo NO genera fila.
    final c3 = await db
        .customSelect(
          "SELECT 1 FROM colaborador_sueldo WHERE colaborador_id = 'c3'",
        )
        .get();
    expect(c3, isEmpty, reason: 'no debe crear filas de sueldo vacías');

    // Y no se inventó ninguna de más.
    final total = await db
        .customSelect('SELECT COUNT(*) AS n FROM colaborador_sueldo')
        .getSingle();
    expect(total.read<int>('n'), 2);

    // 5. `colaboradores` se reconstruyó SIN las columnas de sueldo…
    final columnas = await db
        .customSelect("SELECT name FROM pragma_table_info('colaboradores')")
        .get()
        .then((filas) => filas.map((f) => f.read<String>('name')).toSet());
    expect(
      columnas.intersection({
        'salario_personalizado',
        'periodo_pago',
        'salario_periodo',
        'dias_semana',
      }),
      isEmpty,
      reason: 'el sueldo no debe seguir en colaboradores',
    );

    // …y sin perder el resto de los datos.
    final personas = await db
        .customSelect(
          'SELECT id, nombre, telefono, tipo_pago FROM colaboradores ORDER BY id',
        )
        .get();
    expect(personas.map((f) => f.read<String>('nombre')).toList(),
        ['Enrique', 'Martín', 'Marcos']);
    expect(personas.first.read<String>('telefono'), '55-1234');
    expect(personas.last.read<String>('tipo_pago'), 'DESTAJO');

    // 6. Los triggers sobreviven la reconstrucción de la tabla. Sin esto, editar
    //    a alguien no lo marcaría `pending` y sus cambios no subirían nunca.
    await db.customStatement(
      "UPDATE colaboradores SET nombre = 'Enrique R.' WHERE id = 'c1'",
    );
    final tras = await db
        .customSelect("SELECT sync_status FROM colaboradores WHERE id = 'c1'")
        .getSingle();
    expect(
      tras.read<String>('sync_status'),
      'pending',
      reason: 'el trigger de colaboradores no se reinstaló tras el alterTable',
    );

    // Y la tabla nueva también tiene el suyo.
    await db.customStatement(
      "UPDATE colaborador_sueldo SET sync_status = 'synced' WHERE colaborador_id = 'c1'",
    );
    await db.customStatement(
      "UPDATE colaborador_sueldo SET salario_periodo = 19000 WHERE colaborador_id = 'c1'",
    );
    final sueldoTras = await db
        .customSelect(
          "SELECT sync_status FROM colaborador_sueldo WHERE colaborador_id = 'c1'",
        )
        .getSingle();
    expect(sueldoTras.read<String>('sync_status'), 'pending');

    await db.close();
  });
}
