import '../models/models.dart';

/// Totales de un presupuesto/cotización.
class PresupuestoTotales {
  final double subtotal;
  final double iva;
  final double total;
  final double saldoRestante;

  const PresupuestoTotales({
    required this.subtotal,
    required this.iva,
    required this.total,
    required this.saldoRestante,
  });
}

/// Porta la lógica de cálculo de presupuesto del proyecto Kotlin.
///
/// Reglas (contrato):
/// - subtotal = Σ(cantidad × precioUnitario)
/// - iva = subtotal × (ivaPercentage/100)  (solo si ivaEnabled)
/// - total = subtotal + iva
/// - saldoRestante = total − totalPagado
class PresupuestoCalculator {
  const PresupuestoCalculator();

  PresupuestoTotales calcular({
    required List<Partida> partidas,
    required bool ivaEnabled,
    double ivaPercentage = 16.0,
    double totalPagado = 0.0,
  }) {
    final subtotal =
        partidas.fold<double>(0.0, (acc, p) => acc + p.total);
    final iva = ivaEnabled ? subtotal * (ivaPercentage / 100.0) : 0.0;
    final total = subtotal + iva;
    return PresupuestoTotales(
      subtotal: subtotal,
      iva: iva,
      total: total,
      saldoRestante: total - totalPagado,
    );
  }

  /// % aportado de una partida/sección: gasto/total × 100 (0 si total ≤ 0).
  double porcentajeAportado({required double gasto, required double total}) {
    if (total <= 0) return 0.0;
    return (gasto / total) * 100.0;
  }
}
