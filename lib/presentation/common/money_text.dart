import 'package:flutter/material.dart';

import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';

/// Cifra de dinero con **figuras tabulares**.
///
/// El detalle que arregla: en la fuente por defecto los dígitos tienen anchos
/// distintos (un `1` es más angosto que un `8`), así que en una columna de
/// saldos los montos no alinean y "bailan" cuando el valor cambia —notorio en la
/// lista de saldo por obra y en cualquier total que se recalcula. `tabularFigures`
/// fuerza el mismo ancho para todos los dígitos. La web ya lo hace con
/// `tabular-nums`; esto es su equivalente.
///
/// Además centraliza el color por signo en [AppColors.montoTone], para que
/// "negativo = rojo" no se decida pantalla por pantalla con `Colors.red`.
class MoneyText extends StatelessWidget {
  const MoneyText(
    this.valor, {
    super.key,
    this.style,
    this.colorearPorSigno = false,
    this.mostrarSigno = false,
    this.color,
    this.textAlign,
  });

  final double valor;
  final TextStyle? style;

  /// Antepone «+» a los valores positivos (el «−» ya lo pone el formateador).
  ///
  /// Actívalo en listas donde el signo ES la información —entradas y salidas de
  /// caja—: sin él, la única diferencia entre cobrar y pagar sería el color, y
  /// quien no lo distingue se queda sin poder leer la lista (regla
  /// `color-not-only`).
  final bool mostrarSigno;

  /// Tiñe de verde/rojo según el signo. Úsalo en saldos y balances, donde el
  /// signo es la información. NO lo uses en montos que solo son cantidades
  /// (el precio de una partida no es "malo" por existir).
  final bool colorearPorSigno;

  /// Color explícito. Gana sobre [colorearPorSigno].
  final Color? color;

  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final base = style ?? Theme.of(context).textTheme.bodyMedium;
    final tinte = color ?? (colorearPorSigno ? c.montoTone(valor) : null);
    final texto =
        (mostrarSigno && valor > 0) ? '+${Fmt.money(valor)}' : Fmt.money(valor);

    return Text(
      texto,
      textAlign: textAlign,
      style: (base ?? const TextStyle()).copyWith(
        color: tinte,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}
