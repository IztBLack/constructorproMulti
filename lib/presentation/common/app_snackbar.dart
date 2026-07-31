import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// Intención del aviso. Cambia el ícono y su color, nunca el fondo: el fondo
/// invertido del tema ya garantiza contraste, y teñirlo de rojo entero volvería
/// ilegible el texto en uno de los dos temas.
enum SnackTone { neutral, success, danger, warning }

/// Muestra un aviso breve al pie de la pantalla.
///
/// Reemplaza al `ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:
/// Text(msg)))` repetido ~45 veces en la app, y agrega lo que a ese patrón le
/// faltaba:
///
///   · **Deshacer.** Un borrado sin vuelta atrás obliga a preguntar "¿seguro?"
///     antes de cada acción; con deshacer, la acción puede ser inmediata y el
///     usuario conserva el control (regla `undo-support`). Reserva el diálogo de
///     confirmación para lo verdaderamente irreversible, como borrar una obra
///     con todo su historial.
///   · **Ícono de intención**, para no depender solo del texto.
///   · **Descarta el aviso anterior** antes de encolar el nuevo: sin esto, dos
///     acciones seguidas dejan al usuario esperando a que pase el primer aviso.
///
/// Devuelve el controlador del `SnackBar` por si quien llama necesita esperar a
/// que se cierre (p. ej. para confirmar el borrado solo si NO hubo deshacer).
ScaffoldFeatureController<SnackBar, SnackBarClosedReason> showAppSnack(
  BuildContext context,
  String mensaje, {
  SnackTone tone = SnackTone.neutral,
  String? undoLabel,
  VoidCallback? onUndo,
  Duration duracion = const Duration(seconds: 4),
}) {
  final c = context.colores;
  final messenger = ScaffoldMessenger.of(context);

  final (IconData? icono, Color? colorIcono) = switch (tone) {
    SnackTone.neutral => (null, null),
    SnackTone.success => (Icons.check_circle_outline, c.success),
    SnackTone.danger => (Icons.error_outline, c.danger),
    SnackTone.warning => (Icons.warning_amber_outlined, c.warning),
  };

  messenger.hideCurrentSnackBar();
  return messenger.showSnackBar(
    SnackBar(
      duration: duracion,
      content: Row(
        children: [
          if (icono != null) ...[
            Icon(icono, size: 20, color: colorIcono),
            const SizedBox(width: 10),
          ],
          Expanded(child: Text(mensaje)),
        ],
      ),
      action: (onUndo != null)
          ? SnackBarAction(
              label: undoLabel ?? 'Deshacer',
              onPressed: onUndo,
            )
          : null,
    ),
  );
}
