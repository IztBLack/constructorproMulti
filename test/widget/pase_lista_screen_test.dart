import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/format/format.dart';
import 'package:constructorpro/core/modulos/modulos.dart';
import 'package:constructorpro/core/modulos/modulos_provider.dart';
import 'package:constructorpro/core/settings/settings_provider.dart';
import 'package:constructorpro/core/sync/cloud_providers.dart';
import 'package:constructorpro/core/sync/rol_provider.dart';
import 'package:constructorpro/core/theme/app_theme.dart';
import 'package:constructorpro/data/providers.dart';
import 'package:constructorpro/data/repositories.dart';
import 'package:constructorpro/data/repositories_cuadrilla.dart';
import 'package:constructorpro/data/repositories_obra.dart';
import 'package:constructorpro/presentation/asistencia/pase_lista_screen.dart';
import 'package:drift/drift.dart' show Value, driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Módulos fijos, como si el dueño los hubiera elegido en la web.
class _ModulosFijos extends ModulosNotifier {
  @override
  ModulosActivos build() => ModulosActivos(
        normalizarModulos(const ['equipo', 'cuadrillas']),
        FuenteModulos.servidor,
      );
}

/// El pase de lista con la base EN MEMORIA y sin nube. Lo que se comprueba es
/// lo que vive quien pasa lista en la obra: el vocabulario de los botones, que
/// "marcar a todos" se pueda deshacer y que cada fila diga si ya se guardó.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('es_MX');
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  });

  late AppDatabase db;
  late SharedPreferences prefs;
  late String ana;
  late String beto;
  final hoy = Semana.inicioDia(DateTime.now());

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    db = AppDatabase.forTesting(NativeDatabase.memory());
    await db.customSelect('SELECT 1').get();

    // Una obra con una cuadrilla de dos: Ana ya trae ½ de hoy, Beto nada.
    await db.into(db.obras).insert(ObrasCompanion.insert(
        id: 'obra-1', nombre: 'Casa Norte', fechaInicio: 0));
    final colabs = ColaboradorRepository(db);
    ana = await colabs.crearPorNombre(
        nombre: 'Ana', obraId: 'obra-1', empresaId: 'emp-1');
    beto = await colabs.crearPorNombre(
        nombre: 'Beto', obraId: 'obra-1', empresaId: 'emp-1');
    final cuadrillas = CuadrillaRepository(db);
    await cuadrillas.upsert(
        CuadrillasCompanion.insert(id: 'q1', nombre: 'Albañiles'));
    await cuadrillas.agregarMiembro(cuadrillaId: 'q1', colaboradorId: ana);
    await cuadrillas.agregarMiembro(cuadrillaId: 'q1', colaboradorId: beto);
    await AsistenciaRepository(db).setFraccion(
      obraId: 'obra-1',
      colaboradorId: ana,
      fecha: hoy,
      fraccion: 0.5,
      cuadrillaId: const Value('q1'),
    );
  });

  /// `testWidgets` que al final desmonta la pantalla y cierra la base (Drift
  /// cierra sus consultas vivas con un temporizador de cero).
  void prueba(String nombre, Future<void> Function(WidgetTester t) cuerpo) {
    testWidgets(nombre, (t) async {
      await cuerpo(t);
      await t.pumpWidget(const SizedBox());
      await t.pump(Duration.zero);
      await t.runAsync(() => db.close());
    });
  }

  Widget montar() => ProviderScope(
        overrides: [
          databaseProvider.overrideWithValue(db),
          sharedPreferencesProvider.overrideWithValue(prefs),
          currentUserProvider.overrideWithValue(null),
          empresaIdProvider.overrideWithValue('emp-1'),
          rolUsuarioProvider.overrideWith((ref) async => 'admin'),
          modulosProvider.overrideWith(_ModulosFijos.new),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const PaseListaScreen(),
        ),
      );

  Future<Map<String, double>> fracciones(WidgetTester t) async {
    final filas = await t.runAsync(() => db.select(db.asistencias).get());
    return {for (final a in filas!) a.colaboradorId: a.fraccion};
  }

  prueba('los botones usan el catálogo de la web y TalkBack lee el nombre',
      (t) async {
    await t.pumpWidget(montar());
    await t.pumpAndSettle();

    // Símbolo y nombre a la vista, en cada fila: nada de "F" ni de "✓".
    for (final s in ['·', '½', '¾', '1']) {
      expect(find.text(s), findsNWidgets(2));
    }
    expect(find.text('F'), findsNothing);
    expect(find.text('✓'), findsNothing);
    expect(find.bySemanticsLabel('Falta'), findsNWidgets(2));
    expect(find.bySemanticsLabel('Tres cuartos'), findsNWidgets(2));
    expect(find.bySemanticsLabel('Pase de lista de Ana'), findsOneWidget);
  });

  prueba('"marcar a todos completo" avisa a quién sobrescribió y se deshace',
      (t) async {
    await t.pumpWidget(montar());
    await t.pumpAndSettle();

    expect(find.text('Todos ✓'), findsNothing);
    expect(
      find.bySemanticsLabel(RegExp('^Marcar a todos completo')),
      findsOneWidget,
    );

    await t.tap(find.text('Todos completo'));
    await t.pumpAndSettle();

    expect(await fracciones(t), {ana: 1.0, beto: 1.0});
    expect(find.textContaining('Día completo a 2 persona(s).'), findsOneWidget);
    expect(find.textContaining('1 tenía(n) ½ o ¾ y se sobrescribió.'),
        findsOneWidget);

    await t.tap(find.text('Deshacer'));
    await t.pumpAndSettle();

    // Cada quien como estaba: Ana con su ½ y Beto en "Falta".
    expect(await fracciones(t), {ana: 0.5, beto: 0.0});
  });
}
