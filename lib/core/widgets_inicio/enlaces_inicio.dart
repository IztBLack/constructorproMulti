/// Enlaces con los que los widgets y los atajos del ícono abren la app en una
/// pantalla: `constructorpro://abrir/<destino>?obra=<id>`.
///
/// Kotlin arma estos enlaces (widgets) y `quick_actions` entrega solo el
/// `<destino>` (atajos). Los dos pasan por [leerEnlaceInicio].
library;

const esquemaInicio = 'constructorpro';

enum DestinoInicio {
  paseLista('pase-lista'),
  bitacora('bitacora'),
  entradaBitacora('entrada-bitacora'),
  notas('notas'),
  notaNueva('nota-nueva'),
  gastoCaja('gasto-caja'),
  obra('obra');

  const DestinoInicio(this.ruta);
  final String ruta;

  /// Todo menos el pase de lista necesita saber de qué obra se trata.
  bool get requiereObra => this != DestinoInicio.paseLista;
}

class EnlaceInicio {
  const EnlaceInicio(this.destino, {this.obraId});
  final DestinoInicio destino;
  final String? obraId;

  @override
  bool operator ==(Object other) =>
      other is EnlaceInicio && other.destino == destino && other.obraId == obraId;

  @override
  int get hashCode => Object.hash(destino, obraId);

  @override
  String toString() => 'EnlaceInicio(${destino.ruta}, obra: $obraId)';
}

/// Lo que pide el enlace, o null si no es de la app o no se entiende (un
/// enlace viejo o mal formado no hace nada, no truena).
EnlaceInicio? leerEnlaceInicio(Uri? uri) {
  if (uri == null || uri.scheme != esquemaInicio || uri.host != 'abrir') {
    return null;
  }
  if (uri.pathSegments.isEmpty) return null;
  final ruta = uri.pathSegments.first;
  final destino = DestinoInicio.values.where((d) => d.ruta == ruta).firstOrNull;
  if (destino == null) return null;
  final obra = uri.queryParameters['obra']?.trim();
  return EnlaceInicio(destino, obraId: (obra == null || obra.isEmpty) ? null : obra);
}

/// El enlace de un atajo del ícono (`quick_actions` solo entrega el tipo).
EnlaceInicio? leerAtajo(String tipo) =>
    leerEnlaceInicio(Uri(scheme: esquemaInicio, host: 'abrir', path: '/$tipo'));
