import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/domain/import/import_models.dart';
import 'package:constructorpro/domain/import/presupuesto_reconciliation.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

Future<ObraPresupuestoRow> _insertar(
  AppDatabase db, {
  required String id,
  required String concepto,
  String unidad = '',
  double cantidad = 1,
  double precioUnitario = 0,
}) async {
  await db.into(db.obraPresupuesto).insert(ObraPresupuestoCompanion.insert(
        id: id,
        obraId: 'o1',
        concepto: Value(concepto),
        unidad: Value(unidad),
        cantidad: Value(cantidad),
        precioUnitario: Value(precioUnitario),
      ));
  return (db.select(db.obraPresupuesto)..where((t) => t.id.equals(id)))
      .getSingle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('Igual: mismo concepto, cantidad y precioUnitario', () async {
    await _insertar(db,
        id: 'p1',
        concepto: 'Construcción',
        unidad: 'm2',
        cantidad: 344,
        precioUnitario: 14500);
    final existentes = await db.select(db.obraPresupuesto).get();

    const parsed = [
      ExcelPartida(
          concepto: 'Construcción',
          unidad: 'm2',
          cantidad: 344,
          precioUnitario: 14500),
    ];

    final r = reconciliarPresupuesto(existentes: existentes, parsed: parsed);
    expect(r, hasLength(1));
    expect(r.first.estado, EstadoPartida.igual);
  });

  test('Igual: matchea concepto normalizado (espacios/mayúsculas)', () async {
    await _insertar(db,
        id: 'p1',
        concepto: '  construcción   principal ',
        cantidad: 10,
        precioUnitario: 100);
    final existentes = await db.select(db.obraPresupuesto).get();

    const parsed = [
      ExcelPartida(
          concepto: 'CONSTRUCCIÓN PRINCIPAL',
          unidad: '',
          cantidad: 10,
          precioUnitario: 100),
    ];

    final r = reconciliarPresupuesto(existentes: existentes, parsed: parsed);
    expect(r.first.estado, EstadoPartida.igual);
  });

  test('Conflicto: mismo concepto, cantidad distinta', () async {
    await _insertar(db,
        id: 'p1', concepto: 'Barda', cantidad: 35, precioUnitario: 7000);
    final existentes = await db.select(db.obraPresupuesto).get();

    const parsed = [
      ExcelPartida(
          concepto: 'Barda', unidad: 'm2', cantidad: 40, precioUnitario: 7000),
    ];

    final r = reconciliarPresupuesto(existentes: existentes, parsed: parsed);
    expect(r.first.estado, EstadoPartida.conflicto);
    expect(r.first.deArchivo!.cantidad, 40);
    expect(r.first.deObra!.cantidad, 35);
  });

  test('Conflicto: mismo concepto, precioUnitario distinto', () async {
    await _insertar(db,
        id: 'p1', concepto: 'Alberca', cantidad: 1, precioUnitario: 450000);
    final existentes = await db.select(db.obraPresupuesto).get();

    const parsed = [
      ExcelPartida(
          concepto: 'Alberca', unidad: '', cantidad: 1, precioUnitario: 460000),
    ];

    final r = reconciliarPresupuesto(existentes: existentes, parsed: parsed);
    expect(r.first.estado, EstadoPartida.conflicto);
    expect(r.first.deArchivo!.precioUnitario, 460000);
    expect(r.first.deObra!.precioUnitario, 450000);
  });

  test('Nueva: concepto solo existe en el archivo', () async {
    final r = reconciliarPresupuesto(existentes: const [], parsed: const [
      ExcelPartida(
          concepto: 'Demolición', unidad: '', cantidad: 1, precioUnitario: 240000),
    ]);
    expect(r, hasLength(1));
    expect(r.first.estado, EstadoPartida.nueva);
    expect(r.first.deObra, isNull);
  });

  test('SoloPortal: concepto solo existe en la obra, nunca se borra', () async {
    await _insertar(db,
        id: 'p1', concepto: 'Cimentación extra', cantidad: 1, precioUnitario: 50000);
    final existentes = await db.select(db.obraPresupuesto).get();

    final r = reconciliarPresupuesto(existentes: existentes, parsed: const []);
    expect(r, hasLength(1));
    expect(r.first.estado, EstadoPartida.soloPortal);
    expect(r.first.deArchivo, isNull);
    expect(r.first.deObra, isNotNull);
  });

  test('partidas tombstoneadas (deletedAt) no cuentan como existentes', () async {
    await _insertar(db, id: 'p1', concepto: 'Borrada', cantidad: 1, precioUnitario: 1);
    await (db.update(db.obraPresupuesto)..where((t) => t.id.equals('p1'))).write(
        ObraPresupuestoCompanion(
            deletedAt: Value(DateTime.now().millisecondsSinceEpoch)));
    final existentes = await db.select(db.obraPresupuesto).get();

    final r = reconciliarPresupuesto(existentes: existentes, parsed: const []);
    expect(r, isEmpty);
  });

  test('escenario mixto: Igual + Conflicto + Nueva + SoloPortal simultáneos', () async {
    await _insertar(db, id: 'p1', concepto: 'Construcción', cantidad: 344, precioUnitario: 14500);
    await _insertar(db, id: 'p2', concepto: 'Barda', cantidad: 35, precioUnitario: 7000);
    await _insertar(db, id: 'p3', concepto: 'Cimentación extra', cantidad: 1, precioUnitario: 20000);
    final existentes = await db.select(db.obraPresupuesto).get();

    const parsed = [
      ExcelPartida(concepto: 'Construcción', unidad: 'm2', cantidad: 344, precioUnitario: 14500), // Igual
      ExcelPartida(concepto: 'Barda', unidad: 'm2', cantidad: 35, precioUnitario: 7500), // Conflicto (precio)
      ExcelPartida(concepto: 'Alberca', unidad: '', cantidad: 1, precioUnitario: 450000), // Nueva
    ];

    final r = reconciliarPresupuesto(existentes: existentes, parsed: parsed);
    final porEstado = <EstadoPartida, int>{};
    for (final x in r) {
      porEstado[x.estado] = (porEstado[x.estado] ?? 0) + 1;
    }
    expect(porEstado[EstadoPartida.igual], 1);
    expect(porEstado[EstadoPartida.conflicto], 1);
    expect(porEstado[EstadoPartida.nueva], 1);
    expect(porEstado[EstadoPartida.soloPortal], 1); // Cimentación extra
  });
}
