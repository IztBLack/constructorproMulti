import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../domain/import/import_models.dart' show ExcelMovimiento;

const _uuid = Uuid();

/// Repositorios de la operación por obra: asistencia, destajos y flujo de caja.

class AsistenciaRepository {
  final AppDatabase db;
  AsistenciaRepository(this.db);

  Stream<List<Asistencia>> watchRango(String obraId, int start, int end) =>
      (db.select(db.asistencias)
            ..where((t) =>
                t.obraId.equals(obraId) &
                t.fecha.isBetweenValues(start, end) &
                t.deletedAt.isNull()))
          .watch();

  Future<List<Asistencia>> getDia(String obraId, int fecha) =>
      (db.select(db.asistencias)
            ..where((t) =>
                t.obraId.equals(obraId) &
                t.fecha.equals(fecha) &
                t.deletedAt.isNull()))
          .get();

  /// Asistencias de un conjunto de colaboradores en un rango, SIN filtrar obra.
  /// Permite a la tabla semanal detectar días en que el trabajador estuvo en
  /// OTRA obra distinta a la mostrada. SOLO para overlay visual de UI; no usar
  /// para nómina (ver watchRango / asistenciasRangoProvider).
  Stream<List<Asistencia>> watchSemanaTodasObras(
    List<String> colaboradorIds,
    int start,
    int end,
  ) {
    if (colaboradorIds.isEmpty) return Stream.value(const []);
    return (db.select(db.asistencias)
          ..where((t) =>
              t.colaboradorId.isIn(colaboradorIds) &
              t.fecha.isBetweenValues(start, end) &
              t.deletedAt.isNull()))
        .watch();
  }

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
                t.obraId.equals(obraId) &
                t.fecha.isBetweenValues(start, end) &
                t.deletedAt.isNull())
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

  Future<void> delete(String id) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.destajos)..where((t) => t.id.equals(id))).write(
      DestajosCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }
}

class MovimientoRepository {
  final AppDatabase db;
  MovimientoRepository(this.db);

  Stream<List<Movimiento>> watchByObra(String obraId) =>
      (db.select(db.movimientos)
            ..where((t) => t.obraId.equals(obraId) & t.deletedAt.isNull())
            ..orderBy([
              (t) => OrderingTerm(
                  expression: t.fecha, mode: OrderingMode.desc)
            ]))
          .watch();

  Stream<List<Movimiento>> watchAll() =>
      (db.select(db.movimientos)..where((t) => t.deletedAt.isNull())).watch();

  /// Movimientos ligados a una cotización (para el avance por partida).
  Stream<List<Movimiento>> watchPorCotizacion(String cotId) =>
      (db.select(db.movimientos)
            ..where((t) => t.cotizacionId.equals(cotId) & t.deletedAt.isNull()))
          .watch();

  Future<void> add({
    required String obraId,
    required int fecha,
    required String tipo, // 'ENTRADA' | 'SALIDA'
    required String categoria,
    required String concepto,
    required double monto,
    required String metodoPago,
    String referencia = '',
    String nombre = '',
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
            nombre: Value(nombre),
            nominaId: Value(nominaId),
            cotizacionId: Value(cotizacionId),
            seccionId: Value(seccionId),
            partidaId: Value(partidaId),
          ));

  /// Alta en lote de movimientos importados (Excel/CSV). `concepto` se
  /// duplica desde `categoria` (mismo criterio que usa el resto de la app:
  /// ver `Movimientos.categoria`/`.concepto`; el import de estado de cuenta
  /// solo trae CONCEPTO→categoria, no una descripción separada). Pensado
  /// para insertar solo las filas ya clasificadas como "Nuevo" por
  /// `clasificarMovimientos` (dedup_movimientos.dart) — no re-chequea
  /// duplicados aquí.
  Future<void> insertBatch(
    String obraId,
    List<ExcelMovimiento> movimientos,
  ) {
    if (movimientos.isEmpty) return Future.value();
    return db.batch((b) {
      for (final m in movimientos) {
        b.insert(
          db.movimientos,
          MovimientosCompanion.insert(
            id: _uuid.v4(),
            obraId: obraId,
            fecha: m.fecha,
            tipo: m.tipo,
            categoria: m.categoria,
            concepto: m.categoria,
            monto: m.monto,
            metodoPago: m.metodoPago,
            referencia: Value(m.referencia),
            nombre: Value(m.nombre),
          ),
        );
      }
    });
  }

  Future<void> delete(String id) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.movimientos)..where((t) => t.id.equals(id))).write(
      MovimientosCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }
}

class ObraPresupuestoRepository {
  final AppDatabase db;
  ObraPresupuestoRepository(this.db);

  Stream<List<ObraPresupuestoRow>> watchByObra(String obraId) =>
      (db.select(db.obraPresupuesto)
            ..where((t) => t.obraId.equals(obraId) & t.deletedAt.isNull())
            ..orderBy([(t) => OrderingTerm(expression: t.orden)]))
          .watch();

  Future<List<ObraPresupuestoRow>> getByObra(String obraId) =>
      (db.select(db.obraPresupuesto)
            ..where((t) => t.obraId.equals(obraId) & t.deletedAt.isNull())
            ..orderBy([(t) => OrderingTerm(expression: t.orden)]))
          .get();

  Future<void> upsert({
    String? id,
    required String obraId,
    required String concepto,
    String unidad = '',
    double cantidad = 1,
    double precioUnitario = 0,
    int orden = 0,
  }) =>
      db.into(db.obraPresupuesto).insertOnConflictUpdate(
            ObraPresupuestoCompanion.insert(
              id: id ?? _uuid.v4(),
              obraId: obraId,
              concepto: Value(concepto),
              unidad: Value(unidad),
              cantidad: Value(cantidad),
              precioUnitario: Value(precioUnitario),
              orden: Value(orden),
            ),
          );

  /// Alta/actualización en lote (import de estado de cuenta: reemplaza o
  /// agrega partidas ya reconciliadas por `reconciliarPresupuesto`).
  Future<void> upsertBatch(List<ObraPresupuestoCompanion> partidas) {
    if (partidas.isEmpty) return Future.value();
    return db.batch((b) {
      b.insertAllOnConflictUpdate(db.obraPresupuesto, partidas);
    });
  }

  Future<void> delete(String id) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.obraPresupuesto)..where((t) => t.id.equals(id)))
        .write(
      ObraPresupuestoCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }
}
