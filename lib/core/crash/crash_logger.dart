import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/widgets.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Registro de errores. Dos destinos, y el orden importa:
///
///  1. **Disco, siempre.** Un archivo por crash, los 10 más recientes. Es lo
///     único que funciona en la obra sin señal, que es donde más se usa la app,
///     y lo único que se puede leer desde el propio teléfono.
///  2. **Sentry, si hay DSN.** Compilando con `--dart-define=SENTRY_DSN=...`.
///     Sin él la app se comporta EXACTAMENTE igual que antes: no se inicializa
///     nada, no se manda nada. Es a propósito — el repo se puede clonar y
///     compilar sin cuenta de Sentry.
///
/// El log local no se sustituye por Sentry: un reporte que solo existe en la
/// nube no sirve cuando el problema es justamente que el dispositivo no tiene
/// nube.
class CrashLogger {
  static const _dirName = 'crash_logs';
  static const _maxLogs = 10;

  /// DSN del proyecto Sentry. Vacío = apagado.
  static const _sentryDsn = String.fromEnvironment('SENTRY_DSN');

  static bool get sentryActivo => _sentryDsn.isNotEmpty;

  /// Ejecuta la app dentro de una zona protegida que captura cualquier crash.
  static Future<void> runGuarded(Future<void> Function() body) async {
    if (sentryActivo) {
      // `SentryFlutter.init` ya envuelve el arranque en su propia zona guardada
      // y engancha `FlutterError.onError`, así que el log local se cuelga de sus
      // callbacks en vez de duplicar la captura.
      await SentryFlutter.init(
        (options) {
          options.dsn = _sentryDsn;
          // Sin trazas de rendimiento: hace falta saber QUÉ truena, no cuánto
          // tarda. A 0 no se gasta cuota del plan gratuito.
          options.tracesSampleRate = 0;
          // La app maneja nombres de colaboradores y montos. Que no salgan del
          // teléfono por accidente dentro del contexto de un evento.
          options.sendDefaultPii = false;
          options.environment = kReleaseMode ? 'production' : 'development';
          // En debug los errores ya salen por consola.
          options.debug = false;
          options.beforeSend = (event, hint) {
            _write(
              event.throwable?.toString() ?? event.message?.formatted ?? 'sin detalle',
              event.throwable is Error ? (event.throwable as Error).stackTrace : null,
            );
            return event;
          };
        },
        appRunner: body,
      );
      return;
    }

    await runZonedGuarded(() async {
      WidgetsFlutterBinding.ensureInitialized();
      final prev = FlutterError.onError;
      FlutterError.onError = (details) {
        _write(details.exceptionAsString(), details.stack);
        prev?.call(details);
      };
      await body();
    }, (error, stack) {
      _write(error.toString(), stack);
    });
  }

  static Future<void> _write(String error, StackTrace? stack) async {
    try {
      final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, _dirName));
      await dir.create(recursive: true);
      final ts = DateTime.now().toIso8601String().replaceAll(':', '-').split('.').first;
      final file = File(p.join(dir.path, 'crash_$ts.txt'));
      final content = StringBuffer()
        ..writeln('=== ConstructorPro — Reporte de error ===')
        ..writeln('Fecha: ${DateTime.now()}')
        ..writeln('Plataforma: ${Platform.operatingSystem} ${Platform.operatingSystemVersion}')
        ..writeln()
        ..writeln('--- Error ---')
        ..writeln(error)
        ..writeln()
        ..writeln('--- Stack trace ---')
        ..writeln(stack ?? 'sin stack');
      await file.writeAsString(content.toString());
      await _prune(dir);
    } catch (_) {
      // Nunca interferir con el flujo del crash.
    }
  }

  static Future<void> _prune(Directory dir) async {
    final logs = dir
        .listSync()
        .whereType<File>()
        .where((f) => p.basename(f.path).startsWith('crash_'))
        .toList()
      ..sort((a, b) => b.statSync().modified.compareTo(a.statSync().modified));
    for (final old in logs.skip(_maxLogs)) {
      try {
        old.deleteSync();
      } catch (_) {}
    }
  }

  /// Lista los reportes existentes (más reciente primero).
  static Future<List<File>> getLogs() async {
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, _dirName));
    if (!dir.existsSync()) return [];
    final logs = dir
        .listSync()
        .whereType<File>()
        .where((f) => p.basename(f.path).startsWith('crash_'))
        .toList()
      ..sort((a, b) => b.statSync().modified.compareTo(a.statSync().modified));
    return logs;
  }
}
