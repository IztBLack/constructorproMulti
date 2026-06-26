import 'package:drift/drift.dart';

import '../core/db/app_database.dart';

/// Repositorios delgados sobre Drift, espejo de la capa `domain/` del proyecto
/// Kotlin. Aíslan a la UI de las consultas SQL.

class ObraRepository {
  final AppDatabase db;
  ObraRepository(this.db);

  Stream<List<Obra>> watchAll() =>
      (db.select(db.obras)..orderBy([(t) => OrderingTerm(expression: t.nombre)]))
          .watch();

  Future<void> upsert(ObrasCompanion obra) =>
      db.into(db.obras).insertOnConflictUpdate(obra);

  Future<void> delete(String id) =>
      (db.delete(db.obras)..where((t) => t.id.equals(id))).go();
}

class PuestoRepository {
  final AppDatabase db;
  PuestoRepository(this.db);

  Stream<List<Puesto>> watchAll() =>
      (db.select(db.puestos)..orderBy([(t) => OrderingTerm(expression: t.nombre)]))
          .watch();

  Future<List<Puesto>> getAll() => db.select(db.puestos).get();

  Future<void> upsert(PuestosCompanion puesto) =>
      db.into(db.puestos).insertOnConflictUpdate(puesto);

  Future<void> delete(String id) =>
      (db.delete(db.puestos)..where((t) => t.id.equals(id))).go();
}

class ColaboradorRepository {
  final AppDatabase db;
  ColaboradorRepository(this.db);

  Stream<List<Colaborador>> watchAll() =>
      (db.select(db.colaboradores)
            ..orderBy([(t) => OrderingTerm(expression: t.nombre)]))
          .watch();

  /// Colaboradores activos asignados a una obra (vía obra_colaborador sin fecha de salida).
  Stream<List<Colaborador>> watchActivosPorObra(String obraId) {
    final query = db.select(db.colaboradores).join([
      innerJoin(
        db.obraColaborador,
        db.obraColaborador.colaboradorId.equalsExp(db.colaboradores.id),
      ),
    ])
      ..where(db.obraColaborador.obraId.equals(obraId) &
          db.obraColaborador.fechaSalida.isNull() &
          db.colaboradores.activo.equals(true));
    return query
        .map((row) => row.readTable(db.colaboradores))
        .watch();
  }

  Future<void> upsert(ColaboradoresCompanion colaborador) =>
      db.into(db.colaboradores).insertOnConflictUpdate(colaborador);

  Future<void> delete(String id) =>
      (db.delete(db.colaboradores)..where((t) => t.id.equals(id))).go();

  /// Activa/desactiva (baja lógica) un colaborador.
  Future<void> setActivo(String id, bool activo) =>
      (db.update(db.colaboradores)..where((t) => t.id.equals(id)))
          .write(ColaboradoresCompanion(activo: Value(activo)));

  // --- Asignación N:N obra ↔ colaborador ---
  /// Asigna (o revive) la relación obra↔colaborador. Si ya existía con
  /// fechaSalida (estaba desvinculado), la limpia y reinicia fechaIngreso.
  /// Espejo del `asignarObra` de Kotlin: nunca duplica ni deja colgado el
  /// tombstone de salida.
  Future<void> asignarObra({
    required String obraId,
    required String colaboradorId,
    double? salarioDiaOverride,
  }) =>
      db.into(db.obraColaborador).insertOnConflictUpdate(
            ObraColaboradorCompanion(
              obraId: Value(obraId),
              colaboradorId: Value(colaboradorId),
              fechaIngreso: Value(DateTime.now().millisecondsSinceEpoch),
              fechaSalida: const Value(null),
              salarioDiaOverride: Value(salarioDiaOverride),
            ),
          );

  /// Desvincula con BAJA LÓGICA: marca fechaSalida (conserva el historial).
  Future<void> desvincular(String obraId, String colaboradorId) =>
      (db.update(db.obraColaborador)
            ..where((t) =>
                t.obraId.equals(obraId) &
                t.colaboradorId.equals(colaboradorId) &
                t.fechaSalida.isNull()))
          .write(ObraColaboradorCompanion(
              fechaSalida: Value(DateTime.now().millisecondsSinceEpoch)));

  /// Mapa colaboradorId → obras ACTIVAS asignadas (reactivo). Espejo del
  /// `colaboradorObras` de Kotlin: un colaborador puede estar en varias obras
  /// a la vez. Solo cuenta relaciones sin fechaSalida y obras activas.
  Stream<Map<String, List<Obra>>> watchObrasPorColaborador() {
    final q = db.select(db.obraColaborador).join([
      innerJoin(db.obras, db.obras.id.equalsExp(db.obraColaborador.obraId)),
    ])
      ..where(db.obraColaborador.fechaSalida.isNull() &
          db.obras.activa.equals(true))
      ..orderBy([OrderingTerm(expression: db.obras.nombre)]);
    return q.watch().map((rows) {
      final map = <String, List<Obra>>{};
      for (final r in rows) {
        final colId = r.readTable(db.obraColaborador).colaboradorId;
        (map[colId] ??= []).add(r.readTable(db.obras));
      }
      return map;
    });
  }

  /// colaboradorId → ÚLTIMA obra activa asignada (la de mayor fechaIngreso).
  /// Trae las relaciones activas ordenadas por fechaIngreso desc y se queda con
  /// la primera por colaborador (plegado en Dart): más simple y robusto que
  /// groupBy+max, y el orden estable de SQLite resuelve empates de forma
  /// determinista. Usado por el pase de lista para no duplicar a un colaborador
  /// que está en varias obras a la vez.
  Stream<Map<String, Obra>> watchUltimaObraActivaPorColaborador() {
    final q = db.select(db.obraColaborador).join([
      innerJoin(db.obras, db.obras.id.equalsExp(db.obraColaborador.obraId)),
    ])
      ..where(db.obraColaborador.fechaSalida.isNull() &
          db.obras.activa.equals(true))
      ..orderBy([
        OrderingTerm(
            expression: db.obraColaborador.fechaIngreso,
            mode: OrderingMode.desc)
      ]);
    return q.watch().map((rows) {
      final map = <String, Obra>{};
      for (final r in rows) {
        final colId = r.readTable(db.obraColaborador).colaboradorId;
        map.putIfAbsent(colId, () => r.readTable(db.obras));
      }
      return map;
    });
  }

  /// Historial de obras del colaborador (con fechas de ingreso/salida).
  Future<List<({ObraColaboradorData rel, Obra obra})>> historial(
      String colaboradorId) async {
    final q = db.select(db.obraColaborador).join([
      innerJoin(db.obras, db.obras.id.equalsExp(db.obraColaborador.obraId)),
    ])
      ..where(db.obraColaborador.colaboradorId.equals(colaboradorId));
    final rows = await q.get();
    return rows
        .map((r) => (
              rel: r.readTable(db.obraColaborador),
              obra: r.readTable(db.obras),
            ))
        .toList();
  }
}
