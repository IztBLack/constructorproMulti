import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../settings/settings_provider.dart';
import 'cloud_providers.dart';
import 'supabase_config.dart';

/// Clave del rol cacheado en SharedPreferences (para resolver offline).
const _kRolUsuario = 'rol_usuario';

/// Decisión PURA de permiso (sin red), para poder testearla y reusarla.
///
/// Regla CONSERVADORA: solo se restringe cuando el rol es CONOCIDO y es uno de
/// los roles de solo-lectura para operación ('contador' o 'colaborador'). Ante
/// cualquier otro caso —null, cadena vacía, 'admin', 'supervisor' o un rol
/// desconocido— se concede acceso total. NUNCA queremos bloquear a un admin por
/// un fallo de red o por un valor que no supimos leer: preferimos que el push
/// rechace una escritura ilegítima (ya existe el indicador de error de sync) a
/// esconderle acciones a quien sí tiene permiso.
///
/// La CAJA no se restringe aquí: el contador SÍ la usa (ver migración 0022).
bool puedeEditarOperacionSegunRol(String? rol) {
  return rol != 'contador' && rol != 'colaborador';
}

/// Roles con acceso a la PROYECCIÓN DE NÓMINA.
///
/// Esta es una LISTA BLANCA, al revés que [puedeEditarOperacionSegunRol], y la
/// diferencia es deliberada. Aquella protege una acción (editar); esta protege
/// la EXHIBICIÓN del salario de cada persona junto a su nombre, más la raya
/// completa de la semana. Un rol nuevo que se agregue mañana debe tener que
/// pedir este permiso explícitamente en vez de heredarlo por omisión.
///
/// Quién entra y por qué, contra los roles que existen hoy:
///   · `admin` (socio) — sí. Es su dinero.
///   · `supervisor` — sí. Ya escribe nómina, obras y presupuesto (0014), así que
///     no se le esconde nada que no pueda ver de todos modos.
///   · `colaborador` — NO. Es staff de campo: captura asistencia y gasto. Aunque
///     RLS le deja LEER `colaboradores`, no hay razón para ponerle enfrente la
///     raya de sus compañeros.
///   · `contador` — NO por ahora, y es el caso discutible: es quien necesita
///     saber cuánto efectivo tener listo el sábado, y 0022 ya le da lectura de
///     `asistencias`, `destajos` y `colaboradores`. Si se decide abrirle la
///     pantalla en SOLO LECTURA, se agrega aquí y se combina con
///     [puedeEditarOperacionSegunRol] para que no pueda mover el escenario.
///   · `cliente` — NO, nunca. Ve su obra desde el portal y jamás la nómina.
const _rolesProyeccionNomina = {'admin', 'supervisor'};

/// ¿Este rol puede ver la proyección de nómina?
///
/// Un rol nulo o vacío CONCEDE acceso, igual que el resto del gate de roles,
/// pero por una razón distinta a «no bloquear a un admin por un fallo de red»:
/// la app funciona 100% offline y sin cuenta en la nube. Sin sesión no hay
/// `usuarios_empresa` que consultar, y ese caso es la instalación local de un
/// solo dueño — negarle su propia nómina dejaría la app inservible. En cuanto
/// hay sesión, el rol es conocido y la lista blanca aplica.
bool puedeVerProyeccionNominaSegunRol(String? rol) {
  if (rol == null || rol.isEmpty) return true;
  return _rolesProyeccionNomina.contains(rol);
}

/// Rol del usuario actual, resuelto desde Supabase (`usuarios_empresa`, igual
/// que `resolverEmpresaYsellar`) y cacheado en SharedPreferences para funcionar
/// offline.
///
/// Estrategia offline-first: si hay red, consulta el servidor —la fuente de
/// verdad— y actualiza el cache; si no, cae al último rol conocido. Sin sesión,
/// o si no se pudo resolver nada, devuelve null → acceso total (conservador).
final rolUsuarioProvider = FutureProvider<String?>((ref) async {
  // Re-evalúa al cambiar la sesión (login/logout/refresh).
  final user = ref.watch(currentUserProvider);
  final prefs = ref.watch(sharedPreferencesProvider);

  // Sin sesión no restringimos nada (no hay obra/cotización que editar en la
  // pantalla de login, y devolver el rol de una cuenta anterior sería incorrecto).
  if (user == null) return null;

  final cache = prefs.getString(_kRolUsuario);
  try {
    final rows = await SupabaseConfig.client
        .from('usuarios_empresa')
        .select('rol')
        .limit(1);
    if (rows.isEmpty) return cache;
    final rol = rows.first['rol'] as String?;
    if (rol != null) await prefs.setString(_kRolUsuario, rol);
    return rol ?? cache;
  } catch (e) {
    // Offline / fallo de red: usamos el último rol conocido. No bloqueamos.
    debugPrint('[rol_provider] no se pudo resolver el rol: $e');
    return cache;
  }
});

/// Helper booleano listo para la UI: ¿este usuario puede crear/editar/borrar
/// operación (obras, cotizaciones, nómina, presupuesto)?
///
/// CONSERVADOR: mientras el rol carga, o si hubo error, se concede acceso total
/// —no queremos ocultarle acciones a un admin mientras la red resuelve—. Solo se
/// restringe con un rol CONOCIDO y de solo-lectura.
final puedeEditarOperacionProvider = Provider<bool>((ref) {
  return ref.watch(rolUsuarioProvider).maybeWhen(
        data: puedeEditarOperacionSegunRol,
        orElse: () => true,
      );
});

/// ¿Se le muestra la proyección de nómina a este usuario?
///
/// A diferencia de [puedeEditarOperacionProvider], mientras el rol CARGA se
/// niega el acceso. Es un cambio de polaridad a propósito: ocultar un botón
/// medio segundo de más no le rompe el trabajo a nadie, y enseñar la raya de la
/// plantilla a un colaborador durante ese medio segundo sí sería una fuga. El
/// caso «sin sesión» no pasa por aquí: ahí el provider resuelve a `null` con
/// `data` y la lista blanca ya lo concede.
final puedeVerProyeccionNominaProvider = Provider<bool>((ref) {
  return ref.watch(rolUsuarioProvider).maybeWhen(
        data: puedeVerProyeccionNominaSegunRol,
        orElse: () => false,
      );
});
