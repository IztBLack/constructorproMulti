import 'package:drift/drift.dart';

/// Tablas Drift que espejan las 13 entidades Room del proyecto Kotlin.
/// IDs como TEXT (UUID), fechas como INTEGER (epoch millis).
///
/// Fase 0 (sync nube): cada tabla lleva el bloque [SyncCols] vía mixin —
/// `empresaId`, `createdAt`, `updatedAt`, `serverUpdatedAt`, `deletedAt`,
/// `syncStatus`. La app sigue 100% offline; estas columnas solo habilitan
/// el sync offline-first (LWW por fila, tombstones, cursor de pull).

/// Columnas de sincronización comunes a todas las tablas.
mixin SyncCols on Table {
  /// Llave multitenant + RLS. Vacío mientras no haya backend.
  TextColumn get empresaId => text().withDefault(const Constant(''))();

  /// Alta (UTC ms). 0 en filas previas a la migración.
  IntColumn get createdAt => integer().withDefault(const Constant(0))();

  /// Última edición de cliente (UTC ms). Árbitro local de LWW + dirty flag.
  IntColumn get updatedAt => integer().withDefault(const Constant(0))();

  /// Lo pone Postgres; árbitro de LWW y cursor de pull. Null hasta sincronizar.
  IntColumn get serverUpdatedAt => integer().nullable()();

  /// Tombstone / soft-delete (UTC ms). Las queries de UI filtran IS NULL.
  IntColumn get deletedAt => integer().nullable()();

  /// 'pending' | 'synced' | 'error'.
  TextColumn get syncStatus =>
      text().withDefault(const Constant('pending'))();
}

class Obras extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get nombre => text()();
  TextColumn get cliente => text().withDefault(const Constant(''))();
  TextColumn get ubicacion => text().withDefault(const Constant(''))();
  IntColumn get fechaInicio => integer()();
  BoolColumn get activa => boolean().withDefault(const Constant(true))();
  TextColumn get cotizacionOrigenId => text().nullable()();
  TextColumn get pdfConfigJson => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Puestos extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get nombre => text()();
  RealColumn get salarioDiaDefault => real().withDefault(const Constant(0.0))();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('Colaborador')
class Colaboradores extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get nombre => text()();
  TextColumn get puestoId => text()();
  TextColumn get tipoPago => text()(); // "DIA" | "DESTAJO"
  TextColumn get telefono => text().withDefault(const Constant(''))();
  TextColumn get contactoNombre => text().withDefault(const Constant(''))();
  TextColumn get contactoTelefono => text().withDefault(const Constant(''))();
  TextColumn get contactoParentesco => text().withDefault(const Constant(''))();
  BoolColumn get activo => boolean().withDefault(const Constant(true))();
  RealColumn get salarioPersonalizado => real().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class ObraColaborador extends Table with SyncCols {
  TextColumn get obraId => text()();
  TextColumn get colaboradorId => text()();
  IntColumn get fechaIngreso => integer()();
  IntColumn get fechaSalida => integer().nullable()();
  RealColumn get salarioDiaOverride => real().nullable()();

  @override
  Set<Column> get primaryKey => {obraId, colaboradorId};
}

class Asistencias extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get colaboradorId => text()();
  TextColumn get obraId => text()();
  IntColumn get fecha => integer()();
  RealColumn get fraccion => real()(); // 0.0, 0.5, 0.75, 1.0

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
        {colaboradorId, obraId, fecha}
      ];
}

class Destajos extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get colaboradorId => text()();
  TextColumn get obraId => text()();
  IntColumn get fecha => integer()();
  TextColumn get concepto => text()();
  RealColumn get monto => real()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('Cotizacion')
class Cotizaciones extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get cliente => text()();
  TextColumn get nombreProyecto => text()();
  TextColumn get ubicacion => text().withDefault(const Constant(''))();
  IntColumn get fecha => integer()();
  TextColumn get estado => text().withDefault(const Constant('BORRADOR'))();
  BoolColumn get ivaEnabled => boolean().withDefault(const Constant(true))();
  RealColumn get descuento => real().withDefault(const Constant(0.0))();
  TextColumn get notas => text().withDefault(const Constant(''))();
  TextColumn get obraId => text().nullable()();
  TextColumn get pdfConfigJson => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('Seccion')
class Secciones extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get cotizacionId => text()();
  TextColumn get nombre => text()();
  IntColumn get orden => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

class Partidas extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get seccionId => text()();
  TextColumn get clave => text().withDefault(const Constant(''))();
  TextColumn get descripcion => text()();
  TextColumn get unidad => text().withDefault(const Constant(''))();
  RealColumn get cantidad => real()();
  RealColumn get precioUnitario => real()();
  IntColumn get orden => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

class Pagos extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get cotizacionId => text()();
  IntColumn get fecha => integer()();
  RealColumn get monto => real()();
  TextColumn get metodo => text()();
  TextColumn get concepto => text()();
  TextColumn get referencia => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Movimientos extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get obraId => text()();
  IntColumn get fecha => integer()();
  TextColumn get tipo => text()(); // "ENTRADA" | "SALIDA"
  TextColumn get categoria => text()();
  TextColumn get concepto => text()();
  RealColumn get monto => real()();
  TextColumn get metodoPago => text()();
  TextColumn get referencia => text().withDefault(const Constant(''))();
  TextColumn get nominaId => text().nullable()();
  TextColumn get cotizacionId => text().nullable()();
  TextColumn get seccionId => text().nullable()();
  TextColumn get partidaId => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class CatalogoConceptos extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get clave => text()();
  TextColumn get descripcion => text()();
  TextColumn get unidad => text()();
  RealColumn get precioUnitarioDefault =>
      real().withDefault(const Constant(0.0))();
  TextColumn get categoria => text()();
  BoolColumn get esPersonalizado => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('ArchivoCotizacion')
class ArchivosCotizacion extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get cotizacionId => text()();
  TextColumn get tipo => text()();
  TextColumn get nombre => text()();
  TextColumn get uri => text()();
  IntColumn get fechaAgregado => integer()();

  @override
  Set<Column> get primaryKey => {id};
}
