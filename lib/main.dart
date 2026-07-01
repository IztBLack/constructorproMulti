import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/crash/crash_logger.dart';
import 'core/db/app_database.dart';
import 'core/notifications/notification_service.dart';
import 'core/settings/settings_provider.dart';
import 'core/storage/app_paths.dart';
import 'core/sync/cloud_providers.dart';
import 'core/sync/supabase_config.dart';
import 'core/theme/app_theme.dart';
import 'data/demo_data.dart';
import 'data/providers.dart';
import 'presentation/home_shell.dart';

void main() {
  // Captura cualquier crash (Flutter + zona) en un log local offline.
  CrashLogger.runGuarded(() async {
    await initializeDateFormatting('es_MX', null);
    await NotificationService.init();

    // Cliente Supabase para el sync nube. Si falla (p. ej. sin red al arrancar),
    // la app continúa 100% offline; el sync reintenta luego.
    try {
      await SupabaseConfig.init();
    } catch (e) {
      // Sin red al arrancar: la app sigue offline; el sync reintenta luego.
      debugPrint('Supabase init falló (se continúa offline): $e');
    }

    // Se precargan antes de runApp para que los providers (tema, recordatorio,
    // IVA) lean de forma síncrona y no haya parpadeo ni carreras al arrancar.
    final prefs = await SharedPreferences.getInstance();

    // Directorio de documentos para resolver rutas de archivos (adjuntos, logo).
    AppPaths.documentsDir = (await getApplicationDocumentsDirectory()).path;

    final db = AppDatabase();
    // Carga de demo determinista (solo si se compila con --dart-define=LOAD_DEMO=true).
    if (const bool.fromEnvironment('LOAD_DEMO')) {
      await DemoData.generar(db);
    }

    runApp(ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(db),
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
      child: const ConstructorProApp(),
    ));
  });
}

class ConstructorProApp extends ConsumerWidget {
  const ConstructorProApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    // Arranca el sync automático (arranque/reconexión/post-escritura).
    ref.watch(syncControllerProvider);
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
