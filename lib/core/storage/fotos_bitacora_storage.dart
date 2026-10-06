import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Dónde viven EN EL TELÉFONO las fotos de la bitácora de obra.
///
/// La bitácora se captura en la obra, muchas veces sin señal: la foto tiene que
/// quedar guardada aquí hasta que el sync la suba, y después se sigue viendo sin
/// red. Por eso NO vive en la caché: `image_picker` deja ahí lo que toma, pero
/// Android la vacía cuando necesita espacio, y una foto que aún no subió no
/// tiene otra copia. Se copia de inmediato a la carpeta de soporte de la app
/// (`getApplicationSupportDirectory()/bitacora`), que el sistema no toca.
///
/// El archivo se llama `<foto_id>.<ext>`: el id ES la llave, así que no hace
/// falta una columna local que apunte al archivo (las tablas espejo no admiten
/// columnas que el servidor no tenga). Por la misma razón la ruta no se guarda en
/// la base: el contenedor de la app en iOS cambia de UUID al reinstalar o migrar,
/// y una ruta absoluta guardada quedaría rota (ver `AppPaths`).
///
/// El [baseDir] se inyecta para poder probar contra un directorio temporal sin
/// el plugin de `path_provider`.
class FotosBitacoraStorage {
  FotosBitacoraStorage({Future<Directory> Function()? baseDir})
      : _baseDir = baseDir ?? _carpetaPorDefecto;

  final Future<Directory> Function() _baseDir;

  static Future<Directory> _carpetaPorDefecto() async {
    final soporte = await getApplicationSupportDirectory();
    return Directory(p.join(soporte.path, 'bitacora'));
  }

  /// Los ids son uuid. Se exige ese alfabeto (letras, números, guion y guion
  /// bajo) porque el id de una foto BAJA DEL SERVIDOR en el pull y termina
  /// siendo parte de una ruta: con un `../` escribiría o borraría fuera de la
  /// carpeta de la bitácora. Un id que no cumple no es nuestro: se rechaza en
  /// vez de "limpiarlo", que escondería una colisión entre dos ids distintos.
  static final _idValido = RegExp(r'^[A-Za-z0-9_-]+$');

  static String _validarId(String fotoId) {
    if (!_idValido.hasMatch(fotoId)) {
      throw ArgumentError.value(fotoId, 'fotoId', 'Identificador de foto inválido');
    }
    return fotoId;
  }

  /// Extensión (sin punto) con la que se guarda un tipo de imagen. Solo los tres
  /// formatos que acepta el bucket; cualquier otro cae a `jpg`, que es lo que
  /// `image_picker` produce al recomprimir.
  static String extensionDe(String mime) {
    switch (mime.trim().toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/jpeg':
      default:
        return 'jpg';
    }
  }

  /// Tipo de imagen según la extensión del archivo. Es lo contrario de
  /// [extensionDe]. Sin extensión o con una desconocida (`.heic`, que el
  /// bucket no acepta) se asume JPEG, igual que lo que sale al recomprimir.
  static String mimeDeArchivo(String ruta) {
    switch (p.extension(ruta).toLowerCase()) {
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.jpg':
      case '.jpeg':
      default:
        return 'image/jpeg';
    }
  }

  /// Dónde está (o estaría) la foto. NO garantiza que el archivo exista: la fila
  /// puede venir de otro dispositivo y su archivo aún no haberse descargado.
  /// Tampoco crea la carpeta, para que preguntar no tenga efectos.
  Future<File> archivo(String fotoId, String mime) async {
    _validarId(fotoId);
    final base = await _baseDir();
    return File(p.join(base.path, '$fotoId.${extensionDe(mime)}'));
  }

  /// Copia [origen] (lo que `image_picker` dejó en la caché) a su lugar
  /// definitivo y devuelve el destino.
  ///
  /// Se copia a un temporal y se renombra: si el teléfono se apaga a la mitad,
  /// lo que queda NO se llama `<foto_id>.<ext>`, así que nunca se confunde una
  /// foto truncada con la evidencia y subirla. Si el origen no existe lanza
  /// `FileSystemException` y no deja nada.
  Future<File> guardarCopia({
    required String origen,
    required String fotoId,
    required String mime,
  }) async {
    final destino = await archivo(fotoId, mime);
    // Ya está en su sitio (p. ej. se reintenta con la ruta devuelta antes):
    // copiar un archivo sobre sí mismo lo dejaría vacío.
    if (p.equals(p.absolute(origen), p.absolute(destino.path))) {
      if (!await destino.exists()) {
        throw FileSystemException('El archivo de origen no existe', origen);
      }
      return destino;
    }

    await destino.parent.create(recursive: true);
    final temporal = File('${destino.path}.tmp');
    try {
      await File(origen).copy(temporal.path);
      // `rename` reemplaza el destino si ya había una foto con ese id.
      return await temporal.rename(destino.path);
    } catch (_) {
      await _borrarSiExiste(temporal);
      rethrow;
    }
  }

  /// Quita el archivo. Si no existe no es un error: borrar es idempotente (el
  /// sync puede reintentar) y una foto que bajó de otro dispositivo quizá nunca
  /// se descargó aquí.
  Future<void> borrar(String fotoId, String mime) async =>
      _borrarSiExiste(await archivo(fotoId, mime));

  /// Vacía la carpeta entera. Se usa al cambiar de cuenta: las fotos de la
  /// empresa anterior no deben quedar en el teléfono de la siguiente persona.
  Future<void> borrarTodo() async {
    final base = await _baseDir();
    try {
      if (await base.exists()) await base.delete(recursive: true);
    } on PathNotFoundException {
      // Alguien la borró entre el exists y el delete: el resultado es el mismo.
    }
  }

  Future<void> _borrarSiExiste(File f) async {
    try {
      await f.delete();
    } on PathNotFoundException {
      // Ya no estaba.
    }
  }
}
