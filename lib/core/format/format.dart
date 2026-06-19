import 'package:intl/intl.dart';

/// Formateadores localizados es-MX, equivalentes a los del proyecto Kotlin.
class Fmt {
  static final _currency =
      NumberFormat.currency(locale: 'es_MX', symbol: '\$');
  static final _date = DateFormat('dd/MM/yyyy', 'es_MX');
  static final _dayName = DateFormat('EEE dd MMM', 'es_MX');

  static String money(num v) => _currency.format(v);
  static String date(int epochMillis) =>
      _date.format(DateTime.fromMillisecondsSinceEpoch(epochMillis));
  static String dayName(DateTime d) => _dayName.format(d);
}

/// Helpers de semana (lunes→domingo) y normalización de día, alineados con
/// NominaCalculator del proyecto Kotlin.
class Semana {
  /// Inicio del día (00:00 local) en epoch millis.
  static int inicioDia(DateTime d) =>
      DateTime(d.year, d.month, d.day).millisecondsSinceEpoch;

  /// Lunes 00:00 de la semana que contiene [d], en epoch millis.
  static int inicioSemana(DateTime d) {
    final base = DateTime(d.year, d.month, d.day);
    final lunes = base.subtract(Duration(days: base.weekday - 1));
    return lunes.millisecondsSinceEpoch;
  }

  /// Domingo 23:59:59.999 de la semana, en epoch millis.
  static int finSemana(int inicioSemanaMillis) {
    final ini = DateTime.fromMillisecondsSinceEpoch(inicioSemanaMillis);
    final fin = DateTime(ini.year, ini.month, ini.day)
        .add(const Duration(days: 6, hours: 23, minutes: 59, seconds: 59, milliseconds: 999));
    return fin.millisecondsSinceEpoch;
  }
}
