'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ObraTabsProps {
  obraId: string;
}

function tabsFor(obraId: string) {
  const base = `/admin/obras/${obraId}`;
  return [
    { href: base, label: 'Detalle' },
    { href: `${base}/asistencia`, label: 'Asistencia' },
    { href: `${base}/nomina`, label: 'Nómina' },
    { href: `${base}/importar`, label: 'Importar' },
  ];
}

function isActive(pathname: string, href: string, base: string): boolean {
  if (href === base) return pathname === base;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegación entre las subsecciones de una obra (Detalle/Asistencia/Nómina/Importar),
 * con back-link a "Obras" arriba. Reemplaza los links "← nombre" y botones sueltos
 * ad-hoc que existían en cada página. Accesible: <nav> con aria-current="page" en
 * el activo, focus visible y objetivo táctil ≥44px.
 */
export default function ObraTabs({ obraId }: ObraTabsProps) {
  const pathname = usePathname();
  const base = `/admin/obras/${obraId}`;
  const tabs = tabsFor(obraId);

  return (
    <div className="space-y-2">
      <Link
        href="/admin/obras"
        className="inline-flex items-center text-sm text-neutral-500 transition hover:text-neutral-900 hover:underline"
      >
        ← Obras
      </Link>

      <nav aria-label="Navegación de obra" className="flex flex-wrap gap-1 border-b border-neutral-200">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href, base);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-t-lg border-b-2 px-4 text-sm font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${
                active
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
