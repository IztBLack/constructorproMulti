import 'package:flutter/material.dart';

import '../../domain/asistencia/fracciones.dart';

/// Los cuatro botones para marcar el día de una persona (`· ½ ¾ 1`). Gemelo de
/// la rejilla de `web/src/app/campo/pase-lista.tsx`: símbolo grande y su nombre
/// debajo, para que nadie tenga que aprenderse qué quiere decir cada signo.
///
/// Es el ÚNICO control de asistencia del móvil (pase de lista y detalle de
/// obra): las opciones salen de [opcionesFraccion], así que una pantalla ya no
/// puede volver a inventar su propio vocabulario.
class SelectorFraccion extends StatelessWidget {
  const SelectorFraccion({
    super.key,
    required this.valor,
    required this.onChanged,
    required this.nombre,
  });

  /// La fracción marcada hoy (0 si no hay registro).
  final double valor;

  final ValueChanged<double> onChanged;

  /// De quién es el pase de lista. Nombra al grupo para el lector de pantalla,
  /// como el `aria-label` de la web: sin él, TalkBack lee cuatro botones sueltos
  /// sin decir a quién se le está marcando.
  final String nombre;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    // Tamaños del tema SIN su color: el color lo pone el botón (claro sobre el
    // segmento marcado, oscuro sobre el libre). Con el color del tema, el
    // símbolo del segmento marcado quedaría negro sobre negro.
    final simbolo = TextStyle(
      fontSize: t.titleMedium?.fontSize,
      height: t.titleMedium?.height,
      fontWeight: FontWeight.w600,
    );
    final nombreEstilo = TextStyle(
      fontSize: t.labelSmall?.fontSize,
      height: t.labelSmall?.height,
      letterSpacing: t.labelSmall?.letterSpacing,
    );
    return Semantics(
      container: true,
      label: 'Pase de lista de $nombre',
      child: SegmentedButton<double>(
        showSelectedIcon: false,
        style: const ButtonStyle(
          // Target táctil amplio para dedos con guantes / pantalla sucia.
          minimumSize: WidgetStatePropertyAll(Size(48, 48)),
          tapTargetSize: MaterialTapTargetSize.padded,
          padding: WidgetStatePropertyAll(
              EdgeInsets.symmetric(horizontal: 4, vertical: 6)),
        ),
        segments: [
          for (final o in opcionesFraccion)
            ButtonSegment(
              value: o.valor,
              // El lector de pantalla lee el NOMBRE ("Medio"), no el signo:
              // "½" se pronuncia distinto en cada teléfono y "·" no se lee.
              label: Semantics(
                label: o.etiqueta,
                excludeSemantics: true,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(o.simbolo, style: simbolo),
                    Text(
                      o.etiqueta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: nombreEstilo,
                    ),
                  ],
                ),
              ),
            ),
        ],
        selected: {valor},
        onSelectionChanged: (s) => onChanged(s.first),
      ),
    );
  }
}
