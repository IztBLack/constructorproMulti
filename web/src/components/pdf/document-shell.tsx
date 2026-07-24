import type { ReactNode } from 'react';

/**
 * Contenedor de una página de documento imprimible. `tema-papel` lo deja fuera
 * del tema oscuro (es una hoja, siempre blanca); el fondo neutro enmarca el
 * documento como en un visor. Genérico para todos los PDF.
 */
export function DocumentShell({ children }: { children: ReactNode }) {
  return (
    <div className="tema-papel min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-[880px] space-y-5 px-4 py-6">{children}</div>
    </div>
  );
}
