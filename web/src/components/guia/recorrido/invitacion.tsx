'use client';

import { Button } from '@/components/ui';
import { useGuia } from '../guia-provider';

/**
 * Invitación para cuentas nuevas: un aviso pequeño en una esquina, que no tapa
 * el trabajo ni bloquea nada. Se muestra una sola vez (tras el registro) y se
 * descarta con "Ahora no"; el recorrido sigue disponible en el botón ?.
 */
export function InvitacionRecorrido() {
  const { invitacion, abrirLanzador, cerrarInvitacion } = useGuia();
  if (!invitacion) return null;
  return (
    <aside
      aria-labelledby="invitacion-recorrido"
      className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-80 print:hidden motion-safe:animate-[aterrizar_250ms_ease-out]"
    >
      <h2 id="invitacion-recorrido" className="text-sm font-semibold text-neutral-900">
        ¿Es tu primera vez en el panel?
      </h2>
      <p className="mt-1 text-sm text-neutral-600">
        Un recorrido guiado te muestra cómo funciona, paso a paso y sin guardar nada. Eliges el alcance y la duración.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={abrirLanzador}>
          Ver opciones
        </Button>
        <Button size="sm" variant="ghost" onClick={cerrarInvitacion}>
          Ahora no
        </Button>
      </div>
    </aside>
  );
}
