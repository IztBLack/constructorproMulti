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
  Future<void> asignarObra(ObraColaboradorCompanion rel) =>
      db.into(db.obraColaborador).insertOnConflictUpdate(rel);

  /// Desvincula con BAJA LÓGICA: marca fechaSalida (conserva el historial).
  Future<void> desvincular(String obraId, String colaboradorId) =>
      (db.update(db.obraColaborador)
            ..where((t) =>
                t.obraId.equals(obraId) &
                t.colaboradorId.equals(colaboradorId) &
                t.fechaSalida.isNull()))
          .write(ObraColaboradorCompanion(
              fechaSalida: Value(DateTime.now().millisecondsSinceEpoch)));

  /// Mapa colaboradorId → nombre de una obra activa asignada (para ordenar).
  Stream<Map<String, String>> watchObraPorColaborador() {
    final q = db.select(db.obraColaborador).join([
      innerJoin(db.obras, db.obras.id.equalsExp(db.obraColaborador.obraId)),
    ])
      ..where(db.obraColaborador.fechaSalida.isNull());
    return q.watch().map((rows) {
      final map = <String, String>{};
      for (final r in rows) {
        map[r.readTable(db.obraColaborador).colaboradorId] =
            r.readTable(db.obras).nombre;
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
