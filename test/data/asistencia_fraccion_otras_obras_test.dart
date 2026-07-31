import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories_obra.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// `fraccionOtrasObras` espeja el trigger 0016 del servidor: suma las fracciones
/// que un colaborador ya tiene ese día en TODAS las obras MENOS la que se pasa,
/// para que el móvil pueda impedir que el total del día pase de 1 antes de
/// escribir (y no dejar la fila en `sync_status='error'`). Se ejerce contra una
/// BD real en memoria para que un cambio de esquema rompa aquí y no en el campo.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late AsistenciaRepository repo;
  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = AsistenciaRepository(db);
  });
  tearDown(() => db.close());

  const colab = 'c1';
  const fechaBase = 20260730;

  Future<void> insertAsistencia({
    required String id,
    required String obraId,
    String colaboradorId = colab,
    int fecha = fechaBase,
    required double fraccion,
    int? deletedAt,
  }) =>
      db.into(db.asistencias).insert(AsistenciasCompanion.insert(
            id: id,
            colaboradorId: colaboradorId,
            obraId: obraId,
            fecha: fecha,
            fraccion: fraccion,
            deletedAt: Value(deletedAt),
          ));

  test('suma la fracción de las OTRAS obras (excluye la obra dada)', () async {
    await insertAsistencia(id: 'a', obraId: 'A', fraccion: 0.5);
    await insertAsistencia(id: 'b', obraId: 'B', fraccion: 0.5);

    // Excluyendo A queda solo la de B, y viceversa.
    expect(await repo.fraccionOtrasObras(colab, fechaBase, 'A'), 0.5);
    expect(await repo.fraccionOtrasObras(colab, fechaBase, 'B'), 0.5);
  });

  test('con exceptObra inexistente cuenta TODAS las obras', () async {
    await insertAsistencia(id: 'a', obraId: 'A', fraccion: 0.5);
    await insertAsistencia(id: 'b', obraId: 'B', fraccion: 0.5);

    expect(await repo.fraccionOtrasObras(colab, fechaBase, 'NO_EXISTE'), 1.0);
  });

  test('ignora filas con baja lógica (deletedAt)', () async {
    await insertAsistencia(id: 'a', obraId: 'A', fraccion: 0.5);
    await insertAsistencia(id: 'b', obraId: 'B', fraccion: 0.5, deletedAt: 123);

    // La de B está borrada → no debe sumar.
    expect(await repo.fraccionOtrasObras(colab, fechaBase, 'A'), 0.0);
  });

  test('no cuenta a otros colaboradores ni otras fechas', () async {
    await insertAsistencia(id: 'a', obraId: 'A', fraccion: 0.5);
    await insertAsistencia(
        id: 'x', obraId: 'B', colaboradorId: 'otro', fraccion: 1.0);
    await insertAsistencia(
        id: 'y', obraId: 'B', fecha: fechaBase + 1, fraccion: 1.0);

    expect(await repo.fraccionOtrasObras(colab, fechaBase, 'A'), 0.0);
  });
}
