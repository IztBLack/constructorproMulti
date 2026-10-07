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

  // ── Columnas recién añadidas que hay que rellenar desde el servidor ──
  //
  // Las apunta una migración que acaba de crear una columna que el servidor ya
  // tenía llena (ver `AppDatabase.columnasPorLlenar`, que explica qué se
  // rompería sin esto). Cada entrada es `"tabla.columna"`.
  //
  // Se guardan en DISCO y no solo en memoria porque entre la migración y el
  // primer sync con red pueden pasar días: el usuario actualiza la app en la
  // obra, sin señal, y abre y cierra la app varias veces antes de sincronizar.

  static const _kPorLlenar = 'sync_columnas_por_llenar';

  /// Lo que sigue pendiente de rellenar.
  Set<String> get porLlenar =>
      _prefs.getStringList(_kPorLlenar)?.toSet() ?? const {};

  /// Anota columnas sin pisar las que ya estuvieran apuntadas.
  Future<void> marcarPorLlenar(Iterable<String> columnas) async {
    if (columnas.isEmpty) return;
    await _prefs.setStringList(_kPorLlenar, {...porLlenar, ...columnas}.toList());
  }

  /// Da una columna por atendida. Solo tras un relleno que terminó bien: si
  /// falla, el aviso tiene que sobrevivir al siguiente intento.
  Future<void> limpiarPorLlenar(String columna) async {
    // Copia: sin nada anotado, el getter devuelve un `const {}` inmodificable.
    final resto = {...porLlenar}..remove(columna);
    if (resto.isEmpty) {
      await _prefs.remove(_kPorLlenar);
    } else {
      await _prefs.setStringList(_kPorLlenar, resto.toList());
    }
  }

  /// Reinicia el cursor de una tabla (fuerza un pull completo la próxima vez).
  Future<void> reset(String table) async {
    await _prefs.remove(_kTs(table));
    await _prefs.remove(_kId(table));
  }

  /// Reinicia los cursores de TODAS las tablas (se usa al cerrar sesión o al
  /// cambiar de empresa, para evitar mezcla de datos entre dos cuentas).
  ///
  /// Por prefijo de llave y no con una lista de tablas: la lista a mano que
  /// había aquí era una copia de `SyncService.pushOrder` que había que
  /// mantener a la par, y una tabla olvidada se quedaba sin bajar completa.
  Future<void> resetAll() async {
    final cursores =
        _prefs.getKeys().where((k) => k.startsWith('sync_cursor_')).toList();
    for (final k in cursores) {
      await _prefs.remove(k);
    }
  }

  // ── Última subida completa ──
  //
  // "Última subida completa: hoy 14:32" le dice a quien está en la obra hasta
  // cuándo su trabajo está a salvo en la nube, que es la pregunta real detrás
  // del ícono de sync.

  static const _kUltimaSubida = 'sync_ultima_subida_ok';

  DateTime? get ultimaSubidaCompleta {
    final ms = _prefs.getInt(_kUltimaSubida);
    return ms == null ? null : DateTime.fromMillisecondsSinceEpoch(ms);
  }

  Future<void> marcarSubidaCompleta(DateTime cuando) =>
      _prefs.setInt(_kUltimaSubida, cuando.millisecondsSinceEpoch);
}
