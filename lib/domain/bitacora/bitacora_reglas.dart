/// REGLAS PURAS de la bitácora de obra en el móvil.
///
/// La bitácora se captura en la obra, muchas veces sin señal, y las reglas de
/// verdad (cierre a las 24 h, quién escribe, máximo de fotos) las pone la BASE
/// (migraciones 0041 y 0042). Aquí solo se REFLEJAN para dos cosas: no ofrecer
/// en pantalla algo que el servidor va a rechazar, y traducir lo que rechaza a
/// lenguaje de obra. Si algo de aquí se separa del servidor, gana el servidor.
///
/// ESPEJO de `web/src/lib/bitacora/bitacora.ts` (etiquetas, cierre, limpieza de
/// nombres) y de `web/src/app/admin/obras/[id]/bitacora/actions.ts`
/// (validaciones). `test/domain/bitacora/bitacora_reglas_test.dart` lee la web y
/// la migración y falla si las etiquetas, los topes o el cierre dejan de
/// coincidir: el residente tiene que leer lo mismo en el celular que en la
/// oficina.
///
/// Módulo PURO (sin Flutter, sin Drift, sin Supabase): el reloj y el usuario
/// entran por parámetro, así se prueba cada borde sin montar nada.
library;

import 'dart:convert';

import '../import/mx_time.dart' show medianocheMx;

// ── Catálogos ───────────────────────────────────────────────────────────────

/// Tipos de entrada. La clave es la que acepta el `check` de la base y viaja en
/// `bitacora_entrada.tipo`; el valor es lo que lee la persona. Mismo orden que
/// la web (el primero es el que se propone al abrir el formulario).
const Map<String, String> tiposEntrada = {
  'AVANCE': 'Avance',
  'INCIDENCIA': 'Incidencia',
  'INSTRUCCION': 'Instrucción',
  'VISITA': 'Visita',
  'CLIMA': 'Clima',
  'OTRO': 'Otro',
};

/// Climas. La clave vacía es una opción VÁLIDA y es la de siempre: anotar el
/// clima es opcional y la base lo guarda como `''`, no como null.
const Map<String, String> climas = {
  '': 'Sin anotar',
  'SOLEADO': 'Soleado',
  'NUBLADO': 'Nublado',
  'LLUVIA': 'Lluvia',
  'TORMENTA': 'Tormenta',
  'CALOR': 'Mucho calor',
  'FRIO': 'Frío',
  'VIENTO': 'Viento',
};

// ── Topes ───────────────────────────────────────────────────────────────────

/// Fotos vivas por entrada. Igual que el trigger `bitacora_foto_reglas`: la 11
/// la rechaza la base, así que no se ofrece.
const maxFotosPorEntrada = 10;

/// Letras de una entrada o de una aclaración (`check` de 0041).
const maxLargoTexto = 5000;

/// Personas en obra: el conteo manual va de 0 a este número (`check` de 0041).
const maxPersonal = 10000;

/// Horas que una entrada sigue editable desde que LLEGA al servidor. Después
/// solo admite aclaraciones y publicarla al cliente.
const horasAbierta = 24;

// Topes de la lista de nombres del personal presente. Los de la web; la base
// solo exige los 500 (`array_length <= 500`).
const _maxLargoNombre = 120;
const _maxNombres = 500;

const _ventanaMs = horasAbierta * 60 * 60 * 1000;

// ── Cierre a las 24 h ───────────────────────────────────────────────────────

/// ¿La entrada todavía se puede editar?
///
/// `registradaEn` es el sello que pone el SERVIDOR al recibirla (epoch ms). Vale
/// 0 mientras la entrada solo existe en este teléfono: ahí no corre ninguna
/// ventana, porque todavía no hay hora del servidor contra la cual contar, y la
/// persona puede seguir corrigiéndola. Se cuenta desde que llega, no desde que
/// se escribió: una entrada capturada sin señal no debe cerrarse sola antes de
/// que pueda subir.
///
/// A las 24 h EXACTAS sigue abierta y se cierra un ms después: así compara la
/// base (`p_registrada >= ahora - 24 h`) y así lo hace la web. Quien manda es el
/// servidor; el reloj del teléfono solo sirve para decidir qué botones pintar.
/// Un reloj atrasado deja una entrada abierta de más en pantalla (el servidor la
/// rechazará y [clasificarRechazo] lo explica); nunca la cierra de más.
bool estaAbierta({required int registradaEn, required int ahoraMs}) {
  if (registradaEn == 0) return true;
  return ahoraMs <= registradaEn + _ventanaMs;
}

/// Leyenda del cierre para el encabezado de la entrada.
///
/// Se redondea HACIA ABAJO, igual que la web (quedan 5 h 59 min → "5 h"): es
/// mejor que la persona crea que le queda un poco menos de lo que le queda. Lo
/// que queda de un minuto se dice "1 min", nunca "0 min".
String textoCierre({required int registradaEn, required int ahoraMs}) {
  if (registradaEn == 0) return 'Aún no se sube';
  final resta = registradaEn + _ventanaMs - ahoraMs;
  if (resta < 0) return 'Cerrada · solo aclaraciones';
  final min = resta ~/ 60000;
  if (min < 60) return 'Se cierra en ${min < 1 ? 1 : min} min';
  return 'Se cierra en ${min ~/ 60} h';
}

// ── Fecha del día ───────────────────────────────────────────────────────────

/// Medianoche (00:00:00.000) del día CALENDARIO de [dia] en América/Ciudad de
/// México, en epoch ms. Es lo que se guarda en `bitacora_entrada.fecha`.
///
/// Solo se leen año, mes y día del [DateTime] tal como vienen: la hora y la zona
/// (local o UTC) del objeto no cuentan, así que las 23:59 de un día y las 00:00
/// dan lo mismo y el selector de fecha no depende de la zona del teléfono.
///
/// Usa la MISMA regla que `medianocheMx` de la web (`web/src/lib/data/tz.ts`):
/// la base de zonas horarias real, no un -6 fijo. Importa para fechas viejas:
/// México tuvo horario de verano hasta el 30-oct-2022 y la web anclaría esos
/// días a -5; un offset fijo los movería una hora y la misma entrada saldría con
/// otro `fecha` en el móvil y en la oficina. Es el helper que ya usa el import
/// del estado de cuenta (paquete `timezone`, que el proyecto ya trae).
int medianocheMexicoMs(DateTime dia) =>
    medianocheMx(dia.year, dia.month, dia.day);

// ── Permisos por rol ────────────────────────────────────────────────────────
//
// `rol` es lo que lee el móvil de `rolUsuarioProvider`: null cuando no hay
// cuenta en la nube (la app funciona local, de un solo dueño: acceso total, como
// el resto de los gates de rol del proyecto) o el texto de `usuarios_empresa`.
// Un rol que esta versión no conoce NO recibe permisos de escritura: aquí no
// hay peligro en negar de más, porque el dueño que sí los tiene es admin o
// supervisor y esos roles sí se conocen. Al revés que `puedeEditarOperacion`,
// que concede ante lo desconocido para no encerrar a un admin por un fallo.
//
// Esto es PRESENTACIÓN, no seguridad: lo que realmente se puede leer o escribir
// lo decide la RLS (0041 y 0042).

/// Roles que no ven la bitácora: su trabajo vive en la web (compras y material)
/// y la RLS no les abre estas tablas. Mostrarles la pantalla sería enseñarles
/// una lista vacía. Los desconocidos sí la ven; el servidor filtra.
const _rolesSinBitacora = {'compras', 'almacen'};

/// Roles que crean entradas. El contador solo lee. El colaborador captura (en
/// las obras que tiene asignadas; eso lo cuida la RLS).
const _rolesCapturan = {'admin', 'supervisor', 'residente', 'colaborador'};

/// Roles que agregan aclaraciones. El colaborador NO: su RLS no tiene INSERT
/// sobre `bitacora_aclaracion`.
const _rolesAclaran = {'admin', 'supervisor', 'residente'};

bool puedeVerBitacora(String? rol) => !_rolesSinBitacora.contains(rol);

bool puedeCapturar(String? rol) => rol == null || _rolesCapturan.contains(rol);

bool puedeAclarar(String? rol) => rol == null || _rolesAclaran.contains(rol);

/// ¿Esta entrada es mía? SOLO si el servidor ya dice quién la escribió y soy yo.
/// Un autor nulo o vacío NUNCA cuenta como «yo», ni aunque miUid también lo sea:
/// sin esa guarda, dos valores desconocidos (null == null) se darían permiso
/// mutuamente, y un `autor_id` nulo que llegara del servidor se volvería «mío».
bool _esAutorPropio(String? autorId, String? miUid) {
  // Con el autor presente, la igualdad de abajo ya exige que miUid también lo
  // esté y no sea vacío.
  if (autorId == null || miUid == null || autorId.isEmpty) return false;
  // Los uuid de Postgres y de Auth llegan en minúscula, pero comparar sin
  // distinguir mayúsculas no cuesta nada y evita un falso «no es tuya».
  return autorId.toLowerCase() == miUid.toLowerCase();
}

/// ¿Puede editar (o borrar) esta entrada? Refleja las policies de UPDATE:
///   · admin → cualquiera; sin cuenta en la nube → cualquiera.
///   · supervisor y residente → las suyas (`autor_id = auth.uid()`), o las que
///     todavía no llegan al servidor ([confirmadaEnServidor] falso): esas
///     nacieron en este teléfono, por fuerza son de quien la tiene en la mano.
///     Lo contrario NO vale: una fila ya confirmada se reconoce como mía solo
///     por el autor que selló el servidor, nunca por tenerlo vacío.
///   · colaborador → su RLS no tiene UPDATE: solo puede corregir lo que todavía
///     no llegó al servidor, porque eso es un INSERT pendiente.
/// Y solo mientras esté [abierta]: pasadas las 24 h el trigger lo rechaza hasta
/// para el admin.
bool puedeEditarEntrada({
  required String? rol,
  required String? autorId,
  required String? miUid,
  required bool abierta,
  required bool confirmadaEnServidor,
}) {
  if (!abierta) return false;
  switch (rol) {
    case null:
    case 'admin':
      return true;
    case 'supervisor':
    case 'residente':
      return !confirmadaEnServidor || _esAutorPropio(autorId, miUid);
    case 'colaborador':
      return !confirmadaEnServidor;
    default:
      return false;
  }
}

/// ¿Puede publicar la entrada al cliente (o retirarla del portal)?
///
/// Es el ÚNICO cambio que el servidor permite con la entrada cerrada, por eso
/// aquí no se pide que esté abierta. Sí se pide que el servidor ya la tenga:
/// `visible_cliente` se decide al capturarla, y solo después se cambia como un
/// UPDATE sobre una fila que existe. Admin (o sin cuenta) cualquiera;
/// supervisor y residente solo las suyas (autor sellado por el servidor y
/// coincidente con [miUid]). El colaborador NUNCA, ni la suya: su RLS no tiene
/// UPDATE y la web tampoco se lo ofrece.
bool puedePublicarAlCliente({
  required String? rol,
  required String? autorId,
  required String? miUid,
  required bool confirmadaEnServidor,
}) {
  if (!confirmadaEnServidor) return false;
  switch (rol) {
    case null:
    case 'admin':
      return true;
    case 'supervisor':
    case 'residente':
      return _esAutorPropio(autorId, miUid);
    default:
      return false;
  }
}

/// ¿Puede agregarle fotos? Mismas reglas que editarla (así lo hace la web) y
/// además que quede lugar: con [maxFotosPorEntrada] fotos vivas la base rechaza
/// la siguiente.
bool puedeAgregarFotos({
  required String? rol,
  required String? autorId,
  required String? miUid,
  required bool abierta,
  required bool confirmadaEnServidor,
  required int fotosVivas,
}) {
  if (fotosVivas >= maxFotosPorEntrada) return false;
  return puedeEditarEntrada(
    rol: rol,
    autorId: autorId,
    miUid: miUid,
    abierta: abierta,
    confirmadaEnServidor: confirmadaEnServidor,
  );
}

// ── Personal presente ───────────────────────────────────────────────────────

/// Limpia la lista de nombres capturada: sin espacios en las orillas, sin
/// vacíos, sin repetidos y con tope. IDÉNTICA a `limpiarNombres` de la web.
///
///   · Repetido = mismo nombre sin distinguir MAYÚSCULAS (`Beto` = `BETO`). El
///     acento SÍ distingue (`José` ≠ `Jose`), igual que en la web: no hay forma
///     de saber si son dos personas, y borrar a una de la evidencia es peor que
///     dejarla repetida. Se conserva la primera escritura.
///   · Cada nombre se corta a 120 caracteres y la lista a 500. El tope de 500
///     cuenta nombres que SÍ entran, y en cuanto se alcanza se deja de leer:
///     el [Iterable] de entrada no se recorre completo.
///
/// Un corte que cae en medio de un emoji (dos unidades UTF-16) descarta el
/// emoji entero en lugar de dejar media letra, que no se puede codificar y
/// dañaría el JSON local y el envío al servidor.
List<String> limpiarNombres(Iterable<String> nombres) {
  final salida = <String>[];
  final vistos = <String>{};
  for (final crudo in nombres) {
    var t = crudo.trim();
    if (t.length > _maxLargoNombre) {
      t = t.substring(0, _maxLargoNombre);
      final ultima = t.codeUnitAt(t.length - 1);
      if (ultima >= 0xD800 && ultima <= 0xDBFF) {
        t = t.substring(0, t.length - 1);
      }
    }
    // toLowerCase de Dart no depende del idioma del teléfono; es el mismo
    // resultado que `toLocaleLowerCase('es')` de la web.
    if (t.isNotEmpty && vistos.add(t.toLowerCase())) salida.add(t);
    if (salida.length >= _maxNombres) break;
  }
  return salida;
}

/// `personal_nombres` es `text[]` en el servidor y JSON en la base local (Drift
/// no tiene columnas de arreglo). Este es el lado local→JSON; el sync hace la
/// conversión a arreglo.
String nombresAJson(List<String> nombres) => jsonEncode(nombres);

/// JSON local → lista de nombres. TOLERANTE a propósito: se lee en pantalla
/// cada vez que se pinta la entrada, y una fila con un valor raro (vacío, una
/// versión vieja, un JSON truncado por un corte de luz) no debe tirar la línea
/// de tiempo. Lo ilegible se ve como «sin nombres»; los elementos que no son
/// texto se descartan y el resto se conserva.
List<String> nombresDesdeJson(String? json) {
  if (json == null || json.trim().isEmpty) return <String>[];
  try {
    final dato = jsonDecode(json);
    if (dato is! List) return <String>[];
    return dato.whereType<String>().toList();
  } on FormatException {
    return <String>[];
  }
}

// ── Validación de lo capturado ──────────────────────────────────────────────
//
// Mismos mensajes y mismos límites que `validarEntrada` de la web. Devuelven
// null si todo está bien o el texto que se le enseña a la persona. Se mide la
// longitud en unidades UTF-16 (`String.length`), igual que la web: la base
// cuenta caracteres, que nunca son más que eso, así que lo que aquí pasa la
// base lo acepta.

/// Texto de la entrada: obligatorio (tras recortar) y hasta [maxLargoTexto].
String? validarTexto(String texto) {
  final t = texto.trim();
  if (t.isEmpty) return 'Escribe qué pasó.';
  if (t.length > maxLargoTexto) {
    return 'El texto pasa de $maxLargoTexto letras.';
  }
  return null;
}

/// Texto de una aclaración: mismo tope, con su propio mensaje (la pantalla de
/// aclarar no debe decir «qué pasó»).
String? validarAclaracion(String texto) {
  final t = texto.trim();
  if (t.isEmpty) return 'Escribe la aclaración.';
  if (t.length > maxLargoTexto) {
    return 'La aclaración pasa de $maxLargoTexto letras.';
  }
  return null;
}

/// Conteo manual de personas: null = no se anotó (válido); si se anota, de 0 a
/// [maxPersonal].
String? validarPersonal(int? n) {
  if (n == null) return null;
  if (n < 0 || n > maxPersonal) return 'El número de personas no es válido.';
  return null;
}

// ── Rechazos del servidor ───────────────────────────────────────────────────

/// Rechazos que NO se arreglan reintentando. Reintentarlos cada pocos segundos
/// solo dejaría el indicador de sync en rojo para siempre; hay que dejar de
/// insistir y decirle a la persona qué pasó.
enum RechazoBitacora {
  /// La entrada pasó de las 24 h (`BITACORA_CERRADA`).
  cerrada,

  /// La entrada ya tiene sus 10 fotos (`BITACORA_MAX_FOTOS`).
  maxFotos,

  /// La RLS no deja a este usuario hacer eso (42501).
  sinPermiso,

  /// Se intentó borrar evidencia (`EVIDENCIA_INMUTABLE`).
  evidencia,
}

/// Distingue un rechazo definitivo de un fallo pasajero.
///
/// Se reconoce por las etiquetas que lanzan los triggers de 0041 (con errcode
/// P0001, que no dice nada por sí solo) y por la violación de RLS: código 42501
/// de Postgres, o el texto «row-level security» (así llegan los de Storage, que
/// traen otro código). Las etiquetas mandan sobre el código.
///
/// TODO lo demás devuelve null = transitorio (sin red, timeout, servidor
/// caído, sesión vencida...) y se reintenta. Por eso NO se toma «permission
/// denied» suelto como falta de permiso: también es lo que dice el sistema
/// operativo cuando un socket falla, y marcar como definitivo un corte de red
/// descartaría el trabajo de la persona.
RechazoBitacora? clasificarRechazo({String? code, required String message}) {
  if (message.contains('BITACORA_CERRADA')) return RechazoBitacora.cerrada;
  if (message.contains('BITACORA_MAX_FOTOS')) return RechazoBitacora.maxFotos;
  if (message.contains('EVIDENCIA_INMUTABLE')) return RechazoBitacora.evidencia;
  if (code == '42501' || message.toLowerCase().contains('row-level security')) {
    return RechazoBitacora.sinPermiso;
  }
  return null;
}

/// Lo que se le dice a quien está en la obra. Corto y con la salida a la vista.
String explicarRechazo(RechazoBitacora r) => switch (r) {
  RechazoBitacora.cerrada =>
    'La entrada ya cerró (pasaron $horasAbierta h desde que llegó). '
        'Agrégalo como aclaración.',
  RechazoBitacora.maxFotos =>
    'Una entrada lleva máximo $maxFotosPorEntrada fotos.',
  RechazoBitacora.sinPermiso =>
    'No tienes permiso para hacer esto en la bitácora.',
  RechazoBitacora.evidencia =>
    'Esto ya es evidencia y no se borra. Si algo quedó mal, agrega una '
        'aclaración.',
};
