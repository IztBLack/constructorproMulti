import 'package:flutter_test/flutter_test.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:constructorpro/domain/logic/flujo_calculator.dart';

void main() {
  const calc = FlujoCalculator();

  test('saldo = entradas − salidas', () {
    final movs = [
      const Movimiento(tipo: TipoMovimiento.entrada, monto: 150000.0),
      const Movimiento(tipo: TipoMovimiento.salida, monto: 24200.0),
      const Movimiento(tipo: TipoMovimiento.salida, monto: 18500.0),
    ];
    final r = calc.resumen(movs);
    expect(r.totalEntradas, 150000.0);
    expect(r.totalSalidas, 42700.0);
    expect(r.saldo, 107300.0);
  });

  test('sin movimientos → todo en cero', () {
    final r = calc.resumen(const []);
    expect(r.totalEntradas, 0.0);
    expect(r.totalSalidas, 0.0);
    expect(r.saldo, 0.0);
  });

  test('saldo negativo cuando salidas superan entradas', () {
    final movs = [
      const Movimiento(tipo: TipoMovimiento.entrada, monto: 1000.0),
      const Movimiento(tipo: TipoMovimiento.salida, monto: 1500.0),
    ];
    expect(calc.resumen(movs).saldo, -500.0);
  });
}
