import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Tema Material 3 de Cimnova, alineado con el kit de la web
/// (`web/src/components/ui/`).
///
/// **Por qué se reescribió.** Antes este archivo eran 20 líneas: un
/// `ColorScheme.fromSeed` azul y nada más. Todo lo demás —tarjetas, campos,
/// barras, botones, tipografía— quedaba en los valores por defecto de Material,
/// así que la app se veía como una plantilla de Flutter y no como el producto
/// que el mismo usuario ve en la web.
///
/// **Qué hace ahora.** Traduce a Flutter las decisiones ya tomadas en
/// `globals.css`: superficies neutras (blanco/negro/grises que se invierten
/// entre temas) y color reservado para lo que SIGNIFICA algo. Los valores viven
/// en [AppColors]; aquí solo se cablean a los slots de Material.
///
/// **Regla al escribir pantallas nuevas:** ningún `Colors.green`, ningún
/// `fontSize:` suelto. Color por `context.colores`, tamaño por
/// `Theme.of(context).textTheme`. Lo primero rompe el modo oscuro, lo segundo
/// rompe el escalado de texto del sistema.
class AppTheme {
  AppTheme._();

  /// Radio de esquina de tarjetas y hojas. Equivale a `rounded-xl` de la web.
  static const double radiusLg = 12;

  /// Radio de controles (campos, botones). Equivale a `rounded-lg`.
  static const double radiusMd = 10;

  /// Alto mínimo de cualquier control tocable.
  ///
  /// La web usa `min-h-11` (44px, el mínimo de Apple y de WCAG 2.5.8). En
  /// Android el mínimo de Material es 48dp, así que se toma el mayor de los dos:
  /// un solo número que cumple en ambas plataformas.
  static const double touchTarget = 48;

  static ThemeData get light => _build(Brightness.light, AppColors.light);
  static ThemeData get dark => _build(Brightness.dark, AppColors.dark);

  static ThemeData _build(Brightness brightness, AppColors c) {
    final esClaro = brightness == Brightness.light;

    // El primario es el gris más oscuro, no un azul de marca: replica el botón
    // `bg-neutral-900 text-white` de la web. Como los grises se invierten entre
    // temas, en oscuro el botón se voltea solo (fondo claro, texto oscuro) y
    // sigue siendo legible sin ninguna regla extra — igual que allá.
    final onPrimary = esClaro ? c.alwaysLight : c.alwaysDark;

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: c.textStrong,
      onPrimary: onPrimary,
      primaryContainer: c.surfaceMuted,
      onPrimaryContainer: c.textStrong,
      secondary: c.text,
      onSecondary: onPrimary,
      secondaryContainer: c.surfaceMuted,
      onSecondaryContainer: c.textStrong,
      tertiary: c.info,
      onTertiary: onPrimary,
      tertiaryContainer: c.infoSoft,
      onTertiaryContainer: c.info,
      error: c.danger,
      // `onPrimary` (blanco en claro, casi negro en oscuro) y NO un blanco fijo.
      // Es contraintuitivo —el rojo se ve "oscuro" y uno asume que su texto es
      // blanco siempre— pero `danger` es un tono de TEXTO cuya luminosidad se
      // invierte: en claro es #dc2626 (blanco encima da 4.6:1, pasa) y en oscuro
      // es #f87171, donde el blanco daría 2.2:1 y el botón de borrar quedaría
      // ilegible. Vale para el rojo y para el azul de `tertiary`.
      onError: onPrimary,
      errorContainer: c.dangerSoft,
      onErrorContainer: c.danger,
      surface: c.surface,
      onSurface: c.textStrong,
      onSurfaceVariant: c.textMuted,
      surfaceContainerLowest: c.surface,
      surfaceContainerLow: c.page,
      surfaceContainer: c.surfaceMuted,
      surfaceContainerHigh: c.border,
      surfaceContainerHighest: c.border,
      outline: c.borderStrong,
      outlineVariant: c.border,
      inverseSurface: c.textStrong,
      onInverseSurface: c.page,
      inversePrimary: c.page,
      shadow: const Color(0xFF000000),
      scrim: const Color(0xFF000000),
    );

    final textTheme = _textTheme(brightness, c);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      textTheme: textTheme,
      scaffoldBackgroundColor: c.page,
      canvasColor: c.surface,
      dividerColor: c.border,
      extensions: [c],

      // ── Barra superior ────────────────────────────────────────────────────
      // Sin elevación ni tinte: la separación la da un hairline, como el
      // `border-b border-neutral-200` del layout web. `scrolledUnderElevation`
      // en 0 evita que Material le pinte un tinte morado al hacer scroll.
      appBarTheme: AppBarThemeData(
        backgroundColor: c.surface,
        foregroundColor: c.textStrong,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
        iconTheme: IconThemeData(color: c.textStrong, size: 24),
        actionsIconTheme: IconThemeData(color: c.text, size: 24),
        shape: Border(bottom: BorderSide(color: c.border)),
      ),

      // ── Tarjetas ─────────────────────────────────────────────────────────
      // Borde en vez de sombra: es el look de `Card.tsx`
      // (`rounded-xl border border-neutral-200 bg-white`). El margen se deja en
      // el valor por defecto a propósito, para no descuadrar las listas que ya
      // dependen de él.
      cardTheme: CardThemeData(
        color: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          side: BorderSide(color: c.border),
        ),
      ),

      listTileTheme: ListTileThemeData(
        iconColor: c.textMuted,
        textColor: c.textStrong,
        titleTextStyle: textTheme.bodyLarge,
        subtitleTextStyle: textTheme.bodySmall,
        // Garantiza el alto táctil aun cuando el título es de una sola línea.
        minVerticalPadding: 12,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),

      dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),

      // ── Campos de texto ──────────────────────────────────────────────────
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: c.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        border: _campo(c.borderStrong),
        enabledBorder: _campo(c.borderStrong),
        // El foco se marca engrosando el borde al color de texto fuerte, no con
        // un halo de color: es el `focus:border-neutral-900` de la web.
        focusedBorder: _campo(c.textStrong, ancho: 1.5),
        errorBorder: _campo(c.danger),
        focusedErrorBorder: _campo(c.danger, ancho: 1.5),
        disabledBorder: _campo(c.border),
        labelStyle: textTheme.bodyMedium?.copyWith(color: c.textMuted),
        floatingLabelStyle: textTheme.bodySmall?.copyWith(color: c.textStrong),
        hintStyle: textTheme.bodyMedium?.copyWith(color: c.textFaint),
        helperStyle: textTheme.bodySmall,
        errorStyle: textTheme.bodySmall?.copyWith(color: c.danger),
        prefixIconColor: c.textMuted,
        suffixIconColor: c.textMuted,
      ),

      // ── Botones ──────────────────────────────────────────────────────────
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: c.textStrong,
          foregroundColor: onPrimary,
          disabledBackgroundColor: c.border,
          disabledForegroundColor: c.textFaint,
          minimumSize: const Size(0, touchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: c.text,
          backgroundColor: c.surface,
          side: BorderSide(color: c.borderStrong),
          minimumSize: const Size(0, touchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: c.text,
          minimumSize: const Size(0, touchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: c.text,
          minimumSize: const Size(touchTarget, touchTarget),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: c.textStrong,
        foregroundColor: onPrimary,
        elevation: 2,
        focusElevation: 2,
        hoverElevation: 3,
        highlightElevation: 4,
        extendedTextStyle: textTheme.labelLarge,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),

      // ── Navegación ───────────────────────────────────────────────────────
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: c.surfaceMuted,
        elevation: 0,
        height: 68,
        // Siempre con etiqueta: un ícono solo es adivinanza (regla
        // `nav-label-icon`), y aquí "Obras" y "Equipo" comparten familia visual.
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith((estados) {
          final activo = estados.contains(WidgetState.selected);
          return textTheme.labelSmall?.copyWith(
            color: activo ? c.textStrong : c.textMuted,
            fontWeight: activo ? FontWeight.w600 : FontWeight.w500,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((estados) {
          final activo = estados.contains(WidgetState.selected);
          return IconThemeData(color: activo ? c.textStrong : c.textMuted);
        }),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: c.textStrong,
        unselectedLabelColor: c.textMuted,
        indicatorColor: c.textStrong,
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: c.border,
        labelStyle: textTheme.labelLarge,
        unselectedLabelStyle: textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w500,
        ),
      ),

      // ── Superficies flotantes ────────────────────────────────────────────
      dialogTheme: DialogThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 3,
        titleTextStyle: textTheme.titleLarge,
        contentTextStyle: textTheme.bodyMedium,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        // El asa no es decorativa: es la señal de que la hoja se puede arrastrar
        // para cerrar, y sin ella el gesto es invisible (regla `swipe-clarity`).
        showDragHandle: true,
        dragHandleColor: c.borderStrong,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 3,
        textStyle: textTheme.bodyMedium?.copyWith(color: c.textStrong),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          side: BorderSide(color: c.border),
        ),
      ),
      // Fondo invertido en ambos temas: en claro sale casi negro, en oscuro casi
      // blanco. Suena raro escrito, pero es lo correcto — un aviso temporal debe
      // destacarse CONTRA la página, no fundirse con ella.
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: c.textStrong,
        contentTextStyle: textTheme.bodyMedium?.copyWith(color: c.page),
        actionTextColor: c.page,
        elevation: 3,
        insetPadding: const EdgeInsets.all(12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: c.textStrong,
          borderRadius: BorderRadius.circular(6),
        ),
        textStyle: textTheme.bodySmall?.copyWith(color: c.page),
      ),

      // ── Controles menores ────────────────────────────────────────────────
      chipTheme: ChipThemeData(
        backgroundColor: c.surfaceMuted,
        selectedColor: c.textStrong,
        secondarySelectedColor: c.textStrong,
        side: BorderSide(color: c.border),
        labelStyle: textTheme.labelMedium?.copyWith(color: c.text),
        secondaryLabelStyle: textTheme.labelMedium?.copyWith(color: onPrimary),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        shape: const StadiumBorder(),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          backgroundColor: c.surface,
          foregroundColor: c.text,
          selectedBackgroundColor: c.textStrong,
          selectedForegroundColor: onPrimary,
          side: BorderSide(color: c.borderStrong),
          minimumSize: const Size(0, touchTarget),
          textStyle: textTheme.labelLarge,
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.textStrong,
        linearTrackColor: c.border,
        circularTrackColor: c.border,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((estados) =>
            estados.contains(WidgetState.selected) ? onPrimary : c.surface),
        trackColor: WidgetStateProperty.resolveWith((estados) =>
            estados.contains(WidgetState.selected)
                ? c.textStrong
                : c.surfaceMuted),
        trackOutlineColor: WidgetStateProperty.all(c.borderStrong),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((estados) =>
            estados.contains(WidgetState.selected)
                ? c.textStrong
                : Colors.transparent),
        checkColor: WidgetStateProperty.all(onPrimary),
        side: BorderSide(color: c.borderStrong, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith((estados) =>
            estados.contains(WidgetState.selected)
                ? c.textStrong
                : c.borderStrong),
      ),
      iconTheme: IconThemeData(color: c.text, size: 24),
    );
  }

  static OutlineInputBorder _campo(Color color, {double ancho = 1}) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(radiusMd),
      borderSide: BorderSide(color: color, width: ancho),
    );
  }

  /// Escala tipográfica.
  ///
  /// Se parte de la de Material 3 (que ya trae los tamaños y alturas de línea
  /// correctos y respeta el escalado de texto del sistema) y solo se ajustan
  /// peso y color, siguiendo la jerarquía de la web: título fuerte al 600,
  /// cuerpo al 400, etiquetas al 500-600.
  ///
  /// Que los tamaños vengan de aquí y no de `fontSize:` sueltos es lo que
  /// permite que la app sobreviva con el texto del sistema en grande.
  static TextTheme _textTheme(Brightness brightness, AppColors c) {
    final base = brightness == Brightness.light
        ? Typography.material2021().black
        : Typography.material2021().white;

    // `apply` primero (pinta todo), `copyWith` después (matiza lo que difiere).
    return base
        .apply(bodyColor: c.textStrong, displayColor: c.textStrong)
        .copyWith(
          titleLarge: base.titleLarge?.copyWith(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: c.textStrong,
          ),
          titleMedium: base.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: c.textStrong,
          ),
          titleSmall: base.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: c.textStrong,
          ),
          bodyLarge: base.bodyLarge?.copyWith(color: c.textStrong),
          bodyMedium: base.bodyMedium?.copyWith(color: c.text),
          // Los textos de apoyo (subtítulos de lista, pistas) van en el gris
          // atenuado, que sigue pasando AA en ambos temas.
          bodySmall: base.bodySmall?.copyWith(color: c.textMuted),
          labelLarge: base.labelLarge?.copyWith(
            fontWeight: FontWeight.w600,
            color: c.textStrong,
          ),
          labelMedium: base.labelMedium?.copyWith(color: c.text),
          labelSmall: base.labelSmall?.copyWith(color: c.textMuted),
        );
  }
}
