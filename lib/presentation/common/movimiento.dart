import 'package:flutter/material.dart';

// Movimiento de la interfaz: duraciones, curvas y el respeto al ajuste del
// sistema. Gemelo de lo que la web resuelve con `prefers-reduced-motion` y
// `motion-reduce:animate-none`.
//
// REGLA: la animación se gana el lugar cuando COMUNICA estado —qué se guardó,
// qué se fue, qué está cargando—. Nunca para decorar. Esta app se usa de pie,
// con guantes y con sol: cada milisegundo de animación es un milisegundo antes
// de poder tocar el siguiente nombre, y en un pase de lista de treinta personas
// eso se paga treinta veces.

/// ¿El sistema pidió menos movimiento?
///
/// Hasta ahora el móvil no consultaba esto en ningún lado, así que a quien lo
/// activaba —por mareo, por migraña, por preferencia— se le imponía igual. La
/// web sí lo respeta desde hace tiempo; esto cierra esa asimetría.
bool sinMovimiento(BuildContext context) =>
    MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Duración efectiva: cero cuando el sistema pide menos movimiento, de modo que
/// el cambio ocurre igual pero sin transición. Nunca se cancela la ACCIÓN, solo
/// su animación.
Duration duracion(BuildContext context, Duration normal) =>
    sinMovimiento(context) ? Duration.zero : normal;

/// Duraciones del sistema. Cortas a propósito: por encima de ~300 ms el
/// movimiento deja de sentirse como respuesta y empieza a sentirse como espera.
abstract final class Duraciones {
  /// Confirmaciones y cambios de color de estado.
  static const rapida = Duration(milliseconds: 180);

  /// Entradas y salidas de elementos de lista.
  static const media = Duration(milliseconds: 260);

  /// Aterrizaje de avisos y tarjetas.
  static const aviso = Duration(milliseconds: 340);
}

/// Curva de entrada: rápida al inicio y suave al final, como algo que se posa.
const curvaEntrada = Curves.easeOutCubic;

/// Curva de salida: al revés, para que lo que se va no se quede colgando.
const curvaSalida = Curves.easeInCubic;
