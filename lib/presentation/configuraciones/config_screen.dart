import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/crash/crash_logger.dart';
import '../../core/settings/settings_provider.dart';
import '../../data/demo_data.dart';
import '../../data/providers.dart';
import 'catalogo_screen.dart';
import 'pdf_config_screen.dart';
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
          const _Header('Recordatorios'),
          _reminderTiles(context, ref),
          const Divider(),
          const _Header('Catálogos'),
          ListTile(
            leading: const Icon(Icons.badge_outlined),
            title: const Text('Puestos y salarios'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PuestosScreen())),
          ),
          ListTile(
            leading: const Icon(Icons.menu_book_outlined),
            title: const Text('Catálogo de conceptos'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const CatalogoScreen())),
          ),
          ListTile(
            leading: const Icon(Icons.picture_as_pdf_outlined),
            title: const Text('Personalizar PDF'),
            subtitle: const Text('Logo, color, marca de agua, empresa'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PdfConfigScreen())),
          ),
          ListTile(
            leading: const Icon(Icons.percent),
            title: const Text('IVA por defecto'),
            subtitle: Text('${(ref.watch(ivaPorcentajeProvider).asData?.value ?? 16).toStringAsFixed(0)}%'),
            onTap: () => _editarIva(context, ref),
          ),
          const Divider(),
          const _Header('Datos'),
          ListTile(
            leading: const Icon(Icons.science_outlined),
            title: const Text('Cargar datos de prueba'),
            subtitle: const Text('Reemplaza con un demo completo (4 obras, equipo, cotizaciones)'),
            onTap: () => _cargarDemo(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.upload_file),
            title: const Text('Exportar respaldo (JSON)'),
            onTap: () => _exportarRespaldo(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.restore_page_outlined),
            title: const Text('Restaurar respaldo (JSON)'),
            subtitle: const Text('Reemplaza TODOS los datos actuales'),
            onTap: () => _importarRespaldo(context, ref),
          ),
          const Divider(),
          const _Header('Soporte'),
          ListTile(
            leading: const Icon(Icons.bug_report_outlined),
            title: const Text('Compartir reporte de errores'),
            onTap: () => _compartirCrash(context),
          ),
          const Divider(),
          _Header('Zona de peligro', color: Theme.of(context).colorScheme.error),
          _danger(context, ref, 'Eliminar todas las obras', 'ELIMINAR',
              () => ref.read(maintenanceRepositoryProvider).deleteAllObras()),
          _danger(context, ref, 'Eliminar todos los colaboradores', 'ELIMINAR',
              () => ref.read(maintenanceRepositoryProvider).deleteAllColaboradores()),
          _danger(context, ref, 'Eliminar todas las cotizaciones', 'ELIMINAR',
              () => ref.read(maintenanceRepositoryProvider).deleteAllCotizaciones()),
          _danger(context, ref, 'Vaciar catálogo de conceptos', 'VACIAR',
              () => ref.read(maintenanceRepositoryProvider).vaciarCatalogo()),
          _danger(context, ref, 'Restablecer TODO', 'RESTABLECER',
              () => ref.read(maintenanceRepositoryProvider).restablecerTodo()),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _danger(BuildContext context, WidgetRef ref, String titulo,
      String palabra, Future<void> Function() accion) {
    final error = Theme.of(context).colorScheme.error;
    return ListTile(
      leading: Icon(Icons.warning_amber_outlined, color: error),
      title: Text(titulo, style: TextStyle(color: error)),
      onTap: () => _dangerConfirm(context, titulo, palabra, accion),
    );
  }

  Future<void> _dangerConfirm(BuildContext context, String titulo,
      String palabra, Future<void> Function() accion) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(titulo),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Esta acción es IRREVERSIBLE.\nEscribe "$palabra" para confirmar.'),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            autofocus: true,
            decoration: InputDecoration(hintText: palabra),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirmar')),
        ],
      ),
    );
    if (ok != true) return;
    if (ctrl.text.trim().toUpperCase() != palabra) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('La palabra no coincide. Cancelado.')));
      }
      return;
    }
    await accion();
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$titulo: hecho.')));
    }
  }

  static const _dias = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  Widget _reminderTiles(BuildContext context, WidgetRef ref) {
    final rem = ref.watch(reminderProvider);
    return Column(children: [
      SwitchListTile(
        secondary: const Icon(Icons.notifications_active_outlined),
        title: const Text('Recordatorio semanal de nómina'),
        value: rem.enabled,
        onChanged: (v) async {
          final ok = await ref.read(reminderProvider.notifier).setEnabled(v);
          if (!ok && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Permiso de notificaciones denegado.')));
          }
        },
      ),
      ListTile(
        enabled: rem.enabled,
        leading: const Icon(Icons.schedule),
        title: const Text('Día y hora'),
        subtitle: Text('${_dias[rem.weekday]} a las ${rem.hour.toString().padLeft(2, '0')}:00'),
        onTap: () => _programar(context, ref, rem.weekday, rem.hour),
      ),
    ]);
  }

  Future<void> _programar(BuildContext context, WidgetRef ref, int weekday, int hour) async {
    final dia = await showDialog<int>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Día del recordatorio'),
        children: List.generate(7, (i) => i + 1)
            .map((d) => SimpleDialogOption(
                  onPressed: () => Navigator.pop(ctx, d),
                  child: Text(_dias[d]),
                ))
            .toList(),
      ),
    );
    if (dia == null || !context.mounted) return;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: hour, minute: 0),
    );
    if (t == null) return;
    await ref.read(reminderProvider.notifier).setSchedule(dia, t.hour);
  }

  Future<void> _editarIva(BuildContext context, WidgetRef ref) async {
    final actual = ref.read(ivaPorcentajeProvider).asData?.value ?? 16.0;
    final ctrl = TextEditingController(text: actual.toStringAsFixed(0));
    final v = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('IVA por defecto'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'Porcentaje', suffixText: '%'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, double.tryParse(ctrl.text.trim())),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    if (v != null) {
      await setIvaPorcentaje(v);
      ref.invalidate(ivaPorcentajeProvider);
    }
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
      await Share.shareXFiles([XFile(file.path)], text: 'Respaldo ConstructorPro');
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error al exportar: $e')));
      }
    }
  }

  Future<void> _importarRespaldo(BuildContext context, WidgetRef ref) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json'],
    );
    if (result == null || result.files.single.path == null) return;
    if (!context.mounted) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Restaurar respaldo'),
        content: const Text(
            'Esto REEMPLAZA todos los datos actuales por los del respaldo. '
            '¿Continuar?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Restaurar')),
        ],
      ),
    );
    if (ok != true) return;

    try {
      final json = await File(result.files.single.path!).readAsString();
      await ref.read(backupServiceProvider).importFromJson(json);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Respaldo restaurado correctamente.')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error al restaurar: $e')));
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
    await Share.shareXFiles([XFile(logs.first.path)],
        text: 'Reporte de error ConstructorPro');
  }
}

class _Header extends StatelessWidget {
  final String text;
  final Color? color;
  const _Header(this.text, {this.color});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Text(text,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: color ?? Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.bold)),
      );
}
