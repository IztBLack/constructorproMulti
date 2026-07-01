import 'package:supabase_flutter/supabase_flutter.dart';

/// Configuración y arranque del cliente Supabase para el sync nube (Fase 2).
///
/// La app sigue siendo **offline-first**: Drift/SQLite es la fuente de verdad y
/// la UI nunca espera a Supabase. Esto solo prepara el cliente; la
/// sincronización real la maneja [SyncService].
class SupabaseConfig {
  SupabaseConfig._();

  /// Proyecto Supabase de ConstructorPro.
  static const String url = 'https://vmkkkrlctakzzqebtyci.supabase.co';

  /// Publishable key. Es **pública por diseño** (la protege la RLS de Postgres);
  /// va embebida en el cliente como en cualquier app Supabase. NO es la
  /// `service_role` (esa nunca se incluye).
  static const String publishableKey =
      'sb_publishable_h0AJhToRKa5d2VWkN_u2Tg_R9d2zgQ_';

  /// Inicializa Supabase. Es seguro llamarlo sin red: solo configura el cliente
  /// y restaura la sesión local si existe; no hace I/O de red obligatorio.
  static Future<void> init() async {
    await Supabase.initialize(url: url, publishableKey: publishableKey);
  }

  static SupabaseClient get client => Supabase.instance.client;

  /// Usuario autenticado actual (null si no ha iniciado sesión).
  static User? get currentUser => Supabase.instance.client.auth.currentUser;
}
