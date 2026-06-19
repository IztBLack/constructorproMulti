import 'package:flutter_test/flutter_test.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:constructorpro/domain/logic/presupuesto_calculator.dart';

void main() {
  const calc = PresupuestoCalculator();

  final partidas = [
    const Partida(cantidad: 10, precioUnitario: 100), // 1000
    const Partida(cantidad: 2.5, precioUnitario: 200), // 500
  ]; // subtotal = 1500

  test('con IVA 16% habilitado', () {
    final r = calc.calcular(partidas: partidas, ivaEnabled: true);
    expect(r.subtotal, 1500.0);
    expect(r.iva, closeTo(240.0, 1e-9));
    expect(r.total, closeTo(1740.0, 1e-9));
    expect(r.saldoRestante, closeTo(1740.0, 1e-9));
  });

  test('sin IVA', () {
    final r = calc.calcular(partidas: partidas, ivaEnabled: false);
    expect(r.iva, 0.0);
    expect(r.total, 1500.0);
  });

  test('saldoRestante descuenta lo pagado', () {
    final r = calc.calcular(
      partidas: partidas,
      ivaEnabled: true,
      totalPagado: 740.0,
    );
    expect(r.saldoRestante, closeTo(1000.0, 1e-9));
  });

  test('porcentaje aportado', () {
    expect(calc.porcentajeAportado(gasto: 750, total: 1500), 50.0);
    expect(calc.porcentajeAportado(gasto: 100, total: 0), 0.0); // evita /0
  });

  test('IVA con porcentaje custom', () {
    final r = calc.calcular(
      partidas: partidas,
      ivaEnabled: true,
      ivaPercentage: 8.0,
    );
    expect(r.iva, closeTo(120.0, 1e-9));
  });
}
