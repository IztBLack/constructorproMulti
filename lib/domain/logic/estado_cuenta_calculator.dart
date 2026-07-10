/// Cálculos del "estado de cuenta" de una obra (pestaña Caja): costo total del
/// presupuesto, recibido/pendiente, y los resúmenes "Pagado por persona" /
/// "Recibido por tipo". Espeja `web/src/app/admin/obras/[id]/estado-cuenta.tsx`.
///
/// Opera directo sobre las filas Drift (`Movimiento`, `ObraPresupuestoRow`),
/// igual que `domain/import/dedup_movimientos.dart` y
/// `domain/import/presupuesto_reconciliation.dart` — así el caller puede pasar
/// directo el resultado de `movimientosPorObraProvider` /
/// `partidasPresupuestoPorObraProvider` sin mapear a un modelo intermedio.
library;

import '../../core/db/app_database.dart' show Movimiento, ObraPresupuestoRow;

class EstadoCuentaSummary {
  final double costoTotal;
  final double recibido;
  final double pendiente;

  /// SALIDAS agrupadas por `nombre` (trim), orden descendente por monto. Las
  /// salidas sin nombre capturado se agrupan bajo [EstadoCuentaCalculator.sinNombre].
  final List<MapEntry<String, double>> porPersona;

  /// ENTRADAS agrupadas por `categoria` (trim), orden descendente por monto.
  final List<MapEntry<String, double>> porTipo;

  const EstadoCuentaSummary({
    required this.costoTotal,
    required this.recibido,
    required this.pendiente,
    required this.porPersona,
    required this.porTipo,
  });

  double get totalSalidas =>
      porPersona.fold(0.0, (s, e) => s + e.value);
}

class EstadoCuentaCalculator {
  const EstadoCuentaCalculator();

  static const sinNombre = 'Sin nombre';
  static const sinCategoria = 'Sin categoría';

  EstadoCuentaSummary calcular({
    required List<Movimiento> movimientos,
    required List<ObraPresupuestoRow> partidas,
  }) {
    final costoTotal =
        partidas.fold(0.0, (s, p) => s + p.cantidad * p.precioUnitario);

    var recibido = 0.0;
    final porPersona = <String, double>{};
    final porTipo = <String, double>{};

    for (final m in movimientos) {
      if (m.tipo == 'ENTRADA') {
        recibido += m.monto;
        final key = m.categoria.trim().isEmpty ? sinCategoria : m.categoria.trim();
        porTipo[key] = (porTipo[key] ?? 0) + m.monto;
      } else {
        final key = m.nombre.trim().isEmpty ? sinNombre : m.nombre.trim();
        porPersona[key] = (porPersona[key] ?? 0) + m.monto;
      }
    }

    final porPersonaList = porPersona.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final porTipoList = porTipo.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return EstadoCuentaSummary(
      costoTotal: costoTotal,
      recibido: recibido,
      pendiente: costoTotal - recibido,
      porPersona: porPersonaList,
      porTipo: porTipoList,
    );
  }
}
