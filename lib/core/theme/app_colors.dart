import 'package:flutter/material.dart';

/// Paleta cruda portada 1:1 de `web/src/app/globals.css`.
///
/// Los hexadecimales NO se eligieron aquí: son exactamente los que usa el sitio
/// en `:root` (claro) y `.dark` (oscuro), **incluidos los ajustes que allá se
/// hicieron a mano y están documentados en ese archivo**:
///
///   · el fondo de página oscuro es `#171717` y no negro puro, para que las
///     tarjetas puedan quedar un escalón POR ENCIMA del fondo;
///   · los grises de texto oscuros (`n400`–`n600`) están aclarados por encima de
///     la inversión literal porque medidos en el navegador no pasaban WCAG AA.
///
/// Copiarlos tal cual es lo que hace que la app móvil y la web se vean como el
/// mismo producto. Si allá cambia un valor, cámbialo aquí también.
///
/// Las tres reglas de la web valen igual en Flutter:
///   1. Los GRISES se invierten (50 ↔ 950): son superficie y texto, y en oscuro
///      deben intercambiar papeles.
///   2. El blanco y el negro también se invierten.
///   3. Los colores CON SIGNIFICADO (rojo=error, verde=éxito, ámbar=aviso,
///      azul=info) NO se invierten de tono: solo invierten su luminosidad dentro
///      de la familia, para que un error se vea rojo en ambos temas.
class _Claro {
  static const n50 = Color(0xFFFAFAFA);
  static const n100 = Color(0xFFF5F5F5);
  static const n200 = Color(0xFFE5E5E5);
  static const n300 = Color(0xFFD4D4D4);
  static const n400 = Color(0xFFA3A3A3);
  static const n500 = Color(0xFF737373);
  static const n700 = Color(0xFF404040);
  static const n900 = Color(0xFF171717);

  static const blanco = Color(0xFFFFFFFF);

  static const rojo100 = Color(0xFFFEE2E2);
  // La web usa `text-red-600` (#dc2626) sobre `bg-red-100`: medido da 3.95:1 y
  // NO pasa AA. Aquí se baja un escalón a `red-700`, que da 5.3:1 sobre el
  // fondo tenue y 6.0:1 sobre blanco. Desviación deliberada, verificada por
  // `test/theme/app_colors_contrast_test.dart`.
  static const rojo700 = Color(0xFFB91C1C);

  static const verde100 = Color(0xFFDCFCE7);
  static const verde700 = Color(0xFF15803D);

  static const ambar100 = Color(0xFFFEF3C7);
  static const ambar700 = Color(0xFFB45309);

  static const azul100 = Color(0xFFDBEAFE);
  static const azul700 = Color(0xFF1D4ED8);

  static const morado100 = Color(0xFFF3E8FF);
  static const morado700 = Color(0xFF7E22CE);

  static const indigo500 = Color(0xFF6366F1);
  // `orange-500` (#f97316) da 2.9:1 sobre blanco y se queda corto del 3:1 que
  // pide WCAG 1.4.11 para gráficos. Un escalón más oscuro lo cruza.
  static const naranja600 = Color(0xFFEA580C);
}

class _Oscuro {
  static const n50 = Color(0xFF171717);
  static const n100 = Color(0xFF1F1F1F);
  static const n200 = Color(0xFF2E2E2E);
  static const n300 = Color(0xFF404040);
  static const n400 = Color(0xFF878787);
  static const n500 = Color(0xFF9C9C9C);
  static const n700 = Color(0xFFC9C9C9);
  static const n900 = Color(0xFFF2F2F2);

  static const blanco = Color(0xFF1F1F1F);

  static const rojo100 = Color(0xFF3B191C);
  static const rojo700 = Color(0xFFFCA5A5);

  static const verde100 = Color(0xFF14301F);
  static const verde700 = Color(0xFF86EFAC);

  static const ambar100 = Color(0xFF3A2A10);
  static const ambar700 = Color(0xFFFCD34D);

  static const azul100 = Color(0xFF16264A);
  static const azul700 = Color(0xFF93C5FD);

  static const morado100 = Color(0xFF2A1740);
  static const morado700 = Color(0xFFD8B4FE);

  static const indigo500 = Color(0xFF818CF8);
  static const naranja500 = Color(0xFFFB923C);
}

/// Roles semánticos de color de la app, disponibles vía `Theme.of(context)`.
///
/// Existe porque el `ColorScheme` de Material 3 no tiene lugar para "éxito",
/// "aviso" ni para los categóricos de la gráfica de gasto — y sin un lugar donde
/// vivan, terminan escritos a mano como `Colors.green` en las pantallas, que es
/// justo lo que rompía el modo oscuro (`Colors.green` da 2.8:1 sobre tarjeta
/// clara: reprueba AA).
///
/// **La convención de pares importa.** Cada familia expone dos tonos:
///   · el FUERTE (`success`, `danger`…) es para TEXTO e ÍCONOS. Está verificado
///     ≥4.5:1 contra la superficie de tarjeta en ambos temas.
///   · el SUAVE (`successSoft`…) es SOLO para fondos (chips, franjas de aviso).
///     Nunca pongas texto de ese color; nunca uses el fuerte como relleno de un
///     área grande.
///
/// Uso: `final c = Theme.of(context).extension<AppColors>()!;`
/// o el atajo `context.colores`.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.page,
    required this.surface,
    required this.surfaceMuted,
    required this.border,
    required this.borderStrong,
    required this.textStrong,
    required this.text,
    required this.textMuted,
    required this.textFaint,
    required this.success,
    required this.successSoft,
    required this.danger,
    required this.dangerSoft,
    required this.warning,
    required this.warningSoft,
    required this.info,
    required this.infoSoft,
    required this.accent,
    required this.accentSoft,
    required this.neutralSoft,
    required this.chartPayroll,
    required this.chartMaterial,
    required this.chartOther,
    required this.alwaysLight,
    required this.alwaysDark,
  });

  // ── Superficies y texto ───────────────────────────────────────────────────
  /// Fondo de página (detrás de las tarjetas).
  final Color page;

  /// Fondo de tarjeta / hoja / diálogo. Un escalón por encima de [page].
  final Color surface;

  /// Relleno tenue para zonas agrupadas dentro de una tarjeta.
  final Color surfaceMuted;

  /// Hairline de tarjetas y separadores.
  final Color border;

  /// Borde de controles (inputs, botones secundarios): más visible que [border].
  final Color borderStrong;

  /// Títulos y cifras. Máximo contraste.
  final Color textStrong;

  /// Etiquetas de formulario y texto de cuerpo secundario. Equivale al
  /// `text-neutral-700` de la web (`Field.tsx`).
  final Color text;

  /// Texto secundario (subtítulos, ayudas). Pasa AA.
  final Color textMuted;

  /// Texto deshabilitado y placeholders. NO lo uses para información.
  final Color textFaint;

  // ── Familias semánticas (fuerte = texto/ícono · Soft = fondo) ─────────────
  final Color success;
  final Color successSoft;
  final Color danger;
  final Color dangerSoft;
  final Color warning;
  final Color warningSoft;
  final Color info;
  final Color infoSoft;

  /// Morado. En la web se usa para el estado "convertida" de una cotización.
  final Color accent;
  final Color accentSoft;

  /// Fondo del chip neutro. Su texto es [text], no [textMuted]: el gris
  /// atenuado sobre este fondo da 4.35:1 y se queda a un pelo de AA.
  ///
  /// En oscuro apunta a `n-200` y no a `n-100` como la web, porque allá `n-100`
  /// coincide con el fondo de tarjeta y el chip neutro desaparece.
  final Color neutralSoft;

  // ── Categóricos de la gráfica de distribución del gasto ──────────────────
  /// Estas tres son CATEGÓRICAS, no semánticas: distinguen series, no dicen
  /// "bien" ni "mal". Siempre acompáñalas de su etiqueta — el color por sí solo
  /// no comunica (regla `color-not-only`).
  final Color chartPayroll;
  final Color chartMaterial;
  final Color chartOther;

  // ── Escotillas de escape ─────────────────────────────────────────────────
  /// Blanco y negro que NO responden al tema. Son para texto encima de un fondo
  /// saturado que tampoco se invierte (un botón rojo de borrar): ahí un blanco
  /// que se invierte dejaría texto oscuro sobre rojo. Mismo problema y misma
  /// solución que `text-siempre-claro` en la web.
  final Color alwaysLight;
  final Color alwaysDark;

  static const light = AppColors(
    page: _Claro.n50,
    surface: _Claro.blanco,
    surfaceMuted: _Claro.n100,
    border: _Claro.n200,
    borderStrong: _Claro.n300,
    textStrong: _Claro.n900,
    text: _Claro.n700,
    textMuted: _Claro.n500,
    textFaint: _Claro.n400,
    success: _Claro.verde700,
    successSoft: _Claro.verde100,
    danger: _Claro.rojo700,
    dangerSoft: _Claro.rojo100,
    warning: _Claro.ambar700,
    warningSoft: _Claro.ambar100,
    info: _Claro.azul700,
    infoSoft: _Claro.azul100,
    accent: _Claro.morado700,
    accentSoft: _Claro.morado100,
    neutralSoft: _Claro.n100,
    chartPayroll: _Claro.indigo500,
    chartMaterial: _Claro.naranja600,
    chartOther: _Claro.n500,
    alwaysLight: Color(0xFFFFFFFF),
    alwaysDark: Color(0xFF0A0A0A),
  );

  static const dark = AppColors(
    page: _Oscuro.n50,
    surface: _Oscuro.blanco,
    surfaceMuted: _Oscuro.n100,
    border: _Oscuro.n200,
    borderStrong: _Oscuro.n300,
    textStrong: _Oscuro.n900,
    text: _Oscuro.n700,
    textMuted: _Oscuro.n500,
    textFaint: _Oscuro.n400,
    success: _Oscuro.verde700,
    successSoft: _Oscuro.verde100,
    danger: _Oscuro.rojo700,
    dangerSoft: _Oscuro.rojo100,
    warning: _Oscuro.ambar700,
    warningSoft: _Oscuro.ambar100,
    info: _Oscuro.azul700,
    infoSoft: _Oscuro.azul100,
    accent: _Oscuro.morado700,
    accentSoft: _Oscuro.morado100,
    neutralSoft: _Oscuro.n200,
    chartPayroll: _Oscuro.indigo500,
    chartMaterial: _Oscuro.naranja500,
    chartOther: _Oscuro.n500,
    alwaysLight: Color(0xFFFFFFFF),
    alwaysDark: Color(0xFF0A0A0A),
  );

  /// Color de una cifra de dinero según su signo, con el neutro como caso base.
  /// Centralizado aquí para que "saldo negativo = rojo" se decida en un solo
  /// lugar y no en cada pantalla.
  Color montoTone(double valor) {
    if (valor > 0) return success;
    if (valor < 0) return danger;
    return textStrong;
  }

  @override
  AppColors copyWith({
    Color? page,
    Color? surface,
    Color? surfaceMuted,
    Color? border,
    Color? borderStrong,
    Color? textStrong,
    Color? text,
    Color? textMuted,
    Color? textFaint,
    Color? success,
    Color? successSoft,
    Color? danger,
    Color? dangerSoft,
    Color? warning,
    Color? warningSoft,
    Color? info,
    Color? infoSoft,
    Color? accent,
    Color? accentSoft,
    Color? neutralSoft,
    Color? chartPayroll,
    Color? chartMaterial,
    Color? chartOther,
    Color? alwaysLight,
    Color? alwaysDark,
  }) {
    return AppColors(
      page: page ?? this.page,
      surface: surface ?? this.surface,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      textStrong: textStrong ?? this.textStrong,
      text: text ?? this.text,
      textMuted: textMuted ?? this.textMuted,
      textFaint: textFaint ?? this.textFaint,
      success: success ?? this.success,
      successSoft: successSoft ?? this.successSoft,
      danger: danger ?? this.danger,
      dangerSoft: dangerSoft ?? this.dangerSoft,
      warning: warning ?? this.warning,
      warningSoft: warningSoft ?? this.warningSoft,
      info: info ?? this.info,
      infoSoft: infoSoft ?? this.infoSoft,
      accent: accent ?? this.accent,
      accentSoft: accentSoft ?? this.accentSoft,
      neutralSoft: neutralSoft ?? this.neutralSoft,
      chartPayroll: chartPayroll ?? this.chartPayroll,
      chartMaterial: chartMaterial ?? this.chartMaterial,
      chartOther: chartOther ?? this.chartOther,
      alwaysLight: alwaysLight ?? this.alwaysLight,
      alwaysDark: alwaysDark ?? this.alwaysDark,
    );
  }

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    Color m(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      page: m(page, other.page),
      surface: m(surface, other.surface),
      surfaceMuted: m(surfaceMuted, other.surfaceMuted),
      border: m(border, other.border),
      borderStrong: m(borderStrong, other.borderStrong),
      textStrong: m(textStrong, other.textStrong),
      text: m(text, other.text),
      textMuted: m(textMuted, other.textMuted),
      textFaint: m(textFaint, other.textFaint),
      success: m(success, other.success),
      successSoft: m(successSoft, other.successSoft),
      danger: m(danger, other.danger),
      dangerSoft: m(dangerSoft, other.dangerSoft),
      warning: m(warning, other.warning),
      warningSoft: m(warningSoft, other.warningSoft),
      info: m(info, other.info),
      infoSoft: m(infoSoft, other.infoSoft),
      accent: m(accent, other.accent),
      accentSoft: m(accentSoft, other.accentSoft),
      neutralSoft: m(neutralSoft, other.neutralSoft),
      chartPayroll: m(chartPayroll, other.chartPayroll),
      chartMaterial: m(chartMaterial, other.chartMaterial),
      chartOther: m(chartOther, other.chartOther),
      alwaysLight: m(alwaysLight, other.alwaysLight),
      alwaysDark: m(alwaysDark, other.alwaysDark),
    );
  }
}

/// Atajo para no escribir `Theme.of(context).extension<AppColors>()!` en cada
/// widget. El `!` es seguro: [AppTheme] registra la extensión en ambos temas.
extension AppColorsX on BuildContext {
  AppColors get colores => Theme.of(this).extension<AppColors>()!;
}
