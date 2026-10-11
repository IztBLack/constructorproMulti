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
///
/// El dueño es empresa **y usuario**: dentro de una misma empresa, lo que el
/// servidor deja ver depende del rol (un admin baja sueldos que `compras` no
/// puede ver; un residente solo ve sus obras). Si después del admin entra otro
/// usuario, la base que bajó el admin no es suya aunque la empresa coincida.
class CuentaLocal {
  CuentaLocal(this._prefs);

  final SharedPreferences _prefs;

  static const kDueno = 'datos_locales_empresa';
  static const kDuenoNombre = 'datos_locales_empresa_nombre';
  static const kDuenoCorreo = 'datos_locales_correo';
  static const kDuenoUsuario = 'datos_locales_usuario';

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

  /// Id (auth) del usuario que bajó los datos. Null en teléfonos de antes de
  /// que se guardara: el primer usuario que sincronice lo adopta.
  String? get duenoUsuario => _prefs.getString(kDuenoUsuario);

  Future<void> fijarDueno(String empresaId,
      {String? usuario, String? nombre, String? correo}) async {
    await _prefs.setString(kDueno, empresaId);
    if (usuario != null && usuario.isNotEmpty) {
      await _prefs.setString(kDuenoUsuario, usuario);
    }
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
    await _prefs.remove(kDuenoUsuario);
  }

  /// ¿Puede el sync subir los datos locales a [empresaServidor] con la sesión
  /// de [usuario]?
  ///
  /// Solo si la base es de esa empresa y de ese usuario (un dueño sin usuario
  /// guardado lo adopta). Un teléfono de antes de la 1.5.1 no
  /// tiene [dueno]; si su `empresa_id` de sesión coincide, los datos son de
  /// esa empresa (así funcionaba todo hasta ahora) y se fija el dueño en ese
  /// momento. En cualquier otro caso hay un cambio de cuenta sin resolver y el
  /// sync espera a que la persona decida en la pantalla de Nube: subir antes
  /// mandaría filas de una empresa a otra.
  Future<bool> permiteSincronizar(String empresaServidor, String? usuario) async {
    final d = dueno;
    if (d != null) {
      if (d != empresaServidor) return false;
      final u = duenoUsuario;
      if (u == null) {
        await fijarDueno(d, usuario: usuario);
        return true;
      }
      return usuario == null || u == usuario;
    }
    if (_prefs.getString(kEmpresaSesion) == empresaServidor) {
      await fijarDueno(empresaServidor, usuario: usuario);
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
/// - [duenoUsuario] / [usuarioNuevo]: quién bajó los datos y quién entra. Si
///   la empresa coincide pero el usuario no, también es cambio de cuenta.
/// - [empresaSesion]: `empresa_id` de prefs, solo para teléfonos sin dueño.
/// - [empresasEnBase]: empresas distintas que aparecen en las filas locales
///   (sin `''`). Solo se usa cuando NO se sabe de quién es la base (ni dueño ni
///   empresa de sesión): el teléfono que cerró sesión antes de la 1.5.1.
///   Con dueño conocido no se mira: un teléfono ya mezclado conserva filas
///   ajenas apartadas (`ajena`) para siempre, y tomarlas por un cambio de
///   cuenta haría preguntar —o vaciar— cada vez que se abre la pantalla de
///   nube. Esas filas las resuelve "Rehacer la copia" (decisión D2).
///
/// Las filas con empresa `''` (capturadas sin cuenta) NO cuentan como de otra
/// empresa: quien usó la app sin cuenta y entra por primera vez adopta sus
/// datos. Eso es intencional (offline-first).
TipoEntrada clasificarEntrada({
  required String empresaNueva,
  String? dueno,
  String? empresaSesion,
  String? duenoUsuario,
  String? usuarioNuevo,
  Set<String> empresasEnBase = const {},
}) {
  final conocido = dueno ?? empresaSesion;
  if (conocido != null && conocido.isNotEmpty && conocido != empresaNueva) {
    return TipoEntrada.cambioDeCuenta;
  }
  if (duenoUsuario != null &&
      usuarioNuevo != null &&
      duenoUsuario != usuarioNuevo) {
    return TipoEntrada.cambioDeCuenta;
  }
  if (conocido != null && conocido.isNotEmpty) return TipoEntrada.mismaCuenta;
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
