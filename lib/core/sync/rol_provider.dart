import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../settings/settings_provider.dart';
import 'cloud_providers.dart';
import 'supabase_config.dart';

/// Clave del rol cacheado en SharedPreferences (para resolver offline).
const _kRolUsuario = 'rol_usuario';

/// Decisión PURA de permiso (sin red), para poder testearla y reusarla.
///
/// Regla CONSERVADORA: solo se restringe cuando el rol es CONOCIDO y es uno de
/// los roles de solo-lectura para operación ('contador' o 'colaborador'). Ante
/// cualquier otro caso —null, cadena vacía, 'admin', 'supervisor' o un rol
/// desconocido— se concede acceso total. NUNCA queremos bloquear a un admin por
/// un fallo de red o por un valor que no supimos leer: preferimos que el push
/// rechace una escritura ilegítima (ya existe el indicador de error de sync) a
/// esconderle acciones a quien sí tiene permiso.
///
/// La CAJA no se restringe aquí: el contador SÍ la usa (ver migración 0022).
bool puedeEditarOperacionSegunRol(String? rol) {
  return rol != 'contador' && rol != 'colaborador';
}

/// Rol del usuario actual, resuelto desde Supabase (`usuarios_empresa`, igual
/// que `resolverEmpresaYsellar`) y cacheado en SharedPreferences para funcionar
/// offline.
///
/// Estrategia offline-first: si hay red, consulta el servidor —la fuente de
/// verdad— y actualiza el cache; si no, cae al último rol conocido. Sin sesión,
/// o si no se pudo resolver nada, devuelve null → acceso total (conservador).
final rolUsuarioProvider = FutureProvider<String?>((ref) async {
  // Re-evalúa al cambiar la sesión (login/logout/refresh).
  final user = ref.watch(currentUserProvider);
  final prefs = ref.watch(sharedPreferencesProvider);

  // Sin sesión no restringimos nada (no hay obra/cotización que editar en la
  // pantalla de login, y devolver el rol de una cuenta anterior sería incorrecto).
  if (user == null) return null;

  final cache = prefs.getString(_kRolUsuario);
  try {
    final rows = await SupabaseConfig.client
        .from('usuarios_empresa')
        .select('rol')
        .limit(1);
    if (rows.isEmpty) return cache;
    final rol = rows.first['rol'] as String?;
    if (rol != null) await prefs.setString(_kRolUsuario, rol);
    return rol ?? cache;
  } catch (e) {
    // Offline / fallo de red: usamos el último rol conocido. No bloqueamos.
    debugPrint('[rol_provider] no se pudo resolver el rol: $e');
    return cache;
  }
});

/// Helper booleano listo para la UI: ¿este usuario puede crear/editar/borrar
/// operación (obras, cotizaciones, nómina, presupuesto)?
///
/// CONSERVADOR: mientras el rol carga, o si hubo error, se concede acceso total
/// —no queremos ocultarle acciones a un admin mientras la red resuelve—. Solo se
/// restringe con un rol CONOCIDO y de solo-lectura.
final puedeEditarOperacionProvider = Provider<bool>((ref) {
  return ref.watch(rolUsuarioProvider).maybeWhen(
        data: puedeEditarOperacionSegunRol,
        orElse: () => true,
      );
});
