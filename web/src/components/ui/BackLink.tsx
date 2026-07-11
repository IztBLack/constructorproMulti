import Link, { type LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type BackLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: ReactNode;
  };

/**
 * Enlace estándar "volver": chevron SVG + texto. Reemplaza los distintos patrones
 * sueltos ("← Obras", flechas de texto, etc.) usados en varias páginas por un único
 * estándar reutilizable. Es un `<Link>` real de next/link (navegación, prefetch,
 * clic derecho / abrir en pestaña nueva), con foco visible y `cursor-pointer`.
 *
 * Uso:
 * ```tsx
 * <BackLink href="/admin/obras">Obras</BackLink>
 * ```
 */
export function BackLink({ children, className = '', ...rest }: BackLinkProps) {
  return (
    <Link
      className={`inline-flex items-center gap-1 text-sm font-medium text-neutral-500 transition-colors duration-150 hover:text-neutral-700 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${className}`}
      {...rest}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M15 19l-7-7 7-7" />
      </svg>
      {children}
    </Link>
  );
}
