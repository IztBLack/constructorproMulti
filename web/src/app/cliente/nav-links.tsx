'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/cliente', label: 'Resumen' },
  { href: '/cliente/cotizaciones', label: 'Cotizaciones' },
  { href: '/cliente/obras', label: 'Obras' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/cliente') {
    return pathname === '/cliente';
  }
  return pathname === href || pathname.startsWith(href + '/');
}

interface NavLinksProps {
  className?: string;
  itemClassName?: string;
}

export function ClienteNavLinks({ className = '', itemClassName = '' }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className={className} aria-label="Navegación del portal">
      {NAV_LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? `rounded-lg px-3 py-1.5 text-sm font-medium bg-neutral-100 text-neutral-900 cursor-pointer transition-colors duration-150 ${itemClassName}`
                : `rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 cursor-pointer transition-colors duration-150 ${itemClassName}`
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
