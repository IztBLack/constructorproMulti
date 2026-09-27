/// LECTURA DE MÓDULOS en el móvil: `empresa_config.modulos` (migración 0035).
///
/// Mismo patrón que `ui_orden` (`OrdenModoService`) y `pdf_config`
/// (`PdfConfigService`): el móvil lee la columna DIRECTO de Supabase —no por el
/// motor Drift— y la cachea en SharedPreferences. No hace falta una columna en
/// Drift ni en el sync: el móvil solo lee, y la lista cabe en una preferencia.
///
/// REGLA DE ORO: el móvil nunca se queda vacío por falta de red o de cuenta.
///   · Sin sesión o sin empresa vinculada (modo offline puro) → todo prendido.
///   · Con cuenta, sin señal → la última lista bajada PARA ESA EMPRESA.
///   · Sin nada en caché, o la base sin 0035 → todo prendido.
///
/// Solo se LEE. Los módulos se cambian en la web (Ajustes → Módulos), con la
/// RPC `activar_modulos`, que valida y resuelve dependencias.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../settings/settings_provider.dart';
import '../sync/cloud_providers.dart';
import '../sync/supabase_config.dart';
import '../sync/sync_status.dart';
import 'modulos.dart';

/// Lee el valor crudo de `empresa_config.modulos` de una empresa. Devuelve
/// `null` si no hay fila. Lanza si no hay red o la columna no existe.
typedef LectorModulos = Future<Object?> Function(String empresaId);

Future<Object?> _leerDeSupabase(String empresaId) async {
  // Filtrado por la empresa resuelta (no `maybeSingle` a secas): si alguien
  // estuviera en dos empresas, así se lee la MISMA que el resto del móvil.
  final row = await SupabaseConfig.client
      .from('empresa_config')
      .select('modulos')
      .eq('empresa_id', empresaId)
      .maybeSingle();
  return row?['modulos'];
}

class ModulosService {
  ModulosService(this.prefs, {LectorModulos? lector})
    : _lector = lector ?? _leerDeSupabase;

  final SharedPreferences prefs;
  final LectorModulos _lector;

  static const cacheKey = 'modulos_empresa_cache';

  /// Lo cacheado para [empresaId]. La caché guarda de qué empresa es: la lista
  /// de otra cuenta que se usó antes en este teléfono NO se aplica.
  ModulosActivos leerCache(String? empresaId) {
    if (empresaId == null) return ModulosActivos.porDefecto;
    final raw = prefs.getString(cacheKey);
    if (raw == null || raw.isEmpty) return ModulosActivos.porDefecto;
    try {
      final m = json.decode(raw) as Map<String, dynamic>;
      if (m['empresaId'] != empresaId) return ModulosActivos.porDefecto;
      return ModulosActivos(
        normalizarModulos(m['modulos']),
        FuenteModulos.cache,
      );
    } catch (_) {
      return ModulosActivos.porDefecto;
    }
  }

  /// Baja la lista del servidor y refresca la caché. Silencioso sin red: se
  /// queda con lo cacheado.
  Future<ModulosActivos> refrescar({
    required bool conSesion,
    required String? empresaId,
  }) async {
    if (!conSesion || empresaId == null) return ModulosActivos.porDefecto;
    try {
      final crudo = await _lector(empresaId);
      if (crudo is! List) {
        // Sin fila o sin columna con dato: el paquete de siempre. Se borra la
        // caché para no revivir después una lista que el servidor ya no tiene.
        await prefs.remove(cacheKey);
        return ModulosActivos.porDefecto;
      }
      final activos = normalizarModulos(crudo);
      await prefs.setString(
        cacheKey,
        json.encode({
          'empresaId': empresaId,
          'modulos': [for (final c in activos) c.name],
        }),
      );
      return ModulosActivos(activos, FuenteModulos.servidor);
    } catch (e) {
      debugPrint('[Modulos] refrescar falló (se usa la caché): $e');
      return leerCache(empresaId);
    }
  }
}

final modulosServiceProvider = Provider<ModulosService>(
  (ref) => ModulosService(ref.watch(sharedPreferencesProvider)),
);

/// Módulos prendidos de la empresa. Arranca SÍNCRONO de la caché (la primera
/// pantalla ya sale bien, con o sin señal) y confirma contra el servidor en
/// segundo plano. Se vuelve a leer al cambiar la sesión o la empresa, y al
/// terminar cada sync: así un cambio hecho en la web llega al teléfono en el
/// mismo momento en que llegan los datos.
final modulosProvider = NotifierProvider<ModulosNotifier, ModulosActivos>(
  ModulosNotifier.new,
);

class ModulosNotifier extends Notifier<ModulosActivos> {
  @override
  ModulosActivos build() {
    final conSesion = ref.watch(currentUserProvider) != null;
    final empresaId = ref.watch(empresaIdProvider);
    final service = ref.watch(modulosServiceProvider);

    ref.listen<bool>(syncEnCursoProvider, (antes, ahora) {
      if (antes == true && !ahora) refrescar();
    });

    Future.microtask(refrescar);
    if (!conSesion) return ModulosActivos.porDefecto;
    return service.leerCache(empresaId);
  }

  /// Relee del servidor. Seguro de llamar sin red ni sesión.
  Future<void> refrescar() async {
    final conSesion = ref.read(currentUserProvider) != null;
    final empresaId = ref.read(empresaIdProvider);
    final nuevo = await ref
        .read(modulosServiceProvider)
        .refrescar(conSesion: conSesion, empresaId: empresaId);
    if (!ref.mounted) return;
    if (nuevo != state) state = nuevo;
  }
}
