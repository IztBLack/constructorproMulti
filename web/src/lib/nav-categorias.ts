/**
 * Cómo se DIBUJA la barra del panel: plana o agrupada en menús por categoría
 * (MENU-* en `docs/PROGRESO_ALCANCE.md`).
 *
 * Módulo PURO: recibe los enlaces que ya filtró `navDeModulos` (módulos
 * prendidos + rol) y solo decide la forma. No filtra nada por su cuenta: si un
 * enlace llega aquí es porque el usuario lo puede ver.
 *
 * La categoría de cada enlace NO se declara aquí: viene del catálogo
 * (`lib/modulos.ts`, campo `categoria` de cada `nav`). Aquí solo viven el
 * umbral y las reglas de agrupado.
 */

import { CATEGORIAS_NAV, type CategoriaNav, type EnlaceNav } from '@/lib/modulos';

/**
 * Con este número de enlaces visibles o menos (Inicio incluido), la barra va
 * PLANA, como siempre. El paquete del independiente (obras, cotizaciones,
 * equipo, caja) da 6 enlaces: esconder 5 pantallas detrás de menús le cobra un
 * clic extra a quien menos lo necesita. 7 es lo que cabe en una fila de
 * escritorio sin apretarse (MENU-3).
 */
export const UMBRAL_BARRA_PLANA = 7;

/** Un grupo de enlaces bajo el título de su categoría. */
export interface GrupoNav {
  clave: CategoriaNav;
  titulo: string;
  enlaces: EnlaceNav[];
}

/** Lo que va en la fila de la barra agrupada: un enlace suelto o un menú. */
export type ItemBarra =
  | { tipo: 'enlace'; enlace: EnlaceNav }
  | ({ tipo: 'menu' } & GrupoNav);

export interface BarraNav {
  /** true = se dibujan todos los enlaces en fila, sin menús. */
  plana: boolean;
  /** Barra agrupada (escritorio): sueltos y menús, en orden. Con `plana`, todos sueltos. */
  items: ItemBarra[];
  /** Enlaces sin categoría (Inicio). Van primero en el panel del celular. */
  sueltos: EnlaceNav[];
  /**
   * Todas las categorías con algo visible, en orden, AUNQUE tengan un solo
   * enlace: en el panel del celular un grupo de uno no esconde nada, y el
   * encabezado le da contexto.
   */
  grupos: GrupoNav[];
}

/**
 * Agrupa por categoría. Orden estable: los sueltos primero; las categorías en
 * el orden de `CATEGORIAS_NAV`; dentro de cada una, el orden en que llegaron
 * (el `orden` del catálogo, el mismo de la barra plana). Una categoría sin
 * enlaces no aparece.
 */
export function agruparPorCategoria(enlaces: readonly EnlaceNav[]): {
  sueltos: EnlaceNav[];
  grupos: GrupoNav[];
} {
  const sueltos = enlaces.filter((e) => e.categoria === null);
  const grupos = CATEGORIAS_NAV.map(({ clave, titulo }) => ({
    clave,
    titulo,
    enlaces: enlaces.filter((e) => e.categoria === clave),
  })).filter((g) => g.enlaces.length > 0);
  return { sueltos, grupos };
}

/**
 * La forma de la barra para estos enlaces.
 *
 *   · ≤ `umbral` enlaces → plana, en el orden de siempre.
 *   · Más → Inicio suelto + un menú por categoría. Una categoría que quedó con
 *     UN solo enlace (por módulos o por rol) va suelta en su lugar: un menú de
 *     uno es un clic de más para nada.
 */
export function armarBarra(
  enlaces: readonly EnlaceNav[],
  umbral: number = UMBRAL_BARRA_PLANA,
): BarraNav {
  const { sueltos, grupos } = agruparPorCategoria(enlaces);
  if (enlaces.length <= umbral) {
    return {
      plana: true,
      items: enlaces.map((enlace) => ({ tipo: 'enlace', enlace })),
      sueltos,
      grupos,
    };
  }
  const items: ItemBarra[] = [
    ...sueltos.map((enlace): ItemBarra => ({ tipo: 'enlace', enlace })),
    ...grupos.map(
      (g): ItemBarra => (g.enlaces.length === 1 ? { tipo: 'enlace', enlace: g.enlaces[0] } : { tipo: 'menu', ...g }),
    ),
  ];
  return { plana: false, items, sueltos, grupos };
}

/**
 * ¿Este enlace es la página actual? Inicio solo en `/admin` exacto (si no,
 * estaría activo en todo el panel); los demás también en sus subpáginas
 * (`/admin/obras/123` marca Obras), comparando por segmento completo.
 */
export function enlaceActivo(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

/** El enlace de la página actual entre estos, o `null`. */
export function enlaceActual(pathname: string, enlaces: readonly EnlaceNav[]): EnlaceNav | null {
  return enlaces.find((e) => enlaceActivo(pathname, e.href)) ?? null;
}
