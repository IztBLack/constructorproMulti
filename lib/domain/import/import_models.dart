/// Modelos planos del import de estado de cuenta (Excel/CSV). Espejan los
/// tipos homónimos de `web/src/lib/excel/estado-cuenta-excel.ts` para que la
/// lógica de parseo/dedup/reconciliación sea 1:1 entre plataformas.
library;

class ExcelPartida {
  final String concepto;
  final String unidad;
  final double cantidad;
  final double precioUnitario;

  const ExcelPartida({
    required this.concepto,
    required this.unidad,
    required this.cantidad,
    required this.precioUnitario,
  });

  double get total => cantidad * precioUnitario;

  @override
  String toString() =>
      'ExcelPartida(concepto: $concepto, unidad: $unidad, cantidad: $cantidad, precioUnitario: $precioUnitario)';
}

class ExcelMovimiento {
  /// Epoch ms, anclado a medianoche de México de la fecha de calendario.
  final int fecha;
  final String categoria;
  final double monto;
  final String nombre;
  final String metodoPago;

  /// 'ENTRADA' | 'SALIDA' (ya normalizado).
  final String tipo;
  final String referencia;

  const ExcelMovimiento({
    required this.fecha,
    required this.categoria,
    required this.monto,
    required this.nombre,
    required this.metodoPago,
    required this.tipo,
    required this.referencia,
  });

  @override
  String toString() =>
      'ExcelMovimiento(fecha: $fecha, categoria: $categoria, monto: $monto, '
      'nombre: $nombre, metodoPago: $metodoPago, tipo: $tipo, referencia: $referencia)';
}

class ParsedObraData {
  final String obraNombre;
  final List<ExcelPartida> partidas;
  final List<ExcelMovimiento> movimientos;
  final List<String> advertencias;

  const ParsedObraData({
    required this.obraNombre,
    required this.partidas,
    required this.movimientos,
    required this.advertencias,
  });
}
