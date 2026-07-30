import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Archivar/desarchivar es el "guardar" reversible de una obra: solo cambia la
/// bandera `activa` y deja la fila lista para subir (`sync_status='pending'`),
/// sin tocar el historial (eso es [ObraRepository.delete]). Se ejerce contra
/// una BD real en memoria para que un cambio de esquema o del trigger de sync
/// rompa aquí y no en el teléfono.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late ObraRepository repo;
  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = ObraRepository(db);
  });
  tearDown(() => db.close());

  Future<Obra> leer(String id) =>
      (db.select(db.obras)..where((t) => t.id.equals(id))).getSingle();

  test('setArchivada(true) archiva y setArchivada(false) reactiva, marcando '
      'pending', () async {
    // Se inserta ya como 'synced' a propósito: así comprobar que termina en
    // 'pending' demuestra que la acción ensucia la fila y no que venía sucia.
    await repo.upsert(ObrasCompanion.insert(
      id: 'o1',
      nombre: 'Casa Bienestar',
      fechaInicio: 0,
      activa: const Value(true),
      syncStatus: const Value('synced'),
    ));

    await repo.setArchivada('o1', true);
    var fila = await leer('o1');
    expect(fila.activa, isFalse, reason: 'archivada=true ⇒ activa=false');
    expect(fila.syncStatus, 'pending');

    await repo.setArchivada('o1', false);
    fila = await leer('o1');
    expect(fila.activa, isTrue, reason: 'archivada=false ⇒ activa=true');
    expect(fila.syncStatus, 'pending');
  });
}
