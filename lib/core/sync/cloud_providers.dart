import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/providers.dart';
import '../settings/settings_provider.dart';
import 'supabase_config.dart';
import 'sync_controller.dart';
import 'sync_metadata.dart';
import 'sync_service.dart';
import 'sync_status.dart';

/// Estado de auth de Supabase (emite en login/logout/refresh de sesión).
final authStateProvider = StreamProvider<AuthState>(
    (ref) => SupabaseConfig.client.auth.onAuthStateChange);

/// Usuario actual (reactivo). Null = sin sesión.
final currentUserProvider = Provider<User?>((ref) {
  ref.watch(authStateProvider); // re-evalúa al cambiar la sesión
  return SupabaseConfig.currentUser;
});

const _kEmpresaId = 'empresa_id';
const _kEmpresaNombre = 'empresa_nombre';

/// `empresa_id` del usuario, persistido tras el login. Null si no se ha resuelto.
final empresaIdProvider = Provider<String?>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(sharedPreferencesProvider).getString(_kEmpresaId);
});

/// Último nombre de empresa conocido, leído de prefs. Se usa para pintar algo
/// de inmediato (y en modo avión) mientras [empresaNombreProvider] confirma
/// contra el servidor: un UUID no le dice nada a nadie, pero un nombre viejo
/// sigue siendo cierto casi siempre.
final empresaNombreCacheProvider = Provider<String?>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(sharedPreferencesProvider).getString(_kEmpresaNombre);
});

/// Nombre de la empresa del usuario, resuelto contra `empresas` (la tabla NO se
/// sincroniza a Drift, así que se consulta directo; RLS ya limita la fila a la
/// empresa propia).
///
/// El servidor es la única fuente de verdad: si un administrador renombra la
/// empresa en la web, todos los dispositivos muestran el nombre nuevo la próxima
/// vez que resuelven, sin tocar nada en cada teléfono. La copia en prefs es solo
/// para no quedarse sin texto offline.
final empresaNombreProvider = FutureProvider<String?>((ref) async {
  final empresaId = ref.watch(empresaIdProvider);
  final cache = ref.watch(empresaNombreCacheProvider);
  if (empresaId == null) return null;
  try {
    final row = await SupabaseConfig.client
        .from('empresas')
        .select('nombre')
        .eq('id', empresaId)
        .maybeSingle();
    final nombre = (row?['nombre'] as String?)?.trim();
    if (nombre == null || nombre.isEmpty) return cache;
    if (nombre != cache) {
      await ref.read(sharedPreferencesProvider).setString(_kEmpresaNombre, nombre);
    }
    return nombre;
  } catch (e) {
    // Sin red o RLS negando: se conserva lo último conocido en vez de mostrar
    // un hueco o el UUID.
    debugPrint('[cloud_providers] empresaNombre error: $e');
    return cache;
  }
});

/// Nombre de la persona dueña de la sesión.
///
/// Vive en la metadata del usuario de Supabase (`nombre`), que es lo que llena
/// el alta desde la web; si no está, se cae al correo, que siempre existe. Nunca
/// devuelve el UUID: un identificador no ayuda a saber con qué cuenta trabajas.
final cuentaNombreProvider = Provider<String?>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return null;
  final meta = user.userMetadata?['nombre'];
  final nombre = meta is String ? meta.trim() : '';
  return nombre.isNotEmpty ? nombre : user.email;
});

final syncMetadataProvider = Provider<SyncMetadata>(
    (ref) => SyncMetadata(ref.watch(sharedPreferencesProvider)));

final syncServiceProvider = Provider<SyncService>((ref) => SyncService(
      db: ref.watch(databaseProvider),
      metadata: ref.watch(syncMetadataProvider),
      // Refleja "hay un sync corriendo" en un provider observable por la UI. Se
      // difiere con microtask para no mutar estado de Riverpod en medio de la
      // construcción de otro provider (lo prohíbe) cuando el sync arranca
      // sincrónicamente al inicio.
      onActividad: (activo) => Future.microtask(
          () => ref.read(syncEnCursoProvider.notifier).state = activo),
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
    // Y se refresca el NOMBRE: este método ya corre en el login y al abrir la
    // pantalla de nube, así que es el punto natural para que un renombrado
    // hecho en la web aparezca en el dispositivo sin acción del usuario.
    ref.invalidate(empresaNombreProvider);
    return empresaId;
  } catch (e) {
    debugPrint('[cloud_providers] resolverEmpresaYsellar error: $e');
    return null;
  }
}
