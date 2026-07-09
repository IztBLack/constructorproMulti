/// Cálculo del salario diario a partir del sueldo por periodo.
///
/// Espeja `web/src/lib/data/salario.ts`. El usuario captura el sueldo SEMANAL,
/// QUINCENAL o MENSUAL y los días trabajados por semana (5, 6 o 7); el salario
/// diario (colaboradores.salario_personalizado, que consume la nómina) NO se
/// edita: se deriva aquí y solo se muestra como referencia.
///
/// Base anualizada: 52 semanas → 12 meses (52/12) o 24 quincenas (52/24).
///   6 días/semana → Semanal ÷6, Quincenal ÷13, Mensual ÷26.
library;

enum PeriodoPago { semanal, quincenal, mensual }

const List<int> diasSemanaOpciones = [5, 6, 7];

extension PeriodoPagoX on PeriodoPago {
  /// Valor persistido en BD (coincide con la web y el CHECK de Postgres).
  String get code => switch (this) {
        PeriodoPago.semanal => 'SEMANAL',
        PeriodoPago.quincenal => 'QUINCENAL',
        PeriodoPago.mensual => 'MENSUAL',
      };

  String get label => switch (this) {
        PeriodoPago.semanal => 'Semanal',
        PeriodoPago.quincenal => 'Quincenal',
        PeriodoPago.mensual => 'Mensual',
      };

  /// Etiqueta del campo de monto según el periodo.
  String get sueldoLabel => switch (this) {
        PeriodoPago.semanal => 'Sueldo semanal',
        PeriodoPago.quincenal => 'Sueldo quincenal',
        PeriodoPago.mensual => 'Sueldo mensual',
      };

  /// Días trabajados que abarca el periodo, según los [diasSemana] de la empresa.
  double diasDelPeriodo(int diasSemana) => switch (this) {
        PeriodoPago.semanal => diasSemana.toDouble(),
        PeriodoPago.quincenal => diasSemana * 52 / 24,
        PeriodoPago.mensual => diasSemana * 52 / 12,
      };
}

/// Parsea el código persistido; default MENSUAL para filas previas / inválidas.
PeriodoPago periodoPagoFromCode(String? code) => switch (code) {
      'SEMANAL' => PeriodoPago.semanal,
      'QUINCENAL' => PeriodoPago.quincenal,
      _ => PeriodoPago.mensual,
    };

/// Salario diario (redondeado a centavos) derivado del sueldo del periodo.
/// Devuelve null si no hay monto válido (> 0).
double? salarioDiarioDesdePeriodo(
  double? montoPeriodo,
  PeriodoPago periodo,
  int diasSemana,
) {
  if (montoPeriodo == null || !(montoPeriodo > 0)) return null;
  final dias = periodo.diasDelPeriodo(diasSemana);
  if (!(dias > 0)) return null;
  return (montoPeriodo / dias * 100).roundToDouble() / 100;
}
