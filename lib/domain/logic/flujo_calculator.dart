import '../models/models.dart';

/// Resumen de caja: equivale a `ResumenCaja` del proyecto Kotlin.
class ResumenCaja {
  final double totalEntradas;
  final double totalSalidas;

  const ResumenCaja({
    required this.totalEntradas,
    required this.totalSalidas,
  });

  double get saldo => totalEntradas - totalSalidas;
}

/// Porta la lógica de flujo de caja: `saldo = Σ entradas − Σ salidas`.
class FlujoCalculator {
  const FlujoCalculator();

  ResumenCaja resumen(List<Movimiento> movimientos) {
    double entradas = 0.0;
    double salidas = 0.0;
    for (final m in movimientos) {
      if (m.tipo == TipoMovimiento.entrada) {
        entradas += m.monto;
      } else {
        salidas += m.monto;
      }
    }
    return ResumenCaja(totalEntradas: entradas, totalSalidas: salidas);
  }
}
