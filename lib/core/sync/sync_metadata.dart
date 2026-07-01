import 'package:shared_preferences/shared_preferences.dart';

/// Persiste el **cursor de pull** por tabla: el par `(server_updated_at, id)`
/// de la última fila traída del servidor. Compuesto (no solo el timestamp) para
/// no perder filas cuando varios registros comparten `server_updated_at` en el
/// borde de una página (corrección clave del plan de sync).
class SyncMetadata {
  SyncMetadata(this._prefs);

  final SharedPreferences _prefs;

  String _kTs(String table) => 'sync_cursor_${table}_ts';
  String _kId(String table) => 'sync_cursor_${table}_id';

  /// Último `server_updated_at` sincronizado (0 = nunca).
  int cursorTs(String table) => _prefs.getInt(_kTs(table)) ?? 0;

  /// Último `id` sincronizado para desempatar timestamps iguales.
  String? cursorId(String table) => _prefs.getString(_kId(table));

  Future<void> setCursor(String table, int serverUpdatedAt, String id) async {
    await _prefs.setInt(_kTs(table), serverUpdatedAt);
    await _prefs.setString(_kId(table), id);
  }

  /// Reinicia el cursor de una tabla (fuerza un pull completo la próxima vez).
  Future<void> reset(String table) async {
    await _prefs.remove(_kTs(table));
    await _prefs.remove(_kId(table));
  }
}
