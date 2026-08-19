import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';

import '../generated_migrations/schema.dart';
import '../generated_migrations/schema_v7.dart' as v7;

/// Prueba la migración desde v7 hasta la versión ACTUAL de la app contra los
/// snapshots de esquema. Garantiza que actualizar la app NO rompe a usuarios en
/// producción:
/// 1. El esquema resultante coincide EXACTAMENTE con el snapshot de esa versión.
/// 2. Los datos previos (obras, cotizaciones, movimientos) sobreviven.
/// 3. `cotizaciones.iva_porcentaje` queda en 16 en las filas viejas —la tasa que
///    ya tenían quemada en el código—, así ningún total cambia al migrar.
/// 4. `movimientos.comprobante_uri` queda NULL en las filas viejas.
/// 5. La tabla nueva `obra_caja_nota` queda operativa.
///
/// El destino es `db.schemaVersion`, NO un número escrito a mano. Los bloques de
/// `onUpgrade` se condicionan solo por `from`, así que al subir la versión los
/// pasos nuevos corren de todos modos y validar contra una versión intermedia
/// falla siempre. Leerlo del propio esquema hace que subir `schemaVersion` solo
/// pida regenerar snapshots, no editar este archivo — que es exactamente lo que
/// se olvidó al pasar a v9.
void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('desde v7: migra esquema y preserva datos existentes', () async {
    // 1. Base en el esquema v7 con datos previos (sin las columnas nuevas).
    final schema = await verifier.schemaAt(7);
    final oldDb = v7.DatabaseAtV7(schema.newConnection());
    await oldDb.customStatement(
      "INSERT INTO obras (id, nombre, fecha_inicio) VALUES ('o1', 'Obra 1', 0)",
    );
    await oldDb.customStatement(
      "INSERT INTO cotizaciones (id, cliente, nombre_proyecto, fecha) "
      "VALUES ('c1', 'Cliente', 'Proyecto', 0)",
    );
    await oldDb.customStatement(
      "INSERT INTO movimientos "
      "(id, obra_id, fecha, tipo, categoria, concepto, monto, metodo_pago) "
      "VALUES ('m1', 'o1', 0, 'SALIDA', 'MATERIAL', 'Cemento', 100.0, 'EFECTIVO')",
    );
    await oldDb.close();

    // 2. Migra con la migración real de la app y valida el esquema resultante
    //    contra el snapshot de la versión actual (addColumn + createTable
    //    correctos).
    final db = AppDatabase.forTesting(schema.newConnection());
    await verifier.migrateAndValidate(db, db.schemaVersion);

    // 3. IVA congelado: la cotización vieja queda con la tasa por defecto 16, que
    //    es exactamente la que estaba quemada en el código antes de esta versión.
    //    Es la garantía de que NINGÚN total pasado se altera con la migración.
    final cot = await db
        .customSelect("SELECT iva_porcentaje FROM cotizaciones WHERE id = 'c1'")
        .getSingle();
    expect(cot.read<double>('iva_porcentaje'), 16.0);

    // 4. Comprobante: la columna nueva queda NULL en el movimiento viejo.
    final mov = await db
        .customSelect("SELECT comprobante_uri FROM movimientos WHERE id = 'm1'")
        .getSingle();
    expect(mov.data['comprobante_uri'], isNull);

    // Los datos de negocio sobreviven intactos.
    final obra = await db
        .customSelect("SELECT nombre FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(obra.read<String>('nombre'), 'Obra 1');

    // 5. La tabla nueva queda operativa (PK = obra_id, 1-a-1 con la obra).
    await db.customStatement(
      "INSERT INTO obra_caja_nota (obra_id, nota) VALUES ('o1', 'A favor 20957')",
    );
    final nota = await db
        .customSelect("SELECT nota FROM obra_caja_nota WHERE obra_id = 'o1'")
        .getSingle();
    expect(nota.read<String>('nota'), 'A favor 20957');

    await db.close();
  });
}
