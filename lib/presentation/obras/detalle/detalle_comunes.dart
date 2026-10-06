/// Piezas mínimas que comparten VARIAS pestañas del detalle de obra.
///
/// Están aquí y no duplicadas en cada pestaña porque al partir la pantalla
/// grande estos dos helpers quedaron con más de un dueño: la inicial del avatar
/// la usan Equipo y la hoja de asignar, y el confirmar genérico lo usan
/// Equipo (desvincular) y Nómina (registrar en caja).
///
/// Todo lo público de `presentation/obras/detalle/` es público SOLO para los
/// archivos de esta carpeta: nada de aquí se exporta fuera de
/// `presentation/obras/`.
library;

import 'package:flutter/material.dart';

/// Inicial en mayúscula para el avatar de un colaborador.
String inicialDe(String n) => n.isNotEmpty ? n[0].toUpperCase() : '?';

/// Confirmación genérica «Cancelar / [accion]». Distinta de `confirmDialog`
/// del sistema común: aquella marca la acción como destructiva y avisa de la
/// irreversibilidad; ésta es el freno suave que ya usaban estas dos acciones.
Future<bool> confirmarAccion(
    BuildContext context, String msg, String accion) async {
  return await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Confirmar'),
          content: Text(msg),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancelar')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true), child: Text(accion)),
          ],
        ),
      ) ??
      false;
}
