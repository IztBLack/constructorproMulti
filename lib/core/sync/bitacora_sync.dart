import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../../domain/bitacora/bitacora_reglas.dart';
import '../db/app_database.dart';
import 'bitacora_avisos.dart';
import 'bitacora_remoto.dart';

/// El archivo local de una foto (lo resuelve `FotosBitacoraStorage`).
typedef ArchivoLocalFoto = Future<File> Function(String fotoId, String mime);

/// Push de la bitácora: "insertar primero" en vez del upsert de fila completa.
///
/// Por qué no sirve el push genérico (docs/PLAN_BITACORA_MOVIL.md §2.2):
/// - el colaborador puede INSERTAR pero no ACTUALIZAR, y nadie actualiza una
///   aclaración: un upsert que reintenta una fila ya subida falla;
/// - los triggers BEFORE INSERT de 0041 (máximo de fotos, entrada cerrada) se
///   disparan aunque el upsert acabe en conflicto;
/// - el archivo de una foto solo entra a Storage si su entrada YA existe en el
///   servidor y sigue abierta, así que hay un orden que respetar.
///
/// Reglas que valen para las tres tablas:
/// - **Nunca se confía en un fallo del INSERT**: antes de decidir se lee la fila
///   por id. Si existe, el INSERT sí entró (se perdió la respuesta) y se sigue
///   por la rama UPDATE en la misma vuelta, sin perder la edición local.
/// - **El UPDATE es condicional** por `server_updated_at` y **0 filas no es
///   éxito**: la RLS bloquea en silencio. Se relee para saber si fue falta de
///   permiso o que alguien más la cambió.
/// - **Lo que no se arregla reintentando no queda en `error`** (se reintentaría
///   cada 25 s para siempre con el indicador en rojo): queda un [AvisoBitacora]
///   y la fila vuelve a la versión del servidor o pasa a `skipped`.
/// - `visible_cliente` nunca viaja aquí: publicar es una operación aparte y en
///   línea ([publicar]), para que una edición hecha sin señal no vuelva a
///   publicar algo que la oficina retiró.
class BitacoraSync {
  BitacoraSync({
    required this.db,
    required this.remoto,
    required this.avisos,
    required this.archivoLocal,
    int Function()? ahoraMs,
  }) : _ahora = ahoraMs ?? (() => DateTime.now().millisecondsSinceEpoch);

  final AppDatabase db;
  final BitacoraRemoto remoto;
  final AvisosBitacora avisos;
  final ArchivoLocalFoto archivoLocal;
  final int Function() _ahora;

  static const _uuid = Uuid();

  static const entradas = 'bitacora_entrada';
  static const fotos = 'bitacora_foto';
  static const aclaraciones = 'bitacora_aclaracion';

  /// Las tablas que NO pasan por el push genérico y cuyo pull protege toda fila
  /// que no esté `synced` (pending, error y skipped).
  static const tablas = {entradas, fotos, aclaraciones};

  /// Columnas que en el servidor son arreglo (`text[]`) y aquí JSON.
  static const columnasArreglo = <String, Set<String>>{
    entradas: {'personal_nombres'},
  };

  /// Lo que se pide de vuelta al confirmar una entrada o aclaración: el sello
  /// del servidor y lo que él pone (autor y hora de llegada).
  static const _colsSello =
      'server_updated_at,registrada_en,autor_id,autor_nombre';

  /// Valor de una columna del servidor convertido a lo que guarda SQLite.
  /// Lo usa también el pull genérico de `SyncService`.
  static Object? valorLocal(String tabla, String col, Object? valor) {
    if (columnasArreglo[tabla]?.contains(col) ?? false) {
      final lista = valor is List ? valor.whereType<String>().toList() : const <String>[];
      return jsonEncode(lista);
    }
    return valor;
  }

  static int? _sut(Map<String, dynamic>? m) =>
      (m?['server_updated_at'] as num?)?.toInt();

  static int? _int(Object? v) => (v as num?)?.toInt();

  /// ¿Lo editable de la entrada local ya es lo que tiene el servidor? Sirve para
  /// reconocer como PROPIO un cambio que sí entró pero cuya respuesta se perdió.
  static bool coincideEntrada(
      Map<String, Object?> local, Map<String, dynamic> srv) {
    return _int(local['fecha']) == _int(srv['fecha']) &&
        local['tipo'] == srv['tipo'] &&
        local['texto'] == srv['texto'] &&
        local['clima'] == srv['clima'] &&
        _int(local['personal_presente']) == _int(srv['personal_presente']) &&
        listEquals(
          nombresDesdeJson(local['personal_nombres'] as String?),
          (srv['personal_nombres'] as List?)?.whereType<String>().toList() ??
              const <String>[],
        ) &&
        _int(local['deleted_at']) == _int(srv['deleted_at']);
  }

  static bool _coincideFoto(Map<String, Object?> local, Map<String, dynamic> srv) =>
      _int(local['orden']) == _int(srv['orden']) &&
      _int(local['deleted_at']) == _int(srv['deleted_at']);

  // ───────────────────────────── PUSH ─────────────────────────────

  /// Último fallo transitorio (para la pantalla de nube), como en SyncService.
  String? ultimoError;

  /// Sube lo pendiente: entradas → fotos (archivo y fila) → aclaraciones.
  /// Devuelve cuántas filas fallaron por algo TRANSITORIO (quedan `error` y se
  /// reintentan); los rechazos definitivos no cuentan.
  Future<int> push(String empresaId) async {
    var errores = 0;
    ultimoError = null;
    for (final (tabla, subir) in [
      (entradas, _pushEntrada),
      (fotos, _pushFoto),
      (aclaraciones, _pushAclaracion),
    ]) {
      final filas = await db
          .customSelect(
              "SELECT * FROM $tabla WHERE sync_status IN ('pending', 'error') "
              'ORDER BY created_at')
          .get();
      for (final f in filas) {
        final r = Map<String, Object?>.from(f.data);
        try {
          await subir(r, empresaId);
        } catch (e) {
          // Sin red, timeout, servidor caído… se reintenta en el próximo ciclo.
          errores++;
          ultimoError = '$tabla: $e';
          debugPrint('[BitacoraSync] ✖ $tabla ${r['id']}: $e');
          await _marcar(tabla, r['id'] as String, 'error');
        }
      }
    }
    return errores;
  }

  // ── Entradas ──

  Future<void> _pushEntrada(Map<String, Object?> r, String empresaId) async {
    final id = r['id'] as String;
    var sut = _int(r['server_updated_at']);
    Map<String, dynamic>? srv;

    if (sut == null) {
      if (r['deleted_at'] != null) {
        // Borrada antes de confirmarse: si el servidor no la tiene, se borra
        // solo aquí (con sus fotos y aclaraciones, que nunca salieron).
        srv = await remoto.leer(entradas, id, '*');
        if (srv == null) return _borrarEntradaLocal(id);
        sut = _sut(srv);
      } else {
        // Su obra tiene que existir en el servidor (la RLS lo exige). Si la
        // obra también se creó en el teléfono y aún no sube, la entrada espera:
        // intentarlo daría un "sin permiso" falso que la descartaría.
        final obra = await _fila('obras', r['obra_id'] as String);
        if (obra != null && obra['server_updated_at'] == null) {
          if (obra['sync_status'] == 'skipped') {
            return _rechazarAlta(entradas, r, forzado: RechazoBitacora.obraNoSube);
          }
          return;
        }
        try {
          final res = await remoto.insertar(
              entradas, _altaEntrada(r, empresaId), _colsSello);
          await _confirmar(entradas, r, res, empresaId);
          return _revivirHijas(id, quitarAvisos: true);
        } on RemotoError catch (e) {
          srv = await remoto.leer(entradas, id, '*');
          if (srv == null) return _rechazarAlta(entradas, r, error: e);
          sut = _sut(srv);
        }
      }
    }

    // Rama UPDATE: la entrada existe en el servidor.
    if (srv != null && coincideEntrada(r, srv)) {
      await _aplicarServidor(entradas, r, srv);
      return _revivirHijas(id);
    }
    try {
      final res = await remoto.actualizarSiNoCambio(
          entradas, id, sut!, _cambiosEntrada(r), _colsSello);
      if (res.isNotEmpty) return _confirmar(entradas, r, res.first, empresaId);
      // 0 filas: la RLS no la dejó, o alguien más la cambió. O el cambio YA
      // entró en un intento anterior cuya respuesta se perdió.
      srv = await remoto.leer(entradas, id, '*');
      if (srv != null && coincideEntrada(r, srv)) {
        return _aplicarServidor(entradas, r, srv);
      }
      final rechazo = srv != null && _sut(srv) != sut
          ? RechazoBitacora.cambiada
          : RechazoBitacora.sinPermiso;
      return _rechazarEdicion(r, rechazo, srv, empresaId);
    } on RemotoError catch (e) {
      final rechazo = clasificarRechazo(code: e.code, message: e.message);
      if (rechazo == null) rethrow;
      srv = await remoto.leer(entradas, id, '*');
      return _rechazarEdicion(r, rechazo, srv, empresaId);
    }
  }

  Map<String, dynamic> _altaEntrada(Map<String, Object?> r, String empresaId) => {
        'id': r['id'],
        'empresa_id': empresaId,
        'obra_id': r['obra_id'],
        'fecha': r['fecha'],
        'tipo': r['tipo'],
        'texto': r['texto'],
        'clima': r['clima'],
        'personal_presente': r['personal_presente'],
        'personal_nombres': nombresDesdeJson(r['personal_nombres'] as String?),
        'created_at': r['created_at'],
        'updated_at': r['updated_at'],
        // Ni visible_cliente (nace en false en el servidor) ni los sellos.
      };

  Map<String, dynamic> _cambiosEntrada(Map<String, Object?> r) => {
        'fecha': r['fecha'],
        'tipo': r['tipo'],
        'texto': r['texto'],
        'clima': r['clima'],
        'personal_presente': r['personal_presente'],
        'personal_nombres': nombresDesdeJson(r['personal_nombres'] as String?),
        'deleted_at': r['deleted_at'],
        'updated_at': r['updated_at'],
      };

  // ── Fotos ──

  Future<void> _pushFoto(Map<String, Object?> r, String empresaId) async {
    final id = r['id'] as String;
    final mime = r['mime'] as String? ?? 'image/jpeg';
    var sut = _int(r['server_updated_at']);
    Map<String, dynamic>? srv;

    if (sut == null) {
      final e = await _entradaLocal(r['entrada_id'] as String);
      if (r['deleted_at'] != null) {
        srv = await remoto.leer(fotos, id, '*');
        if (srv == null) {
          // La fila no entró, pero el archivo pudo alcanzar a subir en un
          // intento anterior: no se deja huérfano en Storage.
          if (e != null) await _borrarRemotoSilencioso(_rutaFoto(empresaId, e, r));
          return _borrarFotoLocal(id, mime);
        }
        sut = _sut(srv);
      } else {
        // Sin entrada local (se borró sin llegar nunca): la foto sobra.
        if (e == null) return _borrarFotoLocal(id, mime);
        if (e['sync_status'] == 'skipped') {
          return _marcar(fotos, id, 'skipped');
        }
        // Espera a que su entrada exista en el servidor: Storage lo exige.
        if (e['server_updated_at'] == null) return;

        // La ruta se arma con la empresa de AHORA: la de captura podía estar
        // vacía (sin sesión todavía) y la RLS exige el prefijo de la empresa.
        final path = _rutaFoto(empresaId, e, r);

        final archivo = await archivoLocal(id, mime);
        if (!await archivo.exists()) {
          srv = await remoto.leer(fotos, id, '*');
          if (srv != null) return _aplicarServidor(fotos, r, srv);
          return _rechazarAlta(fotos, r,
              forzado: RechazoBitacora.archivoPerdido, entrada: e);
        }

        try {
          await remoto.subirArchivo(path, await archivo.readAsBytes(), mime);
        } on RemotoError catch (err) {
          if (!err.yaExiste) {
            // Storage niega también cuando la entrada cerró o se borró. Se
            // pregunta por la entrada antes de darlo por definitivo.
            if (err.denegado) {
              final se = await remoto.leer(entradas, e['id'] as String,
                  'registrada_en,deleted_at');
              if (se == null) {
                return _rechazarAlta(fotos, r,
                    forzado: RechazoBitacora.sinPermiso, entrada: e);
              }
              final abierta = se['deleted_at'] == null &&
                  estaAbierta(
                      registradaEn: _int(se['registrada_en']) ?? 0,
                      ahoraMs: _ahora());
              if (!abierta) {
                return _rechazarAlta(fotos, r,
                    forzado: RechazoBitacora.cerrada, entrada: e);
              }
            }
            rethrow;
          }
          // yaExiste: un intento anterior ya la subió. Se sigue con la fila.
        }

        final fila = {
          'id': id,
          'empresa_id': empresaId,
          'entrada_id': r['entrada_id'],
          'path': path,
          'mime': mime,
          'bytes': r['bytes'],
          'orden': r['orden'],
          'created_at': r['created_at'],
          'updated_at': r['updated_at'],
        };
        try {
          final res = await remoto.insertar(fotos, fila, 'server_updated_at');
          return _confirmar(fotos, r, res, empresaId, extra: {'path': path});
        } on RemotoError catch (err) {
          srv = await remoto.leer(fotos, id, '*');
          if (srv == null) {
            final rechazo = clasificarRechazo(code: err.code, message: err.message);
            if (rechazo == null) rethrow;
            // El archivo subió pero la fila no va a entrar: no se deja
            // huérfano en Storage (la web hace lo mismo).
            try {
              await remoto.borrarArchivo(path);
            } catch (_) {}
            return _rechazarAlta(fotos, r, forzado: rechazo, entrada: e);
          }
          sut = _sut(srv);
        }
      }
    }

    // Rama UPDATE: solo orden y borrado (el servidor no deja cambiar la ruta).
    if (srv != null && _coincideFoto(r, srv)) {
      await _aplicarServidor(fotos, r, srv);
      if (r['deleted_at'] != null) {
        await _limpiarFotoBorrada(srv['path'] as String?, id, mime);
      }
      return;
    }
    try {
      final res = await remoto.actualizarSiNoCambio(
        fotos,
        id,
        sut!,
        {'orden': r['orden'], 'deleted_at': r['deleted_at'], 'updated_at': r['updated_at']},
        'server_updated_at,path',
      );
      if (res.isNotEmpty) {
        await _confirmar(fotos, r, res.first, empresaId);
        if (r['deleted_at'] != null) {
          await _limpiarFotoBorrada(res.first['path'] as String?, id, mime);
        }
        return;
      }
      srv = await remoto.leer(fotos, id, '*');
      if (srv != null && _coincideFoto(r, srv)) {
        await _aplicarServidor(fotos, r, srv);
        if (r['deleted_at'] != null) {
          await _limpiarFotoBorrada(srv['path'] as String?, id, mime);
        }
        return;
      }
      final rechazo = srv != null && _sut(srv) != sut
          ? RechazoBitacora.cambiada
          : RechazoBitacora.sinPermiso;
      return _rechazarCambioHijo(fotos, r, rechazo, srv);
    } on RemotoError catch (e) {
      final rechazo = clasificarRechazo(code: e.code, message: e.message);
      if (rechazo == null) rethrow;
      srv = await remoto.leer(fotos, id, '*');
      return _rechazarCambioHijo(fotos, r, rechazo, srv);
    }
  }

  // ── Aclaraciones ──

  Future<void> _pushAclaracion(Map<String, Object?> r, String empresaId) async {
    final id = r['id'] as String;
    // Una aclaración confirmada no se edita nunca (ni el servidor lo deja): si
    // volvió a `pending` por una escritura local, se da por buena sin red.
    if (r['server_updated_at'] != null) return _marcar(aclaraciones, id, 'synced');

    final e = await _entradaLocal(r['entrada_id'] as String);
    if (r['deleted_at'] != null) {
      final srv = await remoto.leer(aclaraciones, id, '*');
      if (srv == null) return _borrarFisico(aclaraciones, id);
      // Ya es evidencia en el servidor: se queda, y aquí se restaura.
      return _restaurar(aclaraciones, srv);
    }
    if (e == null) return _borrarFisico(aclaraciones, id);
    if (e['sync_status'] == 'skipped') return _marcar(aclaraciones, id, 'skipped');
    if (e['server_updated_at'] == null) return; // espera a su entrada

    try {
      final res = await remoto.insertar(
        aclaraciones,
        {
          'id': id,
          'empresa_id': empresaId,
          'entrada_id': r['entrada_id'],
          'texto': r['texto'],
          'created_at': r['created_at'],
          'updated_at': r['updated_at'],
        },
        _colsSello,
      );
      return _confirmar(aclaraciones, r, res, empresaId);
    } on RemotoError catch (err) {
      final srv = await remoto.leer(aclaraciones, id, '*');
      if (srv != null) return _aplicarServidor(aclaraciones, r, srv);
      return _rechazarAlta(aclaraciones, r, error: err, entrada: e);
    }
  }

  // ───────────────────────── PUBLICAR ─────────────────────────

  /// Publica o retira una entrada del portal del cliente. EN LÍNEA: si no hay
  /// red lanza y la pantalla lo dice. Solo manda `visible_cliente` (como
  /// `cambiarVisibilidadEntrada` de la web): se permite aun con la entrada
  /// cerrada, y nunca arrastra una edición de texto.
  Future<void> publicar(String entradaId, bool visible) async {
    final local = await _fila(entradas, entradaId);
    final pendiente = local != null && local['sync_status'] != 'synced';
    // Con una edición pendiente importa saber si la oficina cambió la entrada
    // ANTES de publicar: el sello que devuelva la publicación tapa ese cambio.
    int? selloAntes;
    if (pendiente) {
      selloAntes = _sut(await remoto.leer(entradas, entradaId, 'server_updated_at'));
    }
    final res = await remoto.actualizar(entradas, entradaId,
        {'visible_cliente': visible}, '*');
    if (res.isEmpty) {
      throw RemotoError(explicarRechazo(RechazoBitacora.sinPermiso),
          code: '42501');
    }
    if (!pendiente) {
      return local == null
          ? _restaurar(entradas, res.first)
          : _aplicarServidor(entradas, local, res.first);
    }
    // Hay una edición pendiente: se respeta y se anota lo publicado. El sello
    // nuevo solo se adopta si el servidor seguía en el que conoce el teléfono:
    // si la oficina la cambió antes, adoptarlo haría que el push pisara ese
    // cambio en silencio; dejándolo, el push lo detecta como conflicto.
    final adoptar = selloAntes != null && selloAntes == _int(local['server_updated_at']);
    await db.customUpdate(
      'UPDATE $entradas SET visible_cliente = ?'
      '${adoptar ? ', server_updated_at = ?' : ''} WHERE id = ?',
      variables: [
        Variable(visible),
        if (adoptar) Variable(_sut(res.first)),
        Variable(entradaId),
      ],
      updates: {db.bitacoraEntrada},
    );
  }

  // ───────────────────────── AUXILIARES ─────────────────────────

  TableInfo _tabla(String nombre) =>
      db.allTables.firstWhere((t) => t.actualTableName == nombre);

  Future<Map<String, Object?>?> _fila(String tabla, String id) async {
    final f = await db
        .customSelect('SELECT * FROM $tabla WHERE id = ?',
            variables: [Variable(id)])
        .getSingleOrNull();
    return f?.data;
  }

  Future<Map<String, Object?>?> _entradaLocal(String id) => _fila(entradas, id);

  /// Cambia solo el estado. Como CAMBIA `sync_status`, el trigger
  /// `mark_pending` no se dispara. Si ya tenía ese estado no se escribe: un
  /// UPDATE sin cambio de estado SÍ dispara el trigger, y una fila en `error`
  /// marcada otra vez `error` acabaría en `pending` (el indicador alternaría).
  Future<void> _marcar(String tabla, String id, String estado) async {
    await db.customUpdate(
      'UPDATE $tabla SET sync_status = ? WHERE id = ? AND sync_status != ?',
      variables: [Variable(estado), Variable(id), Variable(estado)],
      updates: {_tabla(tabla)},
    );
  }

  /// La fila ya está en el servidor: se anota su sello (y lo que él pone) y
  /// pasa a `synced` — SOLO si nadie la editó mientras subía. El sync corre en
  /// segundo plano y una foto de varios MB tarda: si la persona corrigió algo
  /// en ese rato (`updated_at` ya no es el del snapshot [r]), se anota solo el
  /// sello y la fila sigue `pending`, para que su edición suba en la siguiente
  /// vuelta por el UPDATE condicional en vez de perderse con el pull.
  Future<void> _confirmar(
    String tabla,
    Map<String, Object?> r,
    Map<String, dynamic> srv,
    String empresaId, {
    Map<String, Object?> extra = const {},
  }) async {
    final id = r['id'] as String;
    final sets = <String, Object?>{
      'sync_status': 'synced',
      'server_updated_at': _sut(srv),
      'empresa_id': empresaId,
      for (final c in const ['registrada_en', 'autor_id', 'autor_nombre'])
        if (srv.containsKey(c) && tabla != fotos) c: srv[c],
      ...extra,
    };
    if (sets['registrada_en'] != null) {
      sets['registrada_en'] = _int(sets['registrada_en']);
    }
    if (sets['autor_nombre'] == null && sets.containsKey('autor_nombre')) {
      sets['autor_nombre'] = '';
    }
    final n = await db.customUpdate(
      'UPDATE $tabla SET ${sets.keys.map((c) => '$c = ?').join(', ')} '
      'WHERE id = ? AND updated_at = ?',
      variables: [
        ...sets.values.map((v) => Variable(v)),
        Variable(id),
        Variable(r['updated_at']),
      ],
      updates: {_tabla(tabla)},
    );
    if (n == 0) await _anotarSello(tabla, id, srv, extra: extra);
  }

  /// Solo el sello (y la ruta de una foto): la fila sigue `pending` con la
  /// edición que la persona hizo mientras subía.
  Future<void> _anotarSello(String tabla, String id, Map<String, dynamic> srv,
      {Map<String, Object?> extra = const {}}) async {
    final sets = {'server_updated_at': _sut(srv), ...extra};
    await db.customUpdate(
      'UPDATE $tabla SET ${sets.keys.map((c) => '$c = ?').join(', ')} WHERE id = ?',
      variables: [...sets.values.map((v) => Variable(v)), Variable(id)],
      updates: {_tabla(tabla)},
    );
  }

  /// Hay fila COMPLETA del servidor y lo editable ya coincide: se adopta tal
  /// cual (trae `visible_cliente`, la ruta definitiva de la foto, los sellos),
  /// salvo que la persona haya editado mientras subía.
  Future<void> _aplicarServidor(
      String tabla, Map<String, Object?> r, Map<String, dynamic> srv) async {
    final id = r['id'] as String;
    final intacta = await _intacta(tabla, r);
    if (intacta) {
      await _restaurar(tabla, srv);
    } else {
      await _anotarSello(tabla, id, srv);
    }
  }

  /// ¿La fila local sigue igual que cuando el push la leyó?
  Future<bool> _intacta(String tabla, Map<String, Object?> r) async {
    final f = await _fila(tabla, r['id'] as String);
    return f != null && f['updated_at'] == r['updated_at'];
  }

  /// Reescribe la fila local con la versión del servidor, ya `synced`.
  /// INSERT OR REPLACE (borrar + insertar) no dispara el trigger de UPDATE.
  Future<void> _restaurar(String tabla, Map<String, dynamic> srv) async {
    final t = _tabla(tabla);
    final locales = t.$columns.map((c) => c.name).toSet();
    final cols = srv.keys.where(locales.contains).toList();
    await db.customUpdate(
      'INSERT OR REPLACE INTO $tabla (${[...cols, 'sync_status'].join(',')}) '
      'VALUES (${List.filled(cols.length + 1, '?').join(',')})',
      variables: [
        ...cols.map((c) => Variable(valorLocal(tabla, c, srv[c]))),
        Variable('synced'),
      ],
      updates: {t},
    );
  }

  Future<void> _borrarFisico(String tabla, String id) async {
    await db.customUpdate('DELETE FROM $tabla WHERE id = ?',
        variables: [Variable(id)], updates: {_tabla(tabla)});
  }

  Future<void> _borrarArchivoLocal(String fotoId, String mime) async {
    try {
      final f = await archivoLocal(fotoId, mime);
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }

  Future<void> _borrarFotoLocal(String fotoId, String mime) async {
    await _borrarFisico(fotos, fotoId);
    await _borrarArchivoLocal(fotoId, mime);
  }

  /// Ruta en el bucket con la empresa de AHORA: la de captura podía estar
  /// vacía (sin sesión todavía) y la RLS exige el prefijo de la empresa.
  static String _rutaFoto(
          String empresaId, Map<String, Object?> e, Map<String, Object?> f) =>
      '$empresaId/${e['obra_id']}/${e['id']}/${(f['path'] as String).split('/').last}';

  Future<void> _borrarRemotoSilencioso(String path) async {
    try {
      await remoto.borrarArchivo(path);
    } catch (_) {
      // La RLS de Storage no deja a todos borrar (p. ej. al colaborador): el
      // archivo se queda, pero la fila ya dice que la foto está quitada.
    }
  }

  /// Quitar una foto también quita sus archivos (como la web), en el servidor
  /// y en el teléfono.
  Future<void> _limpiarFotoBorrada(String? path, String fotoId, String mime) async {
    if (path != null) await _borrarRemotoSilencioso(path);
    await _borrarArchivoLocal(fotoId, mime);
  }

  /// Una entrada que por fin llegó al servidor: las fotos y aclaraciones que
  /// se habían quedado `skipped` con ella (p. ej. su alta se rechazó y la
  /// persona la corrigió) vuelven a intentarlo. Con [quitarAvisos] (solo tras
  /// un INSERT que entró) se quitan sus avisos: en una entrada que nunca había
  /// llegado solo puede haber avisos de ALTA, ya resueltos. En una confirmada
  /// podría haber el de una edición rechazada cuyo texto aún no se rescata.
  Future<void> _revivirHijas(String entradaId, {bool quitarAvisos = false}) async {
    for (final hija in [fotos, aclaraciones]) {
      await db.customUpdate(
        "UPDATE $hija SET sync_status = 'pending' "
        "WHERE entrada_id = ? AND server_updated_at IS NULL AND sync_status = 'skipped'",
        variables: [Variable(entradaId)],
        updates: {_tabla(hija)},
      );
    }
    if (quitarAvisos) await avisos.quitarDeFila(entradaId);
  }

  /// Una entrada que nunca llegó al servidor, con todo lo que cuelga de ella
  /// (que tampoco salió: fotos y aclaraciones esperan a su entrada).
  Future<void> _borrarEntradaLocal(String id) async {
    final hijas = await db
        .customSelect('SELECT id, mime FROM $fotos WHERE entrada_id = ?',
            variables: [Variable(id)])
        .get();
    for (final h in hijas) {
      await _borrarFotoLocal(h.data['id'] as String,
          h.data['mime'] as String? ?? 'image/jpeg');
    }
    await db.customUpdate('DELETE FROM $aclaraciones WHERE entrada_id = ?',
        variables: [Variable(id)], updates: {db.bitacoraAclaracion});
    await _borrarFisico(entradas, id);
  }

  /// Un alta que el servidor no va a aceptar nunca: `skipped` (terminal, no
  /// cuenta como error) con su aviso. Si es una entrada, sus fotos y
  /// aclaraciones sin subir corren la misma suerte.
  Future<void> _rechazarAlta(
    String tabla,
    Map<String, Object?> r, {
    RemotoError? error,
    RechazoBitacora? forzado,
    Map<String, Object?>? entrada,
  }) async {
    final rechazo = forzado ??
        (error == null
            ? null
            : clasificarRechazo(code: error.code, message: error.message));
    if (rechazo == null) throw error ?? RemotoError('rechazo sin motivo');
    final id = r['id'] as String;
    final e = tabla == entradas ? r : entrada;
    // El aviso ANTES del `skipped`: si la app muere entre los dos pasos, peor
    // es una fila descartada sin motivo que un aviso de algo que se reintenta.
    await avisos.agregar(AvisoBitacora(
      id: _uuid.v4(),
      filaId: id,
      tabla: tabla,
      obraId: (e?['obra_id'] as String?) ?? '',
      entradaId: (e?['id'] as String?) ?? (r['entrada_id'] as String? ?? id),
      rechazo: rechazo,
      texto: tabla == fotos ? null : r['texto'] as String?,
      fechaEntrada: _int(e?['fecha']),
      creadoEn: _ahora(),
    ));
    await _marcar(tabla, id, 'skipped');
    if (tabla == entradas) {
      for (final hija in [fotos, aclaraciones]) {
        await db.customUpdate(
          "UPDATE $hija SET sync_status = 'skipped' "
          "WHERE entrada_id = ? AND server_updated_at IS NULL AND sync_status != 'skipped'",
          variables: [Variable(id)],
          updates: {_tabla(hija)},
        );
      }
    }
    debugPrint('[BitacoraSync] ⚑ alta rechazada $tabla $id: ${rechazo.name}');
  }

  /// Una edición de entrada que no va a entrar: se guarda el texto en un
  /// aviso y la fila vuelve a lo que tiene el servidor (leído ahí mismo; el
  /// pull incremental no la traería porque el rechazo no movió su sello).
  Future<void> _rechazarEdicion(
    Map<String, Object?> r,
    RechazoBitacora rechazo,
    Map<String, dynamic>? srv,
    String empresaId,
  ) async {
    final id = r['id'] as String;
    // Si la persona la volvió a editar mientras subía, se deja para la
    // siguiente vuelta: el aviso debe llevar SU texto más reciente, y
    // restaurar aquí borraría esa edición.
    if (!await _intacta(entradas, r)) return;
    await avisos.agregar(AvisoBitacora(
      id: _uuid.v4(),
      filaId: id,
      tabla: entradas,
      obraId: r['obra_id'] as String,
      entradaId: id,
      rechazo: rechazo,
      texto: r['texto'] as String?,
      fechaEntrada: _int(r['fecha']),
      creadoEn: _ahora(),
    ));
    if (srv != null) {
      await _restaurar(entradas, srv);
    } else {
      // Ya no la puede ver: no hay a qué volver.
      await _marcar(entradas, id, 'skipped');
    }
    debugPrint('[BitacoraSync] ⚑ edición rechazada $id: ${rechazo.name}');
  }

  /// Cambio de una foto confirmada (orden o quitarla) que no va a entrar.
  Future<void> _rechazarCambioHijo(String tabla, Map<String, Object?> r,
      RechazoBitacora rechazo, Map<String, dynamic>? srv) async {
    if (!await _intacta(tabla, r)) return;
    final e = await _entradaLocal(r['entrada_id'] as String);
    await avisos.agregar(AvisoBitacora(
      id: _uuid.v4(),
      filaId: r['id'] as String,
      tabla: tabla,
      obraId: (e?['obra_id'] as String?) ?? '',
      entradaId: r['entrada_id'] as String,
      rechazo: rechazo,
      fechaEntrada: _int(e?['fecha']),
      creadoEn: _ahora(),
    ));
    if (srv != null) {
      await _restaurar(tabla, srv);
    } else {
      await _marcar(tabla, r['id'] as String, 'skipped');
    }
  }
}
