import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/sync/sync_service.dart';
import 'package:constructorpro/data/repositories_obra.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// La resolución de un conflicto de jornada ("Subir": este registro reemplaza
/// al de la nube) tiene DOS partes que deben cumplirse juntas, o el servidor
/// vuelve a rechazar la fila y el conflicto reaparece:
///
/// 1. dar de baja al registro rival (tombstone + `pending`) para liberar la
///    jornada del día, dejando el propio registro listo para subir;
/// 2. que el push mande esa baja ANTES del registro que la reemplaza.
///
/// Se ejerce contra una BD real en memoria porque el orden lo impone SQL, no
/// Dart: un `ORDER BY` mal escrito rompería el flujo solo en el teléfono.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late AsistenciaRepository repo;

  const colab = 'c1';
  const obraNube = 'o-nube';
  const obraLocal = 'o-local';
  final dia = DateTime(2026, 8, 5);

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = AsistenciaRepository(db);

    await db.into(db.colaboradores).insert(ColaboradoresCompanion.insert(
        id: colab, nombre: 'Juan Pérez', puestoId: 'p1', tipoPago: 'DIA'));
    await db.into(db.obras).insert(ObrasCompanion.insert(
        id: obraNube, nombre: 'Costa Verde', fechaInicio: 0));
    await db.into(db.obras).insert(ObrasCompanion.insert(
        id: obraLocal, nombre: 'Boticaria', fechaInicio: 0));

    // El rival: ya sincronizado (bajó de la nube y ocupa la jornada).
    await repo.setFraccion(
      obraId: obraNube,
      colaboradorId: colab,
      fecha: dia.millisecondsSinceEpoch,
      fraccion: 1.0,
    );
    await db.customStatement(
        "UPDATE asistencias SET sync_status='synced' WHERE obra_id='$obraNube'");

    // El nuestro: el servidor lo rechazó por la regla de 1 jornada/día.
    await repo.setFraccion(
      obraId: obraLocal,
      colaboradorId: colab,
      fecha: dia.millisecondsSinceEpoch,
      fraccion: 1.0,
    );
    await db.customStatement(
        "UPDATE asistencias SET sync_status='conflict' WHERE obra_id='$obraLocal'");
  });

  tearDown(() => db.close());

  test('watchConflictos resuelve nombres y muestra el registro rival', () async {
    final lista = await repo.watchConflictos().first;

    expect(lista, hasLength(1));
    final c = lista.single;
    expect(c.colaborador, 'Juan Pérez');
    expect(c.obraLocal, 'Boticaria', reason: 'el dato capturado aquí');
    expect(c.obraRival, 'Costa Verde', reason: 'el que ya está en la nube');
    expect(c.fraccionRival, 1.0);
  });

  test('"Subir" da de baja al rival y deja ambas filas listas para subir',
      () async {
    final c = (await repo.watchConflictos().first).single;
    // La suscripción se abre ANTES de mutar: así se verifica que la pantalla se
    // vacía sola por el stream (que es como la ve el usuario) y no se depende
    // del valor cacheado que Drift replica a un suscriptor tardío.
    final seVacia = expectLater(repo.watchConflictos(), emitsThrough(isEmpty));

    await repo.reemplazarConConflicto(c);

    final filas = await db
        .customSelect('SELECT obra_id, deleted_at, sync_status FROM asistencias')
        .get();
    final porObra = {for (final f in filas) f.data['obra_id'] as String: f.data};

    // El rival queda tombstoneado y pendiente de propagar esa baja.
    expect(porObra[obraNube]!['deleted_at'], isNotNull);
    expect(porObra[obraNube]!['sync_status'], 'pending');
    // El nuestro sale de 'conflict' y vuelve a la cola de subida.
    expect(porObra[obraLocal]!['deleted_at'], isNull);
    expect(porObra[obraLocal]!['sync_status'], 'pending');

    // Ya no hay conflicto que mostrar: la pantalla se vacía sola.
    await seVacia;
  });

  test('el push manda la baja del rival ANTES del registro que lo reemplaza',
      () async {
    final c = (await repo.watchConflictos().first).single;
    await repo.reemplazarConConflicto(c);

    final orden = await db.customSelect(SyncService.sqlCandidatosPush('asistencias')).get();
    final obras = orden.map((r) => r.data['obra_id'] as String).toList();

    expect(obras.first, obraNube,
        reason: 'si el alta viaja primero, el servidor la rechaza de nuevo');
    expect(obras, containsAllInOrder([obraNube, obraLocal]));
  });

  test('"Eliminar" descarta el dato local y deja el día en 1 jornada', () async {
    final c = (await repo.watchConflictos().first).single;
    final seVacia = expectLater(repo.watchConflictos(), emitsThrough(isEmpty));

    await repo.eliminarConflicto(c.id);

    // Tombstone + terminal: ni se sube ni sigue contando como conflicto.
    final fila = await db
        .customSelect("SELECT sync_status, deleted_at FROM asistencias "
            "WHERE obra_id = '$obraLocal'")
        .getSingle();
    expect(fila.data['deleted_at'], isNotNull);
    expect(fila.data['sync_status'], 'skipped');

    // Lo que de verdad importa: la nómina local del día vuelve a cuadrar con la
    // nube (1 jornada), que es la diferencia entre "Eliminar" y "Omitir".
    final jornadas = await db
        .customSelect(
            'SELECT COALESCE(SUM(fraccion), 0) AS total FROM asistencias '
            'WHERE colaborador_id = ? AND fecha = ? AND deleted_at IS NULL',
            variables: [Variable(colab), Variable(dia.millisecondsSinceEpoch)])
        .getSingle();
    expect(jornadas.data['total'], 1.0);

    await seVacia;
  });

  test('"Omitir" conserva el dato local (y por eso el día suma 2 jornadas)',
      () async {
    final c = (await repo.watchConflictos().first).single;
    await repo.omitirConflicto(c.id);

    // Contraparte explícita del test de "Eliminar": omitir NO borra, así que el
    // día queda con doble jornada EN LOCAL. Está documentado y la UI lo advierte;
    // si algún día se decide que esto no es aceptable, este test lo señala.
    final jornadas = await db
        .customSelect(
            'SELECT COALESCE(SUM(fraccion), 0) AS total FROM asistencias '
            'WHERE colaborador_id = ? AND fecha = ? AND deleted_at IS NULL',
            variables: [Variable(colab), Variable(dia.millisecondsSinceEpoch)])
        .getSingle();
    expect(jornadas.data['total'], 2.0);
  });

  test('"Omitir" conserva el dato de la nube y saca la fila de la cola',
      () async {
    final c = (await repo.watchConflictos().first).single;
    final seVacia = expectLater(repo.watchConflictos(), emitsThrough(isEmpty));

    await repo.omitirConflicto(c.id);

    final fila = await db
        .customSelect("SELECT sync_status, deleted_at FROM asistencias "
            "WHERE obra_id = '$obraLocal'")
        .getSingle();
    // 'skipped' es terminal: no reintenta ni cuenta como conflicto, pero la
    // fila sigue ahí (no se borra el dato que capturó el usuario).
    expect(fila.data['sync_status'], 'skipped');
    expect(fila.data['deleted_at'], isNull);

    // El rival de la nube queda intacto.
    final rival = await db
        .customSelect("SELECT sync_status, deleted_at FROM asistencias "
            "WHERE obra_id = '$obraNube'")
        .getSingle();
    expect(rival.data['sync_status'], 'synced');
    expect(rival.data['deleted_at'], isNull);

    await seVacia;
  });
}
