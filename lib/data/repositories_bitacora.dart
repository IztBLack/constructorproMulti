/// BITÁCORA DE OBRA en el móvil: lo que pasó cada día, con fotos y aclaraciones.
/// Espeja el acceso de la web (`web/src/app/admin/obras/[id]/bitacora/actions.ts`
/// y `web/src/lib/bitacora/bitacora.ts`).
///
/// Es EVIDENCIA, y eso decide varias cosas de aquí:
///   · Se escribe SIEMPRE en la base local y el trigger `mark_pending` marca la
///     fila solo; el sync la sube cuando hay señal. Nada de esto toca la red.
///   · La edición usa `update().write(Companion)` con SOLO las columnas
///     editables. Un upsert de la fila completa pisaría lo que sella el
///     servidor (`autor_*`, `registrada_en`) y la publicación al cliente, que la
///     oficina puede haber retirado mientras tanto.
///   · El borrado es LÓGICO (`deletedAt`): una fila que desaparece de la base
///     local no tiene cómo viajar en el push.
///   · Las aclaraciones no se editan ni se borran nunca (tampoco en el
///     servidor), así que aquí no existe esa operación.
///
/// Las reglas de verdad (cierre a las 24 h, permisos) las pone el servidor; las
/// funciones de `bitacora_reglas.dart` solo evitan mandarle lo que va a
/// rechazar. Este repositorio valida la FORMA de lo capturado; quién puede
/// editar qué lo decide la pantalla con esas mismas reglas.
library;

import 'dart:io';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../core/storage/fotos_bitacora_storage.dart';
import '../domain/bitacora/bitacora_reglas.dart';

/// Una entrada con sus fotos y aclaraciones ya cargadas: es como la consume la
/// línea de tiempo.
class EntradaConDetalle {
  const EntradaConDetalle(this.entrada, this.fotos, this.aclaraciones);

  final BitacoraEntradaRow entrada;

  /// Solo las vivas, por `orden`.
  final List<BitacoraFotoRow> fotos;

  /// Solo las vivas, en el orden en que llegaron (las que aún no suben, al
  /// final).
  final List<BitacoraAclaracionRow> aclaraciones;

  /// El personal presente. Tolerante: un JSON roto se ve como "sin nombres" y no
  /// tira la línea de tiempo.
  List<String> get nombres => nombresDesdeJson(entrada.personalNombres);

  /// ¿El servidor ya la tiene? Es lo que separa "mía, todavía en el teléfono" de
  /// "ya es evidencia en la oficina" para decidir qué se puede corregir.
  bool get confirmadaEnServidor => entrada.serverUpdatedAt != null;
}

class BitacoraRepository {
  BitacoraRepository(this.db, this.fotos);

  final AppDatabase db;

  /// Dónde viven los archivos de las fotos en el teléfono.
  final FotosBitacoraStorage fotos;
  static const _uuid = Uuid();

  int get _ahora => DateTime.now().millisecondsSinceEpoch;

  // ── Lectura ───────────────────────────────────────────────────────────

  /// La línea de tiempo de una obra, en vivo: días de más reciente a más
  /// antiguo y, dentro del día, en el orden en que llegaron.
  ///
  /// Reacciona a las TRES tablas. Las notas de obra leen los hijos con
  /// `.first` dentro del `asyncMap` del padre, y por eso un cambio solo en un
  /// hijo no re-emite; aquí una foto o una aclaración se agregan sin tocar la
  /// entrada y la pantalla tiene que enterarse. Para eso se vigila un
  /// `SELECT 1` que declara leer las tres tablas y, a cada aviso, se vuelve a
  /// armar la lista completa.
  Stream<List<EntradaConDetalle>> watchDeObra(String obraId) {
    return db
        .customSelect('SELECT 1', readsFrom: {
          db.bitacoraEntrada,
          db.bitacoraFoto,
          db.bitacoraAclaracion,
        })
        .watch()
        .asyncMap((_) => _cargar(obraId));
  }

  Future<List<EntradaConDetalle>> _cargar(String obraId) async {
    final entradas = await (db.select(db.bitacoraEntrada)
          ..where((t) => t.obraId.equals(obraId) & t.deletedAt.isNull()))
        .get();
    if (entradas.isEmpty) return const [];

    // Los hijos se piden con una subconsulta de las entradas de la obra, y no
    // con `id IN (…cientos de ids…)`: así no hay tope de variables de SQLite
    // y es una sola consulta por tabla sin importar cuántos días lleve la obra.
    final idsDeLaObra = db.selectOnly(db.bitacoraEntrada)
      ..addColumns([db.bitacoraEntrada.id])
      ..where(db.bitacoraEntrada.obraId.equals(obraId) &
          db.bitacoraEntrada.deletedAt.isNull());

    final fotosVivas = await (db.select(db.bitacoraFoto)
          ..where((t) =>
              t.deletedAt.isNull() & t.entradaId.isInQuery(idsDeLaObra)))
        .get();
    final aclaracionesVivas = await (db.select(db.bitacoraAclaracion)
          ..where((t) =>
              t.deletedAt.isNull() & t.entradaId.isInQuery(idsDeLaObra)))
        .get();

    final fotosPorEntrada = <String, List<BitacoraFotoRow>>{};
    for (final f in fotosVivas) {
      (fotosPorEntrada[f.entradaId] ??= []).add(f);
    }
    final aclaracionesPorEntrada = <String, List<BitacoraAclaracionRow>>{};
    for (final a in aclaracionesVivas) {
      (aclaracionesPorEntrada[a.entradaId] ??= []).add(a);
    }

    entradas.sort(_compararEntradas);
    return [
      for (final e in entradas)
        EntradaConDetalle(
          e,
          (fotosPorEntrada[e.id] ?? const <BitacoraFotoRow>[])
              .toList()
            ..sort(_compararFotos),
          (aclaracionesPorEntrada[e.id] ?? const <BitacoraAclaracionRow>[])
              .toList()
            ..sort(_compararAclaraciones),
        ),
    ];
  }

  /// Día más reciente primero; dentro del día, la que llegó antes primero.
  static int _compararEntradas(BitacoraEntradaRow a, BitacoraEntradaRow b) {
    final porDia = b.fecha.compareTo(a.fecha);
    if (porDia != 0) return porDia;
    return _porLlegada(a.registradaEn, a.createdAt, a.id, b.registradaEn,
        b.createdAt, b.id);
  }

  static int _compararAclaraciones(
          BitacoraAclaracionRow a, BitacoraAclaracionRow b) =>
      _porLlegada(
          a.registradaEn, a.createdAt, a.id, b.registradaEn, b.createdAt, b.id);

  /// El orden en que algo "llegó": por la hora que le puso el servidor, con las
  /// que todavía no han subido (`registradaEn` = 0) AL FINAL —son las más
  /// recientes: existen solo en este teléfono— y, entre iguales, por cuándo se
  /// escribieron. El id solo asegura un orden estable.
  static int _porLlegada(int regA, int creadaA, String idA, int regB,
      int creadaB, String idB) {
    final sinSubirA = regA == 0;
    final sinSubirB = regB == 0;
    if (sinSubirA != sinSubirB) return sinSubirA ? 1 : -1;
    if (!sinSubirA) {
      final porRegistro = regA.compareTo(regB);
      if (porRegistro != 0) return porRegistro;
    }
    final porCreacion = creadaA.compareTo(creadaB);
    if (porCreacion != 0) return porCreacion;
    return idA.compareTo(idB);
  }

  static int _compararFotos(BitacoraFotoRow a, BitacoraFotoRow b) {
    final porOrden = a.orden.compareTo(b.orden);
    if (porOrden != 0) return porOrden;
    final porCreacion = a.createdAt.compareTo(b.createdAt);
    if (porCreacion != 0) return porCreacion;
    return a.id.compareTo(b.id);
  }

  // ── Escritura: la entrada ─────────────────────────────────────────────

  /// Crea una entrada. Nace SIN publicar al cliente, igual que en la web.
  ///
  /// Lanza [ArgumentError] con el mensaje que se le enseña a la persona si lo
  /// capturado no pasa las mismas reglas que la web (y la base): así el servidor
  /// nunca recibe una fila que va a rechazar para siempre.
  ///
  /// `personal_presente`: con nombres es cuántos son (y [personalPresente] se
  /// ignora); sin nombres, el conteo anotado a mano, o null si no se anotó.
  Future<String> crearEntrada({
    required String obraId,
    required String empresaId,
    required int fecha,
    required String tipo,
    required String texto,
    String clima = '',
    List<String> nombres = const [],
    int? personalPresente,
  }) async {
    _validarEntrada(
        tipo: tipo, clima: clima, texto: texto, personalPresente: personalPresente);
    final limpios = limpiarNombres(nombres);

    final id = _uuid.v4();
    final ahora = _ahora;
    await db.into(db.bitacoraEntrada).insert(BitacoraEntradaCompanion.insert(
          id: id,
          obraId: obraId,
          fecha: fecha,
          tipo: Value(tipo),
          texto: Value(texto.trim()),
          clima: Value(clima),
          personalPresente: Value(_personalFinal(limpios, personalPresente)),
          personalNombres: Value(nombresAJson(limpios)),
          empresaId: Value(empresaId),
          createdAt: Value(ahora),
          updatedAt: Value(ahora),
        ));
    return id;
  }

  /// Edita lo que se puede editar de una entrada.
  ///
  /// NUNCA toca `visible_cliente` (publicar es una operación aparte, en línea),
  /// ni `autor_*`, ni `registrada_en`: son del servidor, y reescribirlos aquí con
  /// un valor local los desharía en el siguiente push. Por eso se escribe SOLO
  /// lo editable con `write` y no con un upsert de la fila.
  ///
  /// Lanza [StateError] si la entrada no existe o ya se borró: callar dejaría a
  /// la persona creyendo que su corrección quedó guardada.
  Future<void> editarEntrada(
    String id, {
    required int fecha,
    required String tipo,
    required String texto,
    required String clima,
    required List<String> nombres,
    int? personalPresente,
  }) async {
    _validarEntrada(
        tipo: tipo, clima: clima, texto: texto, personalPresente: personalPresente);
    final limpios = limpiarNombres(nombres);

    final tocadas = await (db.update(db.bitacoraEntrada)
          ..where((t) => t.id.equals(id) & t.deletedAt.isNull()))
        .write(BitacoraEntradaCompanion(
      fecha: Value(fecha),
      tipo: Value(tipo),
      texto: Value(texto.trim()),
      clima: Value(clima),
      // `Value<int?>` explícito: con null debe ESCRIBIR null (borrar el conteo
      // anotado), no dejar la columna como estaba.
      personalPresente: Value<int?>(_personalFinal(limpios, personalPresente)),
      personalNombres: Value(nombresAJson(limpios)),
      updatedAt: Value(_ahora),
    ));
    if (tocadas == 0) {
      throw StateError('La entrada de bitácora $id no existe o ya se borró.');
    }
  }

  /// Borrado lógico de la entrada y, con ella, de sus fotos y aclaraciones que
  /// el servidor NUNCA confirmó.
  ///
  /// Lo ya confirmado (`serverUpdatedAt` no nulo) no se toca: es evidencia que
  /// existe allá, y si la entrada puede o no borrarse (abierta) lo decide el
  /// servidor al subir el borrado; el sync resolverá después qué pasa con esos
  /// hijos. Lo que nunca salió del teléfono no tiene a quién avisarle y se va
  /// con la entrada. Todo en una transacción: la línea de tiempo no debe ver un
  /// estado a medias.
  ///
  /// Un hijo que ya estaba borrado conserva su sello y su estado de sync.
  Future<void> borrarEntrada(String id) async {
    final sello = _ahora;
    await db.transaction(() async {
      await (db.update(db.bitacoraEntrada)
            ..where((t) => t.id.equals(id) & t.deletedAt.isNull()))
          .write(BitacoraEntradaCompanion(
              deletedAt: Value(sello), updatedAt: Value(sello)));
      await (db.update(db.bitacoraFoto)
            ..where((t) =>
                t.entradaId.equals(id) &
                t.deletedAt.isNull() &
                t.serverUpdatedAt.isNull()))
          .write(BitacoraFotoCompanion(
              deletedAt: Value(sello), updatedAt: Value(sello)));
      await (db.update(db.bitacoraAclaracion)
            ..where((t) =>
                t.entradaId.equals(id) &
                t.deletedAt.isNull() &
                t.serverUpdatedAt.isNull()))
          .write(BitacoraAclaracionCompanion(
              deletedAt: Value(sello), updatedAt: Value(sello)));
    });
  }

  // ── Escritura: aclaraciones ───────────────────────────────────────────

  /// Agrega una aclaración. Solo se agregan: no hay editar ni borrar, ni aquí ni
  /// en el servidor.
  Future<String> agregarAclaracion({
    required String entradaId,
    required String empresaId,
    required String texto,
  }) async {
    final mensaje = validarAclaracion(texto);
    if (mensaje != null) throw ArgumentError(mensaje);

    final id = _uuid.v4();
    final ahora = _ahora;
    await db
        .into(db.bitacoraAclaracion)
        .insert(BitacoraAclaracionCompanion.insert(
          id: id,
          entradaId: entradaId,
          texto: texto.trim(),
          empresaId: Value(empresaId),
          createdAt: Value(ahora),
          updatedAt: Value(ahora),
        ));
    return id;
  }

  // ── Escritura: fotos ──────────────────────────────────────────────────

  /// Guarda una foto en el teléfono y registra su fila. [origen] es el archivo
  /// que dejó `image_picker` (en la caché, que Android puede vaciar): se COPIA de
  /// inmediato a la carpeta de la app.
  ///
  /// `path` es la ruta que tendrá en el bucket (`empresa/obra/entrada/foto.ext`);
  /// el archivo se sube después, cuando el sync pueda. `orden` es el máximo de
  /// las vivas + 1, no su cantidad: si se quitó una del medio, contar vivas
  /// empataría con la última.
  ///
  /// Lanza [StateError] si la entrada ya tiene [maxFotosPorEntrada] fotos vivas
  /// (la 11 la rechazaría la base) o si no existe, y [ArgumentError] si [obraId]
  /// no es la de la entrada. En cualquier fallo la copia del teléfono se borra:
  /// una foto sin fila nunca se subiría ni se borraría.
  Future<String> agregarFoto({
    required String entradaId,
    required String obraId,
    required String empresaId,
    required String origen,
  }) async {
    final fotoId = _uuid.v4();
    final mime = FotosBitacoraStorage.mimeDeArchivo(origen);
    final ext = FotosBitacoraStorage.extensionDe(mime);

    final copia =
        await fotos.guardarCopia(origen: origen, fotoId: fotoId, mime: mime);
    try {
      final bytes = await copia.length();
      // La verificación y el insert van juntos en una transacción: dos altas a
      // la vez (doble toque) no pueden pasar ambas por el último lugar.
      await db.transaction(() async {
        final entrada = await (db.select(db.bitacoraEntrada)
              ..where((t) => t.id.equals(entradaId) & t.deletedAt.isNull()))
            .getSingleOrNull();
        if (entrada == null) {
          throw StateError(
              'La entrada de bitácora $entradaId no existe o ya se borró.');
        }
        if (entrada.obraId != obraId) {
          throw ArgumentError.value(obraId, 'obraId',
              'No es la obra de la entrada (${entrada.obraId})');
        }

        final vivas = await (db.select(db.bitacoraFoto)
              ..where((t) =>
                  t.entradaId.equals(entradaId) & t.deletedAt.isNull()))
            .get();
        if (vivas.length >= maxFotosPorEntrada) {
          throw StateError(
              'Una entrada lleva máximo $maxFotosPorEntrada fotos.');
        }
        final orden = vivas.isEmpty
            ? 0
            : vivas.map((f) => f.orden).reduce((a, b) => a > b ? a : b) + 1;

        final ahora = _ahora;
        await db.into(db.bitacoraFoto).insert(BitacoraFotoCompanion.insert(
              id: fotoId,
              entradaId: entradaId,
              path: '$empresaId/$obraId/$entradaId/$fotoId.$ext',
              mime: Value(mime),
              bytes: Value(bytes),
              orden: Value(orden),
              empresaId: Value(empresaId),
              createdAt: Value(ahora),
              updatedAt: Value(ahora),
            ));
      });
    } catch (_) {
      await _borrarCopiaSilencioso(fotoId, mime);
      rethrow;
    }
    return fotoId;
  }

  /// Quita una foto de la entrada (borrado lógico). NO borra el archivo del
  /// teléfono: si ya subió, el servidor y el sync deciden qué pasa con él, y
  /// borrarlo aquí antes podría perder la única copia.
  Future<void> quitarFoto(String fotoId) async {
    final sello = _ahora;
    await (db.update(db.bitacoraFoto)
          ..where((t) => t.id.equals(fotoId) & t.deletedAt.isNull()))
        .write(BitacoraFotoCompanion(
            deletedAt: Value(sello), updatedAt: Value(sello)));
  }

  // ── Personal sugerido ─────────────────────────────────────────────────

  /// Los nombres de quienes pasaron lista en esa obra ese día, para proponerlos
  /// como personal presente: ordenados alfabéticamente y sin repetir.
  ///
  /// Cuenta a quien tiene alguna fracción de jornada (media jornada también es
  /// estar en obra); la fracción 0 es una falta. [diaLocalMs] es la medianoche
  /// LOCAL del teléfono, que es como el pase de lista guarda `asistencias.fecha`
  /// (`Semana.inicioDia`): NO es la medianoche de la Ciudad de México con la que
  /// se guarda la fecha de la entrada, y en un teléfono en otra zona no
  /// coinciden. Quien llama pasa el valor ya calculado.
  Future<List<String>> personalSugerido({
    required String obraId,
    required int diaLocalMs,
  }) async {
    final filas = await (db.select(db.asistencias).join([
      innerJoin(db.colaboradores,
          db.colaboradores.id.equalsExp(db.asistencias.colaboradorId)),
    ])
          ..where(db.asistencias.obraId.equals(obraId) &
              db.asistencias.fecha.equals(diaLocalMs) &
              db.asistencias.fraccion.isBiggerThanValue(0) &
              db.asistencias.deletedAt.isNull() &
              db.colaboradores.deletedAt.isNull()))
        .get();

    // `limpiarNombres` recorta, quita vacíos y repetidos (sin distinguir
    // mayúsculas): es exactamente la limpieza que va a recibir la entrada, así
    // que lo sugerido y lo guardado no pueden diferir.
    final limpios =
        limpiarNombres(filas.map((f) => f.readTable(db.colaboradores).nombre));
    limpios.sort(_compararNombres);
    return limpios;
  }

  // ── Internos ──────────────────────────────────────────────────────────

  /// Mismas validaciones y mensajes que `validarEntrada` de la web, y por la
  /// misma razón: lo que la base rechaza (tipo o clima fuera del catálogo, texto
  /// vacío) dejaría la fila en error para siempre.
  static void _validarEntrada({
    required String tipo,
    required String clima,
    required String texto,
    required int? personalPresente,
  }) {
    if (!tiposEntrada.containsKey(tipo)) {
      throw ArgumentError('Elige el tipo de entrada.');
    }
    if (!climas.containsKey(clima)) throw ArgumentError('Clima inválido.');
    final errorTexto = validarTexto(texto);
    if (errorTexto != null) throw ArgumentError(errorTexto);
    final errorPersonal = validarPersonal(personalPresente);
    if (errorPersonal != null) throw ArgumentError(errorPersonal);
  }

  /// Con nombres, el conteo sale de la lista; sin ellos, el que se anotó.
  static int? _personalFinal(List<String> nombres, int? anotado) =>
      nombres.isNotEmpty ? nombres.length : anotado;

  Future<void> _borrarCopiaSilencioso(String fotoId, String mime) async {
    try {
      await fotos.borrar(fotoId, mime);
    } on FileSystemException {
      // Es limpieza tras un fallo: no se tapa el error original con otro.
    }
  }

  /// Orden alfabético para personas: sin distinguir mayúsculas ni acentos
  /// (`Ángel` junto a `Ana`, no después de la `Z`), con el texto original como
  /// desempate para que el resultado sea estable.
  static int _compararNombres(String a, String b) {
    final porClave = _claveAlfabetica(a).compareTo(_claveAlfabetica(b));
    return porClave != 0 ? porClave : a.compareTo(b);
  }

  static const _acentos = {
    'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a',
    'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
    'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i',
    'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o',
    'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u',
    // La ñ se alfabetiza junto a la n: es más estable que mandarla tras la z.
    'ñ': 'n',
  };

  static String _claveAlfabetica(String s) {
    final b = StringBuffer();
    for (final c in s.toLowerCase().split('')) {
      b.write(_acentos[c] ?? c);
    }
    return b.toString();
  }
}
