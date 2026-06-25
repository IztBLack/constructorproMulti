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
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await _seedInicial();
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
          // Sin migraciones aún (schemaVersion = 1).
        },
      );

  // ---------------- Obras ----------------
  Stream<List<Obra>> watchObras() =>
      (select(obras)..orderBy([(t) => OrderingTerm(expression: t.nombre)]))
          .watch();

  Future<void> upsertObra(ObrasCompanion obra) =>
      into(obras).insertOnConflictUpdate(obra);

  Future<void> deleteObra(String id) =>
      (delete(obras)..where((t) => t.id.equals(id))).go();

  Future<int> contarObras() async {
    final count = countAll();
    final q = selectOnly(obras)..addColumns([count]);
    return (await q.getSingle()).read(count) ?? 0;
  }

  // ---------------- Catálogo ----------------
  Future<int> contarCatalogo() async {
    final count = countAll();
    final q = selectOnly(catalogoConceptos)..addColumns([count]);
    return (await q.getSingle()).read(count) ?? 0;
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
