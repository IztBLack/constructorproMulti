import Link, { type LinkProps } from 'next/link';
import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

type TableProps = HTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
};

/** Envoltura con scroll horizontal y borde redondeado, lista para una <table> dentro. */
export function TableContainer({ children, className = '', ...rest }: TableProps) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-neutral-200 bg-white ${className}`}>
      <table className="w-full text-sm" {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-neutral-200 text-left text-neutral-500">{children}</tr>
    </thead>
  );
}

export function Th({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-4 py-3 font-medium ${className}`} {...rest}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

/**
 * `relative` habilita el patrón de fila-enlace accesible (ver `RowLink` más abajo):
 * el <Link> "estirado" que cubre toda la fila usa la <Tr> como contenedor posicionado.
 * No tiene efecto visual si la fila no usa `RowLink`.
 */
export function Tr({ children, className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`relative border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${className}`}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-neutral-600 ${className}`} {...rest}>
      {children}
    </td>
  );
}

type RowLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    /** Texto accesible de la fila para lectores de pantalla (ej. "Ver obra Torre Norte"). */
    children: ReactNode;
  };

/**
 * Fila de tabla clicable, accesible por teclado — patrón "stretched link".
 *
 * Muchas vistas hacían `onClick` directo en `<Tr>`, lo que deja la fila inalcanzable
 * con teclado y sin foco visible. En su lugar, coloca `<RowLink>` como PRIMER hijo
 * dentro de la PRIMERA `<Td>` de la fila (antes del contenido visible):
 *
 * ```tsx
 * <Tr>
 *   <Td className="font-medium text-neutral-900">
 *     <RowLink href={`/admin/obras/${obra.id}`}>Ver obra {obra.nombre}</RowLink>
 *     {obra.nombre}
 *   </Td>
 *   <Td>{obra.cliente}</Td>
 * </Tr>
 * ```
 *
 * `RowLink` es un `<Link>` real (funciona clic derecho / "abrir en pestaña nueva"),
 * posicionado en `absolute inset-0` dentro de la `<Tr>` (que ya trae `position: relative`),
 * por lo que cubre visualmente toda la fila aunque viva dentro de una sola celda. Su
 * texto es sólo para lectores de pantalla (`sr-only`); el contenido visible de la celda
 * se pinta encima porque no está posicionado. Recibe foco de teclado (un solo tab-stop
 * por fila) y muestra anillo de foco visible.
 *
 * Si una fila necesita además un botón/enlace propio (ej. una acción "Eliminar" en otra
 * celda), dale `className="relative z-10"` a ese elemento para que quede por encima del
 * RowLink y siga siendo clicable de forma independiente.
 */
export function RowLink({ className = '', children, ...rest }: RowLinkProps) {
  return (
    <Link
      className={`absolute inset-0 rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900 ${className}`}
      {...rest}
    >
      <span className="sr-only">{children}</span>
    </Link>
  );
}
