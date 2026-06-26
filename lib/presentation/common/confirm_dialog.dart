import 'package:flutter/material.dart';

/// Diálogo de confirmación reutilizable. Cuando [destructive] es true, el botón
/// de acción usa el color de error del tema para diferenciar visualmente las
/// acciones irreversibles (borrar una obra completa) de las menores.
///
/// Devuelve `true` si el usuario confirma, `false` si cancela o descarta.
Future<bool> confirmDialog(
  BuildContext context, {
  required String message,
  String actionLabel = 'Eliminar',
  String title = 'Confirmar',
  bool destructive = true,
}) async {
  final cs = Theme.of(context).colorScheme;
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          style: destructive
              ? FilledButton.styleFrom(
                  backgroundColor: cs.error,
                  foregroundColor: cs.onError,
                )
              : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(actionLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}
