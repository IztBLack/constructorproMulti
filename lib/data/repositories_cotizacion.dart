import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter/services.dart' show rootBundle;
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

  /// Cotización ligada a una obra (por obraId o por cotizacionOrigen).
  Future<Cotizacion?> cotizacionDeObra(String obraId) async {
    final porObra = await (db.select(db.cotizaciones)
          ..where((t) => t.obraId.equals(obraId))
          ..limit(1))
        .getSingleOrNull();
    if (porObra != null) return porObra;
    final obra = await (db.select(db.obras)..where((t) => t.id.equals(obraId))).getSingleOrNull();
    final origen = obra?.cotizacionOrigenId;
    if (origen == null) return null;
    return (db.select(db.cotizaciones)..where((t) => t.id.equals(origen))).getSingleOrNull();
  }

  Future<void> cambiarEstado(String cotId, String estado) =>
      (db.update(db.cotizaciones)..where((t) => t.id.equals(cotId)))
          .write(CotizacionesCompanion(estado: Value(estado)));

  /// Liga la cotización a una obra existente (sin crear una nueva).
  Future<void> vincularAObra(String cotId, String obraId) =>
      (db.update(db.cotizaciones)..where((t) => t.id.equals(cotId)))
          .write(CotizacionesCompanion(obraId: Value(obraId)));

  /// Clona la cotización con todas sus secciones y partidas.
  Future<String> duplicar(String cotId) async {
    final nuevaId = _uuid.v4();
    await db.transaction(() async {
      final orig = await (db.select(db.cotizaciones)
            ..where((t) => t.id.equals(cotId)))
          .getSingle();
      await db.into(db.cotizaciones).insert(CotizacionesCompanion.insert(
            id: nuevaId,
            cliente: orig.cliente,
            nombreProyecto: '${orig.nombreProyecto} (copia)',
            ubicacion: Value(orig.ubicacion),
            fecha: DateTime.now().millisecondsSinceEpoch,
            estado: const Value('BORRADOR'),
            ivaEnabled: Value(orig.ivaEnabled),
            descuento: Value(orig.descuento),
            notas: Value(orig.notas),
          ));
      final secs = await (db.select(db.secciones)
            ..where((t) => t.cotizacionId.equals(cotId)))
          .get();
      for (final s in secs) {
        final nuevaSecId = _uuid.v4();
        await db.into(db.secciones).insert(SeccionesCompanion.insert(
            id: nuevaSecId, cotizacionId: nuevaId, nombre: s.nombre, orden: Value(s.orden)));
        final parts = await (db.select(db.partidas)
              ..where((t) => t.seccionId.equals(s.id)))
            .get();
        for (final p in parts) {
          await db.into(db.partidas).insert(PartidasCompanion.insert(
              id: _uuid.v4(), seccionId: nuevaSecId, clave: Value(p.clave),
              descripcion: p.descripcion, unidad: Value(p.unidad),
              cantidad: p.cantidad, precioUnitario: p.precioUnitario, orden: Value(p.orden)));
        }
      }
    });
    return nuevaId;
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

  /// Aplica un factor (ej. 1.10 = +10%) al precio de TODAS las partidas de la
  /// cotización.
  Future<int> ajustarPrecios(String cotId, double factor) async {
    final partidas = await watchDeCotizacion(cotId).first;
    await db.transaction(() async {
      for (final p in partidas) {
        await (db.update(db.partidas)..where((t) => t.id.equals(p.id)))
            .write(PartidasCompanion(precioUnitario: Value(p.precioUnitario * factor)));
      }
    });
    return partidas.length;
  }

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

class ArchivoRepository {
  final AppDatabase db;
  ArchivoRepository(this.db);

  Stream<List<ArchivoCotizacion>> watchByCotizacion(String cotId) =>
      (db.select(db.archivosCotizacion)
            ..where((t) => t.cotizacionId.equals(cotId))
            ..orderBy([(t) => OrderingTerm(expression: t.fechaAgregado, mode: OrderingMode.desc)]))
          .watch();

  Future<void> add({
    required String cotId,
    required String tipo, // 'IMAGEN' | 'PDF'
    required String nombre,
    required String uri,
  }) =>
      db.into(db.archivosCotizacion).insert(ArchivosCotizacionCompanion.insert(
            id: _uuid.v4(),
            cotizacionId: cotId,
            tipo: tipo,
            nombre: nombre,
            uri: uri,
            fechaAgregado: DateTime.now().millisecondsSinceEpoch,
          ));

  Future<void> delete(String id) =>
      (db.delete(db.archivosCotizacion)..where((t) => t.id.equals(id))).go();
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

  Stream<List<CatalogoConcepto>> watchAll() => (db.select(db.catalogoConceptos)
        ..orderBy([
          (t) => OrderingTerm(expression: t.categoria),
          (t) => OrderingTerm(expression: t.clave),
        ]))
      .watch();

  Future<void> upsert(CatalogoConceptosCompanion c) =>
      db.into(db.catalogoConceptos).insertOnConflictUpdate(c);

  Future<void> delete(String id) =>
      (db.delete(db.catalogoConceptos)..where((t) => t.id.equals(id))).go();

  /// Re-siembra el catálogo oficial desde el asset, sin duplicar claves existentes.
  /// Devuelve cuántos conceptos se agregaron.
  Future<int> cargarOficial() async {
    final raw = await rootBundle.loadString('assets/catalogo_base.json');
    final List<dynamic> data = json.decode(raw) as List<dynamic>;
    final existentes = (await db.select(db.catalogoConceptos).get())
        .map((c) => c.clave)
        .toSet();
    var agregados = 0;
    await db.batch((b) {
      for (final item in data) {
        final m = item as Map<String, dynamic>;
        final clave = m['clave'] as String;
        if (existentes.contains(clave)) continue;
        existentes.add(clave);
        agregados++;
        b.insert(
          db.catalogoConceptos,
          CatalogoConceptosCompanion.insert(
            id: _uuid.v4(),
            clave: clave,
            descripcion: m['descripcion'] as String,
            unidad: m['unidad'] as String,
            precioUnitarioDefault: Value((m['precioUnitarioDefault'] as num).toDouble()),
            categoria: m['categoria'] as String,
          ),
        );
      }
    });
    return agregados;
  }

  String newId() => _uuid.v4();
}
