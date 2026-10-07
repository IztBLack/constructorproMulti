import 'package:shared_preferences/shared_preferences.dart';

/// De QUIÉN son los datos que hay en la base local del teléfono.
///
/// Existe por el teléfono de pruebas que tuvo antes otra cuenta: al entrar con
/// la cuenta nueva, la base conservó filas de la otra empresa, el sellado las
/// reetiquetó como de la nueva y el sync acumuló 72 rechazos que se
/// reintentaban para siempre (`docs/PLAN_CAMBIO_DE_CUENTA.md`).
///
/// La causa raíz era que "Cerrar sesión" borra `empresa_id` de prefs, y con eso
/// se perdía la única pista de a quién pertenecían los datos: al entrar la
/// cuenta nueva no había con qué compararla. [dueno] vive en otra llave y **no
/// se borra al cerrar sesión**: solo cambia cuando la base se vacía para otra
/// empresa o cuando una empresa adopta los datos.
class CuentaLocal {
  CuentaLocal(this._prefs);

  final SharedPreferences _prefs;

  static const kDueno = 'datos_locales_empresa';
  static const kDuenoNombre = 'datos_locales_empresa_nombre';
  static const kDuenoCorreo = 'datos_locales_correo';

  /// `empresa_id` vigente de la sesión (la llave que ya usa la app). Se lee
  /// aquí solo para migrar los teléfonos de antes de la 1.5.1.
  static const kEmpresaSesion = 'empresa_id';

  /// Empresa dueña de lo que hay en la base local, o null si no se sabe
  /// (instalación nueva, o teléfono de antes de la 1.5.1 que cerró sesión).
  String? get dueno {
    final v = _prefs.getString(kDueno);
    return (v == null || v.isEmpty) ? null : v;
  }

  /// Nombre de la empresa dueña, para que el aviso diga "cambios de *Casas
  /// Bienestar*" y no un identificador.
  String? get duenoNombre => _prefs.getString(kDuenoNombre);

  /// Correo con el que se entró por última vez a la empresa dueña: es lo que
  /// la persona necesita para "volver a esa cuenta".
  String? get duenoCorreo => _prefs.getString(kDuenoCorreo);

  Future<void> fijarDueno(String empresaId,
      {String? nombre, String? correo}) async {
    await _prefs.setString(kDueno, empresaId);
    if (nombre != null && nombre.isNotEmpty) {
      await _prefs.setString(kDuenoNombre, nombre);
    }
    if (correo != null && correo.isNotEmpty) {
      await _prefs.setString(kDuenoCorreo, correo);
    }
  }

  /// La base quedó vacía: ya no es de nadie.
  Future<void> olvidarDueno() async {
    await _prefs.remove(kDueno);
    await _prefs.remove(kDuenoNombre);
    await _prefs.remove(kDuenoCorreo);
  }

  /// ¿Puede el sync subir los datos locales a [empresaServidor]?
  ///
  /// Solo si la base es de esa empresa. Un teléfono de antes de la 1.5.1 no
  /// tiene [dueno]; si su `empresa_id` de sesión coincide, los datos son de
  /// esa empresa (así funcionaba todo hasta ahora) y se fija el dueño en ese
  /// momento. En cualquier otro caso hay un cambio de cuenta sin resolver y el
  /// sync espera a que la persona decida en la pantalla de Nube: subir antes
  /// mandaría filas de una empresa a otra.
  Future<bool> permiteSincronizar(String empresaServidor) async {
    final d = dueno;
    if (d != null) return d == empresaServidor;
    if (_prefs.getString(kEmpresaSesion) == empresaServidor) {
      await fijarDueno(empresaServidor);
      return true;
    }
    return false;
  }
}

/// Qué significa entrar con una empresa en un teléfono con ciertos datos.
enum TipoEntrada {
  /// La base ya es de esta empresa (o la adopta por primera vez, sin rastro de
  /// otra): se sigue como siempre.
  mismaCuenta,

  /// La base tiene datos de OTRA empresa: hay que vaciarla antes de bajar los
  /// de la nueva, revisando primero lo que no ha subido.
  cambioDeCuenta,
}

/// Decide si entrar con [empresaNueva] es un cambio de cuenta.
///
/// - [dueno]: `datos_locales_empresa` (null si no se sabe).
/// - [empresaSesion]: `empresa_id` de prefs, solo para teléfonos sin dueño.
/// - [empresasEnBase]: empresas distintas que aparecen en las filas locales
///   (sin `''`). Es la red para el teléfono que no sabe de quién son sus datos
///   porque cerró sesión antes de la 1.5.1.
///
/// Las filas con empresa `''` (capturadas sin cuenta) NO cuentan como de otra
/// empresa: quien usó la app sin cuenta y entra por primera vez adopta sus
/// datos. Eso es intencional (offline-first).
TipoEntrada clasificarEntrada({
  required String empresaNueva,
  String? dueno,
  String? empresaSesion,
  Set<String> empresasEnBase = const {},
}) {
  final conocido = dueno ?? empresaSesion;
  if (conocido != null && conocido.isNotEmpty && conocido != empresaNueva) {
    return TipoEntrada.cambioDeCuenta;
  }
  final ajenas = empresasEnBase.where((e) => e.isNotEmpty && e != empresaNueva);
  return ajenas.isEmpty ? TipoEntrada.mismaCuenta : TipoEntrada.cambioDeCuenta;
}

/// Lo que la persona necesita saber para decidir en un cambio de cuenta con
/// cambios sin subir (decisión D1 del plan: avisar y dejar elegir).
class CambioDeCuenta {
  const CambioDeCuenta({
    required this.sinSubir,
    this.empresaAnteriorNombre,
    this.correoAnterior,
  });

  /// Filas que no han llegado a la nube (`pending`, `error`, `conflict`).
  final int sinSubir;
  final String? empresaAnteriorNombre;
  final String? correoAnterior;
}
