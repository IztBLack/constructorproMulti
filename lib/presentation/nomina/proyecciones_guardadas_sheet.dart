import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart' as db;
import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../common/app_snackbar.dart';
import '../common/confirm_dialog.dart';
import 'proyeccion_controller.dart';

const _mesesCortos = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/// La MEMORIA de la pantalla: las proyecciones guardadas con nombre.
///
/// El escenario vivía en memoria y moría con la pantalla; hacer la cuenta antes
/// de ir al banco y querer volver a ella al día siguiente significaba rehacerla.
/// Desde aquí se abre una guardada para consultarla, se edita, se duplica para
/// probar una variante, se renombra, se elimina y se empieza una nueva.
///
/// Abrir para CONSULTAR y abrir para EDITAR son dos acciones distintas a
/// propósito: la mayoría de las veces que se abre una proyección vieja es para
/// mirarla, y un toque accidental sobre una celda no debería cambiar la cuenta
/// que uno ya dio por buena.
Future<void> mostrarProyeccionesGuardadas(BuildContext context) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        builder: (_, scroll) => _Guardadas(scroll: scroll),
      ),
    );

/// Pide un nombre. Devuelve `null` si se canceló.
Future<String?> pedirNombreProyeccion(
  BuildContext context, {
  required String titulo,
  String inicial = '',
  String etiqueta = 'Nombre',
  String accion = 'Guardar',
}) async {
  final ctrl = TextEditingController(text: inicial);
  final nombre = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(titulo),
      content: TextField(
        controller: ctrl,
        autofocus: true,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(
          labelText: etiqueta,
          hintText: 'Simulación 20 de mayo',
        ),
        onSubmitted: (v) => Navigator.pop(ctx, v),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
        FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            child: Text(accion)),
      ],
    ),
  );
  ctrl.dispose();
  final limpio = nombre?.trim();
  return (limpio == null || limpio.isEmpty) ? null : limpio;
}

class _Guardadas extends ConsumerWidget {
  const _Guardadas({required this.scroll});
  final ScrollController scroll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final lista = ref.watch(proyeccionesGuardadasProvider);
    final sesion = ref.watch(sesionProyeccionProvider);
    final tocado = ref.read(proyeccionEstadoProvider.notifier).tocado;

    return ListView(
      controller: scroll,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
      children: [
        Text('Proyecciones guardadas', style: t.titleLarge),
        Text(
          'Se guarda el escenario: quiénes, qué días, sueldos, plazas y ajustes. '
          'La asistencia ya capturada se vuelve a leer al abrir, así que una '
          'proyección vieja siempre enseña el pase de lista corregido.',
          style: t.bodySmall?.copyWith(color: c.textMuted),
        ),
        const SizedBox(height: 14),

        // ── Lo que se está trabajando ────────────────────────────────────
        Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: c.surfaceMuted,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('EN PANTALLA',
                  style: t.labelSmall?.copyWith(
                      color: c.textMuted,
                      fontSize: 10.5,
                      letterSpacing: 0.8,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(
                sesion.tieneArchivo ? sesion.nombre : 'Proyección sin guardar',
                style: t.titleSmall?.copyWith(color: c.textStrong),
              ),
              Text(
                sesion.soloLectura
                    ? 'Abierta solo para consultar.'
                    : tocado
                        ? 'Tiene cambios sin guardar.'
                        : 'Sin cambios pendientes.',
                style: t.bodySmall?.copyWith(
                    color: tocado && !sesion.soloLectura
                        ? c.warning
                        : c.textMuted),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  FilledButton.icon(
                    icon: const Icon(Icons.save_outlined, size: 18),
                    label: Text(sesion.tieneArchivo ? 'Guardar' : 'Guardar…'),
                    onPressed: () => _guardar(context, ref, sesion),
                  ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.save_as_outlined, size: 18),
                    label: const Text('Guardar como…'),
                    onPressed: () => _guardarComo(context, ref, sesion),
                  ),
                  TextButton.icon(
                    icon: const Icon(Icons.note_add_outlined, size: 18),
                    label: const Text('Nueva'),
                    onPressed: () => _nueva(context, ref, tocado),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // ── Las guardadas ────────────────────────────────────────────────
        lista.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 28),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => Text('No se pudieron leer las proyecciones: $e',
              style: t.bodySmall?.copyWith(color: c.danger)),
          data: (filas) => filas.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: Text(
                    'Todavía no guardas ninguna. Arma tu escenario y toca '
                    '«Guardar…»: le pones nombre y vuelves a él cuando quieras.',
                    style: t.bodyMedium?.copyWith(color: c.textMuted),
                  ),
                )
              : Column(
                  children: [
                    for (final fila in filas)
                      _Renglon(fila: fila, abiertaId: sesion.id),
                  ],
                ),
        ),
      ],
    );
  }

  /// El total y las personas que se están enseñando, para la lista. Lo pasa la
  /// pantalla porque la sesión no puede leer la vista sin cerrar un círculo de
  /// dependencias (ver `SesionNotifier.guardar`).
  ({double total, int personas}) _foto(WidgetRef ref) {
    final vista = ref.read(proyeccionVistaProvider);
    return (
      total: vista.redondeada.total.mostrado,
      personas: vista.resultado.personas
    );
  }

  Future<void> _guardar(
      BuildContext context, WidgetRef ref, SesionProyeccion sesion) async {
    final notifier = ref.read(sesionProyeccionProvider.notifier);
    if (sesion.tieneArchivo) {
      await notifier.guardar(foto: _foto(ref));
      if (context.mounted) {
        Navigator.pop(context);
        showAppSnack(context, 'Guardada: ${sesion.nombre}.');
      }
      return;
    }
    final nombre = await pedirNombreProyeccion(context,
        titulo: 'Guardar la proyección',
        inicial: SesionNotifier.nombreSugerido(
            ref.read(proyeccionEstadoProvider).lunesMillis));
    if (nombre == null || !context.mounted) return;
    await notifier.guardar(nombre: nombre, foto: _foto(ref));
    if (context.mounted) {
      Navigator.pop(context);
      showAppSnack(context, 'Guardada: $nombre.');
    }
  }

  Future<void> _guardarComo(
      BuildContext context, WidgetRef ref, SesionProyeccion sesion) async {
    final nombre = await pedirNombreProyeccion(
      context,
      titulo: 'Guardar como',
      inicial: sesion.tieneArchivo
          ? '${sesion.nombre} (variante)'
          : SesionNotifier.nombreSugerido(
              ref.read(proyeccionEstadoProvider).lunesMillis),
      accion: 'Guardar copia',
    );
    if (nombre == null || !context.mounted) return;
    await ref
        .read(sesionProyeccionProvider.notifier)
        .guardarComo(nombre, foto: _foto(ref));
    if (context.mounted) {
      Navigator.pop(context);
      showAppSnack(context, 'Guardada como $nombre. Es la que estás editando.');
    }
  }

  Future<void> _nueva(
      BuildContext context, WidgetRef ref, bool tocado) async {
    // Empezar de cero tira el escenario. Se pregunta por lo mismo que al
    // cambiar de semana: es trabajo capturado a mano.
    if (tocado) {
      final ok = await confirmDialog(
        context,
        title: 'Empezar una proyección nueva',
        message: 'Lo que tienes en pantalla no está guardado y se va a perder. '
            '¿Sigues?',
        actionLabel: 'Empezar de nuevo',
        destructive: false,
      );
      if (!ok || !context.mounted) return;
    }
    ref.read(sesionProyeccionProvider.notifier).nueva();
    if (context.mounted) Navigator.pop(context);
  }
}

class _Renglon extends ConsumerWidget {
  const _Renglon({required this.fila, required this.abiertaId});
  final db.ProyeccionGuardadaRow fila;
  final String? abiertaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final abierta = fila.id == abiertaId;
    final nombreObra = fila.obraFiltro.isEmpty
        ? 'Todas las obras'
        : (ref.read(proyeccionVistaProvider).nombreObra[fila.obraFiltro] ??
            'Una obra');

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        border: Border.all(color: abierta ? c.borderStrong : c.border),
        color: abierta ? c.surfaceMuted : c.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(14, 6, 4, 6),
        title: Row(
          children: [
            Flexible(
              child: Text(fila.nombre,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.bodyLarge?.copyWith(
                      color: c.textStrong, fontWeight: FontWeight.w600)),
            ),
            if (abierta) ...[
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: c.infoSoft,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('abierta',
                    style: t.bodySmall?.copyWith(
                        color: c.info,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600)),
              ),
            ],
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${_semana(fila.lunesMillis)} · $nombreObra',
                style: t.bodySmall?.copyWith(color: c.textMuted)),
            // La cifra se marca como «al guardar»: es una foto, y el número de
            // verdad se recalcula al abrir con la asistencia que haya hoy.
            Text(
              '${fila.personasSnapshot} personas · '
              '${Fmt.money(fila.totalSnapshot)} al guardar',
              style: t.bodySmall?.copyWith(color: c.textMuted),
            ),
          ],
        ),
        onTap: () => _abrir(context, ref, soloLectura: true),
        trailing: PopupMenuButton<String>(
          tooltip: 'Opciones',
          onSelected: (v) => switch (v) {
            'ver' => _abrir(context, ref, soloLectura: true),
            'editar' => _abrir(context, ref, soloLectura: false),
            'duplicar' => _duplicar(context, ref),
            'renombrar' => _renombrar(context, ref),
            'eliminar' => _eliminar(context, ref),
            _ => null,
          },
          itemBuilder: (_) => const [
            PopupMenuItem(
                value: 'ver',
                child: ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.visibility_outlined, size: 20),
                    title: Text('Ver sin editar'))),
            PopupMenuItem(
                value: 'editar',
                child: ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.edit_outlined, size: 20),
                    title: Text('Editar'))),
            PopupMenuItem(
                value: 'duplicar',
                child: ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.copy_outlined, size: 20),
                    title: Text('Duplicar'))),
            PopupMenuItem(
                value: 'renombrar',
                child: ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.drive_file_rename_outline, size: 20),
                    title: Text('Renombrar'))),
            PopupMenuDivider(),
            PopupMenuItem(
                value: 'eliminar',
                child: ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.delete_outline, size: 20),
                    title: Text('Eliminar'))),
          ],
        ),
      ),
    );
  }

  static String _semana(int lunesMillis) {
    final lunes = DateTime.fromMillisecondsSinceEpoch(lunesMillis);
    final domingo = lunes.add(const Duration(days: 6));
    final mesL = _mesesCortos[lunes.month - 1];
    final mesD = _mesesCortos[domingo.month - 1];
    return lunes.month == domingo.month
        ? 'Sem ${lunes.day}–${domingo.day} $mesL'
        : 'Sem ${lunes.day} $mesL – ${domingo.day} $mesD';
  }

  Future<void> _abrir(BuildContext context, WidgetRef ref,
      {required bool soloLectura}) async {
    final notifier = ref.read(sesionProyeccionProvider.notifier);
    final tocado = ref.read(proyeccionEstadoProvider.notifier).tocado;
    final sesion = ref.read(sesionProyeccionProvider);

    // Abrir otra pisa lo que hay en pantalla. Si ese trabajo no está guardado,
    // se pregunta — igual que al cambiar de semana.
    if (tocado && !sesion.soloLectura) {
      final ok = await confirmDialog(
        context,
        title: 'Abrir «${fila.nombre}»',
        message: 'Lo que tienes en pantalla no está guardado y se va a perder. '
            '¿Sigues?',
        actionLabel: 'Abrir de todos modos',
        destructive: false,
      );
      if (!ok || !context.mounted) return;
    }

    final abrio = notifier.abrir(fila, soloLectura: soloLectura);
    if (!context.mounted) return;
    Navigator.pop(context);
    if (!abrio) {
      showAppSnack(
        context,
        'No se pudo abrir «${fila.nombre}»: se guardó con una versión más '
        'nueva de la app.',
      );
    }
  }

  Future<void> _duplicar(BuildContext context, WidgetRef ref) async {
    final nombre = await pedirNombreProyeccion(
      context,
      titulo: 'Duplicar proyección',
      inicial: '${fila.nombre} (copia)',
      accion: 'Duplicar',
    );
    if (nombre == null || !context.mounted) return;
    await ref
        .read(sesionProyeccionProvider.notifier)
        .duplicar(fila.id, nombre: nombre);
    if (context.mounted) showAppSnack(context, 'Se creó «$nombre».');
  }

  Future<void> _renombrar(BuildContext context, WidgetRef ref) async {
    final nombre = await pedirNombreProyeccion(
      context,
      titulo: 'Renombrar proyección',
      inicial: fila.nombre,
      accion: 'Renombrar',
    );
    if (nombre == null || !context.mounted) return;
    await ref.read(sesionProyeccionProvider.notifier).renombrar(fila.id, nombre);
  }

  Future<void> _eliminar(BuildContext context, WidgetRef ref) async {
    final ok = await confirmDialog(
      context,
      title: 'Eliminar «${fila.nombre}»',
      message: 'Se quita de la lista. Podrás deshacerlo en el aviso que sale '
          'enseguida.',
    );
    if (!ok || !context.mounted) return;

    final notifier = ref.read(sesionProyeccionProvider.notifier);
    await notifier.eliminar(fila.id);
    if (!context.mounted) return;
    showAppSnack(
      context,
      '«${fila.nombre}» eliminada.',
      onUndo: () => notifier.restaurar(fila.id),
    );
  }
}
