import type { ReactNode } from 'react';
import { exigirModulo } from '@/lib/data/modulos';
import type { ClaveModulo } from '@/lib/modulos';
import { ModuloApagado } from './modulo-apagado';

/**
 * Envuelve el contenido de un módulo: si está prendido lo muestra tal cual; si
 * está apagado, muestra `<ModuloApagado>` en su lugar.
 *
 * Se usa en el `layout.tsx` de cada segmento del módulo (una línea por
 * segmento), así cubre todas sus páginas sin tocar cada una.
 *
 * OJO, NO ES SEGURIDAD: en el App Router el layout y la página se resuelven en
 * paralelo, así que la página puede llegar a consultar sus datos aunque luego
 * no se muestre. Está bien: un módulo apagado es una preferencia de producto
 * (plan §2.3) y lo que se puede leer lo sigue decidiendo la RLS.
 */
export async function GuardiaModulo({
  clave,
  children,
  volverHref,
  volverTexto,
}: {
  clave: ClaveModulo;
  children: ReactNode;
  volverHref?: string;
  volverTexto?: string;
}) {
  const guardia = await exigirModulo(clave);
  if (guardia.activo) return <>{children}</>;
  return (
    <ModuloApagado
      modulo={guardia.modulo}
      esAdmin={guardia.esAdmin}
      volverHref={volverHref}
      volverTexto={volverTexto}
    />
  );
}
