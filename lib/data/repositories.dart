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

  // --- Asignación N:N obra ↔ colaborador ---
  Future<void> asignarObra(ObraColaboradorCompanion rel) =>
      db.into(db.obraColaborador).insertOnConflictUpdate(rel);

  Future<void> desvincular(String obraId, String colaboradorId) =>
      (db.delete(db.obraColaborador)
            ..where((t) =>
                t.obraId.equals(obraId) & t.colaboradorId.equals(colaboradorId)))
          .go();
}
