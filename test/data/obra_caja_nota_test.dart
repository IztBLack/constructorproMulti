import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories_obra.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// La nota de conciliación es UNA fila por obra (PK = obraId), así que el
/// contrato del repo es: `upsert` crea la primera vez y REEMPLAZA después sin
/// duplicar, y el trigger `mark_pending` del esquema deja la fila lista para
/// subir. Se ejercen contra una BD real en memoria para que un cambio de
/// esquema o del trigger rompa aquí y no en el teléfono.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late ObraCajaNotaRepository repo;
  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = ObraCajaNotaRepository(db);
  });
  tearDown(() => db.close());

  Future<int> conteo(String obraId) async {
    final row = await db
        .customSelect("SELECT COUNT(*) AS n FROM obra_caja_nota "
            "WHERE obra_id = '$obraId'")
        .getSingle();
    return row.read<int>('n');
  }

  test('upsert crea la fila y watch emite su valor', () async {
    await repo.upsert('o1', 'texto');

    expect(await conteo('o1'), 1);
    final fila = await repo.watch('o1').first;
    expect(fila, isNotNull);
    expect(fila!.nota, 'texto');
  });

  test('un segundo upsert de la misma obra actualiza, no duplica', () async {
    await repo.upsert('o1', 'texto');
    await repo.upsert('o1', 'otro');

    expect(await conteo('o1'), 1, reason: 'sigue habiendo UNA fila para o1');
    final fila = await repo.watch('o1').first;
    expect(fila!.nota, 'otro');
  });

  test('watch emite null cuando la obra no tiene nota', () async {
    expect(await repo.watch('sin_nota').first, isNull);
  });

  test('tras upsert la fila queda pending (trigger mark_pending)', () async {
    await repo.upsert('o1', 'texto');
    final fila = await repo.watch('o1').first;
    expect(fila!.syncStatus, 'pending');
  });
}
