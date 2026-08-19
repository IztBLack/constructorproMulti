import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../data/tables/tables.dart';

part 'app_database.g.dart';

@DriftDatabase(tables: [
  Obras,
  Puestos,
  Colaboradores,
  ColaboradorSueldo,
  ObraColaborador,
  Asistencias,
  Destajos,
  Cuadrillas,
  CuadrillaMiembro,
  AsignacionCuadrillaObra,
  Cotizaciones,
  Secciones,
  Partidas,
  Pagos,
  Movimientos,
  CatalogoConceptos,
  ArchivosCotizacion,
  ObraPresupuesto,
  ObraCajaNota,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  /// Constructor para tests (DB en memoria).
  AppDatabase.forTesting(super.e);

  static const _uuid = Uuid();

  @override
  int get schemaVersion => 10;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        beforeOpen: (details) async {
          // Seguridad: los triggers de sync hacen un UPDATE interno; con triggers
          // recursivos apagados (default de SQLite) no se re-disparan.
          await customStatement('PRAGMA recursive_triggers = OFF');
        },
        onCreate: (m) async {
          await m.createAll();
          await _seedInicial();
          await _instalarTriggersSync();
        },
        // Punto ÚNICO de migraciones. La BD es 100% local: si cambias el esquema
        // sin un paso aquí, los usuarios PIERDEN sus datos al actualizar.
        // Al modificar cualquier tabla:
        //   1. Sube `schemaVersion` (de 1 a 2, etc.).
        //   2. Agrega el paso incremental correspondiente, p. ej.:
        //        if (from < 2) await m.addColumn(obras, obras.comentario);
        //   3. Genera el snapshot del esquema Y las clases de prueba. Son DOS
        //      comandos: olvidar el segundo fue lo que dejó la migración v8→v9
        //      sin una sola prueba durante meses.
        //        dart run drift_dev schema dump lib/core/db/app_database.dart \
        //          drift_schemas/
        //        dart run drift_dev schema generate drift_schemas/ \
        //          test/generated_migrations/
        //   4. Agrega `test/data/migration_desde_v<anterior>_test.dart`, calcado
        //      del último. Los que ya existen apuntan a `db.schemaVersion`, así
        //      que no hay que tocarlos al subir de versión.
        // Nunca borres ni recrees tablas con datos del usuario.
        onUpgrade: (m, from, to) async {
          // v1 → v2 (Fase 0 sync): añade columnas de sync a las 13 tablas.
          // Todas con default → addColumn no requiere backfill. Las filas
          // previas quedan con updatedAt=0 (se empujarán al primer sync).
          if (from < 2) {
            final tablas = <TableInfo>[
              obras,
              puestos,
              colaboradores,
              obraColaborador,
              asistencias,
              destajos,
              cotizaciones,
              secciones,
              partidas,
              pagos,
              movimientos,
              catalogoConceptos,
              archivosCotizacion,
            ];
            for (final t in tablas) {
              final cols = t.$columns;
              for (final name in const [
                'empresa_id',
                'created_at',
                'updated_at',
                'server_updated_at',
                'deleted_at',
                'sync_status',
              ]) {
                final col = cols.firstWhere((c) => c.name == name);
                await m.addColumn(t, col);
              }
            }
            // Sello createdAt/updatedAt = ahora para las filas existentes,
            // así no quedan en epoch 0.
            final now = DateTime.now().millisecondsSinceEpoch;
            for (final t in tablas) {
              await customStatement(
                'UPDATE ${t.actualTableName} '
                'SET created_at = $now, updated_at = $now '
                'WHERE created_at = 0',
              );
            }
          }
          // v2 → v3 (Fase 2): triggers que marcan `pending` en cada edición de
          // la app, para que el sync propague también las EDICIONES (no solo
          // altas/borrados).
          if (from < 3) {
            await _instalarTriggersSync();
          }
          // v3 → v4: sueldo por periodo en colaboradores (espeja la web). El
          // diario (salario_personalizado) pasa a DERIVARSE de estos campos.
          // Columnas con default → addColumn sin backfill; las filas previas
          // quedan MENSUAL / 6 días / salario_periodo NULL y conservan su
          // salario_personalizado hasta que se reediten.
          if (from < 4) {
            final hasPeriodo = await m.database.customSelect(
              "SELECT 1 FROM pragma_table_info('colaboradores') WHERE name='periodo_pago'"
            ).get().then((rows) => rows.isNotEmpty);

            // SQL crudo y no `m.addColumn(colaboradores, …)`: estas tres
            // columnas dejaron de existir en `Colaboradores` al mudarse a
            // `colaborador_sueldo` (v10), y un paso histórico no puede depender
            // de la forma ACTUAL de la tabla. Referenciarlas ni siquiera
            // compilaría. Un usuario que salte de v3 a v10 pasa por aquí: se le
            // crean y en el paso v10 se le mudan.
            if (!hasPeriodo) {
              await customStatement(
                "ALTER TABLE colaboradores ADD COLUMN periodo_pago TEXT NOT NULL DEFAULT 'MENSUAL'",
              );
              await customStatement(
                'ALTER TABLE colaboradores ADD COLUMN salario_periodo REAL NULL',
              );
              await customStatement(
                'ALTER TABLE colaboradores ADD COLUMN dias_semana INTEGER NOT NULL DEFAULT 6',
              );
            }
            // Recrea los triggers para que incluyan las columnas nuevas.
            await _instalarTriggersSync();
          }
          // v4 → v5: importación de estado de cuenta (Excel/CSV). `nombre` en
          // movimientos (beneficiario/pagador) + tabla obra_presupuesto
          // (partidas del contrato, espeja Supabase 0008_control_pagos_obra).
          if (from < 5) {
            final hasNombre = await m.database.customSelect(
              "SELECT 1 FROM pragma_table_info('movimientos') WHERE name='nombre'"
            ).get().then((rows) => rows.isNotEmpty);
            
            if (!hasNombre) {
              await m.addColumn(movimientos, movimientos.nombre);
            }

            final hasObraPresupuesto = await m.database.customSelect(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name='obra_presupuesto'"
            ).get().then((rows) => rows.isNotEmpty);

            if (!hasObraPresupuesto) {
              await m.createTable(obraPresupuesto);
            }
            // Recrea los triggers para que incluyan la columna/tabla nuevas.
            await _instalarTriggersSync();
          }
          // v5 → v6 (Fase 3 puente): `seccion` en obra_presupuesto para que el
          // presupuesto de obra conserve las secciones de la cotización de
          // origen (espeja Supabase 0012). Aditivo con default → sin backfill.
          if (from < 6) {
            final hasSeccion = await m.database.customSelect(
              "SELECT 1 FROM pragma_table_info('obra_presupuesto') WHERE name='seccion'"
            ).get().then((rows) => rows.isNotEmpty);

            if (!hasSeccion) {
              await m.addColumn(obraPresupuesto, obraPresupuesto.seccion);
            }
            // Recrea los triggers para que incluyan la columna nueva.
            await _instalarTriggersSync();
          }
          // v6 → v7: cuadrillas. Tablas nuevas (cuadrillas, cuadrilla_miembro,
          // asignacion_cuadrilla_obra) + columna `cuadrilla_id` nullable en
          // asistencias y destajos. Todo ADITIVO: createTable + addColumn con
          // default/nullable → sin backfill; las filas previas quedan intactas.
          if (from < 7) {
            Future<bool> tablaExiste(String name) => m.database
                .customSelect(
                  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$name'",
                )
                .get()
                .then((rows) => rows.isNotEmpty);
            Future<bool> columnaExiste(String tabla, String col) => m.database
                .customSelect(
                  "SELECT 1 FROM pragma_table_info('$tabla') WHERE name='$col'",
                )
                .get()
                .then((rows) => rows.isNotEmpty);

            if (!await tablaExiste('cuadrillas')) {
              await m.createTable(cuadrillas);
            }
            if (!await tablaExiste('cuadrilla_miembro')) {
              await m.createTable(cuadrillaMiembro);
            }
            if (!await tablaExiste('asignacion_cuadrilla_obra')) {
              await m.createTable(asignacionCuadrillaObra);
            }
            if (!await columnaExiste('asistencias', 'cuadrilla_id')) {
              await m.addColumn(asistencias, asistencias.cuadrillaId);
            }
            if (!await columnaExiste('destajos', 'cuadrilla_id')) {
              await m.addColumn(destajos, destajos.cuadrillaId);
            }
            // Recrea los triggers para cubrir las tablas/columnas nuevas
            // (createTable NO instala el trigger mark_pending).
            await _instalarTriggersSync();
          }
          // v7 → v8 (capa de tesorería, paridad web 0017/0023/0024):
          //   · cotizaciones.iva_porcentaje  → IVA congelado por cotización.
          //   · movimientos.comprobante_uri  → ruta del comprobante en Storage.
          //   · obra_caja_nota (tabla nueva) → nota de conciliación por obra.
          // Todo ADITIVO: addColumn con default/nullable + createTable → sin
          // backfill; las filas previas quedan intactas (iva_porcentaje = 16,
          // comprobante_uri = NULL). Idempotente: verifica existencia primero.
          if (from < 8) {
            Future<bool> columnaExiste(String tabla, String col) => m.database
                .customSelect(
                  "SELECT 1 FROM pragma_table_info('$tabla') WHERE name='$col'",
                )
                .get()
                .then((rows) => rows.isNotEmpty);
            Future<bool> tablaExiste(String name) => m.database
                .customSelect(
                  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$name'",
                )
                .get()
                .then((rows) => rows.isNotEmpty);

            if (!await columnaExiste('cotizaciones', 'iva_porcentaje')) {
              await m.addColumn(cotizaciones, cotizaciones.ivaPorcentaje);
            }
            if (!await columnaExiste('movimientos', 'comprobante_uri')) {
              await m.addColumn(movimientos, movimientos.comprobanteUri);
            }
            if (!await tablaExiste('obra_caja_nota')) {
              await m.createTable(obraCajaNota);
            }
            // Recrea los triggers para cubrir la tabla/columnas nuevas
            // (createTable NO instala el trigger mark_pending).
            await _instalarTriggersSync();
          }
          // v8 → v9 (orden personalizado, paridad web 0026): columna `orden`
          // (bigint, default 0) en las 7 tablas reordenables a mano. Aditivo con
          // default → addColumn sin backfill; las filas previas quedan orden=0 y
          // conservan su orden natural (nombre/fecha) hasta el primer arrastre.
          // El MODO (nombre|personalizado) NO se guarda aquí: vive en
          // empresa_config.ui_orden (Supabase), que el móvil lee directo + caché.
          if (from < 9) {
            Future<bool> columnaExiste(String tabla, String col) => m.database
                .customSelect(
                  "SELECT 1 FROM pragma_table_info('$tabla') WHERE name='$col'",
                )
                .get()
                .then((rows) => rows.isNotEmpty);

            final reordenables = <TableInfo>[
              cuadrillas,
              cuadrillaMiembro,
              colaboradores,
              obras,
              cotizaciones,
              puestos,
              catalogoConceptos,
            ];
            for (final t in reordenables) {
              if (!await columnaExiste(t.actualTableName, 'orden')) {
                final col = t.$columns.firstWhere((c) => c.name == 'orden');
                await m.addColumn(t, col);
              }
            }
            // Recrea los triggers para que el UPDATE de `orden` marque pending y
            // el sync propague la posición nueva.
            await _instalarTriggersSync();
          }
          // v9 → v10 (SEGURIDAD, paridad Supabase 0027): el SUELDO sale de
          // `colaboradores` a su propia tabla `colaborador_sueldo`.
          //
          // No es modelado, es permisos: la RLS filtra filas y no columnas, así
          // que mientras el sueldo viviera en `colaboradores` no había manera de
          // dejar que el rol `colaborador` leyera los nombres de sus compañeros
          // —los necesita para el pase de lista— sin dejarle leer lo que cobran.
          // Con la tabla aparte, el pull no le baja nada y el dato NUNCA llega a
          // su teléfono. Ver `supabase/migrations/0027_sueldo_tabla_aparte.sql`.
          if (from < 10) {
            if (!await _tablaExiste('colaborador_sueldo')) {
              await m.createTable(colaboradorSueldo);
            }

            // Copia solo a quien tiene sueldo capturado: una fila vacía por cada
            // colaborador no aporta nada y se subiría al servidor en el push.
            // `INSERT OR IGNORE` para que reintentar la migración sea inocuo.
            if (await _columnaExiste('colaboradores', 'salario_periodo')) {
              final now = DateTime.now().millisecondsSinceEpoch;
              await customStatement(
                'INSERT OR IGNORE INTO colaborador_sueldo ('
                '  colaborador_id, salario_personalizado, periodo_pago,'
                '  salario_periodo, dias_semana,'
                '  empresa_id, created_at, updated_at, server_updated_at,'
                '  deleted_at, sync_status'
                ') SELECT '
                '  id, salario_personalizado,'
                "  COALESCE(periodo_pago, 'MENSUAL'), salario_periodo,"
                '  COALESCE(dias_semana, 6),'
                '  empresa_id, COALESCE(created_at, $now), $now, NULL,'
                "  NULL, 'pending'"
                ' FROM colaboradores'
                ' WHERE deleted_at IS NULL'
                '   AND (salario_personalizado IS NOT NULL'
                '        OR salario_periodo IS NOT NULL)',
              );

              // Y ahora sí, fuera de `colaboradores`. SQLite no sabe soltar
              // varias columnas de un golpe: `alterTable` reconstruye la tabla
              // con la forma nueva y copia el resto de los datos.
              await m.alterTable(TableMigration(colaboradores));
            }

            // `createTable` y `alterTable` NO instalan el trigger mark_pending, y
            // la reconstrucción de `colaboradores` se lleva por delante el suyo.
            // Sin esto, editar a alguien dejaría de marcarlo `pending` y sus
            // cambios no volverían a subir jamás.
            await _instalarTriggersSync();
          }
        },
      );

  /// ¿Existe esta tabla en la base local?
  Future<bool> _tablaExiste(String nombre) => customSelect(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$nombre'",
      ).get().then((rows) => rows.isNotEmpty);

  /// ¿Existe esta columna en esta tabla?
  Future<bool> _columnaExiste(String tabla, String col) => customSelect(
        "SELECT 1 FROM pragma_table_info('$tabla') WHERE name='$col'",
      ).get().then((rows) => rows.isNotEmpty);

  /// Instala, por tabla, un trigger `AFTER UPDATE` que marca la fila como
  /// `pending` y refresca `updated_at` cuando la app edita datos. La condición
  /// `NEW.sync_status = OLD.sync_status` evita dispararse en las escrituras del
  /// propio sync (push marca `synced`, soft-delete marca `pending`: ambos
  /// CAMBIAN sync_status). Idempotente (recrea los triggers).
  Future<void> _instalarTriggersSync() async {
    const nowExpr = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
    
    final existingTables = await customSelect(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).get().then((rows) => rows.map((r) => r.read<String>('name')).toSet());

    for (final t in allTables) {
      final name = t.actualTableName;
      if (!existingTables.contains(name)) continue;

      final pk = t.$primaryKey.map((c) => c.name).toList();
      if (pk.isEmpty) continue;
      final pkWhere = pk.map((c) => '$c = NEW.$c').join(' AND ');
      await customStatement('DROP TRIGGER IF EXISTS trg_${name}_mark_pending');
      await customStatement(
        'CREATE TRIGGER trg_${name}_mark_pending '
        'AFTER UPDATE ON $name '
        'WHEN NEW.sync_status = OLD.sync_status '
        'BEGIN '
        "UPDATE $name SET sync_status = 'pending', updated_at = $nowExpr "
        'WHERE $pkWhere; '
        'END',
      );
    }
  }

  // ---------------- Obras ----------------
  Stream<List<Obra>> watchObras() => (select(obras)
        ..where((t) => t.deletedAt.isNull())
        ..orderBy([(t) => OrderingTerm(expression: t.nombre)]))
      .watch();

  Future<void> upsertObra(ObrasCompanion obra) =>
      into(obras).insertOnConflictUpdate(obra);

  Future<void> deleteObra(String id) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (update(obras)..where((t) => t.id.equals(id))).write(
      ObrasCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }

  Future<int> contarObras() async {
    final count = countAll();
    final q = selectOnly(obras)
      ..addColumns([count])
      ..where(obras.deletedAt.isNull());
    return (await q.getSingle()).read(count) ?? 0;
  }

  // ---------------- Catálogo ----------------
  Future<int> contarCatalogo() async {
    final count = countAll();
    final q = selectOnly(catalogoConceptos)
      ..addColumns([count])
      ..where(catalogoConceptos.deletedAt.isNull());
    return (await q.getSingle()).read(count) ?? 0;
  }

  // ---------------- Sync nube ----------------
  /// Sella `empresa_id` en las filas locales que NO pertenecen a la empresa
  /// actual (creadas offline sin empresa, o cacheadas de una empresa anterior
  /// ya borrada) y las marca `pending` para que el push las suba a la empresa
  /// vigente. Idempotente: las filas que ya son de `empresaId` no se tocan.
  ///
  /// Cubre el caso de reset de BD en la nube: los datos locales quedaban con el
  /// `empresa_id` viejo → antes no se re-sellaban y no volvían a subir. Ahora sí.
  ///
  /// El catálogo base (seed, `es_personalizado = 0`) NO se sube: se siembra en
  /// el servidor al crear la empresa (RPC `crear_empresa`). Si selláramos y
  /// subiéramos el seed local, cada tableta generaría UUIDs distintos →
  /// duplicados masivos en Supabase. En cambio, los conceptos que el USUARIO
  /// haya creado (`es_personalizado = 1`) SÍ se sellan y suben.
  Future<void> sellarEmpresaId(String empresaId) async {
    const tablas = [
      'obras',
      'puestos',
      'colaboradores',
      'obra_colaborador',
      'asistencias',
      'destajos',
      'cuadrillas',
      'cuadrilla_miembro',
      'asignacion_cuadrilla_obra',
      'cotizaciones',
      'secciones',
      'partidas',
      'pagos',
      'movimientos',
      'archivos_cotizacion',
      'obra_presupuesto',
    ];
    final now = DateTime.now().millisecondsSinceEpoch;
    await transaction(() async {
      for (final t in tablas) {
        await customStatement(
          "UPDATE $t SET empresa_id = ?, updated_at = ?, sync_status = 'pending' "
          "WHERE empresa_id IS NULL OR empresa_id != ?",
          [empresaId, now, empresaId],
        );
      }
      // catalogo_conceptos: solo los personalizados del usuario, nunca el seed.
      await customStatement(
        "UPDATE catalogo_conceptos SET empresa_id = ?, updated_at = ?, sync_status = 'pending' "
        "WHERE (empresa_id IS NULL OR empresa_id != ?) AND es_personalizado = 1",
        [empresaId, now, empresaId],
      );
    });
  }

  /// Siembra el catálogo base desde el asset JSON la primera vez.
  Future<void> _seedInicial() async {
    final raw = await rootBundle.loadString('assets/catalogo_base.json');
    final List<dynamic> data = json.decode(raw) as List<dynamic>;
    await batch((b) {
      for (final item in data) {
        final m = item as Map<String, dynamic>;
        b.insert(
          catalogoConceptos,
          CatalogoConceptosCompanion.insert(
            id: _uuid.v4(),
            clave: m['clave'] as String,
            descripcion: m['descripcion'] as String,
            unidad: m['unidad'] as String,
            precioUnitarioDefault: Value(
                (m['precioUnitarioDefault'] as num).toDouble()),
            categoria: m['categoria'] as String,
          ),
        );
      }
    });
  }
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'constructorpro.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}
