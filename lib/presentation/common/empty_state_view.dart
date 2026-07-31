import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import 'app_spacing.dart';

/// Vista de estado vacío reutilizable. Gemelo de
/// `web/src/components/ui/EmptyState.tsx`.
///
/// El recuadro con borde no es adorno: delimita "aquí todavía no hay nada" en
/// vez de dejar un ícono flotando en medio de la página, que es lo que se veía
/// antes y se leía como un error de carga. La web usa la misma idea con
/// `border-dashed`; en Flutter el punteado requiere pintarlo a mano, así que
/// aquí el borde es continuo sobre el fondo de página —basta para separar la
/// zona vacía de una tarjeta con contenido, que es lo que se busca.
class EmptyStateView extends StatelessWidget {
  const EmptyStateView({
    super.key,
    required this.icon,
    required this.title,
    this.hint,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? hint;

  /// Acción sugerida. Cuando existe, el vacío deja de ser un callejón sin
  /// salida: el usuario sale de él sin tener que adivinar cuál botón lo saca.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final textTheme = Theme.of(context).textTheme;

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
                // 40 y no 72: un ícono enorme y gris compite con el texto, que
                // es lo que de verdad explica qué pasa y qué hacer.
                Icon(icon, size: 40, color: c.textFaint),
                AppSpacing.gapMd,
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: textTheme.titleSmall,
                ),
                if (hint != null) ...[
                  AppSpacing.gapXs,
                  Text(
                    hint!,
                    textAlign: TextAlign.center,
                    style: textTheme.bodySmall,
                  ),
                ],
                if (action != null) ...[AppSpacing.gapMd, action!],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
