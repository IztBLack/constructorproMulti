import 'package:flutter/material.dart';

/// Tema Material 3 portado de la paleta del proyecto Kotlin
/// (Azul Pizarra #1A3A5C, Verde Teal #00897B), con modo claro y oscuro.
class AppTheme {
  static const _azulPizarra = Color(0xFF1A3A5C);
  static const _teal = Color(0xFF00897B);

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _azulPizarra,
          primary: _azulPizarra,
          secondary: _teal,
          brightness: Brightness.light,
        ),
      );

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _azulPizarra,
          primary: _azulPizarra,
          secondary: _teal,
          brightness: Brightness.dark,
        ),
      );
}
