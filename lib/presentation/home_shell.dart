import 'package:flutter/material.dart';

import 'colaboradores/colaboradores_screen.dart';
import 'configuraciones/puestos_screen.dart';
import 'obras/obras_screen.dart';

/// Shell principal con navegación inferior (Material 3).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _screens = [
    ObrasScreen(),
    ColaboradoresScreen(),
    PuestosScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.foundation_outlined),
              selectedIcon: Icon(Icons.foundation),
              label: 'Obras'),
          NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people),
              label: 'Equipo'),
          NavigationDestination(
              icon: Icon(Icons.settings_outlined),
              selectedIcon: Icon(Icons.settings),
              label: 'Config.'),
        ],
      ),
    );
  }
}
