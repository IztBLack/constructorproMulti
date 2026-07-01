import 'package:constructorpro/core/db/app_database.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Verifica el trigger de Fase 2 (v3): editar una fila la vuelve a marcar
/// `pending` para que el sync propague también las EDICIONES, sin re-marcar las
/// escrituras del propio sync (que cambian `sync_status`).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('editar una fila ya sincronizada la vuelve a marcar pending', () async {
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'A', fechaInicio: 0));

    // Simula que el sync ya la subió (cambia sync_status → el trigger NO debe
    // dispararse aquí, porque NEW.sync_status != OLD.sync_status).
    await db.customStatement("UPDATE obras SET sync_status = 'synced' WHERE id = 'o1'");
    var row = await (db.select(db.obras)..where((t) => t.id.equals('o1'))).getSingle();
    expect(row.syncStatus, 'synced');

    // Edición de datos de la app (no toca sync_status) → el trigger la remarca.
    await (db.update(db.obras)..where((t) => t.id.equals('o1')))
        .write(const ObrasCompanion(nombre: Value('B')));
    row = await (db.select(db.obras)..where((t) => t.id.equals('o1'))).getSingle();

    expect(row.nombre, 'B');
    expect(row.syncStatus, 'pending'); // el trigger lo remarcó
    expect(row.updatedAt, greaterThan(0)); // refrescó updated_at
  });
}
