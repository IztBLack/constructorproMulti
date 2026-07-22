import type { Rol } from '@/lib/data/types';

/**
 * Qué sección de Ajustes ve cada rol.
 *
 * El modelo son CÍRCULOS CONCÉNTRICOS: cada rol ve todo lo del anterior más lo
 * suyo. Un admin ve lo del cliente; un cliente nunca ve lo del admin.
 *
 *   cliente ⊂ colaborador ⊂ supervisor ⊂ admin
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO ES SEGURIDAD. Es presentación.
 * ─────────────────────────────────────────────────────────────────────────────
 * Ocultar una sección en la interfaz no impide nada: quien envíe el formulario a
 * mano llega igual a la Server Action. La barrera de verdad son las policies de
 * Supabase (`auth_tiene_rol`), que rechazan la escritura del lado del servidor.
 * Este archivo decide QUÉ SE DIBUJA; la base de datos decide QUÉ SE PUEDE
 * ESCRIBIR. Las dos cosas tienen que existir, y no son sustitutas.
 *
 * Las secciones de datos de empresa llegan en la Fase 3, junto con su migración
 * de policies. Aquí ya están declaradas para que el mapa de roles viva completo
 * en un solo lugar y no haya que reconstruirlo después.
 */
export type SeccionAjustes =
  /** Nombre, correo y contraseña. Es TU cuenta: la ven los cuatro roles. */
  | 'cuenta'
  /** Tema y demás gustos personales. Viven en el dispositivo, no en la nube. */
  | 'preferencias'
  /** Recordatorios y datos guardados sin conexión. Solo quien pisa la obra. */
  | 'campo'
  /** IVA por defecto, catálogo, puestos. Configuración del negocio. */
  | 'operacion'
  /** Nombre/marca de la constructora y datos del PDF. */
  | 'empresa'
  /** Altas de usuarios y asignación de roles. */
  | 'usuarios';

/** Secciones que aporta cada rol, ADEMÁS de las del rol anterior. */
const APORTA: Record<string, SeccionAjustes[]> = {
  cliente: ['cuenta', 'preferencias'],
  colaborador: ['campo'],
  supervisor: [],
  // `operacion` (IVA y personalización del PDF) vivía aquí en el supervisor,
  // pero la migración 0018 restringió `empresa_config` a admin por decisión del
  // dueño: el IVA toca el dinero de todas las cotizaciones nuevas y el PDF es la
  // marca frente al cliente. Se mueve para que la interfaz diga lo mismo que la
  // base — mostrarle a un supervisor un formulario que le va a fallar al guardar
  // es peor que no mostrárselo.
  // (El supervisor sigue llegando al catálogo y a los puestos desde el menú.)
  admin: ['operacion', 'empresa', 'usuarios'],
};

/** Orden de menor a mayor privilegio. El acumulado define lo concéntrico. */
const ESCALERA: readonly string[] = ['cliente', 'colaborador', 'supervisor', 'admin'];

/**
 * Secciones visibles para un rol, acumulando las de los roles inferiores.
 *
 * Un rol desconocido (la BD permite texto libre en la práctica) cae al mínimo
 * —solo su cuenta y sus preferencias— en vez de mostrarlo todo. Ante la duda,
 * menos privilegio.
 */
export function seccionesDe(rol: Rol): SeccionAjustes[] {
  const hasta = ESCALERA.indexOf(rol);
  if (hasta === -1) return [...APORTA.cliente];

  return ESCALERA.slice(0, hasta + 1).flatMap((r) => APORTA[r] ?? []);
}

/** ¿Este rol ve esta sección? Azúcar sobre `seccionesDe`. */
export function puedeVer(rol: Rol, seccion: SeccionAjustes): boolean {
  return seccionesDe(rol).includes(seccion);
}
