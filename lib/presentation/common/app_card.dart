import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';

/// Padding interno de [AppCard]. Espeja los tamaños de `Card.tsx` en la web.
enum CardPadding {
  none(EdgeInsets.zero),
  sm(EdgeInsets.all(12)),
  md(EdgeInsets.all(16)),
  lg(EdgeInsets.all(24));

  const CardPadding(this.insets);
  final EdgeInsets insets;
}

/// Contenedor base del kit: superficie con borde tenue y esquinas redondeadas.
///
/// Es el gemelo de `web/src/components/ui/Card.tsx`. Frente al `Card` de
/// Material aporta tres cosas:
///
///   1. Padding declarado por token en vez de un `Padding` anidado a mano.
///   2. Cuando recibe [onTap], envuelve el contenido en un `InkWell` para que la
///      onda de toque quede RECORTADA al radio de la tarjeta — con un
///      `GestureDetector` no hay realimentación táctil, y con un `InkWell` mal
///      colocado la onda se desborda por las esquinas.
///   3. Margen cero por defecto, para que el espaciado lo decida quien la
///      coloca (el `Card` de Material trae un margen invisible de 4).
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = CardPadding.md,
    this.onTap,
    this.borderColor,
    this.color,
  });

  final Widget child;
  final CardPadding padding;
  final VoidCallback? onTap;

  /// Borde de énfasis, para destacar una tarjeta sin rellenarla de color
  /// (p. ej. `context.colores.danger` en un saldo en rojo).
  final Color? borderColor;

  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final radio = BorderRadius.circular(AppTheme.radiusLg);
    final contenido = Padding(padding: padding.insets, child: child);

    return Material(
      color: color ?? c.surface,
      elevation: 0,
      borderRadius: radio,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: radio,
        side: BorderSide(color: borderColor ?? c.border),
      ),
      child: onTap == null
          ? contenido
          : InkWell(onTap: onTap, borderRadius: radio, child: contenido),
    );
  }
}
