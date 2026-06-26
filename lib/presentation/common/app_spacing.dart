import 'package:flutter/widgets.dart';

/// Tokens de espaciado para unificar paddings/margenes en todas las vistas.
/// Reemplaza los valores mágicos (4, 8, 12, 16, 24) repetidos por la app.
class AppSpacing {
  AppSpacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;

  // EdgeInsets de uso frecuente.
  static const EdgeInsets allSm = EdgeInsets.all(sm);
  static const EdgeInsets allMd = EdgeInsets.all(md);
  static const EdgeInsets allLg = EdgeInsets.all(lg);

  static const EdgeInsets hLg = EdgeInsets.symmetric(horizontal: lg);
  static const EdgeInsets rowLg =
      EdgeInsets.symmetric(horizontal: lg, vertical: xs);

  // SizedBox verticales.
  static const SizedBox gapXs = SizedBox(height: xs);
  static const SizedBox gapSm = SizedBox(height: sm);
  static const SizedBox gapMd = SizedBox(height: md);
}
