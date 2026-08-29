import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories_proyeccion.dart';
import 'package:constructorpro/domain/logic/proyeccion_nomina.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// El contrato de la MEMORIA de proyecciones: guardar, abrir, editar,
/// duplicar y eliminar un escenario con nombre.
///
/// Se ejerce contra una base real en memoria —no contra dobles— porque la mitad
/// del contrato lo pone el esquema: el trigger `mark_pending`, los defaults de
/// las columnas y el borrado lógico. Un doble de prueba diría que todo funciona
/// mientras el teléfono guarda proyecciones que nunca subirían.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late ProyeccionRepository repo;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = ProyeccionRepository(db);
  });
  tearDown(() => db.close());

  final lunes = DateTime(2026, 5, 18).millisecondsSinceEpoch;

  ProyeccionEstado escenario() => ProyeccionEstado(
        lunesMillis: lunes,
        participantes: const ['c1'],
        diasProyectados: const {
          'c1': {0, 1, 2, 3, 4, 5}
        },
      ).conPlazas([
        const PlazaProyectada(
          id: '${prefijoPlaza}1',
          etiqueta: 'Maestro 1',
          puestoId: 'pM',
          obraId: 'o1',
          sueldo: SueldoProyectado(
              periodo: PeriodoPago.semanal, monto: 3600, diasSemana: 6),
        ),
      ]);

  test('crear guarda el escenario completo y se puede volver a abrir', () async {
    final id = await repo.crear(
      nombre: '  Simulación 20 de mayo  ',
      estado: escenario(),
      obraFiltro: 'o1',
      totalSnapshot: 6900,
      personasSnapshot: 2,
    );

    final fila = await repo.buscar(id);
    expect(fila, isNotNull);
    expect(fila!.nombre, 'Simulación 20 de mayo', reason: 'se recorta');
    expect(fila.lunesMillis, lunes);
    expect(fila.obraFiltro, 'o1');
    expect(fila.totalSnapshot, 6900);
    expect(fila.personasSnapshot, 2);
    expect(fila.esquema, ProyeccionEstado.versionEsquema);

    final vuelta = escenarioDe(fila);
    expect(vuelta, isNotNull);
    expect(vuelta!.mismoEscenarioQue(escenario()), isTrue);
    expect(vuelta.plazas['${prefijoPlaza}1']!.salarioDia, 600);
  });

  test('actualizar reemplaza el escenario y marca la fila para subir', () async {
    final id = await repo.crear(nombre: 'Base', estado: escenario());
    await db.customStatement(
        "UPDATE proyeccion_guardada SET sync_status = 'synced' WHERE id = '$id'");

    final conMasPlazas = escenario().conPlazas([
      const PlazaProyectada(
        id: '${prefijoPlaza}2',
        etiqueta: 'Ayudante 1',
        puestoId: 'pA',
        sueldo: SueldoProyectado(
            periodo: PeriodoPago.semanal, monto: 2100, diasSemana: 6),
      ),
    ]);
    await repo.actualizar(
        id: id, estado: conMasPlazas, totalSnapshot: 9000, personasSnapshot: 3);

    final fila = (await repo.buscar(id))!;
    expect(escenarioDe(fila)!.plazas, hasLength(2));
    expect(fila.totalSnapshot, 9000);
    expect(fila.syncStatus, 'pending',
        reason: 'el trigger del esquema la deja lista para subir');
  });

  test('renombrar no exige tener el escenario cargado', () async {
    final id = await repo.crear(nombre: 'Sin nombre', estado: escenario());
    await repo.renombrar(id, '  Semana de la losa  ');
    final fila = (await repo.buscar(id))!;
    expect(fila.nombre, 'Semana de la losa');
    expect(escenarioDe(fila)!.plazas, hasLength(1),
        reason: 'el escenario no se tocó');
  });

  test('duplicar copia el escenario tal cual, con identidad nueva', () async {
    final id = await repo.crear(
        nombre: 'Original', estado: escenario(), totalSnapshot: 6900);
    final copiaId = await repo.duplicar(id);

    expect(copiaId, isNotNull);
    expect(copiaId, isNot(id));

    final original = (await repo.buscar(id))!;
    final copia = (await repo.buscar(copiaId!))!;
    expect(copia.nombre, 'Original (copia)');
    expect(copia.escenario, original.escenario,
        reason: 'byte a byte: duplicar sirve para partir de lo mismo');
    expect(copia.totalSnapshot, 6900);
    expect(escenarioDe(copia)!.plazas, hasLength(1));

    // Y editar la copia no toca a la original.
    await repo.actualizar(
        id: copiaId, estado: ProyeccionEstado(lunesMillis: lunes));
    expect(escenarioDe((await repo.buscar(id))!)!.plazas, hasLength(1));
    expect(escenarioDe((await repo.buscar(copiaId))!)!.plazas, isEmpty);
  });

  test('duplicar con nombre propio, y una que no existe devuelve null', () async {
    final id = await repo.crear(nombre: 'Original', estado: escenario());
    final copiaId = await repo.duplicar(id, nombre: 'Variante con 4 maestros');
    expect((await repo.buscar(copiaId!))!.nombre, 'Variante con 4 maestros');
    expect(await repo.duplicar('no-existe'), isNull);
  });

  test('eliminar es lógico y se puede deshacer', () async {
    final id = await repo.crear(nombre: 'Se va', estado: escenario());
    await repo.eliminar(id);

    expect(await repo.buscar(id), isNull, reason: 'ya no se lista');
    final cruda = await db
        .customSelect(
            "SELECT deleted_at FROM proyeccion_guardada WHERE id = '$id'")
        .getSingle();
    expect(cruda.read<int?>('deleted_at'), isNotNull,
        reason: 'la fila se queda para que el sync propague la baja');

    await repo.restaurar(id);
    expect(await repo.buscar(id), isNotNull);
  });

  test('la lista trae las vivas, la más reciente primero', () async {
    final a = await repo.crear(nombre: 'Uno', estado: escenario());
    await Future<void>.delayed(const Duration(milliseconds: 5));
    final b = await repo.crear(nombre: 'Dos', estado: escenario());
    await Future<void>.delayed(const Duration(milliseconds: 5));
    final c = await repo.crear(nombre: 'Tres', estado: escenario());
    await repo.eliminar(b);

    final lista = await repo.watchTodas().first;
    expect(lista.map((f) => f.nombre), ['Tres', 'Uno'],
        reason: 'la borrada no aparece y ordena por lo último tocado');
    expect(lista.map((f) => f.id), containsAll([c, a]));
  });

  test('un escenario de una versión más nueva no se lee a medias', () async {
    final id = await repo.crear(nombre: 'Del futuro', estado: escenario());
    await db.customStatement(
        "UPDATE proyeccion_guardada SET esquema = 99 WHERE id = '$id'");

    expect(escenarioDe((await repo.buscar(id))!), isNull,
        reason: 'mejor decir «no la entiendo» que enseñar una raya equivocada');
  });

  test('un escenario corrupto devuelve null en vez de tronar', () async {
    final id = await repo.crear(nombre: 'Rota', estado: escenario());
    await db.customStatement(
        "UPDATE proyeccion_guardada SET escenario = 'no soy json' WHERE id = '$id'");

    expect(escenarioDe((await repo.buscar(id))!), isNull);
  });
}
