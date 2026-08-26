'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import type { Incompletos } from '@/lib/data/equipo';

/**
 * Aviso global de gente a medio registrar.
 *
 * Sale en TODA la sección de administración, no solo donde se creó, porque el
 * pendiente es del negocio y no de una pantalla: quien dio de alta a alguien en
 * la obra puede no ser quien complete sus datos en la oficina.
 *
 * VIDA DEL AVISO — es lo que se pidió, y cada parte tiene su razón:
 *
 *  · Se calcula de los DATOS (cuántos tienen el puesto "Por definir"), no de lo
 *    que pasó en esta sesión. Por eso vuelve al iniciar sesión de nuevo: el
 *    pendiente sigue ahí aunque la sesión sea otra.
 *  · "Más tarde" lo oculta en MEMORIA, así que sobrevive a moverse entre
 *    pantallas pero NO a recargar. Es deliberado: un descarte que se guardara
 *    para siempre convertiría el aviso en algo que se apaga una vez y nunca
 *    vuelve, que es justo como se pierden estos pendientes.
 *  · Desaparece solo cuando ya no hay nadie incompleto. No hay forma de
 *    silenciarlo de verdad salvo completar los datos.
 */
export function AvisoIncompletos({ datos }: { datos: Incompletos }) {
  const router = useRouter();
  const [oculto, setOculto] = useState(false);

  if (datos.total === 0 || oculto) return null;

  const lista =
    datos.total === 1
      ? `A ${datos.nombres[0]} le faltan datos.`
      : `${datos.nombres.join(', ')}${
          datos.total > datos.nombres.length ? ` y ${datos.total - datos.nombres.length} más` : ''
        } tienen información incompleta.`;

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 motion-safe:animate-[aterrizar_.34s_cubic-bezier(.2,.7,.3,1)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {datos.total === 1
              ? 'Tienes 1 colaborador con información incompleta'
              : `Tienes ${datos.total} colaboradores con información incompleta`}
          </p>
          <p className="mt-0.5 text-sm">{lista}</p>
          {/* Se dice la consecuencia, no solo el hecho: sin esto el aviso es
              ruido y se aprende a ignorarlo. */}
          <p className="mt-1 text-xs text-amber-800">
            Sin puesto ni sueldo capturado, la nómina los cuenta en $0.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              router.push(
                // Con una sola persona no hay nada que elegir: se abre SU
                // formulario. Con varias, la lista recortada — decidir por el
                // usuario cuál completar primero sería adivinar.
                datos.total === 1 && datos.ids[0]
                  ? `/admin/equipo/${datos.ids[0]}?editar=1`
                  : '/admin/equipo?incompletos=1',
              )
            }
          >
            {datos.total === 1 ? 'Completar sus datos' : 'Ir a completar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOculto(true)}>
            Dejar para más tarde
          </Button>
        </div>
      </div>
    </div>
  );
}
