'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navegación del panel: SOLO las secciones de uso diario.
 *
 * Aquí NO va nada de configuración a propósito. Catálogo, Puestos y Usuarios
 * viven detrás del engrane de Ajustes, que ya era el índice de configuración
 * (`components/ajustes/seccion-operacion.tsx` y `seccion-usuarios.tsx` enlazan a
 * esas tres pantallas). Tener además un menú "Configuración" en la barra creaba
 * dos puertas al mismo sitio y dos nombres para la misma idea; peor aún, la
 * barra no filtra por rol y Ajustes sí (`lib/auth/secciones.ts`).
 *
 * Antes las diez secciones estaban al mismo nivel: además de no caber, ponía
 * "Puestos" con el mismo peso visual que "Obras", que es donde se trabaja todos
 * los días.
 */
const NAV_LINKS = [
  { href: '/admin', label: 'Inicio' },
  // Vive fuera de /admin a propósito (ver src/app/campo/layout.tsx), pero se
  // enlaza desde aquí porque es una pantalla de uso diario.
  { href: '/campo', label: 'Pase de lista' },
  { href: '/admin/obras', label: 'Obras' },
  { href: '/admin/cotizaciones', label: 'Cotizaciones' },
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/equipo', label: 'Equipo' },
  { href: '/admin/cuadrillas', label: 'Cuadrillas' },
  // Es de uso diario —se arma la raya de la semana desde la oficina—, así que
  // va en la barra y no bajo Ajustes. El enlace se ve siempre porque este
  // componente es de cliente y no conoce el rol; la puerta está en la página
  // (`puedeVerSueldos`), que es servidor. Quien no tiene permiso llega y
  // encuentra el aviso, nunca los salarios.
  { href: '/admin/proyeccion', label: 'Proyección' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin';
  }
  return pathname === href || pathname.startsWith(href + '/');
}

const BASE_ITEM =
  'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium';
const ITEM_ACTIVO = 'bg-neutral-100 text-neutral-900';
const ITEM_INACTIVO = 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900';

interface NavLinksProps {
  /** Clases extra para el contenedor <nav>. */
  className?: string;
  /** Clases extra para cada <Link> inactivo. */
  itemClassName?: string;
}

export function NavLinks({ className = '', itemClassName = '' }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className={className}>
      {NAV_LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`${BASE_ITEM} ${active ? ITEM_ACTIVO : ITEM_INACTIVO} ${itemClassName}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
