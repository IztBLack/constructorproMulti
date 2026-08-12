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
import '../onboarding/tutorial_screen.dart';
import 'catalogo_screen.dart';
import '../common/sync_status_action.dart';
import 'cloud_sync_screen.dart';
import 'pdf_config_screen.dart';
import 'puestos_screen.dart';

class ConfigScreen extends ConsumerWidget {
  const ConfigScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Configuración'),
        actions: const [SyncStatusAction()],
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: 4, bottom: 28),
        children: [
          _Seccion(
            titulo: 'Apariencia',
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
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
            ],
          ),
          _Seccion(
            titulo: 'Recordatorios',
            children: [_reminderTiles(context, ref)],
          ),
          _Seccion(
            titulo: 'Catálogos',
            children: [
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
                // Cada cotización congela su tasa al crearse; cambiar este valor
                // solo afecta a las que se creen de aquí en adelante.
                subtitle: Text(
                    '${ref.watch(ivaPorcentajeProvider).toStringAsFixed(0)}% · no recalcula cotizaciones existentes'),
                onTap: () => _editarIva(context, ref),
              ),
            ],
          ),
          _Seccion(
            titulo: 'Nube',
            children: [
              ListTile(
                leading: const Icon(Icons.cloud_sync_outlined),
                title: const Text('Sincronización en la nube'),
                subtitle: const Text('Conecta tu cuenta para sincronizar con la web'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const CloudSyncScreen())),
              ),
            ],
          ),
          _Seccion(
            titulo: 'Datos',
            children: [
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
            ],
          ),
          _Seccion(
            titulo: 'Soporte',
            children: [
              ListTile(
                leading: const Icon(Icons.school_outlined),
                title: const Text('Ver tutorial de uso'),
                subtitle: const Text('Repasa cómo funciona cada módulo'),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  fullscreenDialog: true,
                  builder: (_) => const TutorialScreen(),
                )),
              ),
              ListTile(
                leading: const Icon(Icons.bug_report_outlined),
                title: const Text('Compartir reporte de errores'),
                onTap: () => _compartirCrash(context),
              ),
            ],
          ),
          _Seccion(
            titulo: 'Zona de peligro',
            peligro: true,
            children: [
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
            ],
          ),
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
    final actual = ref.read(ivaPorcentajeProvider);
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
      await ref.read(ivaPorcentajeProvider.notifier).set(v);
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
      // ZIP completo: datos + archivos adjuntos (fotos/planos).
      final bytes = await ref.read(backupServiceProvider).exportToZipBytes();
      final dir = await getTemporaryDirectory();
      final file = File(p.join(dir.path, 'RespaldoConstructorPro.zip'));
      await file.writeAsBytes(bytes);
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
      allowedExtensions: ['zip', 'json'],
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
      final ruta = result.files.single.path!;
      final svc = ref.read(backupServiceProvider);
      // ZIP (nuevo, con archivos) o JSON suelto (respaldos viejos / app Kotlin).
      if (ruta.toLowerCase().endsWith('.zip')) {
        await svc.importFromZipBytes(await File(ruta).readAsBytes());
      } else {
        await svc.importFromJson(await File(ruta).readAsString());
      }
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

/// Sección de ajustes: un título tenue + una tarjeta con las filas dentro. Sube
/// la config del móvil al mismo lenguaje visual que la web (grupos en tarjetas)
/// en vez de una lista plana partida por divisores. Las filas se separan con un
/// divisor sangrado DENTRO de la tarjeta, no a todo lo ancho de la pantalla.
class _Seccion extends StatelessWidget {
  const _Seccion({
    required this.titulo,
    required this.children,
    this.peligro = false,
  });

  final String titulo;
  final List<Widget> children;
  final bool peligro;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final acento = peligro ? scheme.error : scheme.onSurfaceVariant;

    // Divisor sangrado entre filas (no después de la última).
    final filas = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) filas.add(const Divider(height: 1, indent: 16, endIndent: 16));
      filas.add(children[i]);
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
            child: Text(
              titulo.toUpperCase(),
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: acento,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                  ),
            ),
          ),
          Card(
            margin: EdgeInsets.zero,
            clipBehavior: Clip.antiAlias,
            // La zona de peligro se delinea en rojo tenue para distinguirla sin
            // gritar; el resto usa el contorno neutro del tema.
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                color: peligro
                    ? scheme.error.withValues(alpha: 0.4)
                    : scheme.outlineVariant,
              ),
            ),
            child: Column(children: filas),
          ),
        ],
      ),
    );
  }
}
