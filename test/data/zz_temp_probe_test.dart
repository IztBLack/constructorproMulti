import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/settings/settings_provider.dart';
import 'package:constructorpro/data/providers.dart';
import 'package:constructorpro/domain/logic/proyeccion_nomina.dart';
import 'package:constructorpro/presentation/nomina/proyeccion_controller.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

  test('abrir de otra semana conserva el escenario cargado', () async {
    // Semana actual distinta a la guardada.
    final otraSemana = lunesDeLaSemana(DateTime(2026, 5, 18));
    final estado = ProyeccionEstado(
      lunesMillis: otraSemana,
      participantes: const ['c1', 'c2'],
      diasProyectados: const {
        'c1': {0, 1, 2, 3, 4},
        'c2': {0, 1},
      },
      salarioOverride: const {'c1': 600},
    );
    // fuerza la construcción del notifier con la semana de HOY
    // ignore: unused_local_variable
    final inicial = container.read(proyeccionEstadoProvider);
    print('semana inicial=${container.read(semanaProyeccionProvider)} guardada=$otraSemana');

    final repo = container.read(proyeccionRepositoryProvider);
    final id = await repo.crear(nombre: 'X', estado: estado, obraFiltro: 'o1');
    final fila = await repo.buscar(id);

    final ok = container
        .read(sesionProyeccionProvider.notifier)
        .abrir(fila!, soloLectura: false);
    expect(ok, isTrue);

    final despues = container.read(proyeccionEstadoProvider);
    print('participantes despues=${despues.participantes} lunes=${despues.lunesMillis}');
    print('sembrado? necesitaSiembra=${container.read(proyeccionEstadoProvider.notifier).necesitaSiembra}');

    // Espera un microtask/frame por si el rebuild es diferido.
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final tarde = container.read(proyeccionEstadoProvider);
    print('participantes TARDE=${tarde.participantes} lunes=${tarde.lunesMillis}');
    print('necesitaSiembra TARDE=${container.read(proyeccionEstadoProvider.notifier).necesitaSiembra}');
    expect(tarde.participantes, ['c1', 'c2']);
  });
}
