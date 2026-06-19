import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';

const _uuid = Uuid();

class CotizacionRepository {
  final AppDatabase db;
  CotizacionRepository(this.db);

  Stream<List<Cotizacion>> watchAll() => (db.select(db.cotizaciones)
        ..orderBy([(t) => OrderingTerm(expression: t.fecha, mode: OrderingMode.desc)]))
      .watch();

  Future<void> upsert(CotizacionesCompanion c) =>
      db.into(db.cotizaciones).insertOnConflictUpdate(c);

  Future<void> delete(String id) async {
    await db.transaction(() async {
      final secs = await (db.select(db.secciones)
            ..where((t) => t.cotizacionId.equals(id)))
          .get();
      for (final s in secs) {
        await (db.delete(db.partidas)..where((t) => t.seccionId.equals(s.id))).go();
      }
      await (db.delete(db.secciones)..where((t) => t.cotizacionId.equals(id))).go();
      await (db.delete(db.pagos)..where((t) => t.cotizacionId.equals(id))).go();
      await (db.delete(db.cotizaciones)..where((t) => t.id.equals(id))).go();
    });
  }

  /// Crea una obra a partir de la cotización y la marca como CONVERTIDA.
  Future<String> convertirEnObra(Cotizacion c) async {
    final obraId = _uuid.v4();
    await db.transaction(() async {
      await db.into(db.obras).insert(ObrasCompanion.insert(
            id: obraId,
            nombre: c.nombreProyecto,
            cliente: Value(c.cliente),
            ubicacion: Value(c.ubicacion),
            fechaInicio: DateTime.now().millisecondsSinceEpoch,
            cotizacionOrigenId: Value(c.id),
          ));
      await (db.update(db.cotizaciones)..where((t) => t.id.equals(c.id)))
          .write(CotizacionesCompanion(
              estado: const Value('CONVERTIDA'), obraId: Value(obraId)));
    });
    return obraId;
  }
}

class SeccionRepository {
  final AppDatabase db;
  SeccionRepository(this.db);

  Stream<List<Seccion>> watchByCotizacion(String cotId) =>
      (db.select(db.secciones)
            ..where((t) => t.cotizacionId.equals(cotId))
            ..orderBy([(t) => OrderingTerm(expression: t.orden)]))
          .watch();

  Future<void> insert(String cotId, String nombre, int orden) =>
      db.into(db.secciones).insert(SeccionesCompanion.insert(
            id: _uuid.v4(),
            cotizacionId: cotId,
            nombre: nombre,
            orden: Value(orden),
          ));

  Future<void> rename(String id, String nombre) =>
      (db.update(db.secciones)..where((t) => t.id.equals(id)))
          .write(SeccionesCompanion(nombre: Value(nombre)));

  Future<void> delete(String id) async {
    await db.transaction(() async {
      await (db.delete(db.partidas)..where((t) => t.seccionId.equals(id))).go();
      await (db.delete(db.secciones)..where((t) => t.id.equals(id))).go();
    });
  }
}

class PartidaRepository {
  final AppDatabase db;
  PartidaRepository(this.db);

  /// Todas las partidas de una cotización (vía join con secciones).
  Stream<List<Partida>> watchDeCotizacion(String cotId) {
    final q = db.select(db.partidas).join([
      innerJoin(db.secciones, db.secciones.id.equalsExp(db.partidas.seccionId)),
    ])
      ..where(db.secciones.cotizacionId.equals(cotId));
    return q.map((row) => row.readTable(db.partidas)).watch();
  }

  Future<void> upsert(PartidasCompanion p) =>
      db.into(db.partidas).insertOnConflictUpdate(p);

  Future<void> delete(String id) =>
      (db.delete(db.partidas)..where((t) => t.id.equals(id))).go();

  String newId() => _uuid.v4();
}

class PagoRepository {
  final AppDatabase db;
  PagoRepository(this.db);

  Stream<List<Pago>> watchByCotizacion(String cotId) => (db.select(db.pagos)
        ..where((t) => t.cotizacionId.equals(cotId))
        ..orderBy([(t) => OrderingTerm(expression: t.fecha, mode: OrderingMode.desc)]))
      .watch();

  Future<void> add({
    required String cotId,
    required int fecha,
    required double monto,
    required String metodo,
    required String concepto,
  }) =>
      db.into(db.pagos).insert(PagosCompanion.insert(
            id: _uuid.v4(),
            cotizacionId: cotId,
            fecha: fecha,
            monto: monto,
            metodo: metodo,
            concepto: concepto,
          ));

  Future<void> delete(String id) =>
      (db.delete(db.pagos)..where((t) => t.id.equals(id))).go();
}

class CatalogoRepository {
  final AppDatabase db;
  CatalogoRepository(this.db);

  Future<List<CatalogoConcepto>> buscar(String query) {
    final q = '%$query%';
    return (db.select(db.catalogoConceptos)
          ..where((t) =>
              t.clave.like(q) | t.descripcion.like(q) | t.categoria.like(q))
          ..orderBy([(t) => OrderingTerm(expression: t.clave)])
          ..limit(50))
        .get();
  }
}
