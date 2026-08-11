import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';

const _uuid = Uuid();

/// Repositorio de CUADRILLAS (equipos de colaboradores). Espeja el estilo de
/// [ColaboradorRepository]: consultas delgadas sobre Drift, baja lógica
/// (tombstone) nunca borrado físico, y sync marcado `pending` en cada escritura.
///
/// Modelo: la cuadrilla es GLOBAL por empresa; sus miembros son N:M con historial
/// ([CuadrillaMiembro], clon de `obra_colaborador`) y su vínculo con obras es
/// temporal ([AsignacionCuadrillaObra]).
class CuadrillaRepository {
  final AppDatabase db;
  CuadrillaRepository(this.db);

  // ───────────────────────── Cuadrillas ─────────────────────────
  Stream<List<Cuadrilla>> watchAll() => (db.select(db.cuadrillas)
        ..where((t) => t.deletedAt.isNull())
        // Orden personalizado primero (0 = sin fijar → cae al desempate por
        // nombre, idéntico al orden natural previo al primer arrastre).
        ..orderBy([
          (t) => OrderingTerm(expression: t.orden),
          (t) => OrderingTerm(expression: t.nombre),
        ]))
      .watch();

  Future<List<Cuadrilla>> getAll() =>
      (db.select(db.cuadrillas)..where((t) => t.deletedAt.isNull())).get();

  Future<void> upsert(CuadrillasCompanion cuadrilla) =>
      db.into(db.cuadrillas).insertOnConflictUpdate(cuadrilla);

  /// Baja lógica EN CASCADA: la cuadrilla + sus membresías + sus asignaciones a
  /// obra. Así no quedan filas huérfanas ocultas ni el sync las resucita. No
  /// toca asistencias/destajos etiquetados (su `cuadrilla_id` queda como
  /// referencia histórica; la FK es DEFERRABLE y la cuadrilla sigue existiendo
  /// como tombstone).
  Future<void> delete(String id) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.transaction(() async {
      await (db.update(db.cuadrillaMiembro)
            ..where((t) => t.cuadrillaId.equals(id)))
          .write(CuadrillaMiembroCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
      await (db.update(db.asignacionCuadrillaObra)
            ..where((t) => t.cuadrillaId.equals(id)))
          .write(AsignacionCuadrillaObraCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
      await (db.update(db.cuadrillas)..where((t) => t.id.equals(id)))
          .write(CuadrillasCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
    });
  }

  Future<void> setActiva(String id, bool activa) =>
      (db.update(db.cuadrillas)..where((t) => t.id.equals(id)))
          .write(CuadrillasCompanion(activa: Value(activa)));

  /// Fija el cabo/jefe. Debe ser un colaborador que también sea miembro vigente;
  /// la UI lo garantiza (se elige de entre los miembros).
  Future<void> setJefe(String cuadrillaId, String? jefeColaboradorId) =>
      (db.update(db.cuadrillas)..where((t) => t.id.equals(cuadrillaId)))
          .write(CuadrillasCompanion(
              jefeColaboradorId: Value(jefeColaboradorId)));

  // ───────────────────── Membresía (N:M con historial) ─────────────────────
  /// Colaboradores VIGENTES de una cuadrilla (sin fecha de salida).
  Stream<List<Colaborador>> watchMiembros(String cuadrillaId) {
    final q = db.select(db.colaboradores).join([
      innerJoin(
        db.cuadrillaMiembro,
        db.cuadrillaMiembro.colaboradorId.equalsExp(db.colaboradores.id),
      ),
    ])
      ..where(db.cuadrillaMiembro.cuadrillaId.equals(cuadrillaId) &
          db.cuadrillaMiembro.fechaSalida.isNull() &
          db.cuadrillaMiembro.deletedAt.isNull() &
          db.colaboradores.deletedAt.isNull() &
          db.colaboradores.activo.equals(true))
      // Orden personalizado del miembro DENTRO de la cuadrilla; desempata nombre.
      ..orderBy([
        OrderingTerm(expression: db.cuadrillaMiembro.orden),
        OrderingTerm(expression: db.colaboradores.nombre),
      ]);
    return q.map((row) => row.readTable(db.colaboradores)).watch();
  }

  /// Agrega (o revive) un colaborador a la cuadrilla. Si ya existía con
  /// fechaSalida, la limpia y reinicia fechaIngreso (espejo de
  /// `ColaboradorRepository.asignarObra`).
  Future<void> agregarMiembro({
    required String cuadrillaId,
    required String colaboradorId,
  }) =>
      db.into(db.cuadrillaMiembro).insertOnConflictUpdate(
            CuadrillaMiembroCompanion(
              cuadrillaId: Value(cuadrillaId),
              colaboradorId: Value(colaboradorId),
              fechaIngreso: Value(DateTime.now().millisecondsSinceEpoch),
              fechaSalida: const Value(null),
            ),
          );

  /// Quita un miembro con BAJA LÓGICA (marca fechaSalida, conserva historial).
  Future<void> quitarMiembro(String cuadrillaId, String colaboradorId) =>
      (db.update(db.cuadrillaMiembro)
            ..where((t) =>
                t.cuadrillaId.equals(cuadrillaId) &
                t.colaboradorId.equals(colaboradorId) &
                t.fechaSalida.isNull()))
          .write(CuadrillaMiembroCompanion(
              fechaSalida: Value(DateTime.now().millisecondsSinceEpoch)));

  /// Mapa colaboradorId → cuadrilla VIGENTE (la primera si estuviera en varias).
  /// Usado por el pase de lista para etiquetar la asistencia y agrupar por
  /// cuadrilla. Solo cuadrillas activas y no borradas.
  Stream<Map<String, Cuadrilla>> watchCuadrillaPorColaborador() {
    final q = db.select(db.cuadrillaMiembro).join([
      innerJoin(db.cuadrillas,
          db.cuadrillas.id.equalsExp(db.cuadrillaMiembro.cuadrillaId)),
    ])
      ..where(db.cuadrillaMiembro.fechaSalida.isNull() &
          db.cuadrillaMiembro.deletedAt.isNull() &
          db.cuadrillas.deletedAt.isNull() &
          db.cuadrillas.activa.equals(true))
      ..orderBy([OrderingTerm(expression: db.cuadrillas.nombre)]);
    return q.watch().map((rows) {
      final map = <String, Cuadrilla>{};
      for (final r in rows) {
        final colId = r.readTable(db.cuadrillaMiembro).colaboradorId;
        map.putIfAbsent(colId, () => r.readTable(db.cuadrillas));
      }
      return map;
    });
  }

  /// Mapa colaboradorId → `orden` de su membresía VIGENTE (para ordenar el pase
  /// de lista en modo personalizado). Solo miembros vigentes y no borrados.
  Stream<Map<String, int>> watchOrdenMiembroVigente() {
    final q = db.select(db.cuadrillaMiembro)
      ..where((t) => t.fechaSalida.isNull() & t.deletedAt.isNull());
    return q.watch().map((rows) {
      final map = <String, int>{};
      for (final r in rows) {
        map[r.colaboradorId] = r.orden;
      }
      return map;
    });
  }

  /// Mapa cuadrillaId → nº de miembros vigentes (para la lista de cuadrillas).
  Stream<Map<String, int>> watchConteoMiembros() {
    final q = db.select(db.cuadrillaMiembro)
      ..where((t) => t.fechaSalida.isNull() & t.deletedAt.isNull());
    return q.watch().map((rows) {
      final map = <String, int>{};
      for (final r in rows) {
        map[r.cuadrillaId] = (map[r.cuadrillaId] ?? 0) + 1;
      }
      return map;
    });
  }

  // ───────────────────── Asignación temporal a obra ─────────────────────
  /// Cuadrillas asignadas VIGENTES a una obra (sin fecha de fin).
  Stream<List<Cuadrilla>> watchCuadrillasPorObra(String obraId) {
    final q = db.select(db.cuadrillas).join([
      innerJoin(
        db.asignacionCuadrillaObra,
        db.asignacionCuadrillaObra.cuadrillaId.equalsExp(db.cuadrillas.id),
      ),
    ])
      ..where(db.asignacionCuadrillaObra.obraId.equals(obraId) &
          db.asignacionCuadrillaObra.fechaFin.isNull() &
          db.asignacionCuadrillaObra.deletedAt.isNull() &
          db.cuadrillas.deletedAt.isNull() &
          db.cuadrillas.activa.equals(true))
      ..orderBy([OrderingTerm(expression: db.cuadrillas.nombre)]);
    return q.map((row) => row.readTable(db.cuadrillas)).watch();
  }

  /// Asigna una cuadrilla a una obra (nueva fila de asignación vigente).
  Future<void> asignarAObra({
    required String cuadrillaId,
    required String obraId,
    String fase = '',
  }) =>
      db.into(db.asignacionCuadrillaObra).insert(
            AsignacionCuadrillaObraCompanion(
              id: Value(_uuid.v4()),
              cuadrillaId: Value(cuadrillaId),
              obraId: Value(obraId),
              fechaInicio: Value(DateTime.now().millisecondsSinceEpoch),
              fechaFin: const Value(null),
              fase: Value(fase),
            ),
          );

  /// Cierra la asignación vigente de una cuadrilla en una obra (marca fechaFin).
  Future<void> desasignarDeObra(String cuadrillaId, String obraId) =>
      (db.update(db.asignacionCuadrillaObra)
            ..where((t) =>
                t.cuadrillaId.equals(cuadrillaId) &
                t.obraId.equals(obraId) &
                t.fechaFin.isNull()))
          .write(AsignacionCuadrillaObraCompanion(
              fechaFin: Value(DateTime.now().millisecondsSinceEpoch)));
}
