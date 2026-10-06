import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../domain/bitacora/bitacora_reglas.dart';

/// Un rechazo de la bitácora que ya no se va a reintentar, guardado para que
/// la persona vea qué pasó y decida (docs/PLAN_BITACORA_MOVIL.md §2.3).
class AvisoBitacora {
  AvisoBitacora({
    required this.id,
    required this.filaId,
    required this.tabla,
    required this.obraId,
    required this.entradaId,
    required this.rechazo,
    required this.creadoEn,
    this.texto,
    this.fechaEntrada,
  });

  /// Id del aviso (no de la fila).
  final String id;

  /// La fila rechazada: entrada, foto o aclaración.
  final String filaId;
  final String tabla;
  final String obraId;
  final String entradaId;
  final RechazoBitacora rechazo;

  /// El texto que se quiso subir (edición o alta de entrada, o aclaración):
  /// es lo que se ofrece "Agregar como aclaración" para no perderlo.
  final String? texto;

  /// Día de la entrada (epoch ms), para decir de cuál se habla.
  final int? fechaEntrada;
  final int creadoEn;

  /// Una edición rechazada: la fila ya volvió a la versión del servidor y lo
  /// único que queda del cambio es [texto].
  bool get esEdicion => tabla == 'bitacora_entrada' && texto != null;

  Map<String, dynamic> toJson() => {
        'id': id,
        'filaId': filaId,
        'tabla': tabla,
        'obraId': obraId,
        'entradaId': entradaId,
        'rechazo': rechazo.name,
        'texto': texto,
        'fechaEntrada': fechaEntrada,
        'creadoEn': creadoEn,
      };

  static AvisoBitacora? fromJson(Object? j) {
    if (j is! Map) return null;
    final rechazo = RechazoBitacora.values
        .where((r) => r.name == j['rechazo'])
        .firstOrNull;
    final id = j['id'], filaId = j['filaId'], tabla = j['tabla'];
    final obraId = j['obraId'], entradaId = j['entradaId'];
    if (rechazo == null ||
        id is! String ||
        filaId is! String ||
        tabla is! String ||
        obraId is! String ||
        entradaId is! String) {
      return null;
    }
    return AvisoBitacora(
      id: id,
      filaId: filaId,
      tabla: tabla,
      obraId: obraId,
      entradaId: entradaId,
      rechazo: rechazo,
      texto: j['texto'] is String ? j['texto'] as String : null,
      fechaEntrada: (j['fechaEntrada'] as num?)?.toInt(),
      creadoEn: (j['creadoEn'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Los avisos viven en preferencias y no en columnas de las tablas espejo: el
/// pull reescribe esas filas con INSERT OR REPLACE y una columna solo-local se
/// borraría en cada ciclo.
class AvisosBitacora {
  AvisosBitacora(this._prefs);

  final SharedPreferences _prefs;
  static const _clave = 'bitacora_avisos';

  final _cambios = StreamController<void>.broadcast();

  /// Emite cada vez que se agrega o quita un aviso (para refrescar la pantalla).
  Stream<void> get cambios => _cambios.stream;

  List<AvisoBitacora> get todos {
    final crudo = _prefs.getString(_clave);
    if (crudo == null || crudo.isEmpty) return const [];
    try {
      final lista = jsonDecode(crudo);
      if (lista is! List) return const [];
      return lista.map(AvisoBitacora.fromJson).whereType<AvisoBitacora>().toList();
    } catch (_) {
      // Un valor corrupto no debe tumbar la pantalla de la bitácora.
      return const [];
    }
  }

  List<AvisoBitacora> deObra(String obraId) =>
      todos.where((a) => a.obraId == obraId).toList();

  /// El aviso de una fila concreta (p. ej. el motivo de un alta `skipped`).
  AvisoBitacora? deFila(String filaId) =>
      todos.where((a) => a.filaId == filaId).lastOrNull;

  /// Agrega un aviso; si ya había uno de la misma fila y el mismo rechazo, lo
  /// reemplaza (un reintento no debe apilar avisos repetidos).
  Future<void> agregar(AvisoBitacora a) async {
    final resto = todos
        .where((x) => !(x.filaId == a.filaId && x.rechazo == a.rechazo))
        .toList();
    await _guardar([...resto, a]);
  }

  Future<void> quitar(String avisoId) async {
    await _guardar(todos.where((a) => a.id != avisoId).toList());
  }

  /// Al cambiar de cuenta o de empresa: lo de la otra cuenta no aplica aquí.
  Future<void> borrarTodo() async {
    await _prefs.remove(_clave);
    _cambios.add(null);
  }

  Future<void> _guardar(List<AvisoBitacora> lista) async {
    await _prefs.setString(
        _clave, jsonEncode(lista.map((a) => a.toJson()).toList()));
    _cambios.add(null);
  }
}
