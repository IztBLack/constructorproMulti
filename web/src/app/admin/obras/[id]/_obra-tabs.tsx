'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ObraTabsProps {
  obraId: string;
}

/**
 * Estado de conexión, leído con `useSyncExternalStore` (es estado externo del
 * navegador; con `useEffect` + `setState` habría un render en cascada).
 * En el servidor se asume "en línea": es lo que será en cuanto hidrate con red.
 */
function suscribirRed(alCambiar: () => void) {
  window.addEventListener('online', alCambiar);
  window.addEventListener('offline', alCambiar);
  return () => {
    window.removeEventListener('online', alCambiar);
    window.removeEventListener('offline', alCambiar);
  };
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

  const enLinea = useSyncExternalStore(
    suscribirRed,
    () => navigator.onLine,
    () => true,
  );

  // Sin conexión se desactiva TODA la navegación, no solo las otras pestañas:
  // estas páginas se renderizan en el servidor, así que incluso volver a la
  // pestaña actual sale a la red y termina en /offline, perdiendo la pantalla
  // de captura. Mientras no haya señal, quedarse donde uno está es lo correcto.
  const claseBase =
    'inline-flex min-h-11 items-center rounded-t-lg border-b-2 px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2';

  return (
    <div className="space-y-2">
      {enLinea ? (
        <Link
          href="/admin/obras"
          className="inline-flex items-center text-sm text-neutral-500 transition hover:text-neutral-900 hover:underline"
        >
          ← Obras
        </Link>
      ) : (
        <span className="inline-flex items-center text-sm text-neutral-300">← Obras</span>
      )}

      <nav aria-label="Navegación de obra" className="flex flex-wrap gap-1 border-b border-neutral-200">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href, base);

          if (!enLinea) {
            return (
              <span
                key={tab.href}
                aria-current={active ? 'page' : undefined}
                aria-disabled="true"
                title="Sin conexión: la navegación no está disponible"
                className={`${claseBase} cursor-not-allowed ${
                  active
                    ? 'border-neutral-900 text-neutral-900'
                    : 'border-transparent text-neutral-300'
                }`}
              >
                {tab.label}
              </span>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`${claseBase} cursor-pointer ${
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

      {!enLinea && (
        <p className="text-xs text-amber-700">
          Sin conexión · la navegación se reactiva al volver la señal. Puedes seguir
          capturando aquí, o ir al{' '}
          {/* <a> y no <Link>: sin red, la navegación de cliente de Next falla al
              pedir el payload RSC. Una navegación dura sí la puede atender el
              service worker desde el precache. */}
          <a href="/campo" className="font-medium underline">
            pase de lista de campo
          </a>
          , que funciona sin conexión y cubre todas las obras.
        </p>
      )}
    </div>
  );
}
