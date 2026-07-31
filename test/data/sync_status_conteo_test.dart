import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/sync/sync_service.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// El indicador de sync se apoya en un conteo de filas `pending`/`error` sacado
/// con un SELECT que se ARMA a partir de [SyncService.pushOrder]. Esa
/// construcción dinámica es lo frágil: un nombre de tabla mal formado o una
/// tabla que dejó de existir rompería el conteo en silencio y el indicador
/// mostraría "al día" con cambios sin subir. Estas pruebas ejercen el mismo SQL
/// contra una BD real para que eso falle aquí y no en el teléfono.
///
/// Se reconstruye el SELECT en el test (en vez de importar el provider, que
/// arrastra Riverpod y Supabase) porque lo que se valida es que el SQL derivado
/// de `pushOrder` corre y suma bien; la combinación con sesión/actividad es
/// lógica pura y se cubriría aparte.
String _sqlConteo() {
  final pend = SyncService.pushOrder
      .map((t) => "(SELECT COUNT(*) FROM $t WHERE sync_status='pending')")
      .join(' + ');
  final err = SyncService.pushOrder
      .map((t) => "(SELECT COUNT(*) FROM $t WHERE sync_status='error')")
      .join(' + ');
  return 'SELECT ($pend) AS pendientes, ($err) AS errores';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<({int pendientes, int errores})> conteo() async {
    final row = await db.customSelect(_sqlConteo()).getSingle();
    return (
      pendientes: row.read<int>('pendientes'),
      errores: row.read<int>('errores'),
    );
  }

  test('el SQL derivado de pushOrder corre contra el esquema real', () async {
    // Si alguna tabla de pushOrder no existe o el nombre está mal, getSingle
    // lanza aquí. No se afirma un valor: la BD de prueba nace con el catálogo
    // semilla (~239 filas pending), y ese es justo el comportamiento real —el
    // usuario recién vinculado ve esos pendientes hasta el primer sync—, así que
    // solo se exige que el conteo corra y devuelva números válidos.
    final c = await conteo();
    expect(c.pendientes, greaterThanOrEqualTo(0));
    expect(c.errores, 0);
  });

  test('cuenta pendientes y errores a través de varias tablas', () async {
    // Se parte del catálogo semilla; se miden DELTAS sobre esa base para no
    // acoplar el test al número exacto de conceptos del asset.
    final base = await conteo();

    // Dos altas nuevas → 'pending' por el default de la columna.
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'A', fechaInicio: 0));
    await db.into(db.puestos).insert(
        PuestosCompanion.insert(id: 'p1', nombre: 'Peón'));

    var c = await conteo();
    expect(c.pendientes, base.pendientes + 2, reason: 'suma obras + puestos');
    expect(c.errores, 0);

    // Una pasa a 'synced' (imita push exitoso) y otra a 'error' (imita fallo).
    await db.customStatement("UPDATE obras SET sync_status='synced'");
    await db.customStatement("UPDATE puestos SET sync_status='error'");

    c = await conteo();
    expect(c.pendientes, base.pendientes, reason: 'las dos nuevas ya no cuentan');
    expect(c.errores, 1);
  });

  test('pushOrder no tiene tablas repetidas (una filaria contaria doble)',
      () async {
    final set = SyncService.pushOrder.toSet();
    expect(set.length, SyncService.pushOrder.length,
        reason: 'un nombre repetido en pushOrder sumaria esa tabla dos veces');
  });
}
