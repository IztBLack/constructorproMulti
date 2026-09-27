import type { Rol } from '@/lib/data/types';

/**
 * Qué es cada rol y qué PANTALLAS le tocan (fase F6, migraciones 0042/0044).
 *
 * ESTO NO ES SEGURIDAD: es presentación, igual que `secciones.ts`. Lo que cada
 * rol lee y escribe lo decide la RLS (`auth_tiene_rol`, `auth_residente_obra`).
 * Aquí vive una sola cosa: el MAPA de roles para que la barra, la paleta, los
 * formularios y las guardias de las páginas digan lo mismo que la base.
 *
 *   · residente (D4) = supervisor limitado a SUS obras (`usuario_obra`). La RLS
 *     ya le filtra las obras: donde la web pregunta "¿captura en obra?", el
 *     residente responde igual que el supervisor.
 *   · compras = proveedores, materiales, requisiciones, órdenes y recepciones.
 *   · almacen = recibe material, existencias y traspasos.
 *
 * Todas las listas son LISTAS BLANCAS: un rol que esta versión no conoce cae al
 * mínimo (no ve nada extra), nunca al máximo.
 */

/** Etiqueta para mostrar. Un rol desconocido se muestra tal cual. */
export const NOMBRE_ROL: Readonly<Record<string, string>> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  residente: 'Residente de obra',
  compras: 'Compras',
  almacen: 'Almacén',
  contador: 'Contador',
  colaborador: 'Colaborador',
  cliente: 'Cliente',
};

export function nombreRol(rol: string | null | undefined): string {
  if (!rol) return '';
  return NOMBRE_ROL[rol] ?? rol;
}

/** Roles que el admin puede dar con un código (el socio va por correo, 0025). */
export const ROLES_INVITABLES = [
  'colaborador',
  'residente',
  'supervisor',
  'compras',
  'almacen',
  'contador',
] as const;
export type RolInvitable = (typeof ROLES_INVITABLES)[number];

export function esRolInvitable(rol: string): rol is RolInvitable {
  return (ROLES_INVITABLES as readonly string[]).includes(rol);
}

/** Texto corto del selector de rol: qué hace, en lenguaje de obra. */
export const DESCRIPCION_ROL: Readonly<Record<string, string>> = {
  colaborador: 'pase de lista y captura; con obra asignada, también su bitácora',
  residente: 'lleva sus obras asignadas: asistencia, bitácora, avance, extras y material',
  supervisor: 'lleva todas las obras y edita cotizaciones',
  compras: 'proveedores, materiales, requisiciones y órdenes de compra',
  almacen: 'recibe material y lleva existencias y traspasos',
  contador: 'maneja la caja, ve todo lo demás',
  admin: 'control total, incluidos usuarios',
};

/**
 * ¿Captura en obra como el supervisor? (bitácora, avance, extras en borrador,
 * notas, programa, seguridad, garantías, herramienta). El residente sí: la RLS
 * ya lo limita a sus obras.
 */
const ROLES_CAMPO: readonly string[] = ['admin', 'supervisor', 'residente'];
export function capturaEnObra(rol: Rol | null | undefined): boolean {
  return typeof rol === 'string' && ROLES_CAMPO.includes(rol);
}

/** Personal de oficina que sube/quita comprobantes de caja (0024 + residente). */
const ROLES_COMPROBANTES: readonly string[] = ['admin', 'supervisor', 'contador', 'residente'];
export function manejaComprobantes(rol: Rol | null | undefined): boolean {
  return typeof rol === 'string' && ROLES_COMPROBANTES.includes(rol);
}

/**
 * ¿Decide y compra? (aprueba requisiciones, arma, emite y cancela órdenes,
 * edita el catálogo de materiales). Admin y el rol compras.
 */
export function gestionaCompras(rol: Rol | null | undefined): boolean {
  return rol === 'admin' || rol === 'compras';
}

/** Roles a los que se les asignan obras (`usuario_obra`). */
export function usaObrasAsignadas(rol: Rol | null | undefined): boolean {
  return rol === 'residente' || rol === 'colaborador';
}

/**
 * Para los roles nuevos, la barra solo ofrece lo que pueden usar. Los roles de
 * siempre no pasan por aquí (su barra no cambia). `null` = sin restricción.
 *
 *   · residente: el día a día de SUS obras. Sin cotizaciones, clientes,
 *     facturación, utilidad, proyección (raya de toda la empresa) ni papeles.
 *   · compras / almacén: su departamento.
 */
const NAV_POR_ROL: Readonly<Record<string, readonly string[]>> = {
  residente: [
    '/admin',
    '/admin/obras',
    '/campo',
    '/admin/equipo',
    '/admin/cuadrillas',
    '/admin/compras',
    '/admin/herramienta',
    '/admin/postventa',
    '/admin/subcontratos',
  ],
  compras: ['/admin', '/admin/compras'],
  almacen: ['/admin', '/admin/compras'],
};

export function rutaNavPermitida(rol: string | null | undefined, href: string): boolean {
  if (!rol) return true;
  const permitidas = NAV_POR_ROL[rol];
  if (!permitidas) return true;
  return permitidas.includes(href);
}

/**
 * Pantallas de toda la empresa que un rol nuevo no debe abrir aunque escriba la
 * URL (la RLS ya le daría listas vacías; esto evita una pantalla que parece
 * rota). Prefijos de ruta.
 */
const BLOQUEADAS_POR_ROL: Readonly<Record<string, readonly string[]>> = {
  residente: [
    '/admin/cotizaciones', '/admin/clientes', '/admin/catalogo', '/admin/puestos', '/admin/actividad',
    '/admin/proyeccion', '/admin/rentabilidad', '/admin/facturacion', '/admin/cumplimiento',
  ],
  compras: [
    '/admin/obras', '/admin/cotizaciones', '/admin/clientes', '/admin/equipo', '/admin/cuadrillas',
    '/admin/catalogo', '/admin/puestos', '/admin/actividad',
  ],
  almacen: [
    '/admin/obras', '/admin/cotizaciones', '/admin/clientes', '/admin/equipo', '/admin/cuadrillas',
    '/admin/catalogo', '/admin/puestos', '/admin/actividad',
  ],
};

export function rutaBloqueadaPara(rol: string | null | undefined, pathname: string): boolean {
  if (!rol) return false;
  // El PDF de la orden de compra trae precios: almacén no lo abre (F6-9).
  if (rol === 'almacen' && /^\/admin\/compras\/ordenes\/[^/]+\/pdf(\/|$)/.test(pathname)) return true;
  const lista = BLOQUEADAS_POR_ROL[rol];
  if (!lista) return false;
  return lista.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * Almacén no ve precios en la web (F6-9). La base sí se los deja leer (la RLS
 * filtra filas, no columnas), así que esto es presentación.
 */
export function vePreciosDeCompras(rol: Rol | null | undefined): boolean {
  return rol !== 'almacen';
}
