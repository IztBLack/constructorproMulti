import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import 'app_spacing.dart';

/// Vista de error reutilizable: muestra un mensaje amable (sin exponer el
/// stacktrace de Drift) y un botón "Reintentar" cuando se provee [onRetry].
///
/// Reemplaza el patrón `error: (e, _) => Center(child: Text('Error: $e'))`
/// repetido en las pantallas que consumen AsyncValue.
class ErrorStateView extends StatelessWidget {
  const ErrorStateView({
    super.key,
    // El dato no se perdió: lo que falló es mostrarlo. Decirlo evita que
    // alguien en la obra lo vuelva a capturar "por si acaso" y lo duplique.
    this.message =
        'No se pudo mostrar esto. Tus datos están a salvo en el teléfono.',
    this.onRetry,
  });

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    // Mismo recuadro que EmptyStateView, con el ícono en el tono de aviso: los
    // dos son "no hay nada que mostrar", pero este SÍ es un problema y debe
    // distinguirse de un simple vacío.
    final c = context.colores;
    return Center(
      child: Padding(
        padding: AppSpacing.allLg,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: c.page,
            borderRadius: BorderRadius.circular(AppTheme.radiusLg),
            border: Border.all(color: c.borderStrong),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.cloud_off, size: 40, color: c.warning),
                AppSpacing.gapMd,
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                if (onRetry != null) ...[
                  AppSpacing.gapMd,
                  OutlinedButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Reintentar'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
