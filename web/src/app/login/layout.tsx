import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Layout mínimo cuyo único propósito es dar metadata a `/login`.
 *
 * `login/page.tsx` es Client Component (usa `useState` y `useSearchParams`), y
 * un Client Component no puede exportar `metadata`. Sin esto, la pestaña del
 * navegador dice "ConstructorPro" a secas, igual que el resto del sitio, y en
 * un historial con varias pestañas abiertas no se distingue cuál es el acceso.
 */
export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Accede a tu cuenta de ConstructorPro.',
  // Una pantalla de acceso no aporta nada en un buscador y es superficie de
  // autenticación. Coincide con el `Disallow` de `app/robots.ts`.
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
