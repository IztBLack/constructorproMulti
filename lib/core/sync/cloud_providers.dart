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
Future<String?> resolverEmpresaYsellar(WidgetRef ref) async {
  final user = SupabaseConfig.currentUser;
  if (user == null) return null;

  final rows = await SupabaseConfig.client
      .from('usuarios_empresa')
      .select('empresa_id')
      .limit(1);
  if (rows.isEmpty) return null;

  final empresaId = rows.first['empresa_id'] as String;
  await ref.read(sharedPreferencesProvider).setString(_kEmpresaId, empresaId);
  await ref.read(databaseProvider).sellarEmpresaId(empresaId);
  ref.invalidate(empresaIdProvider);
  return empresaId;
}
