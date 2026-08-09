import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/sync/sync_service.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Regresión del bug de sincronización: una fila que fallaba al subir quedaba en
/// `sync_status='error'` y NUNCA se reintentaba, porque el push seleccionaba
/// solo las 'pending'. El dato jamás llegaba al servidor y el indicador se
/// quedaba en rojo permanente, sin que "Sincronizar ahora" pudiera limpiarlo.
///
/// El contrato correcto —y lo que fija este test— es que los candidatos a subir
/// son 'pending' Y 'error' (reintento), pero NO 'synced' (ya está) ni 'skipped'
/// (terminal: id legacy no-UUID que nunca subirá). Se ejerce el MISMO SQL de
/// producción (`SyncService.sqlCandidatosPush`) contra una BD real en memoria,
/// para que un cambio en ese filtro rompa aquí y no en el teléfono.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('el push reintenta error y pending, pero no synced ni skipped', () async {
    // Una fila por cada estado posible (las altas nacen 'pending' por default).
    for (final id in const ['pend', 'err', 'syn', 'skp']) {
      await db.into(db.obras).insert(
          ObrasCompanion.insert(id: id, nombre: id, fechaInicio: 0));
    }

    // Fijar el estado de las otras tres. El UPDATE cambia sync_status, así que
    // el trigger `mark_pending` (WHEN NEW.sync_status = OLD.sync_status) NO se
    // dispara y el valor queda tal cual.
    await db.customStatement("UPDATE obras SET sync_status='error'   WHERE id='err'");
    await db.customStatement("UPDATE obras SET sync_status='synced'  WHERE id='syn'");
    await db.customStatement("UPDATE obras SET sync_status='skipped' WHERE id='skp'");

    final rows =
        await db.customSelect(SyncService.sqlCandidatosPush('obras')).get();
    final ids = rows.map((r) => r.data['id'] as String).toSet();

    expect(ids, containsAll(<String>{'pend', 'err'}),
        reason: 'pending y error deben reintentarse');
    expect(ids, isNot(contains('syn')),
        reason: 'synced ya está reconciliado con el servidor');
    expect(ids, isNot(contains('skp')),
        reason: 'skipped es terminal (no-UUID): reintentar es inútil');
  });
}
