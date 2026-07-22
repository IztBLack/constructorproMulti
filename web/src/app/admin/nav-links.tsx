'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  { href: '/admin/catalogo', label: 'Catálogo' },
  { href: '/admin/puestos', label: 'Puestos' },
  // "Usuarios" reemplaza al viejo "Vincular": ahora es un solo módulo con el
  // listado de accesos + invitar (mismo código que se canjea en móvil o web).
  // /admin/vincular quedó como redirección para no romper enlaces guardados.
  { href: '/admin/usuarios', label: 'Usuarios' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin';
  }
  return pathname === href || pathname.startsWith(href + '/');
}

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
            className={
              active
                ? `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium bg-neutral-100 text-neutral-900 ${itemClassName}`
                : `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 ${itemClassName}`
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
