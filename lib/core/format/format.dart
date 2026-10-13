import 'package:intl/intl.dart';

/// Formateadores localizados es-MX, equivalentes a los del proyecto Kotlin.
class Fmt {
  static final _currency =
      NumberFormat.currency(locale: 'es_MX', symbol: '\$');
  // «6 oct 2026», como la web (`formatDate` en web/src/lib/data/format.ts).
  // intl pone punto a los meses abreviados («oct.»); la web no.
  static final _date = DateFormat('d MMM y', 'es_MX');
  static final _dayName = DateFormat('EEE dd MMM', 'es_MX');

  static String money(num v) => _currency.format(v);
  static String date(int epochMillis) => _date
      .format(DateTime.fromMillisecondsSinceEpoch(epochMillis))
      .replaceAll('.', '');
  static String dayName(DateTime d) => _dayName.format(d);

  /// Momento reciente dicho como en la obra: "hoy 14:32", "ayer 09:10" o
  /// "6 oct 14:32". Para "última subida", "guardado a las…".
  static String cuando(DateTime t, {DateTime? ahora}) {
    final hoy = ahora ?? DateTime.now();
    // En UTC: entre dos medianoches locales con cambio de horario de por medio
    // hay 23 h, e `inDays` diría "hoy" en vez de "ayer".
    final dia = DateTime.utc(t.year, t.month, t.day);
    final diferencia =
        DateTime.utc(hoy.year, hoy.month, hoy.day).difference(dia).inDays;
    final hora = DateFormat('HH:mm').format(t);
    if (diferencia == 0) return 'hoy $hora';
    if (diferencia == 1) return 'ayer $hora';
    return '${DateFormat('d MMM', 'es_MX').format(t).replaceAll('.', '')} $hora';
  }
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
