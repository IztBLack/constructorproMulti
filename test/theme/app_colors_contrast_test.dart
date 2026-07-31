import 'dart:math' as math;

import 'package:constructorpro/core/theme/app_colors.dart';
import 'package:constructorpro/core/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Guardia de contraste de la paleta.
///
/// La documentación de [AppColors] afirma que cada par (texto sobre superficie,
/// texto sobre fondo suave) pasa WCAG AA. Sin una prueba, esa afirmación
/// envejece mal: basta que alguien ajuste un tono "para que se vea mejor" y el
/// modo oscuro vuelva a quedar ilegible sin que nadie se entere — que es
/// exactamente el estado del que veníamos (`Colors.green` daba 2.8:1).
///
/// Aquí se calcula la razón de contraste real con la fórmula de WCAG 2.1
/// (luminancia relativa sobre sRGB linealizado) y se exige el umbral en AMBOS
/// temas. Si un cambio de paleta rompe la accesibilidad, esta prueba lo dice.
double _luminanciaRelativa(Color c) {
  double canal(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

double _contraste(Color a, Color b) {
  final la = _luminanciaRelativa(a);
  final lb = _luminanciaRelativa(b);
  final claro = math.max(la, lb);
  final oscuro = math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

/// Umbral AA para texto normal.
const _aa = 4.5;

/// Umbral de WCAG 1.4.11 para elementos gráficos y bordes de control.
const _aaNoTextual = 3.0;

void main() {
  final temas = {'claro': AppColors.light, 'oscuro': AppColors.dark};

  temas.forEach((nombre, c) {
    group('tema $nombre', () {
      void exigir(String que, Color fg, Color bg, {double minimo = _aa}) {
        test(que, () {
          final r = _contraste(fg, bg);
          expect(r, greaterThanOrEqualTo(minimo),
              reason: '$que da ${r.toStringAsFixed(2)}:1, '
                  'por debajo de $minimo:1');
        });
      }

      // ── Texto sobre la superficie de tarjeta ──────────────────────────────
      exigir('textStrong sobre surface', c.textStrong, c.surface);
      exigir('text sobre surface', c.text, c.surface);
      exigir('textMuted sobre surface', c.textMuted, c.surface);
      exigir('success sobre surface', c.success, c.surface);
      exigir('danger sobre surface', c.danger, c.surface);
      exigir('warning sobre surface', c.warning, c.surface);
      exigir('info sobre surface', c.info, c.surface);
      exigir('accent sobre surface', c.accent, c.surface);

      // ── Texto sobre el fondo de página ───────────────────────────────────
      exigir('textStrong sobre page', c.textStrong, c.page);
      exigir('textMuted sobre page', c.textMuted, c.page);

      // ── Pares de insignia (AppBadge y los FAB de caja) ───────────────────
      exigir('success sobre successSoft', c.success, c.successSoft);
      exigir('danger sobre dangerSoft', c.danger, c.dangerSoft);
      exigir('warning sobre warningSoft', c.warning, c.warningSoft);
      exigir('info sobre infoSoft', c.info, c.infoSoft);
      exigir('accent sobre accentSoft', c.accent, c.accentSoft);
      // `text` y no `textMuted`: el atenuado se queda en 4.35:1 sobre este
      // fondo. Es la razón por la que AppBadge.neutral usa el tono de cuerpo.
      exigir('text sobre neutralSoft', c.text, c.neutralSoft);

      // ── Bordes y separadores: no son texto, pero sí deben verse ──────────
      exigir('borderStrong sobre surface', c.borderStrong, c.surface,
          minimo: 1.3);

      // ── Series de la gráfica de gasto ────────────────────────────────────
      // Son relleno, no texto: aplica 1.4.11 (3:1), no AA.
      exigir('chartPayroll sobre surface', c.chartPayroll, c.surface,
          minimo: _aaNoTextual);
      exigir('chartMaterial sobre surface', c.chartMaterial, c.surface,
          minimo: _aaNoTextual);
      exigir('chartOther sobre surface', c.chartOther, c.surface,
          minimo: _aaNoTextual);
    });
  });

  group('ColorScheme derivado', () {
    for (final (nombre, tema) in [
      ('claro', AppTheme.light),
      ('oscuro', AppTheme.dark),
    ]) {
      final cs = tema.colorScheme;

      test('$nombre · onPrimary sobre primary (botón principal)', () {
        expect(_contraste(cs.onPrimary, cs.primary),
            greaterThanOrEqualTo(_aa));
      });

      // Este es el que estaba roto: con `onError` fijo en blanco, el botón de
      // borrar del diálogo destructivo daba 2.2:1 en tema oscuro.
      test('$nombre · onError sobre error (botón destructivo)', () {
        expect(_contraste(cs.onError, cs.error), greaterThanOrEqualTo(_aa));
      });

      test('$nombre · onTertiary sobre tertiary', () {
        expect(_contraste(cs.onTertiary, cs.tertiary),
            greaterThanOrEqualTo(_aa));
      });

      test('$nombre · onSurface sobre surface', () {
        expect(_contraste(cs.onSurface, cs.surface), greaterThanOrEqualTo(_aa));
      });

      test('$nombre · onSurfaceVariant sobre surface', () {
        expect(_contraste(cs.onSurfaceVariant, cs.surface),
            greaterThanOrEqualTo(_aa));
      });

      test('$nombre · texto del SnackBar sobre su fondo', () {
        final fondo = tema.snackBarTheme.backgroundColor!;
        final texto = tema.snackBarTheme.contentTextStyle!.color!;
        expect(_contraste(texto, fondo), greaterThanOrEqualTo(_aa));
      });

      test('$nombre · la extensión AppColors está registrada', () {
        expect(tema.extension<AppColors>(), isNotNull);
      });
    }
  });
}
