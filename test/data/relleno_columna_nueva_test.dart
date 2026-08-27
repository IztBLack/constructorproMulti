import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/sync/sync_service.dart';
import 'package:drift/drift.dart' show Value, Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// El relleno de una columna recién migrada, que es lo que impide que actualizar
/// la app BORRE en el servidor un dato que este teléfono nunca vio.
///
/// EL PROBLEMA. `addColumn` deja la columna nueva en NULL en todas las filas
/// locales. El sync empuja antes de traer, así que una obra `pending` —editada
/// en la obra, sin señal— subiría ese NULL y se llevaría por delante el párrafo
/// del estado de cuenta que la oficina escribió desde la web. Sin error, sin
/// aviso: el cliente recibe el documento sin sus condiciones.
///
/// POR QUÉ NO LO ARREGLA UN PULL. `_pullTabla` aplica LWW y SALTA las filas
/// `pending` con edición local más nueva, que son justo las que corren peligro.
/// Por eso el relleno va columna por columna en vez de fila entera.
///
/// Se ejerce `SyncService.sqlRellenoColumna` —la cadena de producción— contra
/// una base real, igual que `sync_push_retry_test` hace con el SQL del push. Lo
/// que no se cubre aquí es la bajada de Supabase, que necesitaría un cliente
/// falso; lo que se fija es la regla que decide quién gana.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  /// Aplica el relleno como lo haría `_llenarColumnaNueva` con esa respuesta
  /// del servidor.
  Future<int> rellenar(Map<String, String?> delServidor) async {
    var n = 0;
    for (final e in delServidor.entries) {
      if (e.value == null) continue;
      n += await db.customUpdate(
        SyncService.sqlRellenoColumna('obras', 'texto_final', 'id'),
        variables: [Variable(e.value), Variable(e.key)],
      );
    }
    return n;
  }

  Future<String?> textoDe(String id) async {
    final f = await db
        .customSelect("SELECT texto_final FROM obras WHERE id = '$id'")
        .getSingle();
    return f.read<String?>('texto_final');
  }

  Future<void> altaObra(String id, {String? textoFinal}) =>
      db.into(db.obras).insert(ObrasCompanion.insert(
            id: id,
            nombre: id,
            fechaInicio: 0,
            textoFinal: Value.absentIfNull(textoFinal),
          ));

  test('rellena la obra pending: el párrafo de la web sobrevive', () async {
    // La obra recién migrada: editada sin señal (pending) y con la columna
    // nueva en NULL. Es el caso que rompía.
    await altaObra('o1');
    expect(await textoDe('o1'), isNull);

    await rellenar({'o1': 'Le informamos su avance de pagos.'});

    expect(
      await textoDe('o1'),
      'Le informamos su avance de pagos.',
      reason: 'sin esto, el push subiría NULL y borraría el texto de la web',
    );
    // Y sigue pendiente de subir: el relleno no le quita la cola a la edición
    // local que el usuario hizo sin señal.
    final f = await db
        .customSelect("SELECT sync_status FROM obras WHERE id = 'o1'")
        .getSingle();
    expect(f.read<String>('sync_status'), 'pending');
  });

  test('no pisa el texto que el usuario ya escribió en el teléfono', () async {
    await altaObra('o1', textoFinal: 'El mío, escrito aquí.');

    await rellenar({'o1': 'El del servidor.'});

    expect(
      await textoDe('o1'),
      'El mío, escrito aquí.',
      reason: 'el `AND texto_final IS NULL` reserva el relleno a lo que la '
          'migración dejó vacío, no a lo que el usuario decidió',
    );
  });

  test('deja en paz a las obras que el servidor no menciona', () async {
    await altaObra('o1');
    await altaObra('o2');

    // Una obra dada de alta en el celular, sin señal, todavía no existe en el
    // servidor: no viene en la respuesta y su NULL es legítimo.
    final tocadas = await rellenar({'o1': 'Del servidor.', 'o2': null});

    expect(tocadas, 1);
    expect(await textoDe('o1'), 'Del servidor.');
    expect(await textoDe('o2'), isNull);
  });
}
