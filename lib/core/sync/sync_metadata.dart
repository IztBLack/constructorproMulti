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

  /// Reinicia los cursores de TODAS las tablas conocidas (se usa al cerrar
  /// sesión o al detectar un cambio de empresa, para evitar mezcla de datos
  /// entre dos cuentas/empresas distintas).
  Future<void> resetAll() async {
    // Las mismas tablas que SyncService.pushOrder; se duplica aquí para no
    // crear una dependencia circular entre sync_metadata y sync_service.
    const tablas = [
      'puestos',
      'colaboradores',
      'colaborador_sueldo',
      'obras',
      'obra_caja_nota',
      'nota_obra',
      'nota_obra_renglon',
      'cuadrillas',
      'cuadrilla_miembro',
      'asignacion_cuadrilla_obra',
      'obra_presupuesto',
      'cotizaciones',
      'secciones',
      'partidas',
      'pagos',
      'obra_colaborador',
      'asistencias',
      'destajos',
      'movimientos',
      'catalogo_conceptos',
      'archivos_cotizacion',
    ];
    for (final t in tablas) {
      await reset(t);
    }
  }
}
