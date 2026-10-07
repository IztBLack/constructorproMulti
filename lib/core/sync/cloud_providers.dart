import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/providers.dart';
import '../modulos/modulos_provider.dart';
import '../settings/settings_provider.dart';
import 'bitacora_avisos.dart';
import 'bitacora_remoto.dart';
import 'bitacora_sync.dart';
import 'cuenta_local.dart';
import 'rol_provider.dart';
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
    // Y como nombre del dueño de los datos locales: si otra cuenta entra en
    // este teléfono, el aviso dirá "cambios de *este nombre*".
    final cuenta = ref.read(cuentaLocalProvider);
    if (cuenta.dueno == empresaId) {
      await cuenta.fijarDueno(empresaId, nombre: nombre);
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

/// Avisos de la bitácora que ya no se reintentan (docs/PLAN_BITACORA_MOVIL.md §2.3).
final avisosBitacoraProvider = Provider<AvisosBitacora>(
    (ref) => AvisosBitacora(ref.watch(sharedPreferencesProvider)));

final bitacoraRemotoProvider = Provider<BitacoraRemoto>(
    (ref) => SupabaseBitacoraRemoto(SupabaseConfig.client));

/// Push propio de la bitácora ("insertar primero"); lo usa [syncServiceProvider]
/// y la pantalla para publicar al cliente.
final bitacoraSyncProvider = Provider<BitacoraSync>((ref) {
  final fotos = ref.watch(fotosBitacoraStorageProvider);
  return BitacoraSync(
    db: ref.watch(databaseProvider),
    remoto: ref.watch(bitacoraRemotoProvider),
    avisos: ref.watch(avisosBitacoraProvider),
    archivoLocal: fotos.archivo,
  );
});

/// De quién son los datos de la base local (ver [CuentaLocal]).
final cuentaLocalProvider = Provider<CuentaLocal>(
    (ref) => CuentaLocal(ref.watch(sharedPreferencesProvider)));

final syncServiceProvider = Provider<SyncService>((ref) => SyncService(
      db: ref.watch(databaseProvider),
      metadata: ref.watch(syncMetadataProvider),
      bitacora: ref.watch(bitacoraSyncProvider),
      cuentaLocal: ref.watch(cuentaLocalProvider),
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

/// La persona eligió no descartar los cambios sin subir de la cuenta anterior
/// (decisión D1: "Volver a esa cuenta"). No se tocó nada de la base local.
class CambioDeCuentaCancelado implements Exception {
  const CambioDeCuentaCancelado();
}

/// Pregunta a la persona qué hacer con [CambioDeCuenta.sinSubir] cambios de la
/// cuenta anterior. `true` = descartarlos y seguir con la cuenta nueva.
typedef ConfirmarCambioDeCuenta = Future<bool> Function(CambioDeCuenta info);

/// Tras un login exitoso: resuelve el `empresa_id` del usuario (vía
/// `usuarios_empresa`, protegido por RLS) y deja la base local lista para esa
/// empresa con [adoptarEmpresa]. Devuelve el `empresa_id` o null si el usuario
/// aún no está vinculado a ninguna empresa.
///
/// Lanza [CambioDeCuentaCancelado] si el teléfono tenía datos de otra cuenta
/// sin subir y la persona prefirió no descartarlos.
///
/// [timeout] limita SOLO la consulta de red (un cuelgue no es un error y la
/// pantalla giraría para siempre); no cuenta el tiempo que la persona tarde en
/// decidir en el diálogo. Lanza `TimeoutException` si se cumple.
Future<String?> resolverEmpresaYsellar(WidgetRef ref,
    {ConfirmarCambioDeCuenta? confirmarCambio, Duration? timeout}) async {
  final user = SupabaseConfig.currentUser;
  if (user == null) return null;

  final String empresaId;
  try {
    final consulta =
        SupabaseConfig.client.from('usuarios_empresa').select('empresa_id').limit(1);
    final rows =
        timeout == null ? await consulta : await consulta.timeout(timeout);
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

    empresaId = rows.first['empresa_id'] as String;
  } on TimeoutException {
    rethrow; // la pantalla lo muestra como "no se pudo verificar", no "sin empresa"
  } catch (e) {
    debugPrint('[cloud_providers] resolverEmpresaYsellar error: $e');
    return null;
  }

  // Fuera del try: un fallo al rehacer la base local NO es "sin empresa" (eso
  // mandaría a la pantalla de vinculación); la pantalla lo muestra como error.
  await adoptarEmpresa(ref, empresaId, confirmarCambio: confirmarCambio);
  return empresaId;
}

/// Deja la base local lista para trabajar con [empresaId]. Es el único camino
/// por el que una empresa se vuelve dueña de los datos del teléfono: lo usan el
/// login y la vinculación con código.
///
/// 1. Revisa ANTES de sellar si la base tiene datos de otra cuenta
///    ([clasificarEntrada]).
/// 2. Si es un cambio de cuenta y hay cambios sin subir, pregunta con
///    [confirmarCambio] (sin quien pregunte, no descarta nada y lanza
///    [CambioDeCuentaCancelado]). Sin pendientes, vacía directo.
/// 3. Fija el dueño, sella las filas sin empresa y refresca la empresa.
Future<void> adoptarEmpresa(WidgetRef ref, String empresaId,
    {ConfirmarCambioDeCuenta? confirmarCambio}) async {
  final prefs = ref.read(sharedPreferencesProvider);
  final db = ref.read(databaseProvider);
  final cuenta = ref.read(cuentaLocalProvider);

  final tipo = clasificarEntrada(
    empresaNueva: empresaId,
    dueno: cuenta.dueno,
    empresaSesion: prefs.getString(_kEmpresaId),
    empresasEnBase: await db.empresasEnBase(),
  );

  if (tipo == TipoEntrada.cambioDeCuenta) {
    final sinSubir = await db.contarSinSubir();
    if (sinSubir > 0) {
      final descartar = await confirmarCambio?.call(CambioDeCuenta(
            sinSubir: sinSubir,
            empresaAnteriorNombre: cuenta.duenoNombre,
            correoAnterior: cuenta.duenoCorreo,
          )) ??
          false;
      if (!descartar) throw const CambioDeCuentaCancelado();
    }
    debugPrint('[cloud_providers] Cambio de cuenta: se vacía la base local '
        '($sinSubir cambio(s) sin subir descartados).');
    await vaciarCopiaLocal(ref);
  }

  await prefs.setString(_kEmpresaId, empresaId);
  await cuenta.fijarDueno(empresaId,
      correo: SupabaseConfig.currentUser?.email);
  await db.sellarEmpresaId(empresaId);
  ref.invalidate(empresaIdProvider);
  // Y se refresca el NOMBRE: esto ya corre en el login y al abrir la pantalla
  // de nube, así que es el punto natural para que un renombrado hecho en la
  // web aparezca en el dispositivo sin acción del usuario.
  ref.invalidate(empresaNombreProvider);
}

/// Llaves de prefs que guardan algo de UNA empresa (cachés de lo que vive en
/// `empresa_config` y similares). Al vaciar la base se van con ella: el nombre,
/// el logo o los textos de los PDF de una empresa no deben aparecer en los
/// documentos de la siguiente.
bool _esCacheDeEmpresa(String llave) =>
    llave.startsWith('pdf_') ||
    const {
      'modulos_empresa_cache',
      'ui_orden_cache',
      'rol_usuario',
      'empresa_nombre',
      'sync_ultima_subida_ok',
    }.contains(llave);

/// Deja el teléfono sin nada de la cuenta anterior: base local (como recién
/// instalada), fotos y avisos de la bitácora, cachés por empresa y cursores.
/// El siguiente sync baja todo de la cuenta vigente.
///
/// Es lo que hace "Rehacer la copia de este teléfono" (decisión D2) y el paso
/// de un cambio de cuenta. Quien la llama revisa antes lo que no ha subido.
Future<void> vaciarCopiaLocal(WidgetRef ref) async {
  final sync = ref.read(syncServiceProvider);
  await sync.pausar();
  try {
    await ref.read(databaseProvider).vaciarDatosLocales();
    await ref.read(fotosBitacoraStorageProvider).borrarTodo();
    await ref.read(avisosBitacoraProvider).borrarTodo();
    final metadata = ref.read(syncMetadataProvider);
    await metadata.resetAll();
    await metadata.limpiarFilasAjenas();
    final prefs = ref.read(sharedPreferencesProvider);
    for (final k in prefs.getKeys().where(_esCacheDeEmpresa).toList()) {
      await prefs.remove(k);
    }
    await ref.read(cuentaLocalProvider).olvidarDueno();
  } finally {
    sync.reanudar();
  }
  // Los estados que arrancaron de las cachés borradas se vuelven a leer.
  ref.invalidate(empresaNombreCacheProvider);
  ref.invalidate(modulosProvider);
  ref.invalidate(rolUsuarioProvider);
  ref.invalidate(ordenModoProvider);
  ref.invalidate(pdfAspectoProvider);
  ref.invalidate(textosPdfProvider);
}
