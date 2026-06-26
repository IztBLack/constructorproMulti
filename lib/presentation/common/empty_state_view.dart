import 'package:flutter/material.dart';

import 'app_spacing.dart';

/// Vista de estado vacío reutilizable. Unifica la presentación (ícono grande +
/// título + pista) que antes variaba entre pantallas.
class EmptyStateView extends StatelessWidget {
  const EmptyStateView({
    super.key,
    required this.icon,
    required this.title,
    this.hint,
  });

  final IconData icon;
  final String title;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 72, color: cs.outline),
          AppSpacing.gapMd,
          Text(title, textAlign: TextAlign.center),
          if (hint != null) ...[
            AppSpacing.gapXs,
            Text(
              hint!,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}
