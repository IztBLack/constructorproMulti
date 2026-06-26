import 'package:flutter/material.dart';

import 'app_spacing.dart';

/// Vista de error reutilizable: muestra un mensaje amable (sin exponer el
/// stacktrace de Drift) y un botón "Reintentar" cuando se provee [onRetry].
///
/// Reemplaza el patrón `error: (e, _) => Center(child: Text('Error: $e'))`
/// repetido en las pantallas que consumen AsyncValue.
class ErrorStateView extends StatelessWidget {
  const ErrorStateView({
    super.key,
    this.message = 'No se pudo cargar la información.',
    this.onRetry,
  });

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: AppSpacing.allLg,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 64, color: cs.outline),
            AppSpacing.gapMd,
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            if (onRetry != null) ...[
              AppSpacing.gapMd,
              FilledButton.tonalIcon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
