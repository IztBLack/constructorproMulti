import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/db/app_database.dart';

/// Repositorios delgados sobre Drift, espejo de la capa `domain/` del proyecto
/// Kotlin. Aíslan a la UI de las consultas SQL.

class ObraRepository {
  final AppDatabase db;
  ObraRepository(this.db);

  Stream<List<Obra>> watchAll() => (db.select(db.obras)
        ..where((t) => t.deletedAt.isNull())
        ..orderBy([
          (t) => OrderingTerm(expression: t.orden),
          (t) => OrderingTerm(expression: t.nombre),
        ]))
      .watch();

  Future<void> upsert(ObrasCompanion obra) =>
      db.into(db.obras).insertOnConflictUpdate(obra);

  /// Baja lógica (tombstone) EN CASCADA: la obra + sus movimientos, asistencias,
  /// destajos, relaciones de equipo (obra_colaborador) y partidas de
  /// presupuesto (obra_presupuesto). Así no quedan filas huérfanas ocultas ni
  /// el sync las resucita. Nunca borrado físico.
  /// No toca la cotización de origen (vive por su cuenta).
  Future<void> delete(String id) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.transaction(() async {
      await (db.update(db.movimientos)..where((t) => t.obraId.equals(id)))
          .write(MovimientosCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
      await (db.update(db.asistencias)..where((t) => t.obraId.equals(id)))
          .write(AsistenciasCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
      await (db.update(db.destajos)..where((t) => t.obraId.equals(id)))
          .write(DestajosCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
      await (db.update(db.obraColaborador)..where((t) => t.obraId.equals(id)))
          .write(ObraColaboradorCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
      await (db.update(db.obraPresupuesto)..where((t) => t.obraId.equals(id)))
          .write(ObraPresupuestoCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
      await (db.update(db.obras)..where((t) => t.id.equals(id)))
          .write(ObrasCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
              syncStatus: const Value('pending')));
    });
  }

  /// Archiva (archivada=true → activa=false) o reactiva (archivada=false →
  /// activa=true) una obra. Espejo del "archivar" de la web.
  ///
  /// A diferencia de [delete] NO es una baja lógica ni arrastra el historial:
  /// solo cambia el estado de la obra —es reversible—, por eso no hay cascada
  /// ni tombstone, solo se toca `activa`. Marca las mismas columnas de sync que
  /// [delete] (`updatedAt`, `syncStatus`) para que el push suba el cambio como
  /// cualquier otra edición.
  Future<void> setArchivada(String id, bool archivada) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.obras)..where((t) => t.id.equals(id))).write(
      ObrasCompanion(
        activa: Value(!archivada),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }
}

class PuestoRepository {
  final AppDatabase db;
  PuestoRepository(this.db);

  Stream<List<Puesto>> watchAll() => (db.select(db.puestos)
        ..where((t) => t.deletedAt.isNull())
        ..orderBy([
          (t) => OrderingTerm(expression: t.orden),
          (t) => OrderingTerm(expression: t.nombre),
        ]))
      .watch();

  Future<List<Puesto>> getAll() =>
      (db.select(db.puestos)..where((t) => t.deletedAt.isNull())).get();

  Future<void> upsert(PuestosCompanion puesto) =>
      db.into(db.puestos).insertOnConflictUpdate(puesto);

  Future<void> delete(String id) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.puestos)..where((t) => t.id.equals(id))).write(
      PuestosCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }
}

class ColaboradorRepository {
  final AppDatabase db;
  ColaboradorRepository(this.db);

  Stream<List<Colaborador>> watchAll() =>
      (db.select(db.colaboradores)
            ..where((t) => t.deletedAt.isNull())
            ..orderBy([
              (t) => OrderingTerm(expression: t.orden),
              (t) => OrderingTerm(expression: t.nombre),
            ]))
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
          db.obraColaborador.deletedAt.isNull() &
          db.colaboradores.deletedAt.isNull() &
          db.colaboradores.activo.equals(true));
    return query
        .map((row) => row.readTable(db.colaboradores))
        .watch();
  }

  Future<void> upsert(ColaboradoresCompanion colaborador) =>
      db.into(db.colaboradores).insertOnConflictUpdate(colaborador);

  // ── Sueldo ────────────────────────────────────────────────────────────────
  // Vive en `colaborador_sueldo`, tabla aparte, por permisos: la RLS filtra
  // filas y no columnas, así que era la única forma de que el rol `colaborador`
  // pueda leer los NOMBRES de sus compañeros (los necesita para el pase de
  // lista) sin leer lo que cobran. En un dispositivo sin ese permiso el pull no
  // baja nada y estos métodos devuelven vacío, que es el comportamiento
  // correcto: la nómina cae al salario del puesto.

  /// `colaboradorId → sueldo`, reactivo. Mapa y no lista porque todos los
  /// consumidores lo usan para buscar por id.
  Stream<Map<String, ColaboradorSueldoRow>> watchSueldos() =>
      (db.select(db.colaboradorSueldo)..where((t) => t.deletedAt.isNull()))
          .watch()
          .map((filas) => {for (final f in filas) f.colaboradorId: f});

  /// Sueldo de una persona; null si no tiene capturado (o no hay permiso).
  Future<ColaboradorSueldoRow?> sueldoDe(String colaboradorId) =>
      (db.select(db.colaboradorSueldo)
            ..where((t) => t.colaboradorId.equals(colaboradorId))
            ..where((t) => t.deletedAt.isNull()))
          .getSingleOrNull();

  /// Lectura puntual del mapa completo (para exportar y para los PDF, que no
  /// necesitan un stream).
  Future<Map<String, ColaboradorSueldoRow>> sueldos() =>
      (db.select(db.colaboradorSueldo)..where((t) => t.deletedAt.isNull()))
          .get()
          .then((filas) => {for (final f in filas) f.colaboradorId: f});

  Future<void> upsertSueldo(ColaboradorSueldoCompanion sueldo) =>
      db.into(db.colaboradorSueldo).insertOnConflictUpdate(sueldo);

  Future<void> delete(String id) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.update(db.colaboradores)..where((t) => t.id.equals(id))).write(
      ColaboradoresCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }

  /// Activa/desactiva (baja lógica) un colaborador.
  Future<void> setActivo(String id, bool activo) =>
      (db.update(db.colaboradores)..where((t) => t.id.equals(id)))
          .write(ColaboradoresCompanion(activo: Value(activo)));

  // --- Alta por nombre desde el pase de lista ---

  /// Nombre del puesto que marca a quien se dio de alta a las prisas, en campo.
  /// Misma cadena que la web (`equipo/actions.ts`): si divergen, cada plataforma
  /// contaría como incompletos a gente distinta.
  static const puestoPorDefinir = 'Por definir';

  /// Busca el puesto placeholder; lo crea la primera vez que hace falta.
  ///
  /// `puestoId` es NOT NULL y de él sale el salario cuando la persona no tiene
  /// sueldo propio, así que "crear solo con el nombre" necesita un puesto real.
  /// Va con salario 0 a propósito: el error queda RUIDOSO —esa persona sale en
  /// la raya sin dinero— en vez de esconderse tras un número inventado que se
  /// ve correcto y nadie revisa.
  Future<String> _idPuestoPorDefinir(String empresaId) async {
    final existente = await (db.select(db.puestos)
          ..where((t) => t.nombre.equals(puestoPorDefinir) & t.deletedAt.isNull()))
        .getSingleOrNull();
    if (existente != null) return existente.id;

    final id = const Uuid().v4();
    final ahora = DateTime.now().millisecondsSinceEpoch;
    await db.into(db.puestos).insert(PuestosCompanion.insert(
          id: id,
          nombre: puestoPorDefinir,
          salarioDiaDefault: const Value(0),
          empresaId: Value(empresaId),
          createdAt: Value(ahora),
          updatedAt: Value(ahora),
        ));
    return id;
  }

  /// Da de alta a alguien SOLO con su nombre y lo asigna a una obra, para no
  /// detener el pase de lista cuando llega quien no estaba registrado. Devuelve
  /// su id. Puesto, sueldo y contacto quedan pendientes.
  Future<String> crearPorNombre({
    required String nombre,
    required String obraId,
    required String empresaId,
  }) async {
    final id = const Uuid().v4();
    final ahora = DateTime.now().millisecondsSinceEpoch;

    await upsert(ColaboradoresCompanion.insert(
      id: id,
      nombre: nombre.trim(),
      puestoId: await _idPuestoPorDefinir(empresaId),
      tipoPago: 'DIA',
      empresaId: Value(empresaId),
      createdAt: Value(ahora),
      updatedAt: Value(ahora),
    ));

    await asignarObra(obraId: obraId, colaboradorId: id);
    return id;
  }

  /// Quienes quedaron a medio registrar, en vivo. "Incompleto" = tiene el puesto
  /// placeholder; es una definición consultable y no una heurística. NO se
  /// cuenta "sin sueldo" porque un sueldo vacío es legítimo: la nómina cae al
  /// del puesto.
  Stream<List<Colaborador>> watchIncompletos() {
    final q = db.select(db.colaboradores).join([
      innerJoin(db.puestos, db.puestos.id.equalsExp(db.colaboradores.puestoId)),
    ])
      ..where(db.puestos.nombre.equals(puestoPorDefinir) &
          db.colaboradores.activo.equals(true) &
          db.colaboradores.deletedAt.isNull())
      ..orderBy([OrderingTerm(expression: db.colaboradores.nombre)]);

    return q.watch().map((filas) => filas.map((f) => f.readTable(db.colaboradores)).toList());
  }

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
          db.obraColaborador.deletedAt.isNull() &
          db.obras.deletedAt.isNull() &
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
          db.obraColaborador.deletedAt.isNull() &
          db.obras.deletedAt.isNull() &
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
      ..where(db.obraColaborador.colaboradorId.equals(colaboradorId) &
          db.obraColaborador.deletedAt.isNull() &
          db.obras.deletedAt.isNull());
    final rows = await q.get();
    return rows
        .map((r) => (
              rel: r.readTable(db.obraColaborador),
              obra: r.readTable(db.obras),
            ))
        .toList();
  }
}
