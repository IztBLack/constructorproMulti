import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/providers.dart';
import '../db/app_database.dart';
import '../modulos/modulos_provider.dart';
import '../settings/settings_provider.dart';
import '../storage/app_paths.dart';
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
    // Si mientras se consultaba la base pasó a otra empresa (cambio de cuenta),
    // este nombre ya no es el de nadie aquí: no se escribe.
    final prefs = ref.read(sharedPreferencesProvider);
    if (prefs.getString(_kEmpresaId) != empresaId) return cache;
    if (nombre != cache) {
      await prefs.setString(_kEmpresaNombre, nombre);
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

/// Filas que el sync apartó porque la nube no las acepta para esta cuenta.
/// Mientras haya, la pantalla de nube ofrece rehacer la copia (decisión D2).
final filasApartadasProvider = StreamProvider<int>(
    (ref) => ref.watch(databaseProvider).vigilarApartadas());

/// De quién son los datos de la base local (ver [CuentaLocal]).
final cuentaLocalProvider = Provider<CuentaLocal>(
    (ref) => CuentaLocal(ref.watch(sharedPreferencesProvider)));

final syncServiceProvider = Provider<SyncService>((ref) => SyncService(
      db: ref.watch(databaseProvider),
      metadata: ref.watch(syncMetadataProvider),
      bitacora: ref.watch(bitacoraSyncProvider),
      cuentaLocal: ref.watch(cuentaLocalProvider),
      onCuentaPorConfirmar: (v) => Future.microtask(
          () => ref.read(cuentaPorConfirmarProvider.notifier).state = v),
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
///
/// Recibe el [ProviderContainer] de la app y no un `WidgetRef`: entre el
/// primer `await` y el último la persona puede salir de la pantalla, y un
/// `WidgetRef` muerto lanzaría justo a la mitad de vaciar la base.
Future<String?> resolverEmpresaYsellar(ProviderContainer app,
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
      final prefs = app.read(sharedPreferencesProvider);
      if (prefs.getString(_kEmpresaId) != null) {
        await prefs.remove(_kEmpresaId);
        await app.read(syncMetadataProvider).resetAll();
        app.invalidate(empresaIdProvider);
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
  await adoptarEmpresa(app, empresaId, confirmarCambio: confirmarCambio);
  return empresaId;
}

/// Deja la base local lista para trabajar con [empresaId] y el usuario de la
/// sesión. Es el único camino por el que alguien se vuelve dueño de los datos
/// del teléfono: lo usan el login, la vinculación con código y "Rehacer la
/// copia".
///
/// 1. Revisa ANTES de sellar si la base es de otra cuenta ([clasificarEntrada]).
/// 2. Si es un cambio de cuenta y hay cambios sin subir, pregunta con
///    [confirmarCambio] (sin quien pregunte, no descarta nada y lanza
///    [CambioDeCuentaCancelado]). Sin pendientes, vacía directo.
/// 3. Fija el dueño, sella las filas sin empresa y refresca la empresa.
Future<void> adoptarEmpresa(ProviderContainer app, String empresaId,
    {ConfirmarCambioDeCuenta? confirmarCambio}) async {
  final prefs = app.read(sharedPreferencesProvider);
  final db = app.read(databaseProvider);
  final cuenta = app.read(cuentaLocalProvider);
  final usuario = SupabaseConfig.currentUser;

  final tipo = clasificarEntrada(
    empresaNueva: empresaId,
    dueno: cuenta.dueno,
    empresaSesion: prefs.getString(_kEmpresaId),
    duenoUsuario: cuenta.duenoUsuario,
    usuarioNuevo: usuario?.id,
    empresasEnBase: await db.empresasEnBase(),
  );

  if (tipo == TipoEntrada.cambioDeCuenta) {
    final otraEmpresa =
        (cuenta.dueno ?? prefs.getString(_kEmpresaId)) != empresaId;
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
    await vaciarCopiaLocal(app, otraEmpresa: otraEmpresa);
  }

  await prefs.setString(_kEmpresaId, empresaId);
  await cuenta.fijarDueno(empresaId,
      usuario: usuario?.id, correo: usuario?.email);
  await db.sellarEmpresaId(empresaId);
  app.invalidate(empresaIdProvider);
  // Y se refresca el NOMBRE: esto ya corre en el login y al abrir la pantalla
  // de nube, así que es el punto natural para que un renombrado hecho en la
  // web aparezca en el dispositivo sin acción del usuario.
  app.invalidate(empresaNombreProvider);
}

/// Cachés en prefs de lo que vive en la nube por empresa (`empresa_config` y
/// similares). Se borran siempre al vaciar: el siguiente sync las vuelve a
/// llenar con lo de la cuenta vigente.
const _cachesDeEmpresa = {
  'modulos_empresa_cache',
  'ui_orden_cache',
  'pdf_aspecto_cache',
  'pdf_textos_cache',
  'rol_usuario',
  'empresa_nombre',
  'sync_ultima_subida_ok',
};

/// La configuración LOCAL de los PDF (`PdfPrefs`: nombre, contacto, logo,
/// firmas, color…) no está en la nube: rehacer la copia de la misma empresa
/// la perdería sin poder recuperarla. Solo se borra cuando los datos pasan a
/// OTRA empresa, cuyos documentos no deben salir con el nombre ni el logo de
/// la anterior.
bool _esPdfLocal(String llave) =>
    llave.startsWith('pdf_') && !_cachesDeEmpresa.contains(llave);

/// Deja el teléfono sin nada de la cuenta anterior: base local (como recién
/// instalada), fotos y avisos de la bitácora, cachés por empresa y cursores; y
/// si los datos pasan a [otraEmpresa], también la configuración local de los
/// PDF y los archivos de la empresa anterior (adjuntos de cotización, logo,
/// firma). El siguiente sync baja todo de nuevo.
///
/// Es lo que hace "Rehacer la copia de este teléfono" (decisión D2) y el paso
/// de un cambio de cuenta. Quien la llama revisa antes lo que no ha subido.
///
/// El orden importa si la app muere a la mitad:
/// 1. Los cursores se reinician PRIMERO: así el siguiente sync baja todo
///    aunque la base haya quedado vacía (antes podía quedar vacía y con los
///    cursores viejos, y lo anterior al cursor ya no volvía a bajar nunca).
/// 2. La base se vacía en una sola transacción.
/// 3. El dueño se olvida AL FINAL: si algo falla antes, un cambio de cuenta se
///    vuelve a detectar y se repite el vaciado.
Future<void> vaciarCopiaLocal(ProviderContainer app,
    {bool otraEmpresa = true}) async {
  final sync = app.read(syncServiceProvider);
  final db = app.read(databaseProvider);
  final prefs = app.read(sharedPreferencesProvider);
  final metadata = app.read(syncMetadataProvider);
  final cuenta = app.read(cuentaLocalProvider);
  final fotos = app.read(fotosBitacoraStorageProvider);
  final avisos = app.read(avisosBitacoraProvider);

  await sync.pausar();
  try {
    await metadata.resetAll();
    final archivos = otraEmpresa
        ? await _archivosDeEmpresa(db, prefs)
        : const <String>[];
    await db.vaciarDatosLocales();
    await fotos.borrarTodo();
    await avisos.borrarTodo();
    for (final ruta in archivos) {
      await _borrarArchivo(ruta);
    }
    final llaves = prefs
        .getKeys()
        .where((k) =>
            _cachesDeEmpresa.contains(k) || (otraEmpresa && _esPdfLocal(k)))
        .toList();
    for (final k in llaves) {
      await prefs.remove(k);
    }
    await cuenta.olvidarDueno();
  } finally {
    sync.reanudar();
  }
  // Los estados que arrancaron de las cachés borradas se vuelven a leer.
  app.invalidate(empresaNombreCacheProvider);
  app.invalidate(modulosProvider);
  app.invalidate(rolUsuarioProvider);
  app.invalidate(ordenModoProvider);
  app.invalidate(pdfAspectoProvider);
  app.invalidate(textosPdfProvider);
}

/// Archivos en disco de la empresa de la base actual: adjuntos de
/// cotizaciones y el logo y la firma de los PDF. Se calculan ANTES de vaciar
/// la base, porque las rutas de los adjuntos viven en sus filas.
Future<List<String>> _archivosDeEmpresa(
    AppDatabase db, SharedPreferences prefs) async {
  final rutas = <String>[
    for (final a in await db.select(db.archivosCotizacion).get())
      AppPaths.resolve(a.uri),
  ];
  for (final k in const ['pdf_logo', 'pdf_firma']) {
    final v = prefs.getString(k);
    if (v != null && v.isNotEmpty) rutas.add(AppPaths.resolve(v));
  }
  return rutas;
}

/// Borra un archivo SOLO si vive dentro de la carpeta de documentos de la app.
/// Las rutas de los adjuntos bajan del servidor con el sync: una con `../`
/// apuntaría fuera, y aquí no se borra nada que no sea de la app.
Future<void> _borrarArchivo(String ruta) async {
  try {
    final base = p.normalize(p.absolute(AppPaths.documentsDir));
    final destino = p.normalize(p.absolute(ruta));
    if (!p.isWithin(base, destino)) return;
    final f = File(destino);
    if (await f.exists()) await f.delete();
  } catch (e) {
    debugPrint('[cloud_providers] no se pudo borrar $ruta: $e');
  }
}
