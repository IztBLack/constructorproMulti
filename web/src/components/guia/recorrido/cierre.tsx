'use client';

import { useRouter } from 'next/navigation';
import { Button, Modal } from '@/components/ui';
import { ALCANCES, infoAlcance } from '@/lib/guia/recorrido/motor';
import type { Alcance } from '@/lib/guia/recorrido/tipos';
import { useGuia } from '../guia-provider';

/**
 * Fin del recorrido: confirma que no se guardó nada, invita a hacerlo con
 * datos reales y, si hay un alcance mayor, lo ofrece con su duración.
 */
export function CierreRecorrido({ alcance }: { alcance: Alcance }) {
  const { alcances, cerrarCierre, iniciar } = useGuia();
  const router = useRouter();
  const info = infoAlcance(alcance);
  const i = ALCANCES.findIndex((a) => a.clave === alcance);
  const mayor = alcances[i + 1];
  const ofrecerMayor = !!mayor && mayor.avance.hechos < mayor.avance.temas;

  return (
    <Modal open onClose={cerrarCierre} size="md" title="Recorrido completado">
      <div className="space-y-3 text-sm text-neutral-700">
        <p>
          Terminaste el recorrido <strong>{info.titulo.toLowerCase()}</strong>. Lo que capturaste durante el recorrido
          era de ejemplo y no se guardó en tu cuenta.
        </p>
        <p>
          El siguiente paso es hacerlo con tus datos reales. Si en algún apartado tienes dudas, toca el ícono de
          información que está junto a él.
        </p>
        {ofrecerMayor && (
          <p className="rounded-lg bg-neutral-50 px-3 py-2">
            ¿Quieres conocer más? El recorrido <strong>{mayor.titulo.toLowerCase()}</strong> agrega{' '}
            {mayor.avance.temas - mayor.avance.hechos} temas, con una duración aproximada de{' '}
            {mayor.avance.minutosRestantes} min.
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {ofrecerMayor && (
          <Button size="sm" variant="secondary" onClick={() => iniciar(mayor.clave)}>
            Continuar con {mayor.titulo.toLowerCase()}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            cerrarCierre();
            router.push('/admin/obras');
          }}
        >
          Registrar mi primera obra
        </Button>
      </div>
    </Modal>
  );
}
