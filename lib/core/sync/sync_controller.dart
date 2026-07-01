import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../db/app_database.dart';
import 'supabase_config.dart';
import 'sync_service.dart';

/// Orquesta el sync **automático**:
/// 1. al arrancar la app,
/// 2. al reconectar (offline → online),
/// 3. tras cada escritura local (cualquier tabla), con debounce.
///
/// El sync manual (botón "Sincronizar ahora") sigue disponible aparte. Si no hay
/// sesión, los disparos se ignoran sin costo.
class SyncController {
  SyncController(this._service, this._db);

  final SyncService _service;
  final AppDatabase _db;

  StreamSubscription<List<ConnectivityResult>>? _connSub;
  StreamSubscription<dynamic>? _dbSub;
  Timer? _debounce;
  Timer? _poll;
  bool _corriendo = false;

  void start() {
    _agendar(const Duration(seconds: 1)); // arranque

    _connSub = Connectivity().onConnectivityChanged.listen((estado) {
      final online = !estado.every((r) => r == ConnectivityResult.none);
      if (online && !_corriendo) _agendar(const Duration(seconds: 1));
    });

    // Tras cualquier escritura local. Se ignora mientras un sync está activo
    // para no realimentarse con sus propias escrituras.
    _dbSub = _db.tableUpdates().listen((_) {
      if (!_corriendo) _agendar(const Duration(seconds: 3));
    });

    // Sondeo periódico: trae cambios hechos en OTRO dispositivo/la web aunque
    // aquí no haya ningún disparo local. (Sustituible por Supabase Realtime.)
    _poll = Timer.periodic(const Duration(seconds: 25), (_) {
      if (!_corriendo) _ejecutar();
    });
  }

  void _agendar(Duration d) {
    _debounce?.cancel();
    _debounce = Timer(d, _ejecutar);
  }

  Future<void> _ejecutar() async {
    if (_corriendo) return;
    if (SupabaseConfig.currentUser == null) return; // sin sesión: no sync
    _corriendo = true;
    try {
      await _service.syncAll();
    } finally {
      _corriendo = false;
    }
  }

  void dispose() {
    _connSub?.cancel();
    _dbSub?.cancel();
    _debounce?.cancel();
    _poll?.cancel();
  }
}
