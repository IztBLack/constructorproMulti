import 'dart:io';

import 'package:constructorpro/core/storage/fotos_bitacora_storage.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

/// Las fotos de la bitácora se guardan en el teléfono hasta subirlas (sin señal
/// no hay otra copia). Lo que se prueba aquí es lo que, si falla, le cuesta la
/// evidencia a alguien en la obra: que la copia exista, que el nombre sea la
/// llave (`<foto_id>.<ext>`) y que borrar no truene ni se salga de su carpeta.
///
/// Todo contra un directorio temporal real: es la única forma de ver que el
/// archivo de verdad llega a disco.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory raiz;
  late Directory base;
  late FotosBitacoraStorage storage;

  setUp(() {
    raiz = Directory.systemTemp.createTempSync('fotos_bitacora_test_');
    // La carpeta base NO existe todavía: la primera foto debe crearla.
    base = Directory(p.join(raiz.path, 'bitacora'));
    storage = FotosBitacoraStorage(baseDir: () async => base);
  });
  tearDown(() {
    if (raiz.existsSync()) raiz.deleteSync(recursive: true);
  });

  /// Un archivo cualquiera que hace de foto recién tomada (en la caché).
  File origenConBytes(String nombre, List<int> bytes) {
    final f = File(p.join(raiz.path, nombre))..writeAsBytesSync(bytes);
    return f;
  }

  group('extensionDe', () {
    test('mapea los tres formatos que acepta el bucket', () {
      expect(FotosBitacoraStorage.extensionDe('image/jpeg'), 'jpg');
      expect(FotosBitacoraStorage.extensionDe('image/png'), 'png');
      expect(FotosBitacoraStorage.extensionDe('image/webp'), 'webp');
    });

    test('cualquier otro tipo cae a jpg', () {
      expect(FotosBitacoraStorage.extensionDe('image/gif'), 'jpg');
      expect(FotosBitacoraStorage.extensionDe('application/pdf'), 'jpg');
      expect(FotosBitacoraStorage.extensionDe(''), 'jpg');
    });

    test('no distingue mayúsculas ni espacios en las orillas', () {
      expect(FotosBitacoraStorage.extensionDe(' IMAGE/PNG '), 'png');
    });
  });

  group('mimeDeArchivo', () {
    test('lee la extensión de la ruta', () {
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/a.jpg'), 'image/jpeg');
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/a.jpeg'), 'image/jpeg');
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/a.png'), 'image/png');
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/a.webp'), 'image/webp');
    });

    test('no distingue mayúsculas (las cámaras escriben IMG_0001.JPG)', () {
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/IMG_0001.JPG'),
          'image/jpeg');
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/x.PnG'), 'image/png');
    });

    test('sin extensión o con una desconocida cae a image/jpeg', () {
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/foto'), 'image/jpeg');
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/a.heic'), 'image/jpeg');
      expect(FotosBitacoraStorage.mimeDeArchivo(''), 'image/jpeg');
    });

    test('un punto en la carpeta no se confunde con la extensión', () {
      expect(FotosBitacoraStorage.mimeDeArchivo('/tmp/a.png/foto'),
          'image/jpeg');
    });
  });

  group('archivo', () {
    test('es <base>/<fotoId>.<ext> y no obliga a que exista', () async {
      final f = await storage.archivo('f1', 'image/png');

      expect(f.path, p.join(base.path, 'f1.png'));
      expect(f.existsSync(), isFalse);
    });

    test('la extensión sale del mime guardado', () async {
      expect((await storage.archivo('f1', 'image/jpeg')).path,
          endsWith('f1.jpg'));
      expect((await storage.archivo('f1', 'image/webp')).path,
          endsWith('f1.webp'));
      expect((await storage.archivo('f1', 'raro/tipo')).path,
          endsWith('f1.jpg'));
    });

    test('consultar la ruta no crea la carpeta', () async {
      await storage.archivo('f1', 'image/jpeg');
      expect(base.existsSync(), isFalse);
    });
  });

  group('guardarCopia', () {
    test('copia los bytes a <base>/<fotoId>.<ext> y deja el original', () async {
      final origen = origenConBytes('cache.jpg', [1, 2, 3, 4, 5]);

      final destino = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');

      expect(destino.path, p.join(base.path, 'f1.jpg'));
      expect(destino.readAsBytesSync(), [1, 2, 3, 4, 5]);
      // image_picker limpia su caché por su cuenta: aquí no se le quita nada.
      expect(origen.existsSync(), isTrue);
    });

    test('crea la carpeta base si todavía no existe', () async {
      final origen = origenConBytes('cache.png', [9]);
      expect(base.existsSync(), isFalse);

      await storage.guardarCopia(
          origen: origen.path, fotoId: 'f2', mime: 'image/png');

      expect(base.existsSync(), isTrue);
    });

    test('es una copia independiente del original', () async {
      final origen = origenConBytes('cache.jpg', [1, 2, 3]);
      final destino = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');

      origen.deleteSync(); // Android vacía la caché cuando quiere.

      expect(destino.existsSync(), isTrue);
      expect(destino.readAsBytesSync(), [1, 2, 3]);
    });

    test('un origen que no existe lanza y no deja nada a medias', () async {
      await expectLater(
        storage.guardarCopia(
            origen: p.join(raiz.path, 'no_existe.jpg'),
            fotoId: 'f1',
            mime: 'image/jpeg'),
        throwsA(isA<FileSystemException>()),
      );

      // Ni la foto ni un temporal: una foto "a medias" se vería como evidencia
      // válida y subiría truncada.
      final sobras = base.existsSync() ? base.listSync() : <FileSystemEntity>[];
      expect(sobras, isEmpty);
    });

    test('guardar otra vez la misma foto reemplaza el archivo', () async {
      final a = origenConBytes('a.jpg', [1, 1, 1]);
      final b = origenConBytes('b.jpg', [2, 2]);

      await storage.guardarCopia(
          origen: a.path, fotoId: 'f1', mime: 'image/jpeg');
      final destino = await storage.guardarCopia(
          origen: b.path, fotoId: 'f1', mime: 'image/jpeg');

      expect(destino.readAsBytesSync(), [2, 2]);
      expect(base.listSync(), hasLength(1));
    });

    test('si el origen YA es el destino no lo destruye', () async {
      final origen = origenConBytes('x.jpg', [7, 7]);
      final primero = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');

      final otra = await storage.guardarCopia(
          origen: primero.path, fotoId: 'f1', mime: 'image/jpeg');

      expect(otra.readAsBytesSync(), [7, 7]);
    });

    test('maneja una foto grande (varios MB) sin truncarla', () async {
      final bytes = List<int>.generate(3 * 1024 * 1024, (i) => i % 251);
      final origen = origenConBytes('grande.jpg', bytes);

      final destino = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');

      expect(destino.lengthSync(), bytes.length);
      expect(destino.readAsBytesSync(), bytes);
    });
  });

  group('un fotoId raro no se sale de la carpeta', () {
    // El id baja del servidor en el pull: un id con "../" escribiría fuera de
    // la carpeta de la bitácora.
    for (final malo in [
      '',
      '..',
      '../escape',
      'a/b',
      r'a\b',
      '.',
      'con espacio',
    ]) {
      test('rechaza "$malo"', () async {
        final origen = origenConBytes('c.jpg', [1]);

        await expectLater(storage.archivo(malo, 'image/jpeg'),
            throwsA(isA<ArgumentError>()));
        await expectLater(
            storage.guardarCopia(
                origen: origen.path, fotoId: malo, mime: 'image/jpeg'),
            throwsA(isA<ArgumentError>()));
        await expectLater(
            storage.borrar(malo, 'image/jpeg'), throwsA(isA<ArgumentError>()));
      });
    }

    test('acepta un uuid', () async {
      final f = await storage.archivo(
          '3f2b8c1e-9d4a-4e6b-8a1c-0b7d5e2f9a34', 'image/jpeg');
      expect(p.dirname(f.path), base.path);
    });
  });

  group('borrar', () {
    test('quita el archivo', () async {
      final origen = origenConBytes('c.jpg', [1]);
      final destino = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');

      await storage.borrar('f1', 'image/jpeg');

      expect(destino.existsSync(), isFalse);
    });

    test('si no existe no lanza (ni siquiera la carpeta)', () async {
      await storage.borrar('nunca_estuvo', 'image/jpeg');
      expect(base.existsSync(), isFalse);
    });

    test('borrar dos veces no lanza', () async {
      final origen = origenConBytes('c.jpg', [1]);
      await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');

      await storage.borrar('f1', 'image/jpeg');
      await storage.borrar('f1', 'image/jpeg');
    });

    test('solo toca la foto pedida', () async {
      final origen = origenConBytes('c.jpg', [1]);
      await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');
      final otra = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f2', mime: 'image/jpeg');

      await storage.borrar('f1', 'image/jpeg');

      expect(otra.existsSync(), isTrue);
    });
  });

  group('borrarTodo', () {
    test('vacía la carpeta (cambio de cuenta)', () async {
      final origen = origenConBytes('c.jpg', [1]);
      final f1 = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');
      final f2 = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f2', mime: 'image/png');

      await storage.borrarTodo();

      expect(f1.existsSync(), isFalse);
      expect(f2.existsSync(), isFalse);
    });

    test('sin carpeta no lanza', () async {
      await storage.borrarTodo();
    });

    test('después se puede volver a guardar', () async {
      final origen = origenConBytes('c.jpg', [1]);
      await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');
      await storage.borrarTodo();

      final destino = await storage.guardarCopia(
          origen: origen.path, fotoId: 'f3', mime: 'image/jpeg');

      expect(destino.existsSync(), isTrue);
    });

    test('no toca nada fuera de la carpeta base', () async {
      final ajeno = origenConBytes('ajeno.txt', [1]);
      final origen = origenConBytes('c.jpg', [1]);
      await storage.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');

      await storage.borrarTodo();

      expect(ajeno.existsSync(), isTrue);
      expect(origen.existsSync(), isTrue);
    });
  });

  group('directorio por defecto', () {
    // En una prueba no hay plugin real: se simula el canal de path_provider.
    // Lo que importa es DÓNDE cae la carpeta: en "soporte de la app" (que
    // Android no vacía) y no en la caché ni en los documentos visibles.
    const canal = MethodChannel('plugins.flutter.io/path_provider');

    setUp(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(canal, (llamada) async {
        switch (llamada.method) {
          case 'getApplicationSupportDirectory':
            return p.join(raiz.path, 'soporte');
          case 'getTemporaryDirectory':
            return p.join(raiz.path, 'cache');
        }
        return null;
      });
    });
    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(canal, null);
    });

    test('es <soporte de la app>/bitacora', () async {
      final porDefecto = FotosBitacoraStorage();

      final f = await porDefecto.archivo('f1', 'image/jpeg');

      expect(f.path, p.join(raiz.path, 'soporte', 'bitacora', 'f1.jpg'));
    });

    test('guarda de verdad ahí', () async {
      final porDefecto = FotosBitacoraStorage();
      final origen = origenConBytes('c.jpg', [4, 5]);

      final destino = await porDefecto.guardarCopia(
          origen: origen.path, fotoId: 'f1', mime: 'image/jpeg');

      expect(destino.readAsBytesSync(), [4, 5]);
      expect(destino.parent.path, p.join(raiz.path, 'soporte', 'bitacora'));
    });
  });
}
