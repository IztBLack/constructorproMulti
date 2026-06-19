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
