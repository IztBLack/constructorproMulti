import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/crash/crash_logger.dart';
import '../../core/settings/settings_provider.dart';
import '../../data/demo_data.dart';
import '../../data/providers.dart';
import 'puestos_screen.dart';

class ConfigScreen extends ConsumerWidget {
  const ConfigScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Configuración')),
      body: ListView(
        children: [
          const _Header('Apariencia'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SegmentedButton<ThemeMode>(
              segments: const [
                ButtonSegment(value: ThemeMode.system, label: Text('Auto'), icon: Icon(Icons.brightness_auto)),
                ButtonSegment(value: ThemeMode.light, label: Text('Claro'), icon: Icon(Icons.light_mode)),
                ButtonSegment(value: ThemeMode.dark, label: Text('Oscuro'), icon: Icon(Icons.dark_mode)),
              ],
              selected: {themeMode},
              onSelectionChanged: (s) =>
                  ref.read(themeModeProvider.notifier).set(s.first),
            ),
          ),
          const Divider(),
          const _Header('Catálogos'),
          ListTile(
            leading: const Icon(Icons.badge_outlined),
            title: const Text('Puestos y salarios'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PuestosScreen())),
          ),
          const Divider(),
          const _Header('Datos'),
          ListTile(
            leading: const Icon(Icons.science_outlined),
            title: const Text('Cargar datos de prueba'),
            subtitle: const Text('Llena la app con una obra de ejemplo'),
            onTap: () => _cargarDemo(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.upload_file),
            title: const Text('Exportar respaldo (JSON)'),
            onTap: () => _exportarRespaldo(context, ref),
          ),
          const Divider(),
          const _Header('Soporte'),
          ListTile(
            leading: const Icon(Icons.bug_report_outlined),
            title: const Text('Compartir reporte de errores'),
            onTap: () => _compartirCrash(context),
          ),
        ],
      ),
    );
  }

  Future<void> _cargarDemo(BuildContext context, WidgetRef ref) async {
    final creado = await DemoData.generar(ref.read(databaseProvider));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(creado
          ? 'Datos de prueba cargados.'
          : 'Ya hay datos; no se cargaron ejemplos.'),
    ));
  }

  Future<void> _exportarRespaldo(BuildContext context, WidgetRef ref) async {
    try {
      final json = await ref.read(backupServiceProvider).exportToJson();
      final dir = await getTemporaryDirectory();
      final file = File(p.join(dir.path, 'RespaldoConstructorPro.json'));
      await file.writeAsString(json);
      await SharePlus.instance.share(ShareParams(
        files: [XFile(file.path)],
        text: 'Respaldo ConstructorPro',
      ));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error al exportar: $e')));
      }
    }
  }

  Future<void> _compartirCrash(BuildContext context) async {
    final logs = await CrashLogger.getLogs();
    if (!context.mounted) return;
    if (logs.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('No hay reportes de error. La app no ha fallado.')));
      return;
    }
    await SharePlus.instance.share(ShareParams(
      files: [XFile(logs.first.path)],
      text: 'Reporte de error ConstructorPro',
    ));
  }
}

class _Header extends StatelessWidget {
  final String text;
  const _Header(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Text(text,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.bold)),
      );
}
