import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// Tonos de [AppBadge]. Son los mismos seis de `Badge.tsx` en la web, con los
/// nombres de su SIGNIFICADO y no de su color: renombrar `verde` a `success`
/// evita que alguien elija "verde porque se ve bonito" en un estado que no es
/// positivo.
enum BadgeTone { neutral, info, success, danger, warning, accent }

/// Etiqueta compacta de estado (cotización enviada, obra archivada, colaborador
/// inactivo…). Gemelo de `web/src/components/ui/Badge.tsx`.
///
/// Cada tono se dibuja como el par (fondo suave + texto fuerte) de [AppColors],
/// que está verificado ≥4.5:1 en ambos temas. Eso reemplaza al patrón anterior
/// de `CircleAvatar` con `Colors.green.withValues(alpha: 0.2)`, que además de
/// reprobar contraste en oscuro no decía QUÉ estado era: había que aprenderse
/// los colores.
class AppBadge extends StatelessWidget {
  const AppBadge(this.label, {super.key, this.tone = BadgeTone.neutral, this.icon});

  final String label;
  final BadgeTone tone;

  /// Ícono opcional a la izquierda. Vale la pena en los estados que importan
  /// (aceptada, rechazada): el color solo no comunica a quien no lo distingue
  /// —regla `color-not-only`— y aquí el texto ya carga el significado, así que
  /// el ícono es refuerzo, no muleta.
  final IconData? icon;

  ({Color fondo, Color texto}) _colores(AppColors c) => switch (tone) {
        BadgeTone.neutral => (fondo: c.neutralSoft, texto: c.text),
        BadgeTone.info => (fondo: c.infoSoft, texto: c.info),
        BadgeTone.success => (fondo: c.successSoft, texto: c.success),
        BadgeTone.danger => (fondo: c.dangerSoft, texto: c.danger),
        BadgeTone.warning => (fondo: c.warningSoft, texto: c.warning),
        BadgeTone.accent => (fondo: c.accentSoft, texto: c.accent),
      };

  @override
  Widget build(BuildContext context) {
    final paleta = _colores(context.colores);
    final estilo = Theme.of(context).textTheme.labelSmall?.copyWith(
          color: paleta.texto,
          fontWeight: FontWeight.w600,
        );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: paleta.fondo,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: paleta.texto),
            const SizedBox(width: 4),
          ],
          Text(label, style: estilo),
        ],
      ),
    );
  }
}
