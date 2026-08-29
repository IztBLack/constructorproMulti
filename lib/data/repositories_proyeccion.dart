import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../domain/logic/models_proyeccion.dart';

/// Guardado y recuperación de escenarios de proyección con nombre.
///
/// La tabla guarda el escenario como JSON en una sola columna (ver
/// `ProyeccionGuardada` en `tables.dart` para el porqué), así que este
/// repositorio es el único lugar del proyecto que traduce entre
/// [ProyeccionEstado] y la fila. Nadie más debería llamar a `jsonDecode` sobre
/// la columna `escenario`.
class ProyeccionRepository {
  final AppDatabase db;
  ProyeccionRepository(this.db);

  static const _uuid = Uuid();
  int get _ahora => DateTime.now().millisecondsSinceEpoch;

  /// Todas las proyecciones vivas, la más reciente primero.
  ///
  /// Se ordena por `updatedAt` y no por nombre: la lista se usa para «volver a
  /// lo que estaba haciendo», y lo último que se tocó es casi siempre lo que se
  /// busca.
  Stream<List<ProyeccionGuardadaRow>> watchTodas() => (db.select(
        db.proyeccionGuardada,
      )
            ..where((t) => t.deletedAt.isNull())
            ..orderBy([
              (t) => OrderingTerm(
                  expression: t.updatedAt, mode: OrderingMode.desc),
            ]))
          .watch();

  Stream<ProyeccionGuardadaRow?> watchUna(String id) =>
      (db.select(db.proyeccionGuardada)
            ..where((t) => t.id.equals(id) & t.deletedAt.isNull()))
          .watchSingleOrNull();

  Future<ProyeccionGuardadaRow?> buscar(String id) =>
      (db.select(db.proyeccionGuardada)
            ..where((t) => t.id.equals(id) & t.deletedAt.isNull()))
          .getSingleOrNull();

  /// Guarda un escenario nuevo y devuelve su id.
  ///
  /// [totalSnapshot] y [personasSnapshot] son la foto que la lista enseña sin
  /// recalcular; el llamador los saca del resultado que ya tiene en pantalla.
  Future<String> crear({
    required String nombre,
    required ProyeccionEstado estado,
    String obraFiltro = '',
    double totalSnapshot = 0,
    int personasSnapshot = 0,
    String notas = '',
  }) async {
    final id = _uuid.v4();
    final sello = _ahora;
    await db.into(db.proyeccionGuardada).insert(
          ProyeccionGuardadaCompanion.insert(
            id: id,
            nombre: nombre.trim(),
            lunesMillis: estado.lunesMillis,
            escenario: jsonEncode(estado.toJson()),
            obraFiltro: Value(obraFiltro),
            esquema: const Value(ProyeccionEstado.versionEsquema),
            totalSnapshot: Value(totalSnapshot),
            personasSnapshot: Value(personasSnapshot),
            notas: Value(notas),
            createdAt: Value(sello),
            updatedAt: Value(sello),
          ),
        );
    return id;
  }

  /// Reemplaza el escenario de una proyección que ya existe.
  ///
  /// No se toca `syncStatus` a mano: de eso se encarga el trigger
  /// `trg_proyeccion_guardada_mark_pending`. Sí se escribe `updatedAt`, porque
  /// es la columna por la que se ordena la lista y el usuario espera ver arriba
  /// lo que acaba de guardar — el trigger la actualizaría igual, pero después.
  Future<void> actualizar({
    required String id,
    required ProyeccionEstado estado,
    String? nombre,
    String? obraFiltro,
    double? totalSnapshot,
    int? personasSnapshot,
    String? notas,
  }) =>
      (db.update(db.proyeccionGuardada)..where((t) => t.id.equals(id))).write(
        ProyeccionGuardadaCompanion(
          nombre: nombre == null ? const Value.absent() : Value(nombre.trim()),
          lunesMillis: Value(estado.lunesMillis),
          escenario: Value(jsonEncode(estado.toJson())),
          esquema: const Value(ProyeccionEstado.versionEsquema),
          obraFiltro:
              obraFiltro == null ? const Value.absent() : Value(obraFiltro),
          totalSnapshot: totalSnapshot == null
              ? const Value.absent()
              : Value(totalSnapshot),
          personasSnapshot: personasSnapshot == null
              ? const Value.absent()
              : Value(personasSnapshot),
          notas: notas == null ? const Value.absent() : Value(notas),
          updatedAt: Value(_ahora),
        ),
      );

  /// Cambia solo el nombre. Renombrar no debería exigir tener el escenario
  /// cargado en memoria.
  Future<void> renombrar(String id, String nombre) =>
      (db.update(db.proyeccionGuardada)..where((t) => t.id.equals(id))).write(
        ProyeccionGuardadaCompanion(
          nombre: Value(nombre.trim()),
          updatedAt: Value(_ahora),
        ),
      );

  /// Copia una proyección con otro nombre. Devuelve el id de la copia, o `null`
  /// si la original ya no existe.
  ///
  /// La copia arranca limpia de identidad —id nuevo, sellos nuevos— pero con el
  /// MISMO texto de escenario: duplicar sirve para probar una variante, y
  /// reserializar desde el objeto correría el riesgo de que una diferencia de
  /// formato hiciera que la copia no fuera idéntica a lo que se copió.
  Future<String?> duplicar(String id, {String? nombre}) async {
    final original = await buscar(id);
    if (original == null) return null;
    final nuevoId = _uuid.v4();
    final sello = _ahora;
    await db.into(db.proyeccionGuardada).insert(
          ProyeccionGuardadaCompanion.insert(
            id: nuevoId,
            nombre: (nombre ?? '${original.nombre} (copia)').trim(),
            lunesMillis: original.lunesMillis,
            escenario: original.escenario,
            obraFiltro: Value(original.obraFiltro),
            esquema: Value(original.esquema),
            totalSnapshot: Value(original.totalSnapshot),
            personasSnapshot: Value(original.personasSnapshot),
            notas: Value(original.notas),
            createdAt: Value(sello),
            updatedAt: Value(sello),
          ),
        );
    return nuevoId;
  }

  /// Borrado lógico, como todo en este esquema: la fila se queda para que el
  /// sync pueda propagar la baja en vez de que reaparezca en el otro teléfono.
  Future<void> eliminar(String id) {
    final sello = _ahora;
    return (db.update(db.proyeccionGuardada)..where((t) => t.id.equals(id)))
        .write(ProyeccionGuardadaCompanion(
      deletedAt: Value(sello),
      updatedAt: Value(sello),
    ));
  }

  /// Deshacer un borrado. La fila sigue ahí, solo hay que quitarle la marca.
  Future<void> restaurar(String id) =>
      (db.update(db.proyeccionGuardada)..where((t) => t.id.equals(id))).write(
        ProyeccionGuardadaCompanion(
          deletedAt: const Value(null),
          updatedAt: Value(_ahora),
        ),
      );
}

/// El escenario de una fila guardada, o `null` si no se puede leer.
///
/// Devuelve `null` en vez de lanzar por dos casos reales: un JSON escrito por
/// una versión MÁS NUEVA de la app (sincronizado desde otro teléfono ya
/// actualizado) y una fila corrupta. En los dos, la pantalla debe poder decir
/// «esta proyección se guardó con una versión más nueva» en lugar de tronar.
ProyeccionEstado? escenarioDe(ProyeccionGuardadaRow fila) {
  if (fila.esquema > ProyeccionEstado.versionEsquema) return null;
  try {
    final json = jsonDecode(fila.escenario);
    if (json is! Map) return null;
    return ProyeccionEstado.fromJson(json.cast<String, Object?>());
  } on FormatException {
    return null;
  }
}
