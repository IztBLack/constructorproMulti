import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Registro local de errores (100% offline), equivalente al CrashLogger del
/// proyecto Kotlin. Captura errores de Flutter y de la zona; guarda un archivo
/// por crash y conserva los 10 más recientes. No envía nada por la red.
class CrashLogger {
  static const _dirName = 'crash_logs';
  static const _maxLogs = 10;

  /// Ejecuta la app dentro de una zona protegida que captura cualquier crash.
  static Future<void> runGuarded(Future<void> Function() body) async {
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
