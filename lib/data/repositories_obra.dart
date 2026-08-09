import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';
import '../domain/import/import_models.dart' show ExcelMovimiento;

const _uuid = Uuid();

/// Repositorios de la operación por obra: asistencia, destajos y flujo de caja.

/// Una asistencia que el servidor rechazó por la regla de "1 jornada/día",
/// con los nombres ya resueltos para poder explicarla sin mostrar UUIDs.
class ConflictoAsistencia {
  const ConflictoAsistencia({
    required this.id,
    required this.colaboradorId,
    required this.colaborador,
    required this.obraLocal,
    required this.obraId,
    required this.fecha,
    required this.fraccion,
    this.obraRival,
    this.fraccionRival,
  });

  final String id;
  final String colaboradorId;
  final String colaborador;

  /// Obra del registro capturado en ESTE dispositivo (el que no pudo subir).
  final String obraLocal;
  final String obraId;
  final DateTime fecha;
  final double fraccion;

  /// El registro que YA ocupa la jornada (el de la nube). Null si en esta base
  /// no está —p. ej. aún no bajó—, caso en que la UI lo dice en vez de inventarlo.
  final String? obraRival;
  final double? fraccionRival;
}

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

  /// Asistencias que el servidor rechazó por la regla de "1 jornada/día"
  /// (`sync_status='conflict'`), ya resueltas a nombres para la pantalla de
  /// conflictos. Reactivo: al resolver una, la lista se actualiza sola.
  ///
  /// El `LEFT JOIN` sobre obras/colaboradores es deliberado: si el padre no
  /// bajó todavía a este dispositivo, se muestra el conflicto con un nombre
  /// provisional en vez de esconder la fila (esconderla dejaría al usuario con
  /// un contador que no puede vaciar).
  /// El registro RIVAL (el que ya ocupa la jornada, normalmente bajado del
  /// servidor por el pull) se resuelve con subconsultas sobre la MISMA base
  /// local: así la pantalla puede explicar "en la nube tienes X, aquí Y" sin
  /// pedir red, que es justo lo que falta cuando el usuario está en obra.
  Stream<List<ConflictoAsistencia>> watchConflictos() {
    const rivalWhere = '''
        FROM asistencias a2
        LEFT JOIN obras o2 ON o2.id = a2.obra_id
       WHERE a2.colaborador_id = a.colaborador_id
         AND a2.fecha          = a.fecha
         AND a2.obra_id       <> a.obra_id
         AND a2.deleted_at IS NULL
         AND a2.sync_status <> 'conflict'
       ORDER BY a2.fraccion DESC
       LIMIT 1''';
    return db.customSelect(
      '''
      SELECT a.id, a.fecha, a.fraccion, a.obra_id, a.colaborador_id,
             COALESCE(c.nombre, 'Colaborador desconocido') AS colaborador,
             COALESCE(o.nombre, 'Obra desconocida')        AS obra,
             (SELECT COALESCE(o2.nombre, 'otra obra') $rivalWhere) AS rival_obra,
             (SELECT a2.fraccion $rivalWhere)                      AS rival_fraccion
        FROM asistencias a
        LEFT JOIN colaboradores c ON c.id = a.colaborador_id
        LEFT JOIN obras o         ON o.id = a.obra_id
       WHERE a.sync_status = 'conflict' AND a.deleted_at IS NULL
       ORDER BY a.fecha DESC
      ''',
      readsFrom: {db.asistencias, db.colaboradores, db.obras},
    ).watch().map((rows) => rows
        .map((r) => ConflictoAsistencia(
              id: r.read<String>('id'),
              colaboradorId: r.read<String>('colaborador_id'),
              colaborador: r.read<String>('colaborador'),
              obraLocal: r.read<String>('obra'),
              obraId: r.read<String>('obra_id'),
              fecha: DateTime.fromMillisecondsSinceEpoch(r.read<int>('fecha')),
              fraccion: r.read<double>('fraccion'),
              obraRival: r.readNullable<String>('rival_obra'),
              fraccionRival: r.readNullable<double>('rival_fraccion'),
            ))
        .toList());
  }

  /// "Subir": este registro gana y REEMPLAZA al que ocupa la jornada.
  ///
  /// No borra nada en el servidor a mano: da de baja al rival con el mismo
  /// tombstone que usa toda la app (`deleted_at` + `pending`) y deja el propio
  /// registro en `pending`. El push sube primero las bajas (ver
  /// [SyncService.sqlCandidatosPush]), así el servidor ya tiene la jornada
  /// libre cuando llega este registro. Ambas escrituras van en una transacción
  /// para no dejar el día sin ninguna asistencia si algo falla en medio.
  /// Se usa `customUpdate` (no `customStatement`) para que Drift notifique la
  /// tabla y la pantalla de conflictos se vacíe al resolver: con
  /// `customStatement` la escritura ocurre pero el `.watch()` no se re-emite y
  /// la tarjeta resuelta se queda pegada en pantalla.
  Future<void> reemplazarConConflicto(ConflictoAsistencia c) {
    final ahora = DateTime.now().millisecondsSinceEpoch;
    final fecha = c.fecha.millisecondsSinceEpoch;
    return db.transaction(() async {
      await db.customUpdate(
        "UPDATE asistencias SET deleted_at = ?, sync_status = 'pending' "
        "WHERE colaborador_id = ? AND fecha = ? AND obra_id <> ? "
        "AND deleted_at IS NULL AND sync_status <> 'conflict'",
        variables: [
          Variable(ahora),
          Variable(c.colaboradorId),
          Variable(fecha),
          Variable(c.obraId),
        ],
        updates: {db.asistencias},
      );
      await db.customUpdate(
        "UPDATE asistencias SET sync_status = 'pending' WHERE id = ?",
        variables: [Variable(c.id)],
        updates: {db.asistencias},
      );
    });
  }

  /// "Eliminar": descarta el registro capturado aquí.
  ///
  /// Es la salida LIMPIA de un conflicto, y la diferencia con [omitirConflicto]
  /// importa para la nómina: `omitir` deja la fila viva en local, así que el día
  /// sigue sumando 2 jornadas EN ESTE DISPOSITIVO (la nube tiene 1) y el cálculo
  /// local queda inflado. `eliminar` la tombstonea, con lo que desaparece de
  /// todas las consultas de UI y de nómina (filtran `deleted_at IS NULL`) y el
  /// día vuelve a cuadrar con la nube.
  ///
  /// Se marca `skipped` en vez de `pending` a propósito: el servidor nunca
  /// aceptó esta fila, así que no hay nada que dar de baja allá; propagar el
  /// tombstone solo crearía una fila borrada en el servidor y podría volver a
  /// topar con la regla de jornada.
  Future<void> eliminarConflicto(String asistenciaId) => db.customUpdate(
        "UPDATE asistencias SET deleted_at = ?, sync_status = 'skipped' "
        "WHERE id = ?",
        variables: [
          Variable(DateTime.now().millisecondsSinceEpoch),
          Variable(asistenciaId),
        ],
        updates: {db.asistencias},
      );

  /// "Omitir": el registro de la nube se queda y este cambio local se descarta.
  /// Se marca `skipped` (terminal) en vez de borrarse: la fila sigue visible en
  /// los reportes locales, pero deja de pelear por subir y de contar como
  /// conflicto. Es la salida no destructiva del diálogo.
  Future<void> omitirConflicto(String asistenciaId) => db.customUpdate(
        "UPDATE asistencias SET sync_status='skipped' WHERE id = ?",
        variables: [Variable(asistenciaId)],
        updates: {db.asistencias},
      );

  /// Suma de las fracciones que el colaborador ya tiene registradas ese [fecha]
  /// en TODAS las obras EXCEPTO [exceptObraId] (ignora bajas lógicas).
  ///
  /// Espeja el trigger 0016 del servidor, que RECHAZA que un colaborador acumule
  /// más de 1 jornada (suma de `fraccion`) en una misma fecha contando todas las
  /// obras. El móvil llama a esto ANTES de escribir para no crear una fila que la
  /// nube va a rechazar (quedaría en `sync_status='error'`). Se excluye la obra
  /// en curso porque su fracción se va a REEMPLAZAR por el valor nuevo, no a
  /// sumar sobre el anterior.
  Future<double> fraccionOtrasObras(
    String colaboradorId,
    int fecha,
    String exceptObraId,
  ) async {
    final filas = await (db.select(db.asistencias)
          ..where((t) =>
              t.colaboradorId.equals(colaboradorId) &
              t.fecha.equals(fecha) &
              t.obraId.equals(exceptObraId).not() &
              t.deletedAt.isNull()))
        .get();
    return filas.fold<double>(0.0, (suma, a) => suma + a.fraccion);
  }

  /// Registra/actualiza la fracción de un colaborador en un día (índice único).
  /// [cuadrillaId] es opcional y solo ETIQUETA la fila (agrupa el pase de lista
  /// para reportes); no afecta el cálculo de nómina. Se sella con la cuadrilla
  /// vigente del colaborador al momento de capturar.
  Future<void> setFraccion({
    required String obraId,
    required String colaboradorId,
    required int fecha,
    required double fraccion,
    String? cuadrillaId,
  }) async {
    final existing = await (db.select(db.asistencias)
          ..where((t) =>
              t.obraId.equals(obraId) &
              t.colaboradorId.equals(colaboradorId) &
              t.fecha.equals(fecha)))
        .getSingleOrNull();
    if (existing != null) {
      await (db.update(db.asistencias)..where((t) => t.id.equals(existing.id)))
          .write(AsistenciasCompanion(
              fraccion: Value(fraccion), cuadrillaId: Value(cuadrillaId)));
    } else {
      await db.into(db.asistencias).insert(AsistenciasCompanion.insert(
            id: _uuid.v4(),
            colaboradorId: colaboradorId,
            obraId: obraId,
            fecha: fecha,
            fraccion: fraccion,
            cuadrillaId: Value(cuadrillaId),
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
    String? cuadrillaId,
  }) =>
      db.into(db.destajos).insert(DestajosCompanion.insert(
            id: _uuid.v4(),
            colaboradorId: colaboradorId,
            obraId: obraId,
            fecha: fecha,
            concepto: concepto,
            monto: monto,
            cuadrillaId: Value(cuadrillaId),
          ));

  /// Registra una BOLSA de destajo de cuadrilla ya repartida: genera UNA fila de
  /// `destajos` por miembro con su monto, todas etiquetadas con el mismo
  /// [cuadrillaId] y [concepto]. La nómina las suma por colaborador sin cambios
  /// (el destajo sigue siendo por fila; `cuadrilla_id` solo agrupa la bolsa).
  /// El repartidor (UI) garantiza que la suma de montos = total de la bolsa.
  Future<void> registrarBolsaCuadrilla({
    required String obraId,
    required String cuadrillaId,
    required int fecha,
    required String concepto,
    required List<({String colaboradorId, double monto})> reparto,
  }) =>
      db.batch((b) {
        for (final r in reparto) {
          b.insert(
            db.destajos,
            DestajosCompanion.insert(
              id: _uuid.v4(),
              colaboradorId: r.colaboradorId,
              obraId: obraId,
              fecha: fecha,
              concepto: concepto,
              monto: r.monto,
              cuadrillaId: Value(cuadrillaId),
            ),
          );
        }
      });

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

  /// Fija (o limpia, con [uri] null) la ruta del comprobante adjunto de un
  /// movimiento. Escribe `comprobanteUri` + `updatedAt` + `syncStatus:'pending'`
  /// —mismo estilo que [delete]— para que el push a la nube propague el adjunto
  /// como una edición más. La [uri] es la RUTA dentro del bucket privado
  /// `comprobantes` (ver ComprobanteStorage), no una URL; para verlo se pide una
  /// URL firmada al vuelo.
  Future<void> setComprobanteUri(String id, String? uri) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.movimientos)..where((t) => t.id.equals(id))).write(
      MovimientosCompanion(
        comprobanteUri: Value(uri),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }

  /// SOFT-delete de TODOS los movimientos vivos (deletedAt nulo) de una obra.
  /// Marca las mismas tres columnas que [delete] —deletedAt, updatedAt y
  /// syncStatus 'pending'— para que el push a la nube propague el borrado como
  /// una edición más. Devuelve cuántas filas se marcaron (`write` devuelve el
  /// conteo de filas afectadas), útil para el aviso al usuario.
  Future<int> deleteAllByObra(String obraId) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.movimientos)
          ..where((t) => t.obraId.equals(obraId) & t.deletedAt.isNull()))
        .write(
      MovimientosCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }

  /// Revierte un [delete]. Es barato porque el borrado es SUAVE: la fila nunca
  /// se fue, solo se le puso `deletedAt`, así que deshacer es limpiar la marca.
  ///
  /// Escribe exactamente las mismas tres columnas que [delete] —incluido
  /// `syncStatus: 'pending'`— para que el push a la nube trate el "deshacer"
  /// como cualquier otra edición y no haga falta un camino aparte.
  Future<void> restore(String id) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.movimientos)..where((t) => t.id.equals(id))).write(
      MovimientosCompanion(
        deletedAt: const Value(null),
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

/// Nota de conciliación de caja por obra: un texto libre, único por obra (la PK
/// es `obraId`), donde se anota el "por qué" del saldo ("DIFERENCIA A FAVOR…").
class ObraCajaNotaRepository {
  final AppDatabase db;
  ObraCajaNotaRepository(this.db);

  /// La nota de la obra, o null si aún no se ha escrito ninguna.
  Stream<ObraCajaNotaRow?> watch(String obraId) =>
      (db.select(db.obraCajaNota)
            ..where((t) => t.obraId.equals(obraId) & t.deletedAt.isNull()))
          .watchSingleOrNull();

  /// Crea o reemplaza la nota de la obra. Como la PK es `obraId`,
  /// `insertOnConflictUpdate` sirve de upsert sin buscar antes la fila. El
  /// trigger `mark_pending` del esquema marca `sync_status='pending'` solo; no
  /// se toca a mano.
  Future<void> upsert(String obraId, String nota) =>
      db.into(db.obraCajaNota).insertOnConflictUpdate(
            ObraCajaNotaCompanion.insert(obraId: obraId, nota: Value(nota)),
          );
}
