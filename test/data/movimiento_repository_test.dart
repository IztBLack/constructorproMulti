import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories_obra.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// `deleteAllByObra` es la acción "Borrar todos los movimientos" de la caja de
/// una obra: un SOFT-delete masivo que debe (1) marcar SOLO los movimientos de
/// esa obra, dejándolos con `deletedAt` y `sync_status='pending'` para que el
/// push a la nube propague el borrado, y (2) no rozar los de otras obras. Se
/// ejerce contra una BD real en memoria para que un cambio de esquema rompa
/// aquí y no en el teléfono.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late MovimientoRepository repo;
  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = MovimientoRepository(db);
  });
  tearDown(() => db.close());

  Future<void> agregar(String obraId, double monto) => repo.add(
        obraId: obraId,
        fecha: DateTime.now().millisecondsSinceEpoch,
        tipo: 'SALIDA',
        categoria: 'MATERIAL',
        concepto: 'MATERIAL',
        monto: monto,
        metodoPago: 'Efectivo',
      );

  /// Todas las filas de la obra, INCLUIDAS las borradas suavemente (el API de
  /// negocio `watchByObra` las oculta, y aquí necesitamos inspeccionarlas).
  Future<List<Movimiento>> filasCrudas(String obraId) =>
      (db.select(db.movimientos)..where((t) => t.obraId.equals(obraId))).get();

  test('deleteAllByObra marca solo la obra objetivo y respeta las demás',
      () async {
    // 3 movimientos repartidos en 2 obras: 2 en o1, 1 en o2.
    await agregar('o1', 100);
    await agregar('o1', 200);
    await agregar('o2', 300);

    final afectadas = await repo.deleteAllByObra('o1');
    expect(afectadas, 2, reason: 'write() devuelve las filas marcadas de o1');

    final o1 = await filasCrudas('o1');
    expect(o1, hasLength(2));
    for (final m in o1) {
      expect(m.deletedAt, isNotNull, reason: 'o1 queda soft-deleted');
      expect(m.syncStatus, 'pending', reason: 'o1 queda pendiente de subir');
    }

    // La otra obra no se toca: su fila sigue viva.
    final o2 = await filasCrudas('o2');
    expect(o2, hasLength(1));
    expect(o2.single.deletedAt, isNull, reason: 'o2 no se borró');

    // Y el stream de negocio de o1 ya no emite nada (las oculta), o2 sí.
    expect(await repo.watchByObra('o1').first, isEmpty);
    expect(await repo.watchByObra('o2').first, hasLength(1));
  });

  test('deleteAllByObra no recuenta filas ya borradas', () async {
    await agregar('o1', 100);
    expect(await repo.deleteAllByObra('o1'), 1);
    // Segunda pasada: no quedan filas vivas que marcar.
    expect(await repo.deleteAllByObra('o1'), 0);
  });
}
