import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// Recordatorio semanal de nómina con notificaciones locales (Android + iOS),
/// equivalente al del proyecto Kotlin. No usa red.
class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static const _channelId = 'nomina_reminder';
  static const _notificationId = 1001;

  static Future<void> init() async {
    tzdata.initializeTimeZones();
    try {
      final dynamic info = await FlutterTimezone.getLocalTimezone();
      final String name = info is String ? info : info.identifier as String;
      tz.setLocalLocation(tz.getLocation(name));
    } catch (_) {
      // Si falla, queda en UTC; el recordatorio sigue funcionando aprox.
    }

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _plugin.initialize(
        settings: const InitializationSettings(android: android, iOS: ios));
  }

  static Future<bool> requestPermission() async {
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    final ios = _plugin.resolvePlatformSpecificImplementation<
        IOSFlutterLocalNotificationsPlugin>();
    final a = await android?.requestNotificationsPermission() ?? true;
    final i = await ios?.requestPermissions(alert: true, badge: true, sound: true) ?? true;
    return a && i;
  }

  /// Programa un recordatorio semanal recurrente en [weekday] (1=lunes…7=domingo)
  /// a las [hour]:00.
  static Future<void> scheduleWeekly({required int weekday, required int hour}) async {
    await cancel();
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        'Recordatorio de nómina',
        channelDescription: 'Aviso semanal para generar la nómina pendiente',
        importance: Importance.defaultImportance,
      ),
      iOS: DarwinNotificationDetails(),
    );
    await _plugin.zonedSchedule(
      id: _notificationId,
      title: 'Nómina semanal pendiente',
      body: 'Es momento de cerrar y generar la nómina de la semana.',
      scheduledDate: _nextInstance(weekday, hour),
      notificationDetails: details,
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.dayOfWeekAndTime,
    );
  }

  static Future<void> cancel() => _plugin.cancel(id: _notificationId);

  static tz.TZDateTime _nextInstance(int weekday, int hour) {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled =
        tz.TZDateTime(tz.local, now.year, now.month, now.day, hour);
    while (scheduled.weekday != weekday || !scheduled.isAfter(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    return scheduled;
  }
}
