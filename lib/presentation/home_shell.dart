import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/providers.dart';
import 'colaboradores/colaboradores_screen.dart';
import 'configuraciones/config_screen.dart';
import 'cotizaciones/cotizaciones_screen.dart';
import 'obras/obras_screen.dart';
import 'resumen/resumen_screen.dart';

/// Shell principal con navegación inferior (Material 3).
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key});

  static const _screens = [
    ObrasScreen(),
    CotizacionesScreen(),
    ColaboradoresScreen(),
    ResumenScreen(),
    ConfigScreen(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
