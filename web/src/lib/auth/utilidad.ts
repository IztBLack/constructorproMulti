import type { Rol } from '@/lib/data/types';

/**
 * Quién puede ver la UTILIDAD de una obra (módulo `rentabilidad`, fase F1).
 *
 * Decisión D1 del dueño (docs/PROGRESO_ALCANCE.md): el margen es información
 * del dueño. El supervisor ya ve la raya y los costos de campo; si además ve el
 * margen, se vuelve tema de negociación. Así lo manejan los ERP del ramo: el
 * residente ve avance y costo, no la utilidad.
 *
 * LISTA BLANCA, como `puedeVerSueldos`: un rol nuevo (residente, compras…) no
 * hereda este permiso por omisión, tiene que pedirlo.
 *
 * DÓNDE SE CUMPLE: en el SERVIDOR. Los datos crudos (movimientos, raya,
 * presupuesto) el supervisor los puede leer por RLS desde antes, así que la
 * barrera no puede ser la base: es que la utilidad solo se CALCULA y se ENTREGA
 * en `lib/data/rentabilidad.ts` si este chequeo pasa, y las páginas y la acción
 * que guarda el margen lo repiten. El único dato propio de la utilidad que vive
 * en la base, el margen objetivo por obra, sí está cerrado por RLS
 * (`obra_margen_objetivo`, 0036: solo admin y contador).
 */
const ROLES_UTILIDAD: readonly string[] = ['admin', 'contador'];

export function puedeVerUtilidad(rol: Rol | null | undefined): boolean {
  return typeof rol === 'string' && ROLES_UTILIDAD.includes(rol);
}

/** Solo el admin fija el margen objetivo (la RLS de 0036 exige lo mismo). */
export function puedeFijarMargen(rol: Rol | null | undefined): boolean {
  return rol === 'admin';
}
