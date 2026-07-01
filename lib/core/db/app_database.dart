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
  ObraColaborador,
  Asistencias,
  Destajos,
  Cotizaciones,
  Secciones,
  Partidas,
  Pagos,
  Movimientos,
  CatalogoConceptos,
  ArchivosCotizacion,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  /// Constructor para tests (DB en memoria).
  AppDatabase.forTesting(super.e);

  static const _uuid = Uuid();

  @override
  int get schemaVersion => 3;

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
        //   3. Genera un snapshot del esquema y prueba la migración:
        //        dart run drift_dev schema dump lib/core/db/app_database.dart \
        //          drift_schemas/
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
        },
      );

  /// Instala, por tabla, un trigger `AFTER UPDATE` que marca la fila como
  /// `pending` y refresca `updated_at` cuando la app edita datos. La condición
  /// `NEW.sync_status = OLD.sync_status` evita dispararse en las escrituras del
  /// propio sync (push marca `synced`, soft-delete marca `pending`: ambos
  /// CAMBIAN sync_status). Idempotente (recrea los triggers).
  Future<void> _instalarTriggersSync() async {
    const nowExpr = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
    for (final t in allTables) {
      final name = t.actualTableName;
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
  /// Sella `empresa_id` en todas las filas locales que aún no lo tienen (creadas
  /// offline antes del login) y las marca `pending` para que el push las suba.
  /// Idempotente: solo toca filas con `empresa_id` vacío.
  Future<void> sellarEmpresaId(String empresaId) async {
    const tablas = [
      'obras',
      'puestos',
      'colaboradores',
      'obra_colaborador',
      'asistencias',
      'destajos',
      'cotizaciones',
      'secciones',
      'partidas',
      'pagos',
      'movimientos',
      'catalogo_conceptos',
      'archivos_cotizacion',
    ];
    final now = DateTime.now().millisecondsSinceEpoch;
    await transaction(() async {
      for (final t in tablas) {
        await customStatement(
          "UPDATE $t SET empresa_id = ?, updated_at = ?, sync_status = 'pending' "
          "WHERE empresa_id = '' OR empresa_id IS NULL",
          [empresaId, now],
        );
      }
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
