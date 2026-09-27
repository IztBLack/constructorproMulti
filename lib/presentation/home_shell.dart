import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/modulos/modulos.dart';
import '../core/modulos/modulos_provider.dart';
import '../core/settings/settings_provider.dart';
import '../data/providers.dart';
import 'colaboradores/colaboradores_screen.dart';
import 'configuraciones/config_screen.dart';
import 'cotizaciones/cotizaciones_screen.dart';
import 'common/aviso_incompletos.dart';
import 'obras/obras_screen.dart';
import 'onboarding/tutorial_screen.dart';
import 'resumen/resumen_screen.dart';

/// Módulo del que depende cada pestaña. `null` = siempre visible: Obras es el
/// núcleo, y Resumen y Configuración son de la app, no de un módulo (cada
/// sección de adentro se oculta por su cuenta).
ClaveModulo? moduloDePestana(HomeTab t) => switch (t) {
  HomeTab.cotizar => ClaveModulo.cotizaciones,
  HomeTab.equipo => ClaveModulo.equipo,
  HomeTab.obras || HomeTab.resumen || HomeTab.config => null,
};

/// Pestañas que se dibujan con estos módulos, en su orden. Nunca menos de tres
/// (Obras, Resumen, Config.), así la `NavigationBar` siempre es válida.
List<HomeTab> pestanasVisibles(ModulosActivos modulos) => HomeTab.values
    .where(
      (t) => moduloDePestana(t) == null || modulos.usa(moduloDePestana(t)!),
    )
    .toList();

/// Shell principal con navegación inferior (Material 3).
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key, @visibleForTesting this.pantallaDe});

  /// Solo para pruebas: sustituye las pantallas reales (que necesitan la base)
  /// por lo que devuelva. En la app es null.
  final Widget Function(HomeTab)? pantallaDe;

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  @override
  void initState() {
    super.initState();
    // En el primer arranque (tutorial no visto), mostrarlo tras el primer frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!ref.read(tutorialVistoProvider)) {
        Navigator.of(context).push(
          MaterialPageRoute(
            fullscreenDialog: true,
            builder: (_) => const TutorialScreen(),
          ),
        );
      }
    });
  }

  Widget _pantalla(HomeTab t) =>
      widget.pantallaDe?.call(t) ??
      switch (t) {
        HomeTab.obras => const ObrasScreen(),
        HomeTab.cotizar => const CotizacionesScreen(),
        HomeTab.equipo => const ColaboradoresScreen(),
        HomeTab.resumen => const ResumenScreen(),
        HomeTab.config => const ConfigScreen(),
      };

  static NavigationDestination _destino(HomeTab t) => switch (t) {
    HomeTab.obras => const NavigationDestination(
      icon: Icon(Icons.foundation_outlined),
      selectedIcon: Icon(Icons.foundation),
      label: 'Obras',
    ),
    HomeTab.cotizar => const NavigationDestination(
      icon: Icon(Icons.description_outlined),
      selectedIcon: Icon(Icons.description),
      label: 'Cotizar',
    ),
    HomeTab.equipo => const NavigationDestination(
      icon: Icon(Icons.people_outline),
      selectedIcon: Icon(Icons.people),
      label: 'Equipo',
    ),
    HomeTab.resumen => const NavigationDestination(
      icon: Icon(Icons.insights_outlined),
      selectedIcon: Icon(Icons.insights),
      label: 'Resumen',
    ),
    HomeTab.config => const NavigationDestination(
      icon: Icon(Icons.settings_outlined),
      selectedIcon: Icon(Icons.settings),
      label: 'Config.',
    ),
  };

  @override
  Widget build(BuildContext context) {
    final modulos = ref.watch(modulosProvider);
    final visibles = pestanasVisibles(modulos);
    final seleccion = ref.watch(homeTabProvider);
    var index = visibles.indexOf(seleccion);
    if (index < 0) {
      // La pestaña elegida se apagó (el admin la quitó en la web mientras la
      // app estaba abierta). Se enseña Obras y se CORRIGE lo guardado tras el
      // frame (no se puede escribir un provider a media construcción): si no,
      // el día que el módulo vuelva, la app saltaría sola a esa pestaña.
      index = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final n = ref.read(homeTabProvider.notifier);
        if (!visibles.contains(n.state)) n.state = visibles.first;
      });
    }

    return Scaffold(
      // El aviso va FUERA del IndexedStack para que se vea en todas las
      // pestañas: el pendiente es del negocio, no de una pantalla. Es de gente,
      // así que se va con el módulo de equipo.
      body: Column(
        children: [
          if (modulos.usa(ClaveModulo.equipo)) const AvisoIncompletos(),
          Expanded(
            child: IndexedStack(
              index: index,
              // La llave por pestaña conserva el estado de cada pantalla (scroll,
              // búsqueda) cuando otra desaparece y los índices se recorren.
              children: [
                for (final t in visibles)
                  KeyedSubtree(key: ValueKey(t), child: _pantalla(t)),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) =>
            ref.read(homeTabProvider.notifier).state = visibles[i],
        destinations: [for (final t in visibles) _destino(t)],
      ),
    );
  }
}
