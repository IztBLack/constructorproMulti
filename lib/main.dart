import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    // Edge-to-edge explícito. En Android 15 (targetSdk 35) el sistema dibuja sus
    // barras SOBRE la app por defecto; sin declarar esto, en algunos equipos
    // (p. ej. Samsung con barra de 3 botones) la barra de navegación tapa el
    // contenido de abajo. Al activarlo, Flutter recibe los insets y el Scaffold
    // reserva el espacio. En iOS es no-op (allí ya es edge-to-edge y lo maneja
    // SafeArea). El color/contraste de las barras se define en CimnovaApp.
    // `runGuarded` ya llamó a WidgetsFlutterBinding.ensureInitialized().
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

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
      child: const CimnovaApp(),
    ));
  });
}

class CimnovaApp extends ConsumerWidget {
  const CimnovaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    // Arranca el sync automático (arranque/reconexión/post-escritura).
    ref.watch(syncControllerProvider);
    return MaterialApp(
      title: 'Cimnova',
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
      // Barras del sistema TRANSPARENTES y sin scrim forzado, con los íconos en
      // el brillo correcto según el tema activo. `contrastEnforced: false` es la
      // clave: sin él, Android vuelve a pintar una barra opaca encima. Va en el
      // `builder` para leer el brillo del tema ya resuelto (incluye "sistema").
      builder: (context, child) {
        final brillo = Theme.of(context).brightness;
        // Íconos oscuros sobre barra clara (tema claro) y viceversa.
        final iconos =
            brillo == Brightness.dark ? Brightness.light : Brightness.dark;
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: iconos, // Android
            statusBarBrightness: brillo, // iOS
            systemNavigationBarColor: Colors.transparent,
            systemNavigationBarIconBrightness: iconos,
            systemNavigationBarContrastEnforced: false,
            systemStatusBarContrastEnforced: false,
          ),
          child: child!,
        );
      },
      home: const HomeShell(),
    );
  }
}
