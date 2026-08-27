/**
 * Logotipo de ConstructorPro (cuadro oscuro con el trazo del edificio).
 *
 * Vivía dentro de `app/page.tsx`; se sacó aquí al aparecer las páginas legales
 * (`/privacidad`, `/terminos`, `/soporte`), que llevan el mismo encabezado. Es
 * la marca del sitio público: si cambia, cambia en un solo lugar.
 *
 * Sobre el tema: `bg-neutral-900 text-white` se invierte solo en modo oscuro por
 * la paleta invertida de `globals.css` (los grises Y el blanco/negro cambian de
 * papel), así que el logo sigue legible en ambos temas sin una sola clase `dark:`.
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
      </svg>
    </span>
  );
}
