import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories_cuadrilla.dart';
import 'package:constructorpro/data/repositories_obra.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Verifica el modelo de CUADRILLAS (Fase 1-3):
/// 1. Membresía N:M con historial (agregar/quitar es baja lógica).
/// 2. Jefe/cabo como atributo.
/// 3. Asignación temporal a obra (asignar/desasignar).
/// 4. Soft-delete en cascada (miembros + asignaciones).
/// 5. El pase de lista sella `cuadrilla_id` sin afectar la fracción.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late CuadrillaRepository repo;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = CuadrillaRepository(db);
    // Prerrequisitos: colaboradores y una obra.
    await db.into(db.colaboradores).insert(ColaboradoresCompanion.insert(
        id: 'c1', nombre: 'Pedro', puestoId: 'p1', tipoPago: 'DIA'));
    await db.into(db.colaboradores).insert(ColaboradoresCompanion.insert(
        id: 'c2', nombre: 'Luis', puestoId: 'p1', tipoPago: 'DIA'));
    await db.into(db.obras).insert(
        ObrasCompanion.insert(id: 'o1', nombre: 'Obra 1', fechaInicio: 0));
  });
  tearDown(() => db.close());

  Future<void> crearCuadrilla(String id, String nombre) =>
      repo.upsert(CuadrillasCompanion(
          id: Value(id), nombre: Value(nombre), especialidad: Value('ACERO')));

  test('membresía: agregar suma miembros; quitar es baja lógica', () async {
    await crearCuadrilla('q1', 'Fierreros');
    await repo.agregarMiembro(cuadrillaId: 'q1', colaboradorId: 'c1');
    await repo.agregarMiembro(cuadrillaId: 'q1', colaboradorId: 'c2');

    expect((await repo.watchMiembros('q1').first).length, 2);

    await repo.quitarMiembro('q1', 'c2');
    expect((await repo.watchMiembros('q1').first).map((c) => c.id), ['c1']);

    // Baja lógica: la fila sigue existiendo con fechaSalida marcada.
    final rel = await (db.select(db.cuadrillaMiembro)
          ..where((t) => t.cuadrillaId.equals('q1') & t.colaboradorId.equals('c2')))
        .getSingle();
    expect(rel.fechaSalida, isNotNull);
  });

  test('jefe/cabo: se fija y se limpia', () async {
    await crearCuadrilla('q1', 'Fierreros');
    await repo.agregarMiembro(cuadrillaId: 'q1', colaboradorId: 'c1');
    await repo.setJefe('q1', 'c1');
    var q = (await repo.watchAll().first).firstWhere((c) => c.id == 'q1');
    expect(q.jefeColaboradorId, 'c1');

    await repo.setJefe('q1', null);
    q = (await repo.watchAll().first).firstWhere((c) => c.id == 'q1');
    expect(q.jefeColaboradorId, isNull);
  });

  test('asignación a obra: asignar/desasignar', () async {
    await crearCuadrilla('q1', 'Fierreros');
    await repo.asignarAObra(cuadrillaId: 'q1', obraId: 'o1', fase: 'cimbra');
    expect((await repo.watchCuadrillasPorObra('o1').first).map((c) => c.id),
        ['q1']);

    await repo.desasignarDeObra('q1', 'o1');
    expect(await repo.watchCuadrillasPorObra('o1').first, isEmpty);
  });

  test('cuadrilla vigente por colaborador', () async {
    await crearCuadrilla('q1', 'Fierreros');
    await repo.agregarMiembro(cuadrillaId: 'q1', colaboradorId: 'c1');
    final map = await repo.watchCuadrillaPorColaborador().first;
    expect(map['c1']?.id, 'q1');
    expect(map.containsKey('c2'), isFalse);
  });

  test('delete(): tombstone en cascada de miembros y asignaciones', () async {
    await crearCuadrilla('q1', 'Fierreros');
    await repo.agregarMiembro(cuadrillaId: 'q1', colaboradorId: 'c1');
    await repo.asignarAObra(cuadrillaId: 'q1', obraId: 'o1');

    await repo.delete('q1');

    // Oculta para la UI.
    expect(await repo.watchAll().first, isEmpty);
    expect(await repo.watchMiembros('q1').first, isEmpty);
    expect(await repo.watchCuadrillasPorObra('o1').first, isEmpty);

    // Físicamente siguen, marcadas pending.
    final cuad = await (db.select(db.cuadrillas)..where((t) => t.id.equals('q1')))
        .getSingle();
    expect(cuad.deletedAt, isNotNull);
    expect(cuad.syncStatus, 'pending');
    final miembro = await (db.select(db.cuadrillaMiembro)
          ..where((t) => t.cuadrillaId.equals('q1')))
        .getSingle();
    expect(miembro.deletedAt, isNotNull);
  });

  test('destajo por cuadrilla: reparte la bolsa en una fila por miembro', () async {
    final dest = DestajoRepository(db);
    await dest.registrarBolsaCuadrilla(
      obraId: 'o1',
      cuadrillaId: 'q1',
      fecha: 100,
      concepto: 'Armado de castillos',
      reparto: const [
        (colaboradorId: 'c1', monto: 7200.0),
        (colaboradorId: 'c2', monto: 4800.0),
      ],
    );
    final filas = await (db.select(db.destajos)
          ..where((t) => t.cuadrillaId.equals('q1')))
        .get();
    expect(filas.length, 2);
    expect(filas.map((d) => d.monto).reduce((a, b) => a + b), 12000.0);
    expect(filas.every((d) => d.concepto == 'Armado de castillos'), isTrue);
    expect(filas.every((d) => d.obraId == 'o1'), isTrue);
    // Cada fila es un destajo normal → la nómina la suma por colaborador sin cambios.
    final deC1 = filas.firstWhere((d) => d.colaboradorId == 'c1');
    expect(deC1.monto, 7200.0);
  });

  test('pase de lista sella cuadrilla_id sin alterar la fracción', () async {
    final asis = AsistenciaRepository(db);
    await asis.setFraccion(
        obraId: 'o1',
        colaboradorId: 'c1',
        fecha: 100,
        fraccion: 1.0,
        cuadrillaId: 'q1');
    final row = await (db.select(db.asistencias)
          ..where((t) => t.colaboradorId.equals('c1') & t.fecha.equals(100)))
        .getSingle();
    expect(row.fraccion, 1.0);
    expect(row.cuadrillaId, 'q1');

    // Re-guardar sin cuadrilla la limpia (refleja el estado actual del worker).
    await asis.setFraccion(
        obraId: 'o1', colaboradorId: 'c1', fecha: 100, fraccion: 0.5);
    final row2 = await (db.select(db.asistencias)
          ..where((t) => t.colaboradorId.equals('c1') & t.fecha.equals(100)))
        .getSingle();
    expect(row2.fraccion, 0.5);
    expect(row2.cuadrillaId, isNull);
  });
}
