import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/domain/logic/estado_cuenta_calculator.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

Future<Movimiento> _insertarMov(
  AppDatabase db, {
  required String id,
  required String tipo,
  required double monto,
  String categoria = 'GASTO_LIBRE',
  String nombre = '',
}) async {
  await db.into(db.movimientos).insert(MovimientosCompanion.insert(
        id: id,
        obraId: 'o1',
        fecha: 0,
        tipo: tipo,
        categoria: categoria,
        concepto: categoria,
        monto: monto,
        metodoPago: 'Efectivo',
        nombre: Value(nombre),
      ));
  return (db.select(db.movimientos)..where((t) => t.id.equals(id)))
      .getSingle();
}

Future<ObraPresupuestoRow> _insertarPartida(
  AppDatabase db, {
  required String id,
  required String concepto,
  double cantidad = 1,
  double precioUnitario = 0,
}) async {
  await db.into(db.obraPresupuesto).insert(ObraPresupuestoCompanion.insert(
        id: id,
        obraId: 'o1',
        concepto: Value(concepto),
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

  const calc = EstadoCuentaCalculator();

  test('costoTotal, recibido y pendiente', () async {
    await _insertarPartida(db,
        id: 'p1', concepto: 'Construcción', cantidad: 344, precioUnitario: 14500);
    await _insertarPartida(db,
        id: 'p2', concepto: 'Barda', cantidad: 35, precioUnitario: 7000);
    final partidas = await db.select(db.obraPresupuesto).get();

    await _insertarMov(db, id: 'm1', tipo: 'ENTRADA', monto: 1000000);
    final movs = await db.select(db.movimientos).get();

    final s = calc.calcular(movimientos: movs, partidas: partidas);
    expect(s.costoTotal, 344 * 14500 + 35 * 7000.0);
    expect(s.recibido, 1000000);
    expect(s.pendiente, s.costoTotal - 1000000);
  });

  test('pagado por persona: agrupa SALIDAS por nombre, orden desc por monto', () async {
    await _insertarMov(db, id: 'm1', tipo: 'SALIDA', monto: 500, nombre: 'Juan');
    await _insertarMov(db, id: 'm2', tipo: 'SALIDA', monto: 300, nombre: 'Juan');
    await _insertarMov(db, id: 'm3', tipo: 'SALIDA', monto: 900, nombre: 'Pedro');
    await _insertarMov(db, id: 'm4', tipo: 'ENTRADA', monto: 10000, nombre: 'Cliente');
    final movs = await db.select(db.movimientos).get();

    final s = calc.calcular(movimientos: movs, partidas: const []);
    expect(s.porPersona.map((e) => (e.key, e.value)).toList(), [
      ('Pedro', 900.0),
      ('Juan', 800.0),
    ]);
    expect(s.totalSalidas, 1700.0);
  });

  test('salidas sin nombre se agrupan en "Sin nombre"', () async {
    await _insertarMov(db, id: 'm1', tipo: 'SALIDA', monto: 100, nombre: '');
    await _insertarMov(db, id: 'm2', tipo: 'SALIDA', monto: 50, nombre: '   ');
    final movs = await db.select(db.movimientos).get();

    final s = calc.calcular(movimientos: movs, partidas: const []);
    expect(s.porPersona.map((e) => (e.key, e.value)).toList(),
        [(EstadoCuentaCalculator.sinNombre, 150.0)]);
  });

  test('recibido por tipo: agrupa ENTRADAS por categoria, orden desc por monto', () async {
    await _insertarMov(db, id: 'm1', tipo: 'ENTRADA', monto: 2000, categoria: 'Anticipo');
    await _insertarMov(db, id: 'm2', tipo: 'ENTRADA', monto: 500, categoria: 'Anticipo');
    await _insertarMov(db, id: 'm3', tipo: 'ENTRADA', monto: 3000, categoria: 'Liquidación');
    final movs = await db.select(db.movimientos).get();

    final s = calc.calcular(movimientos: movs, partidas: const []);
    expect(s.porTipo.map((e) => (e.key, e.value)).toList(), [
      ('Liquidación', 3000.0),
      ('Anticipo', 2500.0),
    ]);
  });

  test('sin movimientos ni partidas → todo en cero/vacío', () {
    final s = calc.calcular(movimientos: const [], partidas: const []);
    expect(s.costoTotal, 0.0);
    expect(s.recibido, 0.0);
    expect(s.pendiente, 0.0);
    expect(s.porPersona, isEmpty);
    expect(s.porTipo, isEmpty);
  });
}
