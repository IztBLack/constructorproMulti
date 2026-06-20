import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/crash/crash_logger.dart';
import 'core/db/app_database.dart';
import 'core/notifications/notification_service.dart';
import 'core/settings/settings_provider.dart';
import 'core/theme/app_theme.dart';
import 'data/demo_data.dart';
import 'data/providers.dart';
import 'presentation/home_shell.dart';

void main() {
  // Captura cualquier crash (Flutter + zona) en un log local offline.
  CrashLogger.runGuarded(() async {
    await initializeDateFormatting('es_MX', null);
    await NotificationService.init();

    final db = AppDatabase();
    // Carga de demo determinista (solo si se compila con --dart-define=LOAD_DEMO=true).
    if (const bool.fromEnvironment('LOAD_DEMO')) {
      await DemoData.generar(db);
    }

    runApp(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const ConstructorProApp(),
    ));
  });
}

class ConstructorProApp extends ConsumerWidget {
  const ConstructorProApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp(
      title: 'ConstructorPro',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      locale: const Locale('es', 'MX'),
      supportedLocales: const [Locale('es', 'MX'), Locale('es'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const HomeShell(),
    );
  }
}
