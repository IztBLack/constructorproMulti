/// Helpers de zona horaria fija (America/Mexico_City), independientes de la
/// zona del dispositivo. Espeja `web/src/lib/data/tz.ts` (medianocheMx): el
/// import de Excel/CSV ancla cada fecha a la medianoche de México de su
/// fecha de calendario, para que la clave de duplicado (fecha + monto +
/// categoria + tipo + nombre) coincida sin importar en qué zona corra el
/// dispositivo que hizo el import.
library;

import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

const zonaMx = 'America/Mexico_City';

bool _tzInicializado = false;

/// Carga la base de datos de zonas horarias una sola vez (idempotente, no
/// requiere Flutter bindings: es puro Dart, seguro de llamar en tests).
void _asegurarTz() {
  if (_tzInicializado) return;
  tzdata.initializeTimeZones();
  _tzInicializado = true;
}

/// Epoch ms de la medianoche (00:00:00.000) de la fecha calendario
/// `year-month-day` en zona México. México no observa horario de verano
/// actualmente, así que el offset es fijo (-06:00), pero usamos el paquete
/// `timezone` (ya usado por `notification_service.dart`) para no hardcodear
/// el offset por si eso cambiara.
int medianocheMx(int year, int month, int day) {
  _asegurarTz();
  final loc = tz.getLocation(zonaMx);
  return tz.TZDateTime(loc, year, month, day).millisecondsSinceEpoch;
}

/// Fecha de calendario (año, mes, día) en zona México de un instante
/// cualquiera (epoch ms, UTC). Se usa para comparar movimientos "por día"
/// sin importar cómo se haya anclado originalmente el epoch (medianoche
/// local del dispositivo vs medianoche MX explícita del import).
({int year, int month, int day}) fechaMxDe(int epochMs) {
  _asegurarTz();
  final loc = tz.getLocation(zonaMx);
  final dt = tz.TZDateTime.fromMillisecondsSinceEpoch(loc, epochMs);
  return (year: dt.year, month: dt.month, day: dt.day);
}

/// Clave 'YYYY-MM-DD' (zona México) de un epoch ms. Usada como parte de la
/// llave de duplicado de movimientos.
String claveDiaMx(int epochMs) {
  final f = fechaMxDe(epochMs);
  final y = f.year.toString().padLeft(4, '0');
  final m = f.month.toString().padLeft(2, '0');
  final d = f.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}
