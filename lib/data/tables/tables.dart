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

  /// Salario diario (MXN/día) que consume la nómina. **Derivado** del sueldo por
  /// periodo: se recalcula desde [salarioPeriodo] + [periodoPago] + [diasSemana];
  /// no se edita a mano. Nullable → usa el salario del puesto.
  RealColumn get salarioPersonalizado => real().nullable()();

  /// Esquema de captura del sueldo base: "SEMANAL" | "QUINCENAL" | "MENSUAL".
  TextColumn get periodoPago =>
      text().withDefault(const Constant('MENSUAL'))();

  /// Monto del sueldo tal cual lo captura el usuario, para el periodo elegido.
  RealColumn get salarioPeriodo => real().nullable()();

  /// Días trabajados por semana (5, 6 o 7) usados como divisor a diario.
  IntColumn get diasSemana => integer().withDefault(const Constant(6))();

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

  /// Cuadrilla bajo la que se capturó (opcional). El dato de asistencia sigue
  /// siendo INDIVIDUAL; esto solo agrupa el pase de lista para reportes. Null
  /// en filas previas a la migración v7 y cuando el colaborador no trae cuadrilla.
  TextColumn get cuadrillaId => text().nullable()();

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

  /// Cuadrilla a la que se atribuye el destajo (opcional). Habilita a futuro la
  /// "bolsa de cuadrilla" que el cabo reparte. El monto sigue siendo por fila
  /// (individual); esto solo etiqueta el grupo. Null en filas previas a v7.
  TextColumn get cuadrillaId => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Cuadrilla = equipo de colaboradores por especialidad, con un jefe (cabo).
/// Es GLOBAL por empresa (identidad estable) y se asigna a obras vía
/// [AsignacionCuadrillaObra], de modo que rota entre obras conservando historial.
@DataClassName('Cuadrilla')
class Cuadrillas extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get nombre => text()();

  /// Oficio de la cuadrilla: "ALBANILERIA" | "ACERO" | "CIMBRA" |
  /// "INSTALACIONES" | "ACABADOS" | "MIXTA". Texto (no enum en BD) para no
  /// romper el sync si se agregan especialidades nuevas.
  TextColumn get especialidad =>
      text().withDefault(const Constant('MIXTA'))();

  /// El cabo/jefe de cuadrilla. Es un colaborador; debería existir también como
  /// fila en [CuadrillaMiembro]. Nullable: una cuadrilla puede quedar sin jefe
  /// asignado temporalmente.
  TextColumn get jefeColaboradorId => text().nullable()();

  BoolColumn get activa => boolean().withDefault(const Constant(true))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Membresía N:M colaborador ↔ cuadrilla CON HISTORIAL (clon de
/// [ObraColaborador]). `fechaSalida` null = miembro vigente. Permite que un
/// colaborador rote de cuadrilla entre proyectos sin perder el histórico.
class CuadrillaMiembro extends Table with SyncCols {
  TextColumn get cuadrillaId => text()();
  TextColumn get colaboradorId => text()();
  IntColumn get fechaIngreso => integer()();
  IntColumn get fechaSalida => integer().nullable()();

  @override
  Set<Column> get primaryKey => {cuadrillaId, colaboradorId};
}

/// Asignación temporal de una cuadrilla a una obra (la cuadrilla rota entre
/// obras según la fase). `fechaFin` null = asignación vigente.
class AsignacionCuadrillaObra extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get cuadrillaId => text()();
  TextColumn get obraId => text()();
  IntColumn get fechaInicio => integer()();
  IntColumn get fechaFin => integer().nullable()();

  /// Frente/fase opcional dentro de la obra (ej. "cimbra", "acabados").
  TextColumn get fase => text().withDefault(const Constant(''))();

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

  /// Beneficiario/pagador del movimiento (a quién se le pagó / de quién se
  /// recibió). Espeja `movimientos.nombre` de Supabase (migración 0008).
  TextColumn get nombre => text().withDefault(const Constant(''))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Presupuesto de obra por partidas (encabezado tipo "COSTO TOTAL" del Excel
/// "estado de cuenta"). Espeja `public.obra_presupuesto` de Supabase
/// (migración 0008_control_pagos_obra.sql). Ej.: Construcción 344 m² ×
/// 14500 ; Barda 35 m² × 7000 ; Alberca 450000 ; Demolición 240000.
@DataClassName('ObraPresupuestoRow')
class ObraPresupuesto extends Table with SyncCols {
  TextColumn get id => text()();
  TextColumn get obraId => text()();
  TextColumn get concepto => text().withDefault(const Constant(''))();
  /// Sección a la que pertenece la partida (heredada de la cotización de
  /// origen). Vacío para presupuestos capturados/importados sin secciones.
  TextColumn get seccion => text().withDefault(const Constant(''))();
  TextColumn get unidad => text().withDefault(const Constant(''))();
  RealColumn get cantidad => real().withDefault(const Constant(1))();
  RealColumn get precioUnitario => real().withDefault(const Constant(0))();
  IntColumn get orden => integer().withDefault(const Constant(0))();

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
