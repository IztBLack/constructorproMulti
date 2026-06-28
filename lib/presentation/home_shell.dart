import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/settings/settings_provider.dart';
import '../data/providers.dart';
import 'colaboradores/colaboradores_screen.dart';
import 'configuraciones/config_screen.dart';
import 'cotizaciones/cotizaciones_screen.dart';
import 'obras/obras_screen.dart';
import 'onboarding/tutorial_screen.dart';
import 'resumen/resumen_screen.dart';

/// Shell principal con navegación inferior (Material 3).
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  static const _screens = [
    ObrasScreen(),
    CotizacionesScreen(),
    ColaboradoresScreen(),
    ResumenScreen(),
    ConfigScreen(),
  ];

  @override
  void initState() {
    super.initState();
    // En el primer arranque (tutorial no visto), mostrarlo tras el primer frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!ref.read(tutorialVistoProvider)) {
        Navigator.of(context).push(MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => const TutorialScreen(),
        ));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final index = ref.watch(homeTabProvider);
    return Scaffold(
      body: IndexedStack(index: index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => ref.read(homeTabProvider.notifier).state = i,
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.foundation_outlined),
              selectedIcon: Icon(Icons.foundation),
              label: 'Obras'),
          NavigationDestination(
              icon: Icon(Icons.description_outlined),
              selectedIcon: Icon(Icons.description),
              label: 'Cotizar'),
          NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people),
              label: 'Equipo'),
          NavigationDestination(
              icon: Icon(Icons.insights_outlined),
              selectedIcon: Icon(Icons.insights),
              label: 'Resumen'),
          NavigationDestination(
              icon: Icon(Icons.settings_outlined),
              selectedIcon: Icon(Icons.settings),
              label: 'Config.'),
        ],
      ),
    );
  }
}
