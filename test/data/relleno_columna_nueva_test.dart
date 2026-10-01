import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/sync/sync_metadata.dart';
import 'package:constructorpro/core/sync/sync_service.dart';
import 'package:drift/drift.dart' show Value, Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show SupabaseClient;

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

  /// El modo "fila intacta" (`"t.c@<ms>"`), para columnas NOT NULL con default
  /// como las opciones de impresión de la nota (v13 → v14). Aquí no hay NULL
  /// que distinga "no lo sé" de "lo eligió el usuario": lo distingue
  /// `updated_at` contra el momento de la migración.
  group('columna NOT NULL con default (modo @ms)', () {
    const migracion = 1000000;

    Future<void> altaNota(String id,
        {required int updatedAt, String sync = 'synced'}) async {
      await db.into(db.notaObra).insert(NotaObraCompanion.insert(
            id: id,
            obraId: 'o1',
            fecha: 0,
          ));
      // Directo por SQL y CAMBIANDO `sync_status` en cada paso, para que el
      // trigger `mark_pending` (solo salta si no cambia) no reescriba el
      // `updated_at` que se quiere probar. Nace 'pending', así que primero se
      // pasa a 'synced' y, si hace falta, de vuelta a 'pending'.
      await db.customStatement(
        "UPDATE nota_obra SET updated_at = $updatedAt, sync_status = 'synced' "
        "WHERE id = '$id'",
      );
      if (sync != 'synced') {
        await db.customStatement(
          "UPDATE nota_obra SET sync_status = '$sync' WHERE id = '$id'",
        );
      }
    }

    /// Como lo hace `_llenarColumnaNueva`: el bool ya convertido a 0/1.
    Future<int> rellenar(String id, bool delServidor) {
      final v = delServidor ? 1 : 0;
      return db.customUpdate(
        SyncService.sqlRellenoColumnaIntacta('nota_obra', 'mostrar_para', 'id'),
        variables: [Variable(v), Variable(id), Variable(migracion), Variable(v)],
      );
    }

    Future<({bool valor, String sync})> estado(String id) async {
      final f = await db
          .customSelect(
              "SELECT mostrar_para, sync_status FROM nota_obra WHERE id = '$id'")
          .getSingle();
      return (
        valor: f.read<bool>('mostrar_para'),
        sync: f.read<String>('sync_status'),
      );
    }

    test('la pending de ANTES de actualizar toma lo que eligió el dueño',
        () async {
      // Editada sin señal en la v1.3.1, cuando la columna no existía: su
      // edición no pudo tocar la opción, y el push iba a subir el default.
      await altaNota('n1', updatedAt: migracion - 50, sync: 'pending');
      expect((await estado('n1')).valor, isTrue, reason: 'el default local');

      expect(await rellenar('n1', false), 1);
      expect((await estado('n1')).valor, isFalse);
    });

    test('la que falló al subir (error) también: se va a reintentar', () async {
      await altaNota('n1', updatedAt: migracion - 50, sync: 'error');
      expect(await rellenar('n1', false), 1);
      expect((await estado('n1')).valor, isFalse);
    });

    test('la synced NO se toca: la arregla el pull completo', () async {
      // Tocarla la dejaría `pending` y el push subiría la fila ENTERA —texto y
      // montos de la última bajada— encima de lo que la web editó después.
      // `_llenarColumnaNueva` reinicia el cursor y el pull la baja completa.
      await altaNota('n1', updatedAt: migracion - 50);
      expect(await rellenar('n1', false), 0);
      expect(await estado('n1'), (valor: true, sync: 'synced'));
    });

    test('lo editado en el teléfono DESPUÉS de actualizar no se pisa',
        () async {
      await altaNota('n1', updatedAt: migracion + 50, sync: 'pending');
      expect(await rellenar('n1', false), 0);
      expect((await estado('n1')).valor, isTrue,
          reason: 'el usuario vio el valor y lo dejó así: manda su elección');
    });

    test('donde ya coincide no escribe', () async {
      await altaNota('n1', updatedAt: migracion - 50, sync: 'pending');
      expect(await rellenar('n1', true), 0);
    });
  });

  /// El aviso que deja la migración vive en memoria. Si espera al primer sync
  /// con señal y Android mata el proceso antes, se pierde: la siguiente
  /// apertura ya no migra. Por eso pasa a disco sin depender de sesión ni red.
  test('el aviso de la migración pasa a disco aunque no haya sesión', () async {
    SharedPreferences.setMockInitialValues({});
    final metadata = SyncMetadata(await SharedPreferences.getInstance());
    final svc = SyncService(
      db: db,
      metadata: metadata,
      // Nunca se usa: persistir no toca la red.
      client: SupabaseClient('http://localhost', 'clave-de-prueba'),
    );
    AppDatabase.columnasPorLlenar
      ..clear()
      ..add('nota_obra.mostrar_para@123');

    await svc.persistirAvisosDeMigracion();

    expect(metadata.porLlenar, {'nota_obra.mostrar_para@123'});
    expect(AppDatabase.columnasPorLlenar, isEmpty);
  });
}
