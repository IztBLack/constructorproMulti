import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/settings/settings_provider.dart';
import 'package:constructorpro/data/providers.dart';
import 'package:constructorpro/domain/logic/proyeccion_nomina.dart';
import 'package:constructorpro/presentation/nomina/proyeccion_controller.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// El CANDADO de una proyección abierta solo para consultar.
///
/// Vive en el notifier y no en cada botón de la pantalla porque hay más de
/// treinta puntos que mutan el escenario; el que se olvide sería una edición
/// silenciosa sobre algo que el usuario abrió «solo para ver», y no dejaría
/// rastro. Estos tests recorren TODAS las mutaciones públicas para que agregar
/// una nueva sin candado se caiga aquí.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late ProviderContainer container;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    db = AppDatabase.forTesting(NativeDatabase.memory());
    container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      databaseProvider.overrideWithValue(db),
    ]);
  });

  tearDown(() async {
    container.dispose();
    await db.close();
  });

  // Getters como funciones locales: dentro de un cuerpo de función Dart no
  // admite declaraciones `get`.
  ProyeccionNotifier notifier() =>
      container.read(proyeccionEstadoProvider.notifier);
  ProyeccionEstado estado() => container.read(proyeccionEstadoProvider);

  /// Deja el escenario con algo dentro y la sesión en modo consulta.
  Future<void> abrirEnSoloLectura() async {
    notifier().cargar(ProyeccionEstado(
      lunesMillis: DateTime(2026, 8, 24).millisecondsSinceEpoch,
      participantes: const ['c1'],
      diasProyectados: const {
        'c1': {0, 1, 2}
      },
    ));
    final repo = container.read(proyeccionRepositoryProvider);
    final id = await repo.crear(nombre: 'Guardada', estado: estado());
    final fila = await repo.buscar(id);
    container
        .read(sesionProyeccionProvider.notifier)
        .abrir(fila!, soloLectura: true);
  }

  test('en solo lectura, ninguna mutación toca el escenario', () async {
    await abrirEnSoloLectura();
    final antes = estado();
    expect(container.read(sesionProyeccionProvider).soloLectura, isTrue);

    // Todas las mutaciones públicas del notifier, una por una.
    notifier().alternarDia('c1', 4);
    notifier().alternarColumna(5, const ['c1']);
    notifier().rellenar(RellenoSemana.lunesASabado, const ['c1'],
        diasPorColaborador: const {'c1': 6}, bloqueadosPorDia: const {});
    notifier().moverDia('c1', 1, 'o2');
    notifier().agregar('c2');
    notifier().agregarVarios(const ['c3'],
        diasPorColaborador: const {'c3': 6});
    notifier().agregarPlazas(
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 4,
      sueldo: const SueldoProyectado(
          periodo: PeriodoPago.semanal, monto: 3600, diasSemana: 6),
    );
    notifier().setSalario('c1', 999);
    notifier().setSueldo(
        'c1',
        const SueldoProyectado(
            periodo: PeriodoPago.semanal, monto: 4200, diasSemana: 6));
    notifier().setDestajo('c1', 5000);
    notifier().agregarAjuste(
      tipo: TipoAjuste.anticipo,
      destino: DestinoAjuste.colaborador,
      destinoId: 'c1',
      monto: 800,
    );
    notifier().guardarAjuste(const AjusteProyeccion(
      id: 'x',
      tipo: TipoAjuste.destajo,
      destino: DestinoAjuste.colaborador,
      destinoId: 'c1',
      monto: 100,
    ));
    notifier().borrarAjuste('x');
    notifier().limpiarAjustesHuerfanos(const ['x']);
    notifier().setSimularCompleta(true);
    notifier().quitar('c1');
    notifier().sustituirPlazaPorColaborador('${prefijoPlaza}1', 'c9');
    notifier().restaurar(ProyeccionEstado(lunesMillis: 0));

    expect(estado().mismoEscenarioQue(antes), isTrue,
        reason: 'una proyección abierta para consultar no se toca');
    expect(estado().participantes, ['c1']);
    expect(estado().diasDe('c1'), {0, 1, 2});
    expect(estado().plazas, isEmpty);
    expect(estado().ajustes, isEmpty);
    expect(estado().simularCompleta, isFalse);
  });

  test('el redondeo SÍ se puede cambiar mirando: no cambia la proyección',
      () async {
    await abrirEnSoloLectura();
    notifier().setRedondeo(const RedondeoConfig(
        activo: true, paso: 100, campos: {CampoRedondeo.rayaPersona}));

    expect(estado().redondeo.activo, isTrue,
        reason: 'ver los números al peso no es editar la proyección');
    expect(estado().participantes, ['c1'], reason: 'y no toca nada más');
  });

  test('pasar a editar levanta el candado', () async {
    await abrirEnSoloLectura();
    container.read(sesionProyeccionProvider.notifier).editarLaAbierta();

    expect(container.read(sesionProyeccionProvider).soloLectura, isFalse);
    notifier().alternarDia('c1', 4);
    expect(estado().diasDe('c1'), {0, 1, 2, 4});
  });

  test('abrir para editar deja la sesión atada a la fila guardada', () async {
    notifier().cargar(ProyeccionEstado(
      lunesMillis: DateTime(2026, 8, 24).millisecondsSinceEpoch,
      participantes: const ['c1'],
    ));
    final repo = container.read(proyeccionRepositoryProvider);
    final id = await repo.crear(nombre: 'Mi escenario', estado: estado());
    final fila = await repo.buscar(id);

    final sesion = container.read(sesionProyeccionProvider.notifier);
    expect(sesion.abrir(fila!, soloLectura: false), isTrue);

    final s = container.read(sesionProyeccionProvider);
    expect(s.modo, ModoProyeccion.editando);
    expect(s.id, id);
    expect(s.nombre, 'Mi escenario');
    expect(s.soloLectura, isFalse);
    expect(estado().participantes, ['c1'],
        reason: 'y el escenario guardado quedó cargado');
  });

  test('abrir una guardada con formato desconocido no rompe la pantalla',
      () async {
    notifier().cargar(ProyeccionEstado(lunesMillis: 0, participantes: const ['c1']));
    final repo = container.read(proyeccionRepositoryProvider);
    final id = await repo.crear(nombre: 'Del futuro', estado: estado());
    await db.customStatement(
        "UPDATE proyeccion_guardada SET esquema = 99 WHERE id = '$id'");
    final fila = await repo.buscar(id);

    final sesion = container.read(sesionProyeccionProvider.notifier);
    expect(sesion.abrir(fila!, soloLectura: true), isFalse,
        reason: 'la pantalla puede avisar en vez de abrir una vacía');
    expect(container.read(sesionProyeccionProvider).id, isNull,
        reason: 'y la sesión no se queda atada a algo que no pudo leer');
  });

  test('abrir mueve la semana y el filtro de obra al de lo guardado', () async {
    final otraSemana = DateTime(2026, 5, 18).millisecondsSinceEpoch;
    notifier().cargar(ProyeccionEstado(
      lunesMillis: otraSemana,
      participantes: const ['c1'],
      diasProyectados: const {
        'c1': {0, 1}
      },
    ));
    final repo = container.read(proyeccionRepositoryProvider);
    final id = await repo.crear(
        nombre: 'Semana de mayo', estado: estado(), obraFiltro: 'o7');
    final fila = await repo.buscar(id);

    // Se parte de OTRA semana, para que abrir tenga que moverla.
    container.read(semanaProyeccionProvider.notifier).state =
        DateTime(2026, 8, 24).millisecondsSinceEpoch;

    container
        .read(sesionProyeccionProvider.notifier)
        .abrir(fila!, soloLectura: false);

    expect(container.read(semanaProyeccionProvider), otraSemana);
    expect(container.read(obraFiltroProyeccionProvider), 'o7');
    // Lo importante: el rebuild por cambio de semana NO se llevó por delante lo
    // que se acababa de cargar.
    expect(estado().lunesMillis, otraSemana);
    expect(estado().participantes, ['c1']);
    expect(estado().diasDe('c1'), {0, 1});
    expect(notifier().necesitaSiembra, isFalse,
        reason: 'cargar marca el escenario como sembrado: si no, la pantalla '
            'lo pisaría con los participantes sugeridos');
  });

  test('guardar deja el escenario sin cambios pendientes', () async {
    notifier().cargar(ProyeccionEstado(
        lunesMillis: DateTime(2026, 8, 24).millisecondsSinceEpoch));
    notifier().agregar('c1');
    expect(notifier().tocado, isTrue);

    await container.read(sesionProyeccionProvider.notifier).guardar(
        nombre: 'Recién guardada');

    expect(notifier().tocado, isFalse,
        reason: 'justo después de guardar no hay trabajo sin guardar');
    expect(container.read(sesionProyeccionProvider).nombre, 'Recién guardada');
  });

  test('eliminar la abierta deja el escenario en la mano, sin archivo',
      () async {
    notifier().cargar(ProyeccionEstado(
        lunesMillis: DateTime(2026, 8, 24).millisecondsSinceEpoch,
        participantes: const ['c1']));
    final sesion = container.read(sesionProyeccionProvider.notifier);
    await sesion.guardar(nombre: 'Se va');
    final id = container.read(sesionProyeccionProvider).id;

    await sesion.eliminar(id!);

    expect(container.read(sesionProyeccionProvider).tieneArchivo, isFalse);
    expect(estado().participantes, ['c1'],
        reason: 'para poder volver a guardarla si fue un error');
  });
}
