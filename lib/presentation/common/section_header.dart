import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// Encabezado de una sección dentro de una pantalla: título, descripción
/// opcional y acción a la derecha.
///
/// Gemelo de `web/src/components/ui/PageHeader.tsx`. En móvil el título de la
/// PANTALLA lo pone el `AppBar`, así que esto se usa un escalón más abajo: para
/// separar bloques dentro de una vista con scroll ("Saldo por obra",
/// "Distribución del gasto"), donde hoy hay `Text` sueltos con estilos que no
/// coinciden entre pantallas.
///
/// La [description] importa más de lo que parece: es el lugar donde cabe la
/// aclaración que si no termina metida en el título ("Cotizaciones pendientes
/// (borrador/enviada)") o, peor, no se dice en ninguna parte.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.description,
    this.action,
  });

  final String title;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final c = context.colores;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: textTheme.titleSmall),
                if (description != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      description!,
                      style: textTheme.bodySmall?.copyWith(color: c.textMuted),
                    ),
                  ),
              ],
            ),
          ),
          if (action != null) ...[const SizedBox(width: 12), action!],
        ],
      ),
    );
  }
}
