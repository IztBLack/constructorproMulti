import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';

const _uuid = Uuid();

/// Repositorios de la operación por obra: asistencia, destajos y flujo de caja.

class AsistenciaRepository {
  final AppDatabase db;
  AsistenciaRepository(this.db);

  Stream<List<Asistencia>> watchRango(String obraId, int start, int end) =>
      (db.select(db.asistencias)
            ..where((t) =>
                t.obraId.equals(obraId) & t.fecha.isBetweenValues(start, end)))
          .watch();

  Future<List<Asistencia>> getDia(String obraId, int fecha) =>
      (db.select(db.asistencias)
            ..where((t) => t.obraId.equals(obraId) & t.fecha.equals(fecha)))
          .get();

  /// Registra/actualiza la fracción de un colaborador en un día (índice único).
  Future<void> setFraccion({
    required String obraId,
    required String colaboradorId,
    required int fecha,
    required double fraccion,
  }) async {
    final existing = await (db.select(db.asistencias)
          ..where((t) =>
              t.obraId.equals(obraId) &
              t.colaboradorId.equals(colaboradorId) &
              t.fecha.equals(fecha)))
        .getSingleOrNull();
    if (existing != null) {
      await (db.update(db.asistencias)..where((t) => t.id.equals(existing.id)))
          .write(AsistenciasCompanion(fraccion: Value(fraccion)));
    } else {
      await db.into(db.asistencias).insert(AsistenciasCompanion.insert(
            id: _uuid.v4(),
            colaboradorId: colaboradorId,
            obraId: obraId,
            fecha: fecha,
            fraccion: fraccion,
          ));
    }
  }
}

class DestajoRepository {
  final AppDatabase db;
  DestajoRepository(this.db);

  Stream<List<Destajo>> watchRango(String obraId, int start, int end) =>
      (db.select(db.destajos)
            ..where((t) =>
                t.obraId.equals(obraId) & t.fecha.isBetweenValues(start, end))
            ..orderBy([(t) => OrderingTerm(expression: t.fecha)]))
          .watch();

  Future<void> insert({
    required String obraId,
    required String colaboradorId,
    required int fecha,
    required String concepto,
    required double monto,
  }) =>
      db.into(db.destajos).insert(DestajosCompanion.insert(
            id: _uuid.v4(),
            colaboradorId: colaboradorId,
            obraId: obraId,
            fecha: fecha,
            concepto: concepto,
            monto: monto,
          ));

  Future<void> delete(String id) =>
      (db.delete(db.destajos)..where((t) => t.id.equals(id))).go();
}

class MovimientoRepository {
  final AppDatabase db;
  MovimientoRepository(this.db);

  Stream<List<Movimiento>> watchByObra(String obraId) =>
      (db.select(db.movimientos)
            ..where((t) => t.obraId.equals(obraId))
            ..orderBy([
              (t) => OrderingTerm(
                  expression: t.fecha, mode: OrderingMode.desc)
            ]))
          .watch();

  Stream<List<Movimiento>> watchAll() => db.select(db.movimientos).watch();

  /// Movimientos ligados a una cotización (para el avance por partida).
  Stream<List<Movimiento>> watchPorCotizacion(String cotId) =>
      (db.select(db.movimientos)..where((t) => t.cotizacionId.equals(cotId))).watch();

  Future<void> add({
    required String obraId,
    required int fecha,
    required String tipo, // 'ENTRADA' | 'SALIDA'
    required String categoria,
    required String concepto,
    required double monto,
    required String metodoPago,
    String referencia = '',
    String? nominaId,
    String? cotizacionId,
    String? seccionId,
    String? partidaId,
  }) =>
      db.into(db.movimientos).insert(MovimientosCompanion.insert(
            id: _uuid.v4(),
            obraId: obraId,
            fecha: fecha,
            tipo: tipo,
            categoria: categoria,
            concepto: concepto,
            monto: monto,
            metodoPago: metodoPago,
            referencia: Value(referencia),
            nominaId: Value(nominaId),
            cotizacionId: Value(cotizacionId),
            seccionId: Value(seccionId),
            partidaId: Value(partidaId),
          ));

  Future<void> delete(String id) =>
      (db.delete(db.movimientos)..where((t) => t.id.equals(id))).go();
}
