import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../notifications/notification_service.dart';

/// Modo de tema (sistema/claro/oscuro) persistido en SharedPreferences.
final themeModeProvider =
    NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

class ThemeModeNotifier extends Notifier<ThemeMode> {
  static const _key = 'theme_mode';

  @override
  ThemeMode build() {
    _load();
    return ThemeMode.system;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_key);
    state = switch (v) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, mode.name);
  }
}

// ---------------- Recordatorio de nómina ----------------
class ReminderState {
  final bool enabled;
  final int weekday; // 1=lunes … 7=domingo
  final int hour;
  const ReminderState({this.enabled = false, this.weekday = 1, this.hour = 8});

  ReminderState copyWith({bool? enabled, int? weekday, int? hour}) => ReminderState(
        enabled: enabled ?? this.enabled,
        weekday: weekday ?? this.weekday,
        hour: hour ?? this.hour,
      );
}

final reminderProvider =
    NotifierProvider<ReminderNotifier, ReminderState>(ReminderNotifier.new);

class ReminderNotifier extends Notifier<ReminderState> {
  @override
  ReminderState build() {
    _load();
    return const ReminderState();
  }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    state = ReminderState(
      enabled: p.getBool('rem_enabled') ?? false,
      weekday: p.getInt('rem_weekday') ?? 1,
      hour: p.getInt('rem_hour') ?? 8,
    );
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('rem_enabled', state.enabled);
    await p.setInt('rem_weekday', state.weekday);
    await p.setInt('rem_hour', state.hour);
  }

  /// Activa/desactiva el recordatorio. Devuelve false si faltó el permiso.
  Future<bool> setEnabled(bool enabled) async {
    if (enabled) {
      final granted = await NotificationService.requestPermission();
      if (!granted) return false;
      await NotificationService.scheduleWeekly(
          weekday: state.weekday, hour: state.hour);
    } else {
      await NotificationService.cancel();
    }
    state = state.copyWith(enabled: enabled);
    await _save();
    return true;
  }

  Future<void> setSchedule(int weekday, int hour) async {
    state = state.copyWith(weekday: weekday, hour: hour);
    await _save();
    if (state.enabled) {
      await NotificationService.scheduleWeekly(weekday: weekday, hour: hour);
    }
  }
}
