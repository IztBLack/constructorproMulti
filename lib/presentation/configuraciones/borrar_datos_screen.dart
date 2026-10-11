import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/sync/cloud_providers.dart';
import '../../core/sync/sync_status.dart';
import '../../core/theme/app_colors.dart';
import '../../data/maintenance_repository.dart';
import '../../data/providers.dart';
import '../common/app_badge.dart';
import '../common/lista_agrupada.dart';

/// Ajustes → Borrar datos del teléfono.
///
/// Antes eran cinco filas rojas al final de Configuración, a un toque de
/// distancia del resto. Ahora viven aquí, detrás de UNA fila (regla de
/// `docs/DISENO_MOVIL.md`: una sola fila roja por pantalla). Cada acción sigue
/// pidiendo escribir la palabra para confirmar.
class BorrarDatosScreen extends ConsumerWidget {
  const BorrarDatosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    // Se lee al confirmar, no al construir: abrir la pantalla no toca la base.
    MaintenanceRepository mantenimiento() =>
        ref.read(maintenanceRepositoryProvider);
    // El contenedor de la app, tomado ahora: la acción corre después de un
    // diálogo, cuando este `context` ya podría no existir.
    final app = ProviderScope.containerOf(context, listen: false);

    // Qué se pierde de verdad: el borrado es directo en el teléfono, así que
    // lo que no ha subido no tiene otra copia.
    final conSesion = ref.watch(currentUserProvider) != null;
    final s = ref.watch(syncStatusProvider);
    final sinSubir = s.pendientes + s.errores + s.conflictos;
    final aviso = !conSesion
        ? 'Sin cuenta conectada, nada de esto tiene copia en la nube: lo que '
              'borres se pierde. No se puede deshacer.'
        : 'Esto borra solo lo que hay en este teléfono y no se puede '
              'deshacer. Lo que ya está en la nube no se borra.'
              '${sinSubir > 0 ? ' Ojo: tienes $sinSubir cambio(s) que todavía '
                        'no suben; esos sí se perderían.' : ''}';

    return Scaffold(
      appBar: AppBar(title: const Text('Borrar datos del teléfono')),
      body: LayoutBuilder(
        builder: (context, caja) => ListView(
          padding: margenesDeLista(context, caja.maxWidth),
          children: [
            Text(
              aviso,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: 24),
            GrupoLista(
              children: [
                _fila(
                  context,
                  Icons.apartment_outlined,
                  'Borrar todas las obras',
                  'BORRAR',
                  'Borrar obras',
                  () => mantenimiento().deleteAllObras(),
                ),
                _fila(
                  context,
                  Icons.groups_outlined,
                  'Borrar todos los colaboradores',
                  'BORRAR',
                  'Borrar colaboradores',
                  () => mantenimiento().deleteAllColaboradores(),
                ),
                _fila(
                  context,
                  Icons.request_quote_outlined,
                  'Borrar todas las cotizaciones',
                  'BORRAR',
                  'Borrar cotizaciones',
                  () => mantenimiento().deleteAllCotizaciones(),
                ),
                _fila(
                  context,
                  Icons.menu_book_outlined,
                  'Vaciar el catálogo de conceptos',
                  'VACIAR',
                  'Vaciar catálogo',
                  () => mantenimiento().vaciarCatalogo(),
                ),
              ],
            ),
            const SizedBox(height: 24),
            GrupoLista(
              children: [
                _fila(
                  context,
                  Icons.restart_alt,
                  'Dejar el teléfono como nuevo',
                  'RESTABLECER',
                  'Dejar como nuevo',
                  // La misma rutina que "Rehacer la copia": base, fotos,
                  // avisos, cachés y los cursores PRIMERO. Con sesión, el
                  // siguiente sync vuelve a bajar todo de la nube; sin
                  // sesión, el teléfono queda de fábrica.
                  () => vaciarCopiaLocal(app, otraEmpresa: false),
                  subtitulo:
                      'Borra todo. Con cuenta, vuelve a bajar lo de '
                      'la nube.',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _fila(
    BuildContext context,
    IconData icono,
    String titulo,
    String palabra,
    String boton,
    Future<void> Function() accion, {
    String? subtitulo,
  }) {
    return FilaLista(
      icono: icono,
      tono: BadgeTone.danger,
      peligro: true,
      titulo: titulo,
      subtitulo: subtitulo,
      onTap: () => _confirmar(context, titulo, palabra, boton, accion),
    );
  }

  Future<void> _confirmar(
    BuildContext context,
    String titulo,
    String palabra,
    String boton,
    Future<void> Function() accion,
  ) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(titulo),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('No se puede deshacer.\nEscribe "$palabra" para confirmar.'),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              decoration: InputDecoration(hintText: palabra),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: context.colores.danger,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(boton),
          ),
        ],
      ),
    );
    // Sin `dispose` aquí: el diálogo sigue en pantalla durante su animación
    // de salida y su campo todavía usa el controlador.
    final escrito = ctrl.text.trim().toUpperCase();
    if (ok != true) return;
    if (escrito != palabra) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('La palabra no coincide. No se borró nada.'),
          ),
        );
      }
      return;
    }
    try {
      await accion();
    } catch (e) {
      debugPrint('[BorrarDatosScreen] $titulo: $e');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'No se pudo borrar. Intenta de nuevo; no se perdió '
              'nada más.',
            ),
          ),
        );
      }
      return;
    }
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$titulo: hecho.')));
    }
  }
}
