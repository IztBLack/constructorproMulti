import 'dart:io';

import 'package:path/path.dart' as p;

/// Resolución de rutas de archivos guardados por la app (adjuntos de cotización,
/// logo y firma del PDF).
///
/// Los archivos se copian al directorio de documentos de la app. Persistir la
/// ruta ABSOLUTA es frágil: en iOS el contenedor de la app cambia de UUID al
/// reinstalar o migrar el dispositivo, y todas las rutas absolutas se rompen
/// (el usuario pierde fotos/planos). Por eso se persiste solo el NOMBRE del
/// archivo y se reconstruye la ruta con el directorio vigente al momento de leer.
class AppPaths {
  AppPaths._();

  /// Directorio de documentos de la app. Se precarga en main() antes de runApp
  /// para poder resolver rutas de forma síncrona desde la UI. (No es `final` para
  /// poder reasignarlo en tests que simulan distintos dispositivos.)
  static late String documentsDir;

  /// Devuelve la ruta absoluta vigente para un valor persistido.
  /// - Relativo (formato nuevo): se une al [documentsDir] actual.
  /// - Absoluto (formato viejo): se usa tal cual si el archivo existe; si no
  ///   (p. ej. cambió el sandbox en iOS), se reconstruye con el basename sobre el
  ///   [documentsDir] actual. Así los respaldos/instalaciones previas siguen
  ///   funcionando sin migración destructiva de la base de datos.
  static String resolve(String stored) {
    if (stored.isEmpty) return stored;
    if (!p.isAbsolute(stored)) return p.join(documentsDir, stored);
    if (File(stored).existsSync()) return stored;
    return p.join(documentsDir, p.basename(stored));
  }

  /// Valor que debe persistirse para un archivo recién copiado al documentsDir:
  /// solo el nombre (relativo), nunca la ruta absoluta.
  static String toStored(String absolutePath) => p.basename(absolutePath);
}
