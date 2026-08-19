import type { Rol } from '@/lib/data/types';

/**
 * Quién puede ver el SUELDO de una persona junto a su nombre.
 *
 * Es una LISTA BLANCA a propósito, al revés que `seccionesDe` en
 * `./secciones.ts`: un rol nuevo que se agregue mañana debe tener que pedir este
 * permiso explícitamente en vez de heredarlo por omisión.
 *
 * Gobierna los DOS módulos que enseñan la raya —proyección y nómina—, que hasta
 * agosto de 2026 tenían permisos distintos aunque muestran el mismo dato: la
 * proyección devolvía 403 por rol y la nómina solo pedía sesión, así que un
 * `colaborador` de campo podía bajarse el PDF con el sueldo de todos sus
 * compañeros. Vive aquí, y no dentro de `lib/data/proyeccion-nomina.ts`, para
 * que no haya dos listas que se puedan separar otra vez.
 *
 * Quién entra y por qué, contra los roles que existen hoy:
 *   · `admin` (socio) — sí. Es su dinero.
 *   · `supervisor` — sí. Ya escribe nómina, obras y presupuesto (RLS 0014), así
 *     que no se le esconde nada que no pueda ver de todos modos.
 *   · `contador` — sí, desde 2026-08-17. La migración 0022 lo define como el
 *     tesorero que «ve los montos a pagar»; sin la raya no puede hacer su
 *     trabajo. Entra en SOLO LECTURA: escribir sigue siendo de admin/supervisor
 *     por las policies de 0014, no por esta lista.
 *   · `colaborador` — NO. Es staff de campo: captura asistencia y gasto. No hay
 *     razón para ponerle enfrente la raya de sus compañeros.
 *   · `cliente` — NO, nunca. Ve su obra desde el portal y jamás la nómina.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO SOLO ES LA MITAD. La otra vive en `supabase/migrations/0027`, que revoca
 * las columnas de sueldo de `colaboradores` para todo el mundo y las expone por
 * la vista `colaboradores_sueldo`, filtrada por estos mismos tres roles. Sin esa
 * mitad, quien tenga la sesión puede consultar la tabla directo y este archivo
 * no lo detiene. Espeja `_rolesSueldos` del móvil (`lib/core/sync/rol_provider.dart`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const ROLES_SUELDOS: readonly string[] = ['admin', 'supervisor', 'contador'];

/** ¿Este rol puede ver sueldos (nómina y proyección)? */
export function puedeVerSueldos(rol: Rol): boolean {
  return ROLES_SUELDOS.includes(rol);
}
