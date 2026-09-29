'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { navDeModulos, type ClaveModulo, type EnlaceNav } from '@/lib/modulos';
import {
  armarBarra,
  enlaceActivo,
  enlaceActual,
  type BarraNav,
  type GrupoNav,
} from '@/lib/nav-categorias';

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
 * LOS ENLACES SALEN DEL CATÁLOGO DE MÓDULOS (`lib/modulos.ts`, campo `nav`), no
 * de una lista aquí: cada módulo declara los suyos, su posición y su categoría,
 * y la barra solo muestra los de los módulos prendidos. Así:
 *   · "Pase de lista" es de `equipo` aunque viva fuera de /admin (ver
 *     src/app/campo/layout.tsx): es una pantalla de uso diario.
 *   · "Proyección" se ve siempre que el módulo esté prendido, aunque el rol no
 *     pueda ver sueldos: la puerta está en la página (`puedeVerSueldos`), que es
 *     servidor. Quien no tiene permiso llega y encuentra el aviso, nunca los
 *     salarios.
 *
 * FORMA (MENU-*, `lib/nav-categorias.ts`): con pocos enlaces (≤ 7) la barra va
 * plana, como siempre. Con más —hasta 15 con todo prendido— no cabían y se
 * desplazaban en horizontal, así que se agrupan en menús por categoría (Obras,
 * Gente, Dinero, Operación). En escritorio cada categoría es un botón que
 * despliega sus enlaces; en el celular un solo botón "Menú" abre un panel con
 * las categorías como secciones.
 *
 * Los menús son DISCLOSURES (botón con `aria-expanded` + lista de enlaces), no
 * `role="menu"`: son enlaces de navegación y el patrón de menú de ARIA exige
 * todo un manejo de foco que aquí no aporta. Escape cierra y regresa el foco al
 * botón; un clic fuera, salir con Tab o cambiar de página también cierran.
 */

const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2';
const BASE_ITEM = `inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium cursor-pointer ${FOCO}`;
const ITEM_ACTIVO = 'bg-neutral-100 text-neutral-900';
const ITEM_INACTIVO = 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900';

/** Enlace dentro de un menú o del panel: renglón completo, 44px de alto. */
const BASE_SUBITEM = `flex min-h-11 items-center rounded-lg px-3 text-sm ${FOCO}`;
const SUBITEM_ACTIVO = 'bg-neutral-100 font-semibold text-neutral-900';
const SUBITEM_INACTIVO = 'font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900';

const CONTENEDOR = 'mx-auto max-w-6xl border-t border-neutral-100 px-4 py-2 sm:px-8';

/** Clave de lo abierto: una categoría, o el panel del celular. */
const PANEL = 'panel';

interface NavLinksProps {
  /** Módulos prendidos de la empresa; los lee el layout (servidor). */
  modulos: readonly ClaveModulo[];
  /** Rol del usuario: quita los enlaces restringidos (p. ej. Utilidad, D1). */
  rol?: string;
}

export function NavLinks({ modulos, rol }: NavLinksProps) {
  const pathname = usePathname();
  const enlaces = navDeModulos(modulos, rol);
  const barra = armarBarra(enlaces);

  if (barra.plana) {
    return (
      <nav
        aria-label="Secciones del panel"
        className={`${CONTENEDOR} flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        {enlaces.map((e) => (
          <EnlaceBarra key={e.href} enlace={e} pathname={pathname} />
        ))}
      </nav>
    );
  }

  return <BarraAgrupada barra={barra} pathname={pathname} actual={enlaceActual(pathname, enlaces)} />;
}

function EnlaceBarra({ enlace, pathname }: { enlace: EnlaceNav; pathname: string }) {
  const activo = enlaceActivo(pathname, enlace.href);
  return (
    <Link
      href={enlace.href}
      aria-current={activo ? 'page' : undefined}
      className={`${BASE_ITEM} ${activo ? ITEM_ACTIVO : ITEM_INACTIVO}`}
    >
      {enlace.label}
    </Link>
  );
}

function SubEnlace({ enlace, pathname }: { enlace: EnlaceNav; pathname: string }) {
  const activo = enlaceActivo(pathname, enlace.href);
  return (
    <li>
      <Link
        href={enlace.href}
        aria-current={activo ? 'page' : undefined}
        className={`${BASE_SUBITEM} ${activo ? SUBITEM_ACTIVO : SUBITEM_INACTIVO}`}
      >
        {enlace.label}
      </Link>
    </li>
  );
}

/** Mueve el foco entre los enlaces de una lista con flechas, Inicio y Fin. */
function moverFoco(e: KeyboardEvent<HTMLElement>) {
  const enlaces = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>('a[href]')];
  const i = enlaces.indexOf(document.activeElement as HTMLAnchorElement);
  let siguiente: number | null = null;
  if (e.key === 'ArrowDown') siguiente = i < 0 ? 0 : (i + 1) % enlaces.length;
  else if (e.key === 'ArrowUp') siguiente = i < 0 ? enlaces.length - 1 : (i - 1 + enlaces.length) % enlaces.length;
  else if (e.key === 'Home') siguiente = 0;
  else if (e.key === 'End') siguiente = enlaces.length - 1;
  if (siguiente === null || enlaces.length === 0) return;
  e.preventDefault();
  enlaces[siguiente].focus();
}

function BarraAgrupada({
  barra,
  pathname,
  actual,
}: {
  barra: BarraNav;
  pathname: string;
  actual: EnlaceNav | null;
}) {
  const base = useId();
  const navRef = useRef<HTMLElement>(null);
  /** Tras abrir con flecha abajo, el foco va al primer enlace del menú. */
  const enfocarPrimero = useRef(false);

  // Lo abierto va amarrado a la página en que se abrió: al navegar (clic en un
  // enlace, atrás/adelante) queda cerrado solo, sin un efecto que lo reinicie.
  const [abierto, setAbierto] = useState<{ clave: string; en: string } | null>(null);
  const clave = abierto?.en === pathname ? abierto.clave : null;

  const abrir = (c: string) => setAbierto({ clave: c, en: pathname });
  const cerrar = (regresarFoco: boolean) => {
    if (regresarFoco && clave) document.getElementById(`${base}-${clave}-boton`)?.focus();
    setAbierto(null);
  };
  const alternar = (c: string) => (clave === c ? setAbierto(null) : abrir(c));

  // Clic (o toque) fuera de la barra: cierra. Solo escucha mientras hay algo abierto.
  useEffect(() => {
    if (!clave) return;
    const fuera = (ev: PointerEvent) => {
      if (!navRef.current?.contains(ev.target as Node)) setAbierto(null);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [clave]);

  // Abrir con flecha abajo: el foco entra al primer enlace ya dibujado.
  useEffect(() => {
    if (!clave || !enfocarPrimero.current) return;
    enfocarPrimero.current = false;
    document.getElementById(`${base}-${clave}`)?.querySelector<HTMLAnchorElement>('a[href]')?.focus();
  }, [clave, base]);

  const alTeclear = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && clave) {
      e.preventDefault();
      cerrar(true);
    }
  };

  return (
    <nav
      ref={navRef}
      aria-label="Secciones del panel"
      className={CONTENEDOR}
      onKeyDown={alTeclear}
      // Un clic en cualquier enlace cierra, también si es la página en la que ya
      // estás (ahí la ruta no cambia y no se cerraría sola).
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a[href]')) setAbierto(null);
      }}
    >
      {/* ── Escritorio y tableta: Inicio + un botón por categoría ─────────── */}
      <ul className="hidden flex-wrap items-center gap-1 sm:flex">
        {barra.items.map((item) =>
          item.tipo === 'enlace' ? (
            <li key={item.enlace.href}>
              <EnlaceBarra enlace={item.enlace} pathname={pathname} />
            </li>
          ) : (
            <MenuCategoria
              key={item.clave}
              grupo={item}
              id={`${base}-${item.clave}`}
              abierto={clave === item.clave}
              activo={actual?.categoria === item.clave}
              pathname={pathname}
              alternar={() => alternar(item.clave)}
              abrirConFoco={() => {
                enfocarPrimero.current = true;
                abrir(item.clave);
              }}
              alSalir={() => setAbierto(null)}
            />
          ),
        )}
      </ul>

      {/* ── Celular: un botón "Menú" y el panel con todo por secciones ───── */}
      <div className="sm:hidden">
        <div className="flex items-center gap-3">
          <button
            id={`${base}-${PANEL}-boton`}
            type="button"
            aria-expanded={clave === PANEL}
            aria-controls={`${base}-${PANEL}`}
            onClick={() => alternar(PANEL)}
            className={`${BASE_ITEM} gap-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-5 w-5"
            >
              {clave === PANEL ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
            Menú
          </button>
          {/* Dónde estás, para no tener que abrir el menú para saberlo. */}
          {actual && (
            <span className="min-w-0 truncate text-sm font-medium text-neutral-900">{actual.label}</span>
          )}
        </div>
        <div
          id={`${base}-${PANEL}`}
          hidden={clave !== PANEL}
          className="mt-2 border-t border-neutral-100 pt-3"
          onKeyDown={moverFoco}
        >
          <ul className="mb-3">
            {barra.sueltos.map((e) => (
              <SubEnlace key={e.href} enlace={e} pathname={pathname} />
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-x-2 gap-y-3">
            {barra.grupos.map((g) => (
              <SeccionPanel key={g.clave} grupo={g} id={`${base}-seccion-${g.clave}`} pathname={pathname} />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

function MenuCategoria({
  grupo,
  id,
  abierto,
  activo,
  pathname,
  alternar,
  abrirConFoco,
  alSalir,
}: {
  grupo: GrupoNav;
  id: string;
  abierto: boolean;
  /** La página actual es de esta categoría. */
  activo: boolean;
  pathname: string;
  alternar: () => void;
  abrirConFoco: () => void;
  alSalir: () => void;
}) {
  return (
    <li
      className="relative"
      // Salir con Tab (el foco se fue a algo que no es este menú): se cierra,
      // para no dejar una lista flotando sobre la página.
      onBlur={(e) => {
        if (abierto && !e.currentTarget.contains(e.relatedTarget as Node | null)) alSalir();
      }}
    >
      <button
        id={`${id}-boton`}
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        // Lo que la vista dice con el fondo: la página actual es de este menú.
        aria-current={activo ? 'true' : undefined}
        onClick={alternar}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !abierto) {
            e.preventDefault();
            abrirConFoco();
          }
        }}
        className={`${BASE_ITEM} gap-1 ${activo || abierto ? ITEM_ACTIVO : ITEM_INACTIVO}`}
      >
        {grupo.titulo}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 motion-safe:transition-transform ${abierto ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <ul
        id={id}
        hidden={!abierto}
        onKeyDown={moverFoco}
        className="absolute left-0 top-full z-40 mt-1 min-w-52 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
      >
        {grupo.enlaces.map((e) => (
          <SubEnlace key={e.href} enlace={e} pathname={pathname} />
        ))}
      </ul>
    </li>
  );
}

function SeccionPanel({ grupo, id, pathname }: { grupo: GrupoNav; id: string; pathname: string }) {
  return (
    <section aria-labelledby={id}>
      <p id={id} className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {grupo.titulo}
      </p>
      <ul>
        {grupo.enlaces.map((e) => (
          <SubEnlace key={e.href} enlace={e} pathname={pathname} />
        ))}
      </ul>
    </section>
  );
}
