import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/providers.dart';
import '../settings/settings_provider.dart';
import 'supabase_config.dart';
import 'sync_controller.dart';
import 'sync_metadata.dart';
import 'sync_service.dart';

/// Estado de auth de Supabase (emite en login/logout/refresh de sesión).
final authStateProvider = StreamProvider<AuthState>(
    (ref) => SupabaseConfig.client.auth.onAuthStateChange);

/// Usuario actual (reactivo). Null = sin sesión.
final currentUserProvider = Provider<User?>((ref) {
  ref.watch(authStateProvider); // re-evalúa al cambiar la sesión
  return SupabaseConfig.currentUser;
});

const _kEmpresaId = 'empresa_id';

/// `empresa_id` del usuario, persistido tras el login. Null si no se ha resuelto.
final empresaIdProvider = Provider<String?>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(sharedPreferencesProvider).getString(_kEmpresaId);
});

final syncMetadataProvider = Provider<SyncMetadata>(
    (ref) => SyncMetadata(ref.watch(sharedPreferencesProvider)));

final syncServiceProvider = Provider<SyncService>((ref) => SyncService(
      db: ref.watch(databaseProvider),
      metadata: ref.watch(syncMetadataProvider),
    ));

/// Orquestador del sync automático (arranque, reconexión, post-escritura).
/// Mantente vivo observándolo desde la app (ver main.dart).
final syncControllerProvider = Provider<SyncController>((ref) {
  final c = SyncController(
    ref.watch(syncServiceProvider),
    ref.watch(databaseProvider),
  );
  c.start();
  ref.onDispose(c.dispose);
  return c;
});

/// Tras un login exitoso: resuelve el `empresa_id` del usuario (vía
/// `usuarios_empresa`, protegido por RLS), lo persiste y **sella** las filas
/// locales que se crearon offline sin empresa. Devuelve el `empresa_id` o null
/// si el usuario aún no está vinculado a ninguna empresa.
///
/// Si la empresa resuelta es DISTINTA a la que había en prefs (cambio de
/// cuenta/empresa), resetea todos los cursores de sync antes de sellar para
/// forzar un pull completo de la empresa nueva y evitar mezcla de datos.
Future<String?> resolverEmpresaYsellar(WidgetRef ref) async {
  final user = SupabaseConfig.currentUser;
  if (user == null) return null;

  try {
    final rows = await SupabaseConfig.client
        .from('usuarios_empresa')
        .select('empresa_id')
        .limit(1);
    if (rows.isEmpty) {
      // El servidor es la fuente de verdad: este usuario NO tiene empresa.
      // Limpia cualquier empresa_id viejo en prefs (p. ej. de una vinculación
      // previa a un reset de la BD) para que la UI muestre la pantalla de
      // vinculación y no salte a "conectado" con datos huérfanos.
      final prefs = ref.read(sharedPreferencesProvider);
      if (prefs.getString(_kEmpresaId) != null) {
        await prefs.remove(_kEmpresaId);
        await ref.read(syncMetadataProvider).resetAll();
        ref.invalidate(empresaIdProvider);
      }
      return null;
    }

    final empresaId = rows.first['empresa_id'] as String;
    final prefs = ref.read(sharedPreferencesProvider);
    final empresaAnterior = prefs.getString(_kEmpresaId);

    // Detecta cambio de empresa: resetea cursores para forzar pull completo.
    if (empresaAnterior != null && empresaAnterior != empresaId) {
      debugPrint(
        '[cloud_providers] Cambio de empresa detectado '
        '($empresaAnterior → $empresaId). Reseteando cursores de sync.',
      );
      await ref.read(syncMetadataProvider).resetAll();
    }

    await prefs.setString(_kEmpresaId, empresaId);
    await ref.read(databaseProvider).sellarEmpresaId(empresaId);
    ref.invalidate(empresaIdProvider);
    return empresaId;
  } catch (e) {
    debugPrint('[cloud_providers] resolverEmpresaYsellar error: $e');
    return null;
  }
}
