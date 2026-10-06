import 'dart:convert';
import 'dart:io';

import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/sync/bitacora_avisos.dart';
import 'package:constructorpro/core/sync/bitacora_remoto.dart';
import 'package:constructorpro/core/sync/bitacora_sync.dart';
import 'package:constructorpro/domain/bitacora/bitacora_reglas.dart';
import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// El push "insertar primero" de la bitácora contra un servidor FALSO que
/// aplica las reglas de `supabase/migrations/0041` y `0042` que importan aquí:
/// sellos del servidor, cierre a las 24 h, máximo 10 fotos (trigger BEFORE
/// INSERT, que corre aunque el id ya exista), UPDATE que la RLS bloquea con
/// 0 filas, Storage que no sobrescribe (409) y niega si la entrada cerró.
///
/// Los casos son los huecos que encontró la revisión de arquitectura
/// (docs/PLAN_BITACORA_MOVIL.md §2.2-2.3): si alguno vuelve, aquí cae.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const empresa = 'emp-1';
  const dia = 1791266400000;
  const h24 = 24 * 60 * 60 * 1000;

  late AppDatabase db;
  late _Servidor srv;
  late AvisosBitacora avisos;
  late Directory dir;
  late BitacoraSync sync;

  Future<File> archivo(String id, String mime) async =>
      File('${dir.path}/$id.jpg');

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    srv = _Servidor();
    SharedPreferences.setMockInitialValues({});
    avisos = AvisosBitacora(await SharedPreferences.getInstance());
    dir = Directory.systemTemp.createTempSync('bitacora_sync_test');
    sync = BitacoraSync(
      db: db,
      remoto: srv,
      avisos: avisos,
      archivoLocal: archivo,
      ahoraMs: () => srv.reloj,
    );
  });

  tearDown(() async {
    await db.close();
    if (dir.existsSync()) dir.deleteSync(recursive: true);
  });

  // ── Altas locales, como las haría el repositorio ──

  Future<void> entrada(String id,
      {String texto = 'Colado de losa', String nombres = '["Ana"]'}) {
    return db.customStatement(
      "INSERT INTO bitacora_entrada (id, obra_id, fecha, texto, personal_nombres, "
      "personal_presente, created_at, updated_at, sync_status) "
      "VALUES ('$id', 'o1', $dia, '$texto', '$nombres', 1, 1, 1, 'pending')",
    );
  }

  Future<void> foto(String id, String entradaId, {int orden = 0}) async {
    File('${dir.path}/$id.jpg').writeAsBytesSync([1, 2, 3]);
    await db.customStatement(
      "INSERT INTO bitacora_foto (id, entrada_id, path, mime, bytes, orden, "
      "created_at, updated_at, sync_status) "
      "VALUES ('$id', '$entradaId', '/o1/$entradaId/$id.jpg', 'image/jpeg', 3, "
      "$orden, 2, 2, 'pending')",
    );
  }

  Future<void> aclaracion(String id, String entradaId) => db.customStatement(
        "INSERT INTO bitacora_aclaracion (id, entrada_id, texto, created_at, "
        "updated_at, sync_status) VALUES ('$id', '$entradaId', 'Fue en N2', 3, 3, "
        "'pending')",
      );

  Future<Map<String, Object?>?> local(String tabla, String id) async => (await db
          .customSelect("SELECT * FROM $tabla WHERE id = '$id'")
          .getSingleOrNull())
      ?.data;

  /// Una edición como la de la app: el trigger la marca `pending`.
  Future<void> editarTexto(String id, String texto) => db.customStatement(
      "UPDATE bitacora_entrada SET texto = '$texto' WHERE id = '$id'");

  group('entradas', () {
    test('el alta sube sin publicar y trae los sellos del servidor', () async {
      await entrada('e1');
      expect(await sync.push(empresa), 0);

      final s = srv.fila('bitacora_entrada', 'e1')!;
      expect(s['visible_cliente'], isFalse,
          reason: 'el móvil nunca publica al dar de alta');
      expect(s['personal_nombres'], ['Ana'], reason: 'text[] viaja como lista');
      expect(s['empresa_id'], empresa);

      final l = (await local('bitacora_entrada', 'e1'))!;
      expect(l['sync_status'], 'synced');
      expect(l['server_updated_at'], s['server_updated_at']);
      expect(l['registrada_en'], srv.reloj, reason: 'lo sella el servidor');
      expect(l['autor_id'], 'u-yo');
    });

    test('si se perdió la respuesta del alta, la edición posterior NO se pierde',
        () async {
      // El INSERT entra, pero la respuesta no llega: la fila queda en error y
      // sin sello. El usuario la corrige antes del siguiente ciclo.
      await entrada('e1', texto: 'Colado');
      srv.perderRespuestaInsert = true;
      expect(await sync.push(empresa), 1);
      expect((await local('bitacora_entrada', 'e1'))!['sync_status'], 'error');

      await editarTexto('e1', 'Colado de losa N2');
      srv.sinRed = false;
      expect(await sync.push(empresa), 0);

      expect(srv.fila('bitacora_entrada', 'e1')!['texto'], 'Colado de losa N2',
          reason: 'el duplicado no se toma como "ya está": se lee y se actualiza');
      expect((await local('bitacora_entrada', 'e1'))!['sync_status'], 'synced');
    });

    test('editar una entrada que ya cerró: aviso con el texto y vuelve la del '
        'servidor', () async {
      await entrada('e1', texto: 'Original');
      await sync.push(empresa);
      srv.reloj += h24 + 1; // pasaron más de 24 h desde que llegó

      await editarTexto('e1', 'Corregido sin señal');
      expect(await sync.push(empresa), 0,
          reason: 'no se queda en error reintentando para siempre');

      final l = (await local('bitacora_entrada', 'e1'))!;
      expect(l['texto'], 'Original');
      expect(l['sync_status'], 'synced');
      final a = avisos.deFila('e1')!;
      expect(a.rechazo, RechazoBitacora.cerrada);
      expect(a.texto, 'Corregido sin señal', reason: 'para agregarlo como aclaración');
      expect(a.esEdicion, isTrue);
    });

    test('UPDATE de 0 filas (colaborador sin permiso) es rechazo, no éxito',
        () async {
      await entrada('e1', texto: 'Original');
      await sync.push(empresa);
      srv.rol = 'colaborador';

      await editarTexto('e1', 'Otro texto');
      expect(await sync.push(empresa), 0);

      expect(srv.fila('bitacora_entrada', 'e1')!['texto'], 'Original');
      expect((await local('bitacora_entrada', 'e1'))!['texto'], 'Original');
      expect(avisos.deFila('e1')!.rechazo, RechazoBitacora.sinPermiso);
    });

    test('si la oficina la cambió antes, gana la oficina y queda el aviso',
        () async {
      await entrada('e1', texto: 'Original');
      await sync.push(empresa);
      srv.editar('bitacora_entrada', 'e1', {'texto': 'Corrección de oficina'});

      await editarTexto('e1', 'Mi corrección');
      await sync.push(empresa);

      expect(srv.fila('bitacora_entrada', 'e1')!['texto'], 'Corrección de oficina');
      expect((await local('bitacora_entrada', 'e1'))!['texto'],
          'Corrección de oficina');
      final a = avisos.deFila('e1')!;
      expect(a.rechazo, RechazoBitacora.cambiada);
      expect(a.texto, 'Mi corrección');
    });

    test('una edición de texto NUNCA vuelve a publicar lo que la oficina retiró',
        () async {
      await entrada('e1');
      await sync.push(empresa);
      await sync.publicar('e1', true);
      // La oficina la retira del portal; el teléfono sigue creyendo que está
      // publicada y alguien edita el texto sin señal.
      srv.editar('bitacora_entrada', 'e1', {'visible_cliente': false});
      await editarTexto('e1', 'Otro');
      await sync.push(empresa);

      expect(srv.fila('bitacora_entrada', 'e1')!['visible_cliente'], isFalse);
    });

    test('alta rechazada por permiso: skipped en cascada y con aviso', () async {
      await entrada('e1');
      await foto('f1', 'e1');
      await aclaracion('a1', 'e1');
      srv.insertDenegado = true;

      expect(await sync.push(empresa), 0);

      for (final (t, id) in [
        ('bitacora_entrada', 'e1'),
        ('bitacora_foto', 'f1'),
        ('bitacora_aclaracion', 'a1'),
      ]) {
        expect((await local(t, id))!['sync_status'], 'skipped', reason: t);
      }
      expect(avisos.deFila('e1')!.rechazo, RechazoBitacora.sinPermiso);
      expect(srv.fila('bitacora_entrada', 'e1'), isNull);
    });

    test('sin red se reintenta (error), no se descarta', () async {
      await entrada('e1');
      srv.sinRed = true;
      expect(await sync.push(empresa), 1);
      expect((await local('bitacora_entrada', 'e1'))!['sync_status'], 'error');
      expect(avisos.todos, isEmpty);
    });

    test('borrada antes de subir: se va solo del teléfono, con fotos y archivo',
        () async {
      await entrada('e1');
      await foto('f1', 'e1');
      await db.customStatement(
          "UPDATE bitacora_entrada SET deleted_at = 9 WHERE id = 'e1'");
      await db.customStatement(
          "UPDATE bitacora_foto SET deleted_at = 9 WHERE id = 'f1'");

      await sync.push(empresa);

      expect(await local('bitacora_entrada', 'e1'), isNull);
      expect(await local('bitacora_foto', 'f1'), isNull);
      expect(File('${dir.path}/f1.jpg').existsSync(), isFalse);
      expect(srv.archivos, isEmpty);
    });
  });

  group('fotos', () {
    test('espera a su entrada; luego sube archivo y fila con la empresa de ahora',
        () async {
      await entrada('e1');
      await foto('f1', 'e1');
      srv.sinRed = true;
      await sync.push(empresa);
      expect(srv.archivos, isEmpty);

      srv.sinRed = false;
      expect(await sync.push(empresa), 0);

      expect(srv.archivos, {'$empresa/o1/e1/f1.jpg'});
      final s = srv.fila('bitacora_foto', 'f1')!;
      expect(s['path'], '$empresa/o1/e1/f1.jpg',
          reason: 'la ruta de captura no tenía empresa; se arma al subir');
      final l = (await local('bitacora_foto', 'f1'))!;
      expect(l['sync_status'], 'synced');
      expect(l['path'], '$empresa/o1/e1/f1.jpg');
    });

    test('el archivo ya estaba en Storage (409): se sigue con la fila', () async {
      await entrada('e1');
      await sync.push(empresa);
      await foto('f1', 'e1');
      srv.archivos.add('$empresa/o1/e1/f1.jpg');

      expect(await sync.push(empresa), 0);
      expect(srv.fila('bitacora_foto', 'f1'), isNotNull);
    });

    test('no cupo (ya hay 10): skipped, aviso y sin archivo huérfano', () async {
      await entrada('e1');
      await sync.push(empresa);
      for (var i = 0; i < 10; i++) {
        srv.fotoDirecta('srv$i', 'e1');
      }
      await foto('f1', 'e1');

      expect(await sync.push(empresa), 0);

      expect((await local('bitacora_foto', 'f1'))!['sync_status'], 'skipped');
      expect(avisos.deFila('f1')!.rechazo, RechazoBitacora.maxFotos);
      expect(srv.archivos.contains('$empresa/o1/e1/f1.jpg'), isFalse);
      expect(File('${dir.path}/f1.jpg').existsSync(), isTrue,
          reason: 'la foto se queda en el teléfono');
    });

    test('la entrada cerró antes de subir la foto: rechazo definitivo', () async {
      await entrada('e1');
      await sync.push(empresa);
      await foto('f1', 'e1');
      srv.reloj += h24 + 1;

      expect(await sync.push(empresa), 0);
      expect(avisos.deFila('f1')!.rechazo, RechazoBitacora.cerrada);
    });

    test('reintento de una foto que sí entró, con 10 vivas: no es "no cupo"',
        () async {
      // El trigger BEFORE INSERT cuenta la foto ya subida y lanza MAX_FOTOS
      // antes que el duplicado: por eso se lee por id antes de decidir.
      await entrada('e1');
      await sync.push(empresa);
      for (var i = 0; i < 9; i++) {
        srv.fotoDirecta('srv$i', 'e1');
      }
      await foto('f1', 'e1');
      srv.perderRespuestaInsert = true;
      await sync.push(empresa);
      expect((await local('bitacora_foto', 'f1'))!['sync_status'], 'error');

      srv.sinRed = false;
      expect(await sync.push(empresa), 0);
      expect((await local('bitacora_foto', 'f1'))!['sync_status'], 'synced');
      expect(avisos.todos, isEmpty);
    });

    test('quitar una foto confirmada borra la fila (lógico) y el archivo', () async {
      await entrada('e1');
      await foto('f1', 'e1');
      await sync.push(empresa);
      await db.customStatement(
          "UPDATE bitacora_foto SET deleted_at = 99 WHERE id = 'f1'");

      expect(await sync.push(empresa), 0);
      expect(srv.fila('bitacora_foto', 'f1')!['deleted_at'], 99);
      expect(srv.archivos, isEmpty);
      expect(File('${dir.path}/f1.jpg').existsSync(), isFalse);
    });
  });

  group('aclaraciones', () {
    test('suben después de su entrada y un reintento duplicado no falla',
        () async {
      await entrada('e1');
      await aclaracion('a1', 'e1');
      expect(await sync.push(empresa), 0);
      expect(srv.fila('bitacora_aclaracion', 'a1')!['autor_id'], 'u-yo');

      // Vuelve a pending por una escritura local: no se toca la red.
      await db.customStatement(
          "UPDATE bitacora_aclaracion SET updated_at = 77 WHERE id = 'a1'");
      srv.sinRed = true;
      expect(await sync.push(empresa), 0);
      expect((await local('bitacora_aclaracion', 'a1'))!['sync_status'], 'synced');
    });
  });

  group('publicar', () {
    test('solo manda visible_cliente y deja la fila local al día', () async {
      await entrada('e1');
      await sync.push(empresa);
      await sync.publicar('e1', true);

      expect(srv.fila('bitacora_entrada', 'e1')!['visible_cliente'], isTrue);
      final l = (await local('bitacora_entrada', 'e1'))!;
      expect(l['visible_cliente'], 1);
      expect(l['sync_status'], 'synced');
      expect(srv.ultimoUpdate, {'visible_cliente': true});
    });

    test('sin permiso lanza (la pantalla lo dice)', () async {
      await entrada('e1');
      await sync.push(empresa);
      srv.rol = 'colaborador';
      await expectLater(sync.publicar('e1', true), throwsA(isA<RemotoError>()));
    });
  });

  test('pull: el text[] del servidor se guarda como JSON', () {
    expect(
        BitacoraSync.valorLocal(
            'bitacora_entrada', 'personal_nombres', ['Ana', 'Beto']),
        jsonEncode(['Ana', 'Beto']));
    expect(BitacoraSync.valorLocal('bitacora_entrada', 'personal_nombres', null),
        '[]');
    expect(BitacoraSync.valorLocal('bitacora_entrada', 'texto', 'x'), 'x');
    expect(BitacoraSync.valorLocal('obras', 'personal_nombres', 'x'), 'x');
  });
}

/// Servidor falso con las reglas de 0041/0042 que el push necesita respetar.
class _Servidor implements BitacoraRemoto {
  int reloj = 1791300000000;
  int _sello = 5000;
  String rol = 'admin';
  String uid = 'u-yo';
  bool perderRespuestaInsert = false;
  bool sinRed = false;
  bool insertDenegado = false;
  Map<String, dynamic>? ultimoUpdate;

  final _t = <String, Map<String, Map<String, dynamic>>>{
    'bitacora_entrada': {},
    'bitacora_foto': {},
    'bitacora_aclaracion': {},
  };
  final archivos = <String>{};

  static const _h24 = 24 * 60 * 60 * 1000;

  Map<String, dynamic>? fila(String t, String id) => _t[t]![id];

  void editar(String t, String id, Map<String, dynamic> cambios) {
    _t[t]![id]!
      ..addAll(cambios)
      ..['server_updated_at'] = ++_sello;
  }

  void fotoDirecta(String id, String entradaId) {
    _t['bitacora_foto']![id] = {
      'id': id,
      'entrada_id': entradaId,
      'path': 'x/$id.jpg',
      'orden': 0,
      'deleted_at': null,
      'server_updated_at': ++_sello,
    };
  }

  bool _abierta(Map<String, dynamic> e) =>
      e['deleted_at'] == null && reloj <= (e['registrada_en'] as int) + _h24;

  void _red() {
    if (sinRed) throw RemotoError('SocketException: Failed host lookup');
  }

  Map<String, dynamic> _proy(Map<String, dynamic> r, String cols) =>
      cols == '*' ? Map.of(r) : {for (final c in cols.split(',')) c: r[c]};

  static Map<String, dynamic> _defaults(String t) => switch (t) {
        'bitacora_entrada' => {
            'tipo': 'AVANCE',
            'texto': '',
            'clima': '',
            'personal_presente': null,
            'personal_nombres': <String>[],
            'visible_cliente': false,
            'deleted_at': null,
          },
        'bitacora_foto' => {'orden': 0, 'deleted_at': null},
        _ => {'deleted_at': null},
      };

  @override
  Future<Map<String, dynamic>> insertar(
      String tabla, Map<String, dynamic> fila, String columnas) async {
    _red();
    if (insertDenegado) {
      throw RemotoError('new row violates row-level security policy',
          code: '42501');
    }
    // Trigger BEFORE INSERT de fotos: corre ANTES que la llave duplicada.
    if (tabla == 'bitacora_foto') {
      final e = _t['bitacora_entrada']![fila['entrada_id']];
      if (e == null) throw RemotoError('violates foreign key', code: '23503');
      if (!_abierta(e)) {
        throw RemotoError('BITACORA_CERRADA: la entrada ya cerró', code: 'P0001');
      }
      final vivas = _t['bitacora_foto']!.values.where((f) =>
          f['entrada_id'] == fila['entrada_id'] && f['deleted_at'] == null);
      if (vivas.length >= 10) {
        throw RemotoError('BITACORA_MAX_FOTOS: máximo 10', code: 'P0001');
      }
    }
    if (_t[tabla]!.containsKey(fila['id'])) {
      throw RemotoError('duplicate key value', code: '23505', yaExiste: true);
    }
    final r = <String, dynamic>{
      ..._defaults(tabla),
      ...fila,
      'server_updated_at': ++_sello,
    };
    if (tabla != 'bitacora_foto') {
      r['registrada_en'] = reloj;
      r['autor_id'] = uid;
      r['autor_nombre'] = 'Yo';
    }
    _t[tabla]![fila['id'] as String] = r;
    if (perderRespuestaInsert) {
      // El INSERT entró pero la red se cayó justo después: tampoco se podrá
      // leer en este ciclo. (Si la red siguiera, el sync lo resuelve en la
      // misma vuelta leyendo por id; eso lo cubre el test de alta normal.)
      perderRespuestaInsert = false;
      sinRed = true;
      throw RemotoError('TimeoutException');
    }
    return _proy(r, columnas);
  }

  @override
  Future<Map<String, dynamic>?> leer(
      String tabla, String id, String columnas) async {
    _red();
    final r = _t[tabla]![id];
    return r == null ? null : _proy(r, columnas);
  }

  static const _guardadas = [
    'fecha', 'tipo', 'texto', 'clima', 'personal_presente',
    'personal_nombres', 'deleted_at',
  ];

  bool _cambia(Object? a, Object? b) =>
      a is List && b is List ? !listEquals(a, b) : a != b;

  @override
  Future<List<Map<String, dynamic>>> actualizarSiNoCambio(String tabla,
      String id, int serverUpdatedAt, Map<String, dynamic> cambios,
      String columnas) async {
    _red();
    final r = _t[tabla]![id];
    if (r == null || r['server_updated_at'] != serverUpdatedAt) return [];
    return _actualizar(tabla, r, cambios, columnas);
  }

  @override
  Future<List<Map<String, dynamic>>> actualizar(String tabla, String id,
      Map<String, dynamic> cambios, String columnas) async {
    _red();
    final r = _t[tabla]![id];
    if (r == null) return [];
    return _actualizar(tabla, r, cambios, columnas);
  }

  List<Map<String, dynamic>> _actualizar(String tabla, Map<String, dynamic> r,
      Map<String, dynamic> cambios, String columnas) {
    // RLS: el colaborador no tiene UPDATE; el supervisor solo lo suyo.
    if (rol == 'colaborador') return [];
    if (tabla == 'bitacora_entrada') {
      if (rol == 'supervisor' && r['autor_id'] != uid) return [];
      if (!_abierta(r) &&
          _guardadas.any(
              (c) => cambios.containsKey(c) && _cambia(cambios[c], r[c]))) {
        throw RemotoError('BITACORA_CERRADA: la entrada ya cerró', code: 'P0001');
      }
    }
    ultimoUpdate = Map.of(cambios);
    r.addAll(cambios);
    r['server_updated_at'] = ++_sello;
    return [_proy(r, columnas)];
  }

  @override
  Future<void> subirArchivo(String path, Uint8List bytes, String mime) async {
    _red();
    if (archivos.contains(path)) {
      throw RemotoError('The resource already exists',
          code: '409', yaExiste: true);
    }
    final e = _t['bitacora_entrada']![path.split('/')[2]];
    if (e == null || !_abierta(e)) {
      throw RemotoError('new row violates row-level security policy',
          code: '403', denegado: true);
    }
    archivos.add(path);
  }

  @override
  Future<void> borrarArchivo(String path) async {
    _red();
    archivos.remove(path);
  }

  @override
  Future<Uint8List> descargarArchivo(String path) async => Uint8List(0);
}
