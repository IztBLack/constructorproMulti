import 'dart:async';
import 'dart:io';

import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/core/storage/fotos_bitacora_storage.dart';
import 'package:constructorpro/data/repositories_bitacora.dart';
import 'package:constructorpro/domain/bitacora/bitacora_reglas.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

/// El repositorio de la bitácora contra una BD real en memoria y un directorio
/// temporal real para las fotos: un cambio de esquema, del trigger
/// `mark_pending` o de la ruta del archivo rompe AQUÍ y no en la obra, donde no
/// hay señal para reintentar.
///
/// Lo que más se vigila:
///   · que crear/editar/borrar dejen la fila `pending` (si no, no sube nunca);
///   · que editar NO toque lo que sella el servidor ni la publicación al
///     cliente (la oficina puede haberla retirado);
///   · que la línea de tiempo se entere de un cambio en CUALQUIERA de las tres
///     tablas (la pantalla de notas no lo hace con los hijos y aquí sí hace
///     falta: una foto nueva tiene que verse sin tocar la entrada).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late Directory raiz;
  late FotosBitacoraStorage fotos;
  late BitacoraRepository repo;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    raiz = Directory.systemTemp.createTempSync('bitacora_repo_test_');
    fotos = FotosBitacoraStorage(
        baseDir: () async => Directory(p.join(raiz.path, 'bitacora')));
    repo = BitacoraRepository(db, fotos);
  });
  tearDown(() async {
    await db.close();
    if (raiz.existsSync()) raiz.deleteSync(recursive: true);
  });

  // Un miércoles cualquiera a medianoche de México (el valor exacto no importa;
  // lo que importa es que los días se comparen entre sí).
  const dia1 = 1700000000000;
  const dia2 = dia1 + 86400000;
  const dia3 = dia2 + 86400000;

  /// Una foto recién tomada, en la "caché" de la prueba.
  String foto(String nombre, {List<int> bytes = const [1, 2, 3]}) {
    final f = File(p.join(raiz.path, 'cache', nombre));
    f.parent.createSync(recursive: true);
    f.writeAsBytesSync(bytes);
    return f.path;
  }

  Future<String> crear({
    String obraId = 'o1',
    int fecha = dia1,
    String texto = 'Se coló la losa',
    String tipo = 'AVANCE',
    String clima = '',
    List<String> nombres = const [],
    int? personal,
  }) =>
      repo.crearEntrada(
        obraId: obraId,
        empresaId: 'e1',
        fecha: fecha,
        tipo: tipo,
        texto: texto,
        clima: clima,
        nombres: nombres,
        personalPresente: personal,
      );

  Future<BitacoraEntradaRow> entrada(String id) => (db.select(db.bitacoraEntrada)
        ..where((t) => t.id.equals(id)))
      .getSingle();

  Future<BitacoraFotoRow> fotoRow(String id) =>
      (db.select(db.bitacoraFoto)..where((t) => t.id.equals(id))).getSingle();

  Future<BitacoraAclaracionRow> aclaracionRow(String id) =>
      (db.select(db.bitacoraAclaracion)..where((t) => t.id.equals(id)))
          .getSingle();

  /// Imita el estado tras un push exitoso: el servidor ya la tiene y le puso su
  /// sello. Va por SQL directo y cambiando `sync_status` en el MISMO UPDATE para
  /// que el trigger `mark_pending` no la vuelva a marcar (solo se dispara cuando
  /// el estado no cambia).
  Future<void> confirmar(String tabla, String id,
      {int servidor = 5000, String extra = ''}) {
    return db.customStatement(
        "UPDATE $tabla SET sync_status = 'synced', "
        'server_updated_at = $servidor$extra WHERE id = ?',
        [id]);
  }

  Future<void> sincronizadaTodo() async {
    for (final t in ['bitacora_entrada', 'bitacora_foto', 'bitacora_aclaracion']) {
      await db.customStatement("UPDATE $t SET sync_status = 'synced'");
    }
  }

  /// Inserta una entrada directo, con sellos a mano (lo que normalmente pone el
  /// servidor). Para armar el orden de la línea de tiempo.
  Future<void> insertar(
    String id, {
    String obraId = 'o1',
    int fecha = dia1,
    int registradaEn = 0,
    int createdAt = 1,
    String texto = 'x',
  }) =>
      db.into(db.bitacoraEntrada).insert(BitacoraEntradaCompanion.insert(
            id: id,
            obraId: obraId,
            fecha: fecha,
            texto: Value(texto),
            registradaEn: Value(registradaEn),
            createdAt: Value(createdAt),
            updatedAt: Value(createdAt),
          ));

  group('crearEntrada', () {
    test('inserta la fila, pending, con empresa y fechas', () async {
      final antes = DateTime.now().millisecondsSinceEpoch;
      final id = await crear(
          fecha: dia1, tipo: 'INCIDENCIA', texto: 'Se rompió una tubería',
          clima: 'LLUVIA');

      final e = await entrada(id);
      expect(e.obraId, 'o1');
      expect(e.empresaId, 'e1');
      expect(e.fecha, dia1);
      expect(e.tipo, 'INCIDENCIA');
      expect(e.texto, 'Se rompió una tubería');
      expect(e.clima, 'LLUVIA');
      expect(e.syncStatus, 'pending');
      expect(e.createdAt, greaterThanOrEqualTo(antes));
      expect(e.updatedAt, greaterThanOrEqualTo(antes));
      expect(e.deletedAt, isNull);
      expect(e.serverUpdatedAt, isNull);
    });

    test('nace sin publicar al cliente y sin lo que sella el servidor',
        () async {
      final e = await entrada(await crear());

      expect(e.visibleCliente, isFalse);
      expect(e.autorId, isNull);
      expect(e.autorNombre, '');
      expect(e.registradaEn, 0);
    });

    test('devuelve un uuid v4 distinto cada vez', () async {
      final uuidRe = RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
      final a = await crear();
      final b = await crear();

      expect(uuidRe.hasMatch(a), isTrue);
      expect(a, isNot(b));
    });

    test('recorta el texto', () async {
      final e = await entrada(await crear(texto: '  con espacios \n'));
      expect(e.texto, 'con espacios');
    });

    test('conserva acentos, emojis y comillas tal cual', () async {
      const texto = "Ñandú 🏗️ 'ok' \"sí\"; DROP TABLE bitacora_entrada;--";
      final id = await crear(texto: texto);

      expect((await entrada(id)).texto, texto);
      // y la tabla sigue ahí
      expect(await db.select(db.bitacoraEntrada).get(), hasLength(1));
    });

    test('el clima es opcional: sin anotar se guarda como cadena vacía',
        () async {
      expect((await entrada(await crear())).clima, '');
    });

    group('personal presente', () {
      test('con nombres, es cuántos son y los guarda como JSON', () async {
        final id = await crear(nombres: ['Ana', 'Beto', 'Carlos']);

        final e = await entrada(id);
        expect(e.personalPresente, 3);
        expect(e.personalNombres, '["Ana","Beto","Carlos"]');
      });

      test('con nombres, el conteo manual se ignora', () async {
        final e = await entrada(await crear(nombres: ['Ana', 'Beto'], personal: 50));
        expect(e.personalPresente, 2);
      });

      test('limpia los nombres ANTES de contarlos (vacíos y repetidos)',
          () async {
        final id = await crear(
            nombres: ['  Ana ', 'ana', '', '   ', 'Beto', 'BETO', 'José', 'Jose']);

        final e = await entrada(id);
        expect(e.personalNombres, '["Ana","Beto","José","Jose"]');
        expect(e.personalPresente, 4);
      });

      test('sin nombres, usa el conteo anotado', () async {
        final e = await entrada(await crear(personal: 12));
        expect(e.personalPresente, 12);
        expect(e.personalNombres, '[]');
      });

      test('solo nombres vacíos cuentan como sin nombres', () async {
        final e = await entrada(await crear(nombres: ['', '  '], personal: 7));
        expect(e.personalPresente, 7);
        expect(e.personalNombres, '[]');
      });

      test('sin nombres ni conteo queda sin anotar (null)', () async {
        expect((await entrada(await crear())).personalPresente, isNull);
      });

      test('el conteo 0 es válido y se guarda (no es lo mismo que sin anotar)',
          () async {
        expect((await entrada(await crear(personal: 0))).personalPresente, 0);
      });

      test('los nombres se leen de vuelta con nombresDesdeJson', () async {
        final id = await crear(nombres: ['Ana "la jefa"', 'Ñ\\o', 'Pepe 🧱']);
        final e = await entrada(id);

        expect(nombresDesdeJson(e.personalNombres),
            ['Ana "la jefa"', 'Ñ\\o', 'Pepe 🧱']);
      });
    });

    group('validación (mismas reglas y mensajes que la web)', () {
      Future<void> rechaza(Future<String> Function() f, String mensaje) async {
        await expectLater(
          f(),
          throwsA(isA<ArgumentError>()
              .having((e) => e.message, 'message', mensaje)),
        );
        // Lo rechazado no deja ni media fila: nada que subir y que el servidor
        // rechace después.
        expect(await db.select(db.bitacoraEntrada).get(), isEmpty);
      }

      test('texto vacío', () => rechaza(() => crear(texto: ''), 'Escribe qué pasó.'));

      test('texto de solo espacios',
          () => rechaza(() => crear(texto: ' \n\t '), 'Escribe qué pasó.'));

      test('texto de 5001 letras',
          () => rechaza(() => crear(texto: 'a' * 5001), 'El texto pasa de 5000 letras.'));

      test('texto de exactamente 5000 letras SÍ pasa', () async {
        final id = await crear(texto: 'a' * 5000);
        expect((await entrada(id)).texto.length, 5000);
      });

      test('5000 letras más espacios en las orillas SÍ pasa (se recorta)',
          () async {
        final id = await crear(texto: '  ${'a' * 5000}  ');
        expect((await entrada(id)).texto.length, 5000);
      });

      test('conteo negativo',
          () => rechaza(() => crear(personal: -1), 'El número de personas no es válido.'));

      test('conteo de 10001',
          () => rechaza(() => crear(personal: 10001), 'El número de personas no es válido.'));

      test('conteo de 10000 SÍ pasa', () async {
        expect((await entrada(await crear(personal: 10000))).personalPresente,
            10000);
      });

      test('tipo que la base no acepta',
          () => rechaza(() => crear(tipo: 'CHISME'), 'Elige el tipo de entrada.'));

      test('tipo en minúsculas no es el de la base',
          () => rechaza(() => crear(tipo: 'avance'), 'Elige el tipo de entrada.'));

      test('clima que la base no acepta',
          () => rechaza(() => crear(clima: 'NEVADA'), 'Clima inválido.'));

      test('todos los tipos y climas del catálogo se aceptan', () async {
        for (final t in tiposEntrada.keys) {
          await crear(tipo: t);
        }
        for (final c in climas.keys) {
          await crear(clima: c);
        }
        expect(await db.select(db.bitacoraEntrada).get(),
            hasLength(tiposEntrada.length + climas.length));
      });
    });
  });

  group('editarEntrada', () {
    Future<void> editar(
      String id, {
      int fecha = dia2,
      String tipo = 'INCIDENCIA',
      String texto = 'Texto corregido',
      String clima = 'SOLEADO',
      List<String> nombres = const [],
      int? personal,
    }) =>
        repo.editarEntrada(id,
            fecha: fecha,
            tipo: tipo,
            texto: texto,
            clima: clima,
            nombres: nombres,
            personalPresente: personal);

    test('cambia los campos editables', () async {
      final id = await crear(nombres: ['Ana']);

      await editar(id, nombres: ['Beto', 'Carlos']);

      final e = await entrada(id);
      expect(e.fecha, dia2);
      expect(e.tipo, 'INCIDENCIA');
      expect(e.texto, 'Texto corregido');
      expect(e.clima, 'SOLEADO');
      expect(e.personalNombres, '["Beto","Carlos"]');
      expect(e.personalPresente, 2);
    });

    test('una entrada ya subida vuelve a pending (si no, la edición no sube)',
        () async {
      final id = await crear();
      await sincronizadaTodo();
      expect((await entrada(id)).syncStatus, 'synced');

      await editar(id);

      expect((await entrada(id)).syncStatus, 'pending');
    });

    test('una entrada en error o skipped vuelve a pending al editarla',
        () async {
      final id = await crear();
      for (final estado in ['error', 'skipped']) {
        await db.customStatement(
            "UPDATE bitacora_entrada SET sync_status = '$estado'");
        await editar(id);
        expect((await entrada(id)).syncStatus, 'pending',
            reason: 'tras $estado');
      }
    });

    test('NO toca visible_cliente (la oficina pudo retirarla del portal)',
        () async {
      final id = await crear();
      await db.customStatement(
          "UPDATE bitacora_entrada SET visible_cliente = 1, "
          "sync_status = 'synced'");

      await editar(id);
      expect((await entrada(id)).visibleCliente, isTrue);

      await db.customStatement(
          "UPDATE bitacora_entrada SET visible_cliente = 0, "
          "sync_status = 'synced'");
      await editar(id);
      expect((await entrada(id)).visibleCliente, isFalse);
    });

    test('NO toca lo que sella el servidor ni dónde vive la entrada', () async {
      final id = await crear(obraId: 'o7');
      await db.customStatement(
          "UPDATE bitacora_entrada SET autor_id = 'u-42', "
          "autor_nombre = 'Mario', registrada_en = 123456, "
          "server_updated_at = 9000, sync_status = 'synced'");
      final antes = await entrada(id);

      await editar(id);

      final e = await entrada(id);
      expect(e.autorId, 'u-42');
      expect(e.autorNombre, 'Mario');
      expect(e.registradaEn, 123456);
      expect(e.serverUpdatedAt, 9000,
          reason: 'es el árbitro del conflicto: solo lo mueve el sync');
      expect(e.obraId, 'o7');
      expect(e.empresaId, 'e1');
      expect(e.createdAt, antes.createdAt);
      expect(e.deletedAt, isNull);
    });

    test('no toca las demás entradas', () async {
      final a = await crear(texto: 'A');
      final b = await crear(texto: 'B');
      await sincronizadaTodo();

      await editar(a);

      final otra = await entrada(b);
      expect(otra.texto, 'B');
      expect(otra.syncStatus, 'synced');
    });

    test('quitar los nombres vuelve al conteo manual', () async {
      final id = await crear(nombres: ['Ana', 'Beto']);

      await editar(id, nombres: const [], personal: 9);

      final e = await entrada(id);
      expect(e.personalNombres, '[]');
      expect(e.personalPresente, 9);
    });

    test('sin nombres ni conteo BORRA el personal anotado (null explícito)',
        () async {
      final id = await crear(personal: 5);

      await editar(id, personal: null);

      expect((await entrada(id)).personalPresente, isNull);
    });

    test('con nombres, el conteo manual se ignora y se limpian', () async {
      final id = await crear();

      await editar(id, nombres: ['Ana', 'ANA', 'Beto'], personal: 99);

      final e = await entrada(id);
      expect(e.personalNombres, '["Ana","Beto"]');
      expect(e.personalPresente, 2);
    });

    test('recorta el texto', () async {
      final id = await crear();
      await editar(id, texto: '  nuevo  ');
      expect((await entrada(id)).texto, 'nuevo');
    });

    test('valida igual que al crear y deja la fila como estaba', () async {
      final id = await crear(texto: 'original');
      await sincronizadaTodo();

      await expectLater(editar(id, texto: '  '),
          throwsA(isA<ArgumentError>().having((e) => e.message, 'm', 'Escribe qué pasó.')));
      await expectLater(editar(id, personal: -3), throwsArgumentError);
      await expectLater(editar(id, tipo: 'CHISME'), throwsArgumentError);
      await expectLater(editar(id, clima: 'NEVADA'), throwsArgumentError);
      await expectLater(editar(id, texto: 'a' * 5001), throwsArgumentError);

      final e = await entrada(id);
      expect(e.texto, 'original');
      expect(e.syncStatus, 'synced', reason: 'un intento inválido no ensucia');
    });

    test('una entrada que no existe lanza StateError', () async {
      await expectLater(editar('fantasma'), throwsStateError);
    });

    test('una entrada borrada no se puede editar', () async {
      final id = await crear(texto: 'original');
      await repo.borrarEntrada(id);

      await expectLater(editar(id), throwsStateError);
      expect((await entrada(id)).texto, 'original');
    });
  });

  group('borrarEntrada', () {
    test('es borrado LÓGICO: la fila queda con deletedAt y pending', () async {
      final id = await crear();
      await sincronizadaTodo();

      await repo.borrarEntrada(id);

      final e = await entrada(id);
      expect(e.deletedAt, isNotNull);
      expect(e.syncStatus, 'pending',
          reason: 'el borrado también tiene que viajar');
    });

    test('no la borra de verdad (el sync necesita la fila)', () async {
      final id = await crear();
      await repo.borrarEntrada(id);
      expect(await db.select(db.bitacoraEntrada).get(), hasLength(1));
      expect((await entrada(id)).id, id);
    });

    test('en cascada: borra las fotos y aclaraciones que NUNCA llegaron',
        () async {
      final id = await crear();
      final f = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      final a = await repo.agregarAclaracion(
          entradaId: id, empresaId: 'e1', texto: 'Aclaro algo');

      await repo.borrarEntrada(id);

      expect((await fotoRow(f)).deletedAt, isNotNull);
      expect((await aclaracionRow(a)).deletedAt, isNotNull);
    });

    test('en cascada: NO toca los hijos que el servidor ya confirmó',
        () async {
      // Una foto o aclaración ya subida es evidencia: borrarla en el teléfono
      // sin que el servidor lo decida las dejaría en un estado que no se
      // reconcilia. El sync resuelve esos casos.
      final id = await crear();
      final fSubida = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      final fLocal = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('b.jpg'));
      final aSubida = await repo.agregarAclaracion(
          entradaId: id, empresaId: 'e1', texto: 'Ya subida');
      final aLocal = await repo.agregarAclaracion(
          entradaId: id, empresaId: 'e1', texto: 'Solo aquí');
      await confirmar('bitacora_foto', fSubida);
      await confirmar('bitacora_aclaracion', aSubida);

      await repo.borrarEntrada(id);

      expect((await entrada(id)).deletedAt, isNotNull);
      expect((await fotoRow(fSubida)).deletedAt, isNull);
      expect((await fotoRow(fSubida)).syncStatus, 'synced');
      expect((await aclaracionRow(aSubida)).deletedAt, isNull);
      expect((await aclaracionRow(aSubida)).syncStatus, 'synced');
      expect((await fotoRow(fLocal)).deletedAt, isNotNull);
      expect((await aclaracionRow(aLocal)).deletedAt, isNotNull);
    });

    test('un hijo ya borrado conserva su sello original', () async {
      final id = await crear();
      final f = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      await repo.quitarFoto(f);
      final sello = (await fotoRow(f)).deletedAt;
      await db.customStatement("UPDATE bitacora_foto SET sync_status = 'synced'");

      await repo.borrarEntrada(id);

      final despues = await fotoRow(f);
      expect(despues.deletedAt, sello);
      expect(despues.syncStatus, 'synced',
          reason: 'no se vuelve a marcar lo que ya estaba borrado');
    });

    test('solo toca los hijos de ESA entrada y no las otras entradas',
        () async {
      final a = await crear(texto: 'A');
      final b = await crear(texto: 'B');
      final fB = await repo.agregarFoto(
          entradaId: b, obraId: 'o1', empresaId: 'e1', origen: foto('b.jpg'));
      final aclB = await repo.agregarAclaracion(
          entradaId: b, empresaId: 'e1', texto: 'de B');

      await repo.borrarEntrada(a);

      expect((await entrada(b)).deletedAt, isNull);
      expect((await fotoRow(fB)).deletedAt, isNull);
      expect((await aclaracionRow(aclB)).deletedAt, isNull);
    });

    test('borrar dos veces no cambia el sello ni lanza', () async {
      final id = await crear();
      await repo.borrarEntrada(id);
      final sello = (await entrada(id)).deletedAt;
      await Future<void>.delayed(const Duration(milliseconds: 3));

      await repo.borrarEntrada(id);

      expect((await entrada(id)).deletedAt, sello);
    });

    test('una entrada que no existe no lanza', () async {
      await repo.borrarEntrada('fantasma');
    });

    test('no borra el archivo de la foto (eso lo decide el sync)', () async {
      final id = await crear();
      final f = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      final archivo = await fotos.archivo(f, 'image/jpeg');

      await repo.borrarEntrada(id);

      expect(archivo.existsSync(), isTrue);
    });
  });

  group('agregarAclaracion', () {
    test('inserta la fila pending, recortada, sin lo que sella el servidor',
        () async {
      final id = await crear();

      final a = await repo.agregarAclaracion(
          entradaId: id, empresaId: 'e1', texto: '  Faltó anotar el cemento ');

      final r = await aclaracionRow(a);
      expect(r.entradaId, id);
      expect(r.empresaId, 'e1');
      expect(r.texto, 'Faltó anotar el cemento');
      expect(r.syncStatus, 'pending');
      expect(r.autorId, isNull);
      expect(r.autorNombre, '');
      expect(r.registradaEn, 0);
      expect(r.createdAt, greaterThan(0));
      expect(r.deletedAt, isNull);
    });

    test('rechaza el texto vacío con el mensaje de aclarar', () async {
      final id = await crear();
      await expectLater(
        repo.agregarAclaracion(entradaId: id, empresaId: 'e1', texto: '   '),
        throwsA(isA<ArgumentError>()
            .having((e) => e.message, 'm', 'Escribe la aclaración.')),
      );
      expect(await db.select(db.bitacoraAclaracion).get(), isEmpty);
    });

    test('rechaza más de 5000 letras y acepta exactamente 5000', () async {
      final id = await crear();
      await expectLater(
        repo.agregarAclaracion(
            entradaId: id, empresaId: 'e1', texto: 'a' * 5001),
        throwsA(isA<ArgumentError>().having(
            (e) => e.message, 'm', 'La aclaración pasa de 5000 letras.')),
      );
      await repo.agregarAclaracion(
          entradaId: id, empresaId: 'e1', texto: 'a' * 5000);
      expect(await db.select(db.bitacoraAclaracion).get(), hasLength(1));
    });

    test('no marca la entrada como editada (la aclaración es otra fila)',
        () async {
      final id = await crear();
      await sincronizadaTodo();

      await repo.agregarAclaracion(
          entradaId: id, empresaId: 'e1', texto: 'algo');

      expect((await entrada(id)).syncStatus, 'synced');
    });
  });

  group('agregarFoto', () {
    Future<String> agregar(String entradaId, String origen,
            {String obraId = 'o1', String empresaId = 'e1'}) =>
        repo.agregarFoto(
            entradaId: entradaId,
            obraId: obraId,
            empresaId: empresaId,
            origen: origen);

    test('arma la fila: ruta del bucket, mime, bytes y orden 0', () async {
      final id = await crear(obraId: 'obraA');
      final origen = foto('IMG_1.jpg', bytes: List.filled(1234, 7));

      final f = await agregar(id, origen, obraId: 'obraA', empresaId: 'e1');

      final r = await fotoRow(f);
      expect(r.entradaId, id);
      expect(r.path, 'e1/obraA/$id/$f.jpg');
      expect(r.mime, 'image/jpeg');
      expect(r.bytes, 1234);
      expect(r.orden, 0);
      expect(r.empresaId, 'e1');
      expect(r.syncStatus, 'pending');
      expect(r.createdAt, greaterThan(0));
      expect(r.deletedAt, isNull);
      expect(r.serverUpdatedAt, isNull);
    });

    test('copia el archivo al teléfono como <foto_id>.<ext>', () async {
      final id = await crear();
      final origen = foto('IMG_1.jpg', bytes: [9, 8, 7, 6]);

      final f = await agregar(id, origen);

      final copia = await fotos.archivo(f, 'image/jpeg');
      expect(copia.existsSync(), isTrue);
      expect(copia.readAsBytesSync(), [9, 8, 7, 6]);
      expect(p.basename(copia.path), '$f.jpg');
    });

    test('los bytes son los del archivo COPIADO, no los del original', () async {
      final id = await crear();
      final f = await agregar(id, foto('a.jpg', bytes: List.filled(500, 1)));

      final copia = await fotos.archivo(f, 'image/jpeg');
      expect((await fotoRow(f)).bytes, copia.lengthSync());
    });

    test('png y webp conservan su mime y su extensión', () async {
      final id = await crear();

      final png = await agregar(id, foto('a.png'));
      final webp = await agregar(id, foto('b.WEBP'));

      expect((await fotoRow(png)).mime, 'image/png');
      expect((await fotoRow(png)).path, endsWith('/$png.png'));
      expect((await fotoRow(webp)).mime, 'image/webp');
      expect((await fotoRow(webp)).path, endsWith('/$webp.webp'));
      expect((await fotos.archivo(png, 'image/png')).existsSync(), isTrue);
      expect((await fotos.archivo(webp, 'image/webp')).existsSync(), isTrue);
    });

    test('un origen sin extensión conocida se guarda como jpeg', () async {
      final id = await crear();
      final f = await agregar(id, foto('sin_extension'));

      expect((await fotoRow(f)).mime, 'image/jpeg');
      expect((await fotoRow(f)).path, endsWith('/$f.jpg'));
    });

    test('el orden crece: 0, 1, 2…', () async {
      final id = await crear();
      final a = await agregar(id, foto('a.jpg'));
      final b = await agregar(id, foto('b.jpg'));
      final c = await agregar(id, foto('c.jpg'));

      expect([
        (await fotoRow(a)).orden,
        (await fotoRow(b)).orden,
        (await fotoRow(c)).orden,
      ], [0, 1, 2]);
    });

    test('el orden sigue al MÁXIMO de las vivas, no a su cantidad', () async {
      final id = await crear();
      await agregar(id, foto('a.jpg'));
      final b = await agregar(id, foto('b.jpg'));
      final c = await agregar(id, foto('c.jpg'));
      await repo.quitarFoto(b); // quedan orden 0 y 2

      final d = await agregar(id, foto('d.jpg'));

      expect((await fotoRow(c)).orden, 2);
      expect((await fotoRow(d)).orden, 3,
          reason: 'contar vivas daría 2 y empataría con la foto c');
    });

    test('quitar la última deja su lugar libre para la siguiente', () async {
      final id = await crear();
      await agregar(id, foto('a.jpg'));
      final b = await agregar(id, foto('b.jpg'));
      await repo.quitarFoto(b);

      final c = await agregar(id, foto('c.jpg'));

      expect((await fotoRow(c)).orden, 1);
    });

    test('cada entrada lleva su propio orden', () async {
      final e1 = await crear(texto: 'uno');
      final e2 = await crear(texto: 'dos');
      await agregar(e1, foto('a.jpg'));
      await agregar(e1, foto('b.jpg'));

      final f = await agregar(e2, foto('c.jpg'));

      expect((await fotoRow(f)).orden, 0);
    });

    test('respeta el máximo de 10 fotos vivas: la 11 lanza StateError',
        () async {
      final id = await crear();
      for (var i = 0; i < maxFotosPorEntrada; i++) {
        await agregar(id, foto('f$i.jpg'));
      }

      await expectLater(
          agregar(id, foto('la11.jpg')), throwsStateError);

      final vivas = await (db.select(db.bitacoraFoto)
            ..where((t) => t.deletedAt.isNull()))
          .get();
      expect(vivas, hasLength(maxFotosPorEntrada));
      // Y no queda una copia huérfana de la foto rechazada.
      final archivos = Directory(p.join(raiz.path, 'bitacora')).listSync();
      expect(archivos, hasLength(maxFotosPorEntrada));
    });

    test('las fotos quitadas no cuentan para el máximo', () async {
      final id = await crear();
      final ids = <String>[];
      for (var i = 0; i < maxFotosPorEntrada; i++) {
        ids.add(await agregar(id, foto('f$i.jpg')));
      }
      await repo.quitarFoto(ids.first);

      await agregar(id, foto('nueva.jpg'));

      final vivas = await (db.select(db.bitacoraFoto)
            ..where((t) => t.deletedAt.isNull()))
          .get();
      expect(vivas, hasLength(maxFotosPorEntrada));
    });

    test('el máximo es por entrada', () async {
      final e1 = await crear(texto: 'uno');
      final e2 = await crear(texto: 'dos');
      for (var i = 0; i < maxFotosPorEntrada; i++) {
        await agregar(e1, foto('f$i.jpg'));
      }

      await agregar(e2, foto('otra.jpg'));
    });

    test('dos altas a la vez no se pasan del máximo', () async {
      final id = await crear();
      for (var i = 0; i < maxFotosPorEntrada - 1; i++) {
        await agregar(id, foto('f$i.jpg'));
      }

      final resultados = await Future.wait([
        agregar(id, foto('x.jpg')).then<Object>((v) => v, onError: (Object e) => e),
        agregar(id, foto('y.jpg')).then<Object>((v) => v, onError: (Object e) => e),
      ]);

      expect(resultados.whereType<StateError>(), hasLength(1));
      final vivas = await (db.select(db.bitacoraFoto)
            ..where((t) => t.deletedAt.isNull()))
          .get();
      expect(vivas, hasLength(maxFotosPorEntrada));
      expect(Directory(p.join(raiz.path, 'bitacora')).listSync(),
          hasLength(maxFotosPorEntrada));
    });

    test('si la entrada no existe lanza y borra la copia del teléfono',
        () async {
      await expectLater(
          agregar('fantasma', foto('a.jpg')), throwsStateError);

      expect(await db.select(db.bitacoraFoto).get(), isEmpty);
      final base = Directory(p.join(raiz.path, 'bitacora'));
      expect(base.existsSync() ? base.listSync() : [], isEmpty);
    });

    test('si la entrada está borrada tampoco acepta fotos', () async {
      final id = await crear();
      await repo.borrarEntrada(id);

      await expectLater(agregar(id, foto('a.jpg')), throwsStateError);
      expect(await db.select(db.bitacoraFoto).get(), isEmpty);
    });

    test('la obra tiene que ser la de la entrada (la ruta del bucket depende)',
        () async {
      final id = await crear(obraId: 'o1');

      await expectLater(
          agregar(id, foto('a.jpg'), obraId: 'otra'), throwsArgumentError);

      expect(await db.select(db.bitacoraFoto).get(), isEmpty);
      final base = Directory(p.join(raiz.path, 'bitacora'));
      expect(base.existsSync() ? base.listSync() : [], isEmpty);
    });

    test('un origen que no existe lanza y no deja fila', () async {
      final id = await crear();

      await expectLater(agregar(id, p.join(raiz.path, 'no_existe.jpg')),
          throwsA(isA<FileSystemException>()));

      expect(await db.select(db.bitacoraFoto).get(), isEmpty);
    });

    test('no marca la entrada como editada', () async {
      final id = await crear();
      await sincronizadaTodo();

      await agregar(id, foto('a.jpg'));

      expect((await entrada(id)).syncStatus, 'synced');
    });
  });

  group('quitarFoto', () {
    test('borrado lógico: deletedAt, pending, y el archivo se queda', () async {
      final id = await crear();
      final f = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      await db.customStatement("UPDATE bitacora_foto SET sync_status = 'synced'");

      await repo.quitarFoto(f);

      final r = await fotoRow(f);
      expect(r.deletedAt, isNotNull);
      expect(r.syncStatus, 'pending');
      expect((await fotos.archivo(f, 'image/jpeg')).existsSync(), isTrue,
          reason: 'borrarlo es decisión del sync, que sabe si ya subió');
    });

    test('solo quita esa foto', () async {
      final id = await crear();
      final a = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      final b = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('b.jpg'));

      await repo.quitarFoto(a);

      expect((await fotoRow(b)).deletedAt, isNull);
    });

    test('quitarla dos veces conserva el primer sello', () async {
      final id = await crear();
      final f = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      await repo.quitarFoto(f);
      final sello = (await fotoRow(f)).deletedAt;
      await Future<void>.delayed(const Duration(milliseconds: 3));

      await repo.quitarFoto(f);

      expect((await fotoRow(f)).deletedAt, sello);
    });

    test('una foto que no existe no lanza', () async {
      await repo.quitarFoto('fantasma');
    });
  });

  group('watchDeObra', () {
    /// Escucha el stream y junta TODAS sus emisiones. `pumpEventQueue` deja que
    /// drift notifique y que el `asyncMap` termine antes de mirar.
    late List<List<EntradaConDetalle>> emisiones;
    StreamSubscription<List<EntradaConDetalle>>? sub;

    Future<void> empezar([String obraId = 'o1']) async {
      emisiones = [];
      sub = repo.watchDeObra(obraId).listen(emisiones.add);
      await pumpEventQueue();
    }

    tearDown(() async {
      await sub?.cancel();
    });

    test('una obra sin entradas emite la lista vacía', () async {
      await empezar();
      expect(emisiones, isNotEmpty);
      expect(emisiones.last, isEmpty);
    });

    test('emite la entrada al crearla', () async {
      await empezar();

      final id = await crear(nombres: ['Ana', 'Beto']);
      await pumpEventQueue();

      final ultima = emisiones.last;
      expect(ultima, hasLength(1));
      expect(ultima.single.entrada.id, id);
      expect(ultima.single.nombres, ['Ana', 'Beto']);
      expect(ultima.single.fotos, isEmpty);
      expect(ultima.single.aclaraciones, isEmpty);
    });

    test('RE-EMITE al agregar SOLO una foto (la entrada no cambió)', () async {
      final id = await crear();
      await empezar();
      final antes = emisiones.length;
      expect(emisiones.last.single.fotos, isEmpty);

      final f = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      await pumpEventQueue();

      expect(emisiones.length, greaterThan(antes),
          reason: 'sin re-emitir, la foto no se vería hasta salir y volver');
      expect(emisiones.last.single.fotos.map((x) => x.id), [f]);
    });

    test('RE-EMITE al agregar SOLO una aclaración', () async {
      final id = await crear();
      await empezar();
      final antes = emisiones.length;

      final a = await repo.agregarAclaracion(
          entradaId: id, empresaId: 'e1', texto: 'Se me pasó decir…');
      await pumpEventQueue();

      expect(emisiones.length, greaterThan(antes));
      expect(emisiones.last.single.aclaraciones.map((x) => x.id), [a]);
    });

    test('RE-EMITE al quitar una foto y la saca de la lista', () async {
      final id = await crear();
      final f = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      await empezar();
      expect(emisiones.last.single.fotos, hasLength(1));

      await repo.quitarFoto(f);
      await pumpEventQueue();

      expect(emisiones.last.single.fotos, isEmpty);
    });

    test('RE-EMITE al editar la entrada', () async {
      final id = await crear(texto: 'antes');
      await empezar();

      await repo.editarEntrada(id,
          fecha: dia1, tipo: 'AVANCE', texto: 'después', clima: '',
          nombres: const []);
      await pumpEventQueue();

      expect(emisiones.last.single.entrada.texto, 'después');
    });

    test('al borrar la entrada desaparece de la lista', () async {
      final id = await crear();
      await empezar();
      expect(emisiones.last, hasLength(1));

      await repo.borrarEntrada(id);
      await pumpEventQueue();

      expect(emisiones.last, isEmpty);
    });

    test('borrar una entrada con hijos emite sin pasar por un estado a medias',
        () async {
      final id = await crear();
      await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      await repo.agregarAclaracion(
          entradaId: id, empresaId: 'e1', texto: 'algo');
      await empezar();
      final antes = emisiones.length;

      await repo.borrarEntrada(id);
      await pumpEventQueue();

      // Toda emisión nueva ya viene sin la entrada: el borrado es atómico.
      for (final e in emisiones.skip(antes)) {
        expect(e, isEmpty);
      }
    });

    test('no mezcla obras y no ve las entradas borradas de antes', () async {
      await crear(obraId: 'o1', texto: 'de o1');
      await crear(obraId: 'o2', texto: 'de o2');
      final borrada = await crear(obraId: 'o1', texto: 'borrada');
      await repo.borrarEntrada(borrada);

      await empezar('o1');

      expect(emisiones.last.map((e) => e.entrada.texto), ['de o1']);
    });

    test('un cambio en OTRA obra no altera las fotos de ésta', () async {
      final e1 = await crear(obraId: 'o1');
      final e2 = await crear(obraId: 'o2');
      await repo.agregarFoto(
          entradaId: e2, obraId: 'o2', empresaId: 'e1', origen: foto('x.jpg'));
      await empezar('o1');

      expect(emisiones.last.single.entrada.id, e1);
      expect(emisiones.last.single.fotos, isEmpty);
    });

    test('fotos: solo las vivas, por orden', () async {
      final id = await crear();
      final a = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('a.jpg'));
      final b = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('b.jpg'));
      final c = await repo.agregarFoto(
          entradaId: id, obraId: 'o1', empresaId: 'e1', origen: foto('c.jpg'));
      await repo.quitarFoto(b);
      // Un reorden hecho en otro dispositivo llega con el pull.
      await db.customStatement(
          "UPDATE bitacora_foto SET orden = 5 WHERE id = '$a'");

      await empezar();

      expect(emisiones.last.single.fotos.map((f) => f.id), [c, a]);
    });

    test('fotos con el mismo orden se desempatan por antigüedad', () async {
      final id = await crear();
      for (final (fid, creada) in [('f3', 30), ('f1', 10), ('f2', 20)]) {
        await db.into(db.bitacoraFoto).insert(BitacoraFotoCompanion.insert(
            id: fid,
            entradaId: id,
            path: 'p/$fid.jpg',
            createdAt: Value(creada)));
      }

      await empezar();

      expect(emisiones.last.single.fotos.map((f) => f.id), ['f1', 'f2', 'f3']);
    });

    test('aclaraciones: solo las vivas, por hora de registro; sin subir al final',
        () async {
      final id = await crear();
      Future<void> acl(String aid,
              {required int registrada, required int creada, int? borrada}) =>
          db.into(db.bitacoraAclaracion).insert(
              BitacoraAclaracionCompanion.insert(
                id: aid,
                entradaId: id,
                texto: aid,
                registradaEn: Value(registrada),
                createdAt: Value(creada),
                deletedAt: Value(borrada),
              ));
      await acl('sinSubirB', registrada: 0, creada: 50);
      await acl('tarde', registrada: 900, creada: 1);
      await acl('sinSubirA', registrada: 0, creada: 40);
      await acl('temprano', registrada: 100, creada: 99);
      await acl('muerta', registrada: 50, creada: 1, borrada: 7);

      await empezar();

      expect(emisiones.last.single.aclaraciones.map((a) => a.id),
          ['temprano', 'tarde', 'sinSubirA', 'sinSubirB']);
    });

    test('línea de tiempo: días de más reciente a más antiguo', () async {
      await insertar('viejo', fecha: dia1);
      await insertar('nuevo', fecha: dia3);
      await insertar('medio', fecha: dia2);

      await empezar();

      expect(emisiones.last.map((e) => e.entrada.id),
          ['nuevo', 'medio', 'viejo']);
    });

    test(
        'dentro del día: en el orden en que llegaron; las que no han subido '
        'al final, por createdAt', () async {
      await insertar('tarde', fecha: dia1, registradaEn: 900, createdAt: 1);
      await insertar('sinSubir2', fecha: dia1, registradaEn: 0, createdAt: 300);
      await insertar('temprano', fecha: dia1, registradaEn: 100, createdAt: 999);
      await insertar('sinSubir1', fecha: dia1, registradaEn: 0, createdAt: 200);
      await insertar('otroDia', fecha: dia2, registradaEn: 5, createdAt: 5);

      await empezar();

      expect(emisiones.last.map((e) => e.entrada.id),
          ['otroDia', 'temprano', 'tarde', 'sinSubir1', 'sinSubir2']);
    });

    test('registradaEn igual se desempata por createdAt', () async {
      await insertar('b', fecha: dia1, registradaEn: 100, createdAt: 20);
      await insertar('a', fecha: dia1, registradaEn: 100, createdAt: 10);

      await empezar();

      expect(emisiones.last.map((e) => e.entrada.id), ['a', 'b']);
    });

    test('una entrada nueva sin subir queda al final de SU día, no del todo',
        () async {
      await insertar('ayer', fecha: dia1, registradaEn: 10);
      await insertar('hoyYaSubida', fecha: dia2, registradaEn: 20);

      await empezar();
      final nueva = await crear(fecha: dia2);
      await pumpEventQueue();

      expect(emisiones.last.map((e) => e.entrada.id),
          ['hoyYaSubida', nueva, 'ayer']);
    });

    test('confirmadaEnServidor sigue a serverUpdatedAt', () async {
      final id = await crear();
      await empezar();
      expect(emisiones.last.single.confirmadaEnServidor, isFalse);

      await confirmar('bitacora_entrada', id);
      // Un UPDATE crudo no avisa a los streams de drift (el sync real escribe
      // por la API tipada, que sí avisa): se avisa a mano.
      db.markTablesUpdated({db.bitacoraEntrada});
      await pumpEventQueue();

      expect(emisiones.last.single.confirmadaEnServidor, isTrue);
    });

    test('nombres tolera un JSON roto sin tirar la línea de tiempo', () async {
      final id = await crear();
      await db.customStatement(
          "UPDATE bitacora_entrada SET personal_nombres = '[\"Ana\", ' "
          "WHERE id = '$id'");

      await empezar();

      expect(emisiones.last.single.nombres, isEmpty);
    });

    test('una bitácora grande (500 entradas × 3 fotos) sale completa y en orden',
        () async {
      await db.batch((b) {
        for (var i = 0; i < 500; i++) {
          b.insert(
              db.bitacoraEntrada,
              BitacoraEntradaCompanion.insert(
                id: 'e$i',
                obraId: 'o1',
                fecha: dia1 + (i ~/ 5) * 86400000,
                registradaEn: Value(1000 + i),
                createdAt: Value(i + 1),
              ));
          for (var j = 0; j < 3; j++) {
            b.insert(
                db.bitacoraFoto,
                BitacoraFotoCompanion.insert(
                  id: 'f${i}_$j',
                  entradaId: 'e$i',
                  path: 'p/$i/$j.jpg',
                  orden: Value(2 - j),
                ));
          }
        }
      });

      await empezar();

      final lista = emisiones.last;
      expect(lista, hasLength(500));
      expect(lista.every((e) => e.fotos.length == 3), isTrue);
      expect(lista.first.entrada.id, 'e495',
          reason: 'el día más reciente primero, y en él, el primero en llegar');
      expect(lista.first.fotos.map((f) => f.id),
          ['f495_2', 'f495_1', 'f495_0']);
    });
  });

  group('personalSugerido', () {
    /// El pase de lista guarda `fecha` con la medianoche LOCAL del teléfono.
    const dia = 1700006400000;

    var n = 0;
    Future<void> colaborador(String id, String nombre, {int? borrado}) =>
        db.into(db.colaboradores).insert(ColaboradoresCompanion.insert(
              id: id,
              nombre: nombre,
              puestoId: 'pu1',
              tipoPago: 'DIA',
              deletedAt: Value(borrado),
            ));

    Future<void> asistio(String colaboradorId,
            {String obraId = 'o1',
            int fecha = dia,
            double fraccion = 1.0,
            int? borrada}) =>
        db.into(db.asistencias).insert(AsistenciasCompanion.insert(
              id: 'as${n++}',
              colaboradorId: colaboradorId,
              obraId: obraId,
              fecha: fecha,
              fraccion: fraccion,
              deletedAt: Value(borrada),
            ));

    test('sin pase de lista ese día no sugiere a nadie', () async {
      expect(await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia), isEmpty);
    });

    test('devuelve los nombres de quienes asistieron, ordenados', () async {
      await colaborador('c1', 'Carlos');
      await colaborador('c2', 'Ana');
      await colaborador('c3', 'Beto');
      await asistio('c1');
      await asistio('c2');
      await asistio('c3');

      expect(await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia),
          ['Ana', 'Beto', 'Carlos']);
    });

    test('cuenta media jornada y tres cuartos, pero NO la fracción 0',
        () async {
      await colaborador('c1', 'Completo');
      await colaborador('c2', 'Medio');
      await colaborador('c3', 'TresCuartos');
      await colaborador('c4', 'Falto');
      await asistio('c1', fraccion: 1.0);
      await asistio('c2', fraccion: 0.5);
      await asistio('c3', fraccion: 0.75);
      await asistio('c4', fraccion: 0.0);

      expect(await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia),
          ['Completo', 'Medio', 'TresCuartos']);
    });

    test('ignora las asistencias borradas', () async {
      await colaborador('c1', 'Vivo');
      await colaborador('c2', 'Corregido');
      await asistio('c1');
      await asistio('c2', borrada: 5);

      expect(await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia),
          ['Vivo']);
    });

    test('ignora a los colaboradores borrados', () async {
      await colaborador('c1', 'Vivo');
      await colaborador('c2', 'Dado de baja', borrado: 5);
      await asistio('c1');
      await asistio('c2');

      expect(await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia),
          ['Vivo']);
    });

    test('solo la obra y el día pedidos', () async {
      await colaborador('c1', 'Aqui');
      await colaborador('c2', 'OtraObra');
      await colaborador('c3', 'OtroDia');
      await asistio('c1');
      await asistio('c2', obraId: 'o2');
      await asistio('c3', fecha: dia + 86400000);

      expect(await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia),
          ['Aqui']);
    });

    test('dos colaboradores con el mismo nombre salen una vez', () async {
      await colaborador('c1', 'Beto');
      await colaborador('c2', 'beto');
      await asistio('c1');
      await asistio('c2');

      final r = await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia);
      expect(r, hasLength(1));
    });

    test('el orden alfabético ignora mayúsculas y acentos', () async {
      await colaborador('c1', 'zacarías');
      await colaborador('c2', 'Ángel');
      await colaborador('c3', 'beto');
      await colaborador('c4', 'Ana');
      for (final c in ['c1', 'c2', 'c3', 'c4']) {
        await asistio(c);
      }

      expect(await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia),
          ['Ana', 'Ángel', 'beto', 'zacarías']);
    });

    test('recorta los espacios y descarta nombres vacíos', () async {
      await colaborador('c1', '  Ana ');
      await colaborador('c2', '   ');
      await asistio('c1');
      await asistio('c2');

      expect(await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia),
          ['Ana']);
    });

    test('lo sugerido se puede pasar tal cual a crearEntrada', () async {
      await colaborador('c1', 'Ana');
      await colaborador('c2', 'Beto');
      await asistio('c1');
      await asistio('c2');

      final nombres =
          await repo.personalSugerido(obraId: 'o1', diaLocalMs: dia);
      final id = await crear(nombres: nombres);

      expect((await entrada(id)).personalPresente, 2);
    });
  });
}
