import 'package:constructorpro/core/modulos/modulos.dart';
import 'package:constructorpro/core/modulos/modulos_provider.dart';
import 'package:constructorpro/core/settings/settings_provider.dart';
import 'package:constructorpro/data/providers.dart';
import 'package:constructorpro/presentation/home_shell.dart';
import 'package:constructorpro/presentation/obras/obra_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Módulos fijos que la prueba puede cambiar en caliente, como si el admin
/// apagara algo en la web con la app abierta.
class _ModulosFijos extends ModulosNotifier {
  _ModulosFijos(this.inicial);
  final ModulosActivos inicial;

  @override
  ModulosActivos build() => inicial;

  void poner(ModulosActivos m) => state = m;
}

ModulosActivos _con(Iterable<String> claves) =>
    ModulosActivos(normalizarModulos(claves.toList()), FuenteModulos.servidor);

void main() {
  late SharedPreferences prefs;

  setUp(() async {
    // Tutorial visto: que no se abra encima del shell.
    SharedPreferences.setMockInitialValues({'tutorial_visto': true});
    prefs = await SharedPreferences.getInstance();
  });

  Widget montar(ModulosActivos modulos) => ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          modulosProvider.overrideWith(() => _ModulosFijos(modulos)),
          incompletosProvider.overrideWith((ref) => Stream.value(const [])),
        ],
        child: MaterialApp(
          // Las pantallas reales necesitan la base; aquí basta saber cuál es.
          home: HomeShell(pantallaDe: (t) => Text('pantalla ${t.name}')),
        ),
      );

  List<String> etiquetas(WidgetTester t) => t
      .widget<NavigationBar>(find.byType(NavigationBar))
      .destinations
      .map((d) => (d as NavigationDestination).label)
      .toList();

  testWidgets('con todo prendido se ven las cinco pestañas', (t) async {
    await t.pumpWidget(montar(ModulosActivos.porDefecto));
    await t.pumpAndSettle();
    expect(etiquetas(t), ['Obras', 'Cotizar', 'Equipo', 'Resumen', 'Config.']);
  });

  testWidgets('sin cotizaciones desaparece "Cotizar" y los índices siguen '
      'apuntando a la pantalla correcta', (t) async {
    await t.pumpWidget(montar(_con(['obras', 'equipo', 'caja'])));
    await t.pumpAndSettle();
    expect(etiquetas(t), ['Obras', 'Equipo', 'Resumen', 'Config.']);

    // La segunda pestaña ahora es Equipo: tocarla debe enseñar Equipo, no
    // la pantalla que antes ocupaba ese índice.
    await t.tap(find.text('Equipo'));
    await t.pumpAndSettle();
    final shell = t.element(find.byType(HomeShell));
    final c = ProviderScope.containerOf(shell);
    expect(c.read(homeTabProvider), HomeTab.equipo);
    expect(
      t.widget<IndexedStack>(find.byType(IndexedStack)).index,
      1,
    );
  });

  testWidgets('si se apaga la pestaña abierta, vuelve a Obras y lo guardado '
      'se corrige', (t) async {
    await t.pumpWidget(montar(ModulosActivos.porDefecto));
    await t.pumpAndSettle();
    await t.tap(find.text('Cotizar'));
    await t.pumpAndSettle();

    final c = ProviderScope.containerOf(t.element(find.byType(HomeShell)));
    expect(c.read(homeTabProvider), HomeTab.cotizar);

    (c.read(modulosProvider.notifier) as _ModulosFijos)
        .poner(_con(['obras', 'equipo']));
    await t.pumpAndSettle();

    expect(find.text('Cotizar'), findsNothing);
    expect(c.read(homeTabProvider), HomeTab.obras);
    expect(t.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 0);
    expect(t.widget<IndexedStack>(find.byType(IndexedStack)).index, 0);
  });

  testWidgets('lo mínimo son tres pestañas: Obras, Resumen y Config.',
      (t) async {
    await t.pumpWidget(montar(_con(['obras'])));
    await t.pumpAndSettle();
    expect(etiquetas(t), ['Obras', 'Resumen', 'Config.']);
  });

  test('pestañas de la obra según módulos', () {
    expect(pestanasObraVisibles(ModulosActivos.porDefecto), PestanaObra.values);
    expect(pestanasObraVisibles(_con(['caja'])), [PestanaObra.caja]);
    expect(pestanasObraVisibles(_con(['equipo'])), [
      PestanaObra.equipo,
      PestanaObra.asistencia,
      PestanaObra.nomina,
    ]);
    expect(pestanasObraVisibles(_con(['obras'])), isEmpty);
  });
}
