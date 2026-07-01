import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../db/app_database.dart';
import 'sync_metadata.dart';
import 'supabase_config.dart';

/// Resultado de un intento de sincronización.
enum SyncOutcome { ok, sinSesion, sinRed, sinEmpresa, error }

/// Motor de sincronización offline-first (Fase 2).
///
/// Contrato:
/// - **Drift/SQLite es la fuente de verdad.** Esto solo reconcilia con Supabase.
/// - **Push** de filas locales con `sync_status='pending'` en **orden topológico
///   de FK** (padres→hijos), upsert idempotente por PK.
/// - **Pull incremental** por tabla con cursor `server_updated_at` (árbitro =
///   reloj del servidor); upsert local marcando `synced`.
/// - **LWW por fila:** en pull, si la fila local está `pending` y su `updated_at`
///   es más nuevo que el del servidor, se conserva el cambio local (se empuja luego).
/// - **Tombstones:** `deleted_at` viaja como un campo más; nunca se borra físico.
///
/// LÍMITES CONOCIDOS de v1 (documentados; refinar después):
/// - Cursor solo por `server_updated_at` (no compuesto con id) → en el borde de
///   una página con timestamps idénticos podría re-traer/saltar filas; con
///   pocos datos no se nota.
/// - Pull sin paginación (límite 1000/tabla/sync).
/// - Las EDICIONES de repos aún no remarcan `pending` (Fase 0 paso 4 diferido):
///   v1 sincroniza bien ALTAS y BORRADOS; las ediciones requieren ese marcado.
class SyncService {
  SyncService({
    required this.db,
    required this.metadata,
    SupabaseClient? client,
  }) : client = client ?? SupabaseConfig.client;

  final AppDatabase db;
  final SyncMetadata metadata;
  final SupabaseClient client;

  /// Guard compartido: evita que dos llamadas concurrentes a [syncAll] (una
  /// del [SyncController] automático y otra del botón manual) corran en
  /// paralelo y generen race conditions. Como [syncServiceProvider] es un
  /// Provider singleton, cualquier llamante usa esta misma instancia.
  bool _enCurso = false;

  /// Último error detallado de sync (para diagnóstico en la UI). Null si el
  /// último intento fue exitoso.
  String? ultimoError;

  /// Orden topológico de push: padres antes que hijos (respeta las FK de
  /// `supabase/migrations/0002_schema.sql`).
  static const List<String> pushOrder = [
    'puestos',
    'colaboradores',
    'obras',
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

  bool get tieneSesion => SupabaseConfig.currentUser != null;

  Future<bool> get hayRed async {
    final estado = await Connectivity().checkConnectivity();
    return !estado.every((r) => r == ConnectivityResult.none);
  }

  /// Punto de entrada. Disparado por: arranque, reconexión, post-escritura
  /// (con debounce) y pull-to-refresh.
  ///
  /// Si ya hay un sync en curso (p. ej. el automático del [SyncController]
  /// solapado con el manual del usuario), retorna inmediatamente para no
  /// correr dos syncs concurrentes sobre los mismos datos.
  Future<SyncOutcome> syncAll() async {
    if (_enCurso) return SyncOutcome.ok; // otro sync ya está en camino
    if (!tieneSesion) return SyncOutcome.sinSesion;
    if (!await hayRed) return SyncOutcome.sinRed;

    final empresaId = await _empresaIdActual();
    if (empresaId == null) return SyncOutcome.sinEmpresa;

    _enCurso = true;
    try {
      // 1) PUSH primero (padres→hijos) para no traer del server algo que aún
      //    no subimos y perder la edición local.
      for (final t in pushOrder) {
        await _pushTabla(t, empresaId);
      }
      // 2) PULL de cada tabla (orden indistinto: upsert idempotente).
      for (final t in pushOrder) {
        await _pullTabla(t);
      }
      ultimoError = null;
      return SyncOutcome.ok;
    } catch (e, st) {
      ultimoError = e.toString();
      debugPrint('[SyncService] ══════ syncAll ERROR ══════');
      debugPrint('[SyncService] $e');
      debugPrint('[SyncService] $st');
      return SyncOutcome.error;
    } finally {
      _enCurso = false;
    }
  }

  /// empresa_id del usuario (vía RLS). Null si no está vinculado.
  Future<String?> _empresaIdActual() async {
    final rows = await client
        .from('usuarios_empresa')
        .select('empresa_id')
        .limit(1);
    if (rows.isEmpty) return null;
    return rows.first['empresa_id'] as String?;
  }

  TableInfo _info(String name) =>
      db.allTables.firstWhere((t) => t.actualTableName == name);

  List<String> _pk(TableInfo t) => t.$primaryKey.map((c) => c.name).toList();

  Set<String> _boolCols(TableInfo t) => t.$columns
      .where((c) => c.type == DriftSqlType.bool)
      .map((c) => c.name)
      .toSet();

  // ---------------- PUSH ----------------
  Future<void> _pushTabla(String name, String empresaId) async {
    final t = _info(name);
    final pk = _pk(t);
    final boolCols = _boolCols(t);

    final pendientes =
        await db.customSelect("SELECT * FROM $name WHERE sync_status = 'pending'").get();

    if (pendientes.isNotEmpty) {
      debugPrint('[SyncService] PUSH $name: ${pendientes.length} pendientes');
    }

    for (final r in pendientes) {
      final data = Map<String, dynamic>.from(r.data);
      data.remove('sync_status'); // no existe en el servidor
      data.remove('server_updated_at'); // lo pone el trigger
      // Sobrescribimos siempre con el empresaId actual para evitar que datos 
      // cacheados de sesiones/empresas anteriores rompan RLS.
      data['empresa_id'] = empresaId;
      // SQLite guarda bool como 0/1; Postgres espera boolean.
      for (final c in boolCols) {
        if (data[c] is int) data[c] = data[c] != 0;
      }

      try {
        final resp = await client
            .from(name)
            .upsert(data, onConflict: pk.join(','))
            .select('server_updated_at')
            .maybeSingle();
        final serverUpd = (resp?['server_updated_at'] as num?)?.toInt();

        final whereSql = pk.map((c) => '$c = ?').join(' AND ');
        final whereArgs = pk.map((c) => r.data[c]).toList();
        await db.customStatement(
          "UPDATE $name SET sync_status='synced', server_updated_at=?, empresa_id=? "
          "WHERE $whereSql",
          [serverUpd, empresaId, ...whereArgs],
        );
      } catch (e) {
        final pkVals = pk.map((c) => '$c=${r.data[c]}').join(', ');
        debugPrint('[SyncService] ✖ PUSH $name fallo en fila ($pkVals): $e');
        debugPrint('[SyncService]   data enviada: $data');
        rethrow;
      }
    }
  }

  // ---------------- PULL ----------------
  Future<void> _pullTabla(String name) async {
    final t = _info(name);
    final pk = _pk(t);
    final localCols = t.$columns.map((c) => c.name).toSet();
    final cursorTs = metadata.cursorTs(name);

    final serverRows = await client
        .from(name)
        .select()
        .gt('server_updated_at', cursorTs)
        .order('server_updated_at')
        .limit(1000);

    var maxTs = cursorTs;
    String lastId = metadata.cursorId(name) ?? '';

    for (final row in (serverRows as List).cast<Map<String, dynamic>>()) {
      final sut = (row['server_updated_at'] as num?)?.toInt() ?? 0;
      if (sut > maxTs) maxTs = sut;

      // LWW: conservar edición local no sincronizada más nueva.
      final whereSql = pk.map((c) => '$c = ?').join(' AND ');
      final pkArgs = pk.map((c) => row[c]).toList();
      final locales = await db
          .customSelect(
            "SELECT sync_status, updated_at FROM $name WHERE $whereSql",
            variables: pkArgs.map<Variable>((a) => Variable(a)).toList(),
          )
          .get();
      if (locales.isNotEmpty) {
        final lr = locales.first.data;
        final pending = lr['sync_status'] == 'pending';
        final localUpd = (lr['updated_at'] as int?) ?? 0;
        final serverUserUpd = (row['updated_at'] as num?)?.toInt() ?? 0;
        if (pending && localUpd > serverUserUpd) {
          continue; // gana el cambio local; se empujará en el próximo push
        }
      }

      // Upsert local con sync_status='synced'.
      final cols = row.keys.where(localCols.contains).toList();
      final colList = [...cols, 'sync_status'].join(',');
      final placeholders = List.filled(cols.length + 1, '?').join(',');
      final vals = <Object?>[...cols.map((c) => row[c]), 'synced'];
      await db.customStatement(
        "INSERT OR REPLACE INTO $name ($colList) VALUES ($placeholders)",
        vals,
      );

      if (pk.length == 1) lastId = row[pk.first]?.toString() ?? lastId;
    }

    if (maxTs > cursorTs) {
      await metadata.setCursor(name, maxTs, lastId);
    }
  }
}
