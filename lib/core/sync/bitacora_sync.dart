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
        try {
          final res = await remoto.insertar(
              entradas, _altaEntrada(r, empresaId), _colsSello);
          return _confirmar(entradas, id, res, empresaId);
        } on RemotoError catch (e) {
          srv = await remoto.leer(entradas, id, '*');
          if (srv == null) return _rechazarAlta(entradas, r, error: e);
          sut = _sut(srv);
        }
      }
    }

    // Rama UPDATE: la entrada existe en el servidor.
    if (srv != null && coincideEntrada(r, srv)) {
      return _confirmar(entradas, id, srv, empresaId);
    }
    try {
      final res = await remoto.actualizarSiNoCambio(
          entradas, id, sut!, _cambiosEntrada(r), _colsSello);
      if (res.isNotEmpty) return _confirmar(entradas, id, res.first, empresaId);
      // 0 filas: la RLS no la dejó, o alguien más la cambió. O el cambio YA
      // entró en un intento anterior cuya respuesta se perdió.
      srv = await remoto.leer(entradas, id, '*');
      if (srv != null && coincideEntrada(r, srv)) {
        return _confirmar(entradas, id, srv, empresaId);
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
        if (srv == null) return _borrarFotoLocal(id, mime);
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
        final nombre = (r['path'] as String).split('/').last;
        final path = '$empresaId/${e['obra_id']}/${e['id']}/$nombre';

        final archivo = await archivoLocal(id, mime);
        if (!await archivo.exists()) {
          srv = await remoto.leer(fotos, id, '*');
          if (srv != null) return _confirmar(fotos, id, srv, empresaId);
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
          return _confirmar(fotos, id, res, empresaId, extra: {'path': path});
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
      return _confirmar(fotos, id, srv, empresaId);
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
        await _confirmar(fotos, id, res.first, empresaId);
        if (r['deleted_at'] != null) {
          // Quitar una foto también quita el archivo (como la web). Si la RLS
          // no lo deja, queda en Storage: la fila ya dice que está borrada.
          try {
            await remoto.borrarArchivo(res.first['path'] as String);
          } catch (_) {}
          await _borrarArchivoLocal(id, mime);
        }
        return;
      }
      srv = await remoto.leer(fotos, id, '*');
      if (srv != null && _coincideFoto(r, srv)) {
        return _confirmar(fotos, id, srv, empresaId);
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
      return _confirmar(aclaraciones, id, res, empresaId);
    } on RemotoError catch (err) {
      final srv = await remoto.leer(aclaraciones, id, '*');
      if (srv != null) return _confirmar(aclaraciones, id, srv, empresaId);
      return _rechazarAlta(aclaraciones, r, error: err, entrada: e);
    }
  }

  // ───────────────────────── PUBLICAR ─────────────────────────

  /// Publica o retira una entrada del portal del cliente. EN LÍNEA: si no hay
  /// red lanza y la pantalla lo dice. Solo manda `visible_cliente` (como
  /// `cambiarVisibilidadEntrada` de la web): se permite aun con la entrada
  /// cerrada, y nunca arrastra una edición de texto.
  Future<void> publicar(String entradaId, bool visible) async {
    final res = await remoto.actualizar(entradas, entradaId,
        {'visible_cliente': visible}, '*');
    if (res.isEmpty) {
      throw RemotoError(explicarRechazo(RechazoBitacora.sinPermiso),
          code: '42501');
    }
    final local = await _fila(entradas, entradaId);
    if (local == null || local['sync_status'] == 'synced') {
      return _restaurar(entradas, res.first);
    }
    // Hay una edición pendiente: se respeta y solo se anota lo publicado y el
    // nuevo sello (el UPDATE condicional de esa edición lo necesita).
    await db.customUpdate(
      'UPDATE $entradas SET visible_cliente = ?, server_updated_at = ? WHERE id = ?',
      variables: [Variable(visible), Variable(_sut(res.first)), Variable(entradaId)],
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
  /// `mark_pending` no se dispara.
  Future<void> _marcar(String tabla, String id, String estado) async {
    await db.customUpdate(
      'UPDATE $tabla SET sync_status = ? WHERE id = ?',
      variables: [Variable(estado), Variable(id)],
      updates: {_tabla(tabla)},
    );
  }

  /// La fila ya está en el servidor: se anota su sello (y lo que él pone) y
  /// pasa a `synced`.
  Future<void> _confirmar(
    String tabla,
    String id,
    Map<String, dynamic> srv,
    String empresaId, {
    Map<String, Object?> extra = const {},
  }) async {
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
    await db.customUpdate(
      'UPDATE $tabla SET ${sets.keys.map((c) => '$c = ?').join(', ')} WHERE id = ?',
      variables: [...sets.values.map((v) => Variable(v)), Variable(id)],
      updates: {_tabla(tabla)},
    );
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
    await _marcar(tabla, id, 'skipped');
    final e = tabla == entradas ? r : entrada;
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
