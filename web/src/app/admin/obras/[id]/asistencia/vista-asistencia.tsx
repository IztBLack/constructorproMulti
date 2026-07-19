'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import type { Colaborador } from '@/lib/data/types';
import {
  encolarMarca,
  flush,
  iniciarAutoFlush,
  listarPendientes,
  suscribirEstado,
  type EstadoOffline,
} from '@/lib/offline/cola-asistencia';
import {
  guardarSnapshot,
  leerSnapshot,
  podarSnapshots,
} from '@/lib/offline/snapshot-asistencia';
import CuadriculaAsistencia from './cuadricula-asistencia';
import VistaDia from './vista-dia';
import BarraOffline from './barra-offline';
import { cellKey, type DiaSemana } from './tipos';

type Modo = 'dia' | 'semana';

/**
 * Dueño del estado del pase de lista, del cambio entre vistas y de la captura
 * offline.
 *
 * Ambas vistas comparten un único `fracciones`, así que una marca hecha en la
 * vista de día se refleja en la cuadrícula semanal sin recargar (y al revés).
 *
 * El modo por defecto se resuelve **por CSS**, no por JavaScript: día en
 * pantallas chicas, cuadrícula en `md:` y arriba. Hacerlo con `matchMedia` en un
 * `useEffect` provocaría un parpadeo tras la hidratación; hacerlo en el render
 * del servidor es imposible (no conoce el ancho). Cuando la persona elige un
 * modo explícitamente, esa elección gana en todos los tamaños.
 *
 * La escritura ya no pasa por una Server Action: va a una cola en
 * IndexedDB que se vacía contra Supabase desde el navegador. Una Server Action
 * exige round-trip y no se puede encolar, y el pase de lista se captura en obra,
 * donde la señal falla. Consecuencia: aquí no hay `revalidatePath()`, así que la
 * UI se pinta en optimista y es la fuente de verdad hasta la siguiente carga.
 */
export default function VistaAsistencia({
  obraId,
  empresaId,
  colaboradores: colaboradoresServidor,
  dias,
  fraccionesIniciales,
  hoyMs,
  inicioSemanaMs,
  huboErrorDeCarga = false,
}: {
  obraId: string;
  empresaId: string;
  colaboradores: Colaborador[];
  dias: DiaSemana[];
  fraccionesIniciales: Record<string, number>;
  hoyMs: number;
  inicioSemanaMs: number;
  huboErrorDeCarga?: boolean;
}) {
  const [colaboradores, setColaboradores] = useState(colaboradoresServidor);
  const [fracciones, setFracciones] = useState<Record<string, number>>(fraccionesIniciales);
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());
  const [conError, setConError] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<EstadoOffline | null>(null);
  const [desdeRespaldo, setDesdeRespaldo] = useState(false);
  const [modoManual, setModoManual] = useState<Modo | null>(null);

  // Si hoy cae dentro de la semana mostrada, se abre en hoy; si no (semana
  // pasada o futura), en el lunes.
  const [diaSeleccionadoMs, setDiaSeleccionadoMs] = useState<number>(
    () => dias.find((d) => d.ms === hoyMs)?.ms ?? dias[0].ms,
  );

  /**
   * Reconstruye el estado por celda a partir de la cola. Una celda encolada se
   * marca "pendiente"; si además acumuló un error permanente (RLS, dato
   * inválido), se marca en error: reintentar no va a arreglarla sola.
   */
  const refrescarPendientes = useCallback(async () => {
    const marcas = await listarPendientes();
    const pend = new Set<string>();
    const err = new Set<string>();
    for (const m of marcas) {
      if (m.obraId !== obraId) continue;
      const k = cellKey(m.colaboradorId, m.fecha);
      pend.add(k);
      if (m.ultimoError) err.add(k);
    }
    setPendientes(pend);
    setConError(err);
  }, [obraId]);

  // Arranque: disparadores automáticos de envío + suscripción al estado.
  useEffect(() => {
    const pararAutoFlush = iniciarAutoFlush();
    const desuscribir = suscribirEstado((e) => {
      setEstado(e);
      void refrescarPendientes();
    });
    return () => {
      pararAutoFlush();
      desuscribir();
    };
  }, [refrescarPendientes]);

  // Fase D — respaldo de lectura. Con datos del servidor se guarda la copia de
  // la semana; sin ellos (carga fallida) se intenta rehidratar desde la copia.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      if (!huboErrorDeCarga && colaboradoresServidor.length > 0) {
        await guardarSnapshot(obraId, inicioSemanaMs, {
          colaboradores: colaboradoresServidor,
          fracciones: fraccionesIniciales,
        });
        void podarSnapshots();
        return;
      }
      const copia = await leerSnapshot(obraId, inicioSemanaMs);
      if (!copia || cancelado) return;
      setColaboradores(copia.colaboradores);
      setFracciones((actuales) => ({ ...copia.fracciones, ...actuales }));
      setDesdeRespaldo(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [obraId, inicioSemanaMs, colaboradoresServidor, fraccionesIniciales, huboErrorDeCarga]);

  /**
   * Único punto de escritura del pase de lista. Persiste en la cola local y
   * pinta de inmediato; el envío ocurre en segundo plano.
   */
  async function onMarcar(colaboradorId: string, ms: number, valor: number) {
    const key = cellKey(colaboradorId, ms);
    const previo = fracciones[key] ?? 0;
    if (valor === previo) return; // sin cambios

    setFracciones((p) => ({ ...p, [key]: valor }));
    setPendientes((p) => new Set(p).add(key));

    await encolarMarca({
      obraId,
      colaboradorId,
      fecha: ms,
      fraccion: valor,
      empresaId,
      // Sello de CAPTURA. Es lo que decide el last-write-wins contra la app
      // móvil; sellar al enviar corrompería el orden real de los hechos.
      updatedAt: Date.now(),
    });
    void flush();
  }

  // `null` = automático por CSS. Al fijar un modo, se fuerza en todos los anchos.
  const claseDia =
    modoManual === null ? 'md:hidden' : modoManual === 'dia' ? '' : 'hidden';
  const claseSemana =
    modoManual === null ? 'hidden md:block' : modoManual === 'semana' ? '' : 'hidden';

  return (
    <section className="space-y-3">
      {estado && <BarraOffline estado={estado} onReintentar={() => void flush()} />}

      {desdeRespaldo && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sin conexión con el servidor: se muestra la última copia guardada en este
          dispositivo. Lo que marques se envía al recuperar la señal.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-700">
          <span className={claseDia}>Pase de lista del día</span>
          <span className={claseSemana}>Cuadrícula semanal</span>
        </h2>

        {/* En modo automático se ofrece el cambio hacia la vista contraria a la
            que toca por ancho; por eso son dos botones con visibilidad por CSS. */}
        {modoManual === null ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="md:hidden"
              onClick={() => setModoManual('semana')}
            >
              Ver semana completa
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => setModoManual('dia')}
            >
              Ver por día
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setModoManual(modoManual === 'dia' ? 'semana' : 'dia')}
          >
            {modoManual === 'dia' ? 'Ver semana completa' : 'Ver por día'}
          </Button>
        )}
      </div>

      <div className={claseDia}>
        <VistaDia
          colaboradores={colaboradores}
          dias={dias}
          fracciones={fracciones}
          pendientes={pendientes}
          conError={conError}
          onMarcar={onMarcar}
          diaSeleccionadoMs={diaSeleccionadoMs}
          onCambiarDia={setDiaSeleccionadoMs}
        />
      </div>

      <div className={claseSemana}>
        <p className="mb-2 text-xs text-neutral-400">
          Toca una celda para cambiar: · sin registro → ½ medio → ¾ → 1 completa
        </p>
        <CuadriculaAsistencia
          colaboradores={colaboradores}
          dias={dias}
          fracciones={fracciones}
          pendientes={pendientes}
          conError={conError}
          onMarcar={onMarcar}
        />
      </div>
    </section>
  );
}
