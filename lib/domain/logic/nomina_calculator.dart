import '../models/models.dart';

/// Resultado del cálculo de nómina por colaborador.
class NominaItem {
  final Colaborador colaborador;
  final String puestoNombre;
  final double totalDias; // suma de fracciones (tipo DIA)
  final double totalDestajos; // suma de montos (tipo DESTAJO)
  final double salarioBaseCalculado;
  final double totalPagar;

  const NominaItem({
    required this.colaborador,
    required this.puestoNombre,
    required this.totalDias,
    required this.totalDestajos,
    required this.salarioBaseCalculado,
    required this.totalPagar,
  });
}

class NominaSummary {
  final double totalNomina;
  final double totalDia;
  final double totalDestajo;
  final List<NominaItem> items;

  const NominaSummary({
    required this.totalNomina,
    required this.totalDia,
    required this.totalDestajo,
    required this.items,
  });
}

/// Porta la lógica de `NominaViewModel.kt`.
///
/// Reglas (contrato):
/// - Semana lunes→domingo.
/// - salarioDia = salarioPersonalizado ?? puesto.salarioDiaDefault ?? 0.0
/// - DIA: totalPagar = Σ(fracciones) × salarioDia
/// - DESTAJO: totalPagar = Σ(montos de destajos)
/// - totalNomina = totalDia + totalDestajo
class NominaCalculator {
  const NominaCalculator();

  NominaSummary calcular({
    required List<Colaborador> colaboradores,
    required List<Asistencia> asistencias,
    required List<Destajo> destajos,
    required List<Puesto> puestos,
  }) {
    final puestoPorId = {for (final p in puestos) p.id: p};

    double totalDia = 0.0;
    double totalDestajo = 0.0;
    final items = <NominaItem>[];

    for (final worker in colaboradores) {
      final puesto = puestoPorId[worker.puestoId];
      final puestoNombre = puesto?.nombre ?? 'Sin Puesto';
      final salarioDia =
          worker.salarioPersonalizado ?? puesto?.salarioDiaDefault ?? 0.0;

      if (worker.tipoPago == TipoPago.dia) {
        final sumFracciones = asistencias
            .where((a) => a.colaboradorId == worker.id)
            .fold<double>(0.0, (acc, a) => acc + a.fraccion);
        final totalPagar = sumFracciones * salarioDia;
        totalDia += totalPagar;
        items.add(NominaItem(
          colaborador: worker,
          puestoNombre: puestoNombre,
          totalDias: sumFracciones,
          totalDestajos: 0.0,
          salarioBaseCalculado: salarioDia,
          totalPagar: totalPagar,
        ));
      } else {
        final sumDestajos = destajos
            .where((d) => d.colaboradorId == worker.id)
            .fold<double>(0.0, (acc, d) => acc + d.monto);
        totalDestajo += sumDestajos;
        items.add(NominaItem(
          colaborador: worker,
          puestoNombre: puestoNombre,
          totalDias: 0.0,
          totalDestajos: sumDestajos,
          salarioBaseCalculado: salarioDia,
          totalPagar: sumDestajos,
        ));
      }
    }

    return NominaSummary(
      totalNomina: totalDia + totalDestajo,
      totalDia: totalDia,
      totalDestajo: totalDestajo,
      items: items,
    );
  }

  /// Inicio de la semana (lunes 00:00:00.000) que contiene [fecha].
  /// Equivale a `NominaViewModel.getStartOfWeek`.
  static DateTime getStartOfWeek(DateTime fecha) {
    final d = DateTime(fecha.year, fecha.month, fecha.day); // 00:00 local
    // DateTime.weekday: lunes=1 … domingo=7  → restar (weekday-1) días.
    return d.subtract(Duration(days: d.weekday - 1));
  }

  /// Fin de la semana (domingo 23:59:59.999) a partir del inicio.
  static DateTime getEndOfWeek(DateTime startOfWeek) {
    final start = DateTime(
        startOfWeek.year, startOfWeek.month, startOfWeek.day);
    return start
        .add(const Duration(days: 6))
        .add(const Duration(
            hours: 23, minutes: 59, seconds: 59, milliseconds: 999));
  }
}
