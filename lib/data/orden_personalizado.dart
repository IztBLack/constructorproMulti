/// ORDEN PERSONALIZADO (paridad web, migración 0026).
///
/// Dos piezas:
///   1. [OrdenRepository]: escribe la columna `orden` de las tablas reordenables.
///      Esa columna viaja en el sync normal de Drift (es común, no jsonb), así que
///      la posición se replica a todos los dispositivos por el push/pull existente.
///   2. [OrdenModoService]: guarda el MODO por lista (nombre|personalizado) en
///      `empresa_config.ui_orden` (jsonb) de Supabase. El móvil lo lee/escribe
///      DIRECTO (no por el motor Drift, que no maneja jsonb) y lo cachea en
///      SharedPreferences para funcionar offline.
library;

import 'dart:convert';

import 'package:drift/drift.dart' show Variable;
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/db/app_database.dart';
import '../core/sync/supabase_config.dart';

/// Claves de lista (deben coincidir con las que usa la web en `empresa_config`).
class OrdenLista {
  static const cuadrillas = 'cuadrillas';
  static const cuadrillaMiembro = 'cuadrilla_miembro';
  static const colaboradores = 'colaboradores';
  static const obras = 'obras';
  static const cotizaciones = 'cotizaciones';
  static const puestos = 'puestos';
  static const catalogo = 'catalogo_conceptos';
}

/// Modos de orden (estilo Spotify). Cada CRITERIO tiene su sentido natural y su
/// inverso (sufijo `_desc`); volver a elegir el criterio activo lo invierte. El
/// valor se guarda tal cual en `empresa_config.ui_orden` y lo comparten móvil y
/// web (ver `web/src/lib/data/orden-modos.ts`, que aplica las MISMAS reglas).
const modoNombre = 'nombre';
const modoRecientes = 'recientes'; // agregados recientes (created_at desc)
const modoModificados = 'modificados'; // últimos modificados (updated_at desc)
const modoPersonalizado = 'personalizado'; // manual, de arriba hacia abajo

/// Criterios que ofrece el menú, en orden de aparición.
const ordenBases = <String>[
  modoNombre,
  modoRecientes,
  modoModificados,
  modoPersonalizado,
];

/// Criterio de un modo, ignorando el sentido.
String baseDe(String modo) =>
    modo.endsWith('_desc') ? modo.substring(0, modo.length - 5) : modo;

/// True si el modo va en sentido inverso al natural de su criterio.
bool esInvertido(String modo) => modo.endsWith('_desc');

String componerModo(String base, bool invertido) =>
    invertido ? '${base}_desc' : base;

/// Qué modo aplicar al tocar [base] estando en [actual]: si es el criterio ya
/// activo, invierte el sentido; si es otro, entra en su sentido natural.
String alternarModo(String actual, String base) =>
    baseDe(actual) != base ? base : componerModo(base, !esInvertido(actual));

/// True si el modo respeta la posición manual (`orden`), en cualquier dirección.
bool esModoPersonalizado(String modo) => baseDe(modo) == modoPersonalizado;

/// Nombre del criterio (sin el sentido).
String etiquetaBase(String base) => switch (base) {
      modoRecientes => 'Agregados recientes',
      modoModificados => 'Últimos modificados',
      modoPersonalizado => 'Orden personalizado',
      _ => 'Por nombre',
    };

/// Cómo se lee cada sentido: [natural, invertido]. Se nombra el RESULTADO (qué
/// queda arriba), no "asc/desc".
List<String> direccionesDe(String base) => switch (base) {
      modoRecientes => const ['Más nuevos primero', 'Más antiguos primero'],
      modoModificados => const ['Editados al último', 'Editados hace más'],
      modoPersonalizado => const ['Arriba → abajo', 'Abajo → arriba'],
      _ => const ['A → Z', 'Z → A'],
    };

/// Etiqueta completa del modo activo (la que muestra el botón de orden).
String etiquetaModo(String modo) {
  final base = baseDe(modo);
  final dirs = direccionesDe(base);
  return '${etiquetaBase(base)} · ${esInvertido(modo) ? dirs[1] : dirs[0]}';
}

/// Separación entre posiciones al reordenar. Deja huecos para insertar sin
/// renumerar toda la lista (100, 200, 300…).
const _paso = 100;

/// Escribe posiciones `orden` sobre cualquier tabla reordenable. Marca las filas
/// `pending` (vía updated_at + sync_status) para que el push las suba.
class OrdenRepository {
  final AppDatabase db;
  OrdenRepository(this.db);

  /// Reasigna `orden` a las filas de [tabla] en el orden dado por [pksEnOrden]
  /// (cada elemento son los valores de las columnas [pkCols], en ese orden).
  /// Todo en una transacción. Ej. flat: pkCols=['id']; compuesta:
  /// pkCols=['cuadrilla_id','colaborador_id'].
  Future<void> reordenar({
    required String tabla,
    required List<String> pkCols,
    required List<List<Object?>> pksEnOrden,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final whereSql = pkCols.map((c) => '$c = ?').join(' AND ');
    // customUpdate (NO customStatement) + `updates`: es lo único que hace que
    // Drift marque la tabla como sucia y los `.watch()` de la UI vuelvan a
    // emitir. Con customStatement la fila SÍ se guardaba, pero la lista se
    // repintaba con el snapshot viejo y el elemento arrastrado "regresaba" a su
    // lugar. Mismo motivo por el que el pull del sync usa customUpdate.
    final info = db.allTables.firstWhere((t) => t.actualTableName == tabla);
    await db.transaction(() async {
      for (var i = 0; i < pksEnOrden.length; i++) {
        await db.customUpdate(
          "UPDATE $tabla SET orden = ?, updated_at = ?, sync_status = 'pending' "
          "WHERE $whereSql",
          variables: [
            Variable<int>((i + 1) * _paso),
            Variable<int>(now),
            ...pksEnOrden[i].map((v) => Variable(v)),
          ],
          updates: {info},
        );
      }
    });
  }

  /// Azúcar para tablas con PK simple `id`.
  Future<void> reordenarPorId(String tabla, List<String> idsEnOrden) =>
      reordenar(
        tabla: tabla,
        pkCols: const ['id'],
        pksEnOrden: idsEnOrden.map((id) => [id]).toList(),
      );
}

/// Lee/escribe el MODO de orden por lista, respaldado en Supabase
/// (`empresa_config.ui_orden`) y cacheado en SharedPreferences.
class OrdenModoService {
  final SharedPreferences prefs;
  OrdenModoService(this.prefs);

  static const _cacheKey = 'ui_orden_cache';

  Map<String, String> _leerCache() {
    final raw = prefs.getString(_cacheKey);
    if (raw == null || raw.isEmpty) return {};
    try {
      final m = json.decode(raw) as Map<String, dynamic>;
      return m.map((k, v) => MapEntry(k, v.toString()));
    } catch (_) {
      return {};
    }
  }

  Future<void> _guardarCache(Map<String, String> m) async {
    await prefs.setString(_cacheKey, json.encode(m));
  }

  /// Modo cacheado de una lista (default: por nombre).
  String modoDe(String listKey) => _leerCache()[listKey] ?? modoNombre;

  Map<String, String> get todos => _leerCache();

  /// Baja el `ui_orden` del servidor y refresca la caché. Silencioso si no hay
  /// red/sesión: se conserva lo cacheado.
  Future<Map<String, String>> refrescar() async {
    if (SupabaseConfig.currentUser == null) return _leerCache();
    try {
      final row = await SupabaseConfig.client
          .from('empresa_config')
          .select('ui_orden')
          .maybeSingle();
      final crudo = row?['ui_orden'];
      if (crudo is Map) {
        final m = crudo.map((k, v) => MapEntry(k.toString(), v.toString()));
        await _guardarCache(m);
        return m;
      }
    } catch (e) {
      debugPrint('[OrdenModo] refrescar falló: $e');
    }
    return _leerCache();
  }

  /// Fija el modo de una lista: escribe la caché de inmediato (para respuesta
  /// instantánea y offline) y, si hay sesión, lo persiste en Supabase para que
  /// el resto de dispositivos lo reciban. Devuelve el mapa resultante.
  Future<Map<String, String>> setModo(String listKey, String modo) async {
    final m = _leerCache();
    m[listKey] = modo;
    await _guardarCache(m);
    if (SupabaseConfig.currentUser != null) {
      try {
        await SupabaseConfig.client.from('empresa_config').update({
          'ui_orden': m,
          'updated_at': DateTime.now().millisecondsSinceEpoch,
        }).eq('empresa_id', await _empresaId());
      } catch (e) {
        debugPrint('[OrdenModo] setModo no se subió (se guardó local): $e');
      }
    }
    return m;
  }

  Future<String> _empresaId() async {
    // Igual que SyncService._empresaIdActual: limit(1) en vez de maybeSingle para
    // no lanzar si el usuario estuviera vinculado a más de una empresa.
    final rows = await SupabaseConfig.client
        .from('usuarios_empresa')
        .select('empresa_id')
        .limit(1);
    if (rows.isEmpty) return '';
    return (rows.first['empresa_id'] ?? '') as String;
  }
}
