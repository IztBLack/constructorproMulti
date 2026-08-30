'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import {
  nombrePropuesto,
  seEntiende,
  type ProyeccionResumen,
} from '@/lib/data/proyeccion-guardada';
import {
  duplicarProyeccion,
  eliminarProyeccion,
  guardarProyeccion,
  listarProyecciones,
  renombrarProyeccion,
} from './actions';
import type { ProyeccionEstado } from '@/lib/data/proyeccion-nomina';
import { APAGADO, FOCO } from './estilos';

interface Props {
  /// El escenario que está en pantalla ahora mismo, por si se guarda.
  estado: ProyeccionEstado;
  obraFiltro: string;
  totalActual: number;
  personasActuales: number;

  /// La fila abierta, si hay alguna.
  sesionId: string | null;
  sesionNombre: string | null;
  soloLectura: boolean;

  /// ¿El usuario puede guardar? El contador entra a mirar y no arma escenarios.
  puedeEditar: boolean;

  onAbrir: (resumen: ProyeccionResumen, soloLectura: boolean) => void;
  /// Avisa que la fila abierta cambió de nombre o dejó de existir.
  onSesion: (id: string | null, nombre: string | null) => void;
  onCerrar: () => void;
}

const FMT_FECHA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Mexico_City',
});

/// Escenarios guardados: la memoria de la proyección.
///
/// Abrir PARA VER y abrir PARA EDITAR son dos acciones distintas, no un modo que
/// se cambia después. La mayoría de las veces que se abre una vieja es para
/// mirarla —«¿cuánto habíamos calculado la semana pasada?»— y un toque
/// accidental no debería cambiar una cuenta que ya se dio por buena.
///
/// Espeja `proyecciones_guardadas_sheet.dart` del móvil.
export function ProyeccionesGuardadas(props: Props) {
  const {
    estado,
    obraFiltro,
    totalActual,
    personasActuales,
    sesionId,
    sesionNombre,
    soloLectura,
    puedeEditar,
  } = props;

  const [filas, setFilas] = useState<ProyeccionResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /// Qué fila tiene el menú de renombrar abierto, y con qué texto.
  const [renombrando, setRenombrando] = useState<{ id: string; nombre: string } | null>(
    null,
  );
  const [confirmarBorrado, setConfirmarBorrado] = useState<ProyeccionResumen | null>(
    null,
  );
  const [guardarComo, setGuardarComo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarProyecciones().then((r) => {
      if (!vivo) return;
      setFilas(r.filas);
      setError(r.error);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const nombres = useMemo(() => (filas ?? []).map((f) => f.nombre), [filas]);

  async function recargar() {
    const r = await listarProyecciones();
    setFilas(r.filas);
    setError(r.error);
    return r.filas;
  }

  /// Envuelve una acción de escritura: apaga los botones mientras corre, recarga
  /// la lista al terminar y deja el error a la vista en vez de en la consola.
  async function ejecutar(accion: () => Promise<string | null>) {
    setOcupado(true);
    setError(null);
    try {
      const fallo = await accion();
      if (fallo) {
        setError(fallo);
        return false;
      }
      await recargar();
      return true;
    } finally {
      setOcupado(false);
    }
  }

  async function alGuardar(sobreEscribir: boolean, nombre: string) {
    const ok = await ejecutar(async () => {
      const r = await guardarProyeccion({
        id: sobreEscribir && sesionId ? sesionId : undefined,
        nombre,
        estado,
        obraFiltro,
        totalSnapshot: totalActual,
        personasSnapshot: personasActuales,
      });
      if (r.id) props.onSesion(r.id, nombre);
      return r.error;
    });
    if (ok) setGuardarComo(null);
  }

  return (
    <Modal open onClose={props.onCerrar} title="Proyecciones guardadas" size="lg">
      <div className="space-y-4">
        {!puedeEditar && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Tu rol puede consultar las proyecciones guardadas, pero no crearlas ni
            modificarlas.
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* ── Guardar lo que hay en pantalla ─────────────────────────────── */}
        {puedeEditar && (
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-sm font-medium">Lo que tienes en pantalla</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {personasActuales} {personasActuales === 1 ? 'persona' : 'personas'} ·{' '}
              {formatCurrency(totalActual)}
              {soloLectura && ' · abierta solo para consultar'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sesionId && !soloLectura && (
                <Button
                  size="sm"
                  disabled={ocupado}
                  onClick={() => alGuardar(true, sesionNombre ?? '')}
                >
                  Guardar en «{sesionNombre}»
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={ocupado}
                onClick={() => setGuardarComo(nombrePropuesto(estado.lunesMs, nombres))}
              >
                {sesionId && !soloLectura ? 'Guardar como…' : 'Guardar…'}
              </Button>
            </div>
          </div>
        )}

        {/* ── La lista ───────────────────────────────────────────────────── */}
        {filas === null ? (
          <p className="py-6 text-center text-sm text-neutral-500">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">
            Todavía no has guardado ninguna. Arma la semana y guárdala con un nombre
            para poder volver a ella.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {filas.map((f) => {
              const abierta = f.id === sesionId;
              const legible = seEntiende(f);
              return (
                <li key={f.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {f.nombre || 'Sin nombre'}
                        {abierta && (
                          <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900">
                            abierta
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        Semana del {FMT_FECHA.format(new Date(f.lunesMs))} ·{' '}
                        {f.personasSnapshot}{' '}
                        {f.personasSnapshot === 1 ? 'persona' : 'personas'} ·{' '}
                        {formatCurrency(f.totalSnapshot)}{' '}
                        <span className="text-neutral-400">al guardar</span>
                      </p>
                      {!legible && (
                        <p className="mt-1 text-xs text-amber-700">
                          Se guardó con una versión más nueva de la app. Actualiza para
                          poder abrirla.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={!legible}
                        onClick={() => props.onAbrir(f, true)}
                        className={`rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 ${FOCO} ${APAGADO}`}
                      >
                        Ver
                      </button>
                      {puedeEditar && (
                        <button
                          type="button"
                          disabled={!legible}
                          onClick={() => props.onAbrir(f, false)}
                          className={`rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 ${FOCO} ${APAGADO}`}
                        >
                          Editar
                        </button>
                      )}
                      {puedeEditar && (
                        <>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => setRenombrando({ id: f.id, nombre: f.nombre })}
                            className={`rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 ${FOCO} ${APAGADO}`}
                          >
                            Renombrar
                          </button>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() =>
                              ejecutar(async () => {
                                const r = await duplicarProyeccion(
                                  f.id,
                                  nombrePropuesto(f.lunesMs, nombres),
                                );
                                return r.error;
                              })
                            }
                            className={`rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 ${FOCO} ${APAGADO}`}
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => setConfirmarBorrado(f)}
                            className={`rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-900 ${FOCO} ${APAGADO}`}
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Guardar con nombre ───────────────────────────────────────────── */}
      {guardarComo !== null && (
        <Modal
          open
          onClose={() => setGuardarComo(null)}
          title="Guardar la proyección"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setGuardarComo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={ocupado || !guardarComo.trim()}
                onClick={() => alGuardar(false, guardarComo)}
              >
                Guardar
              </Button>
            </>
          }
        >
          <label className="block text-sm">
            Nombre
            <input
              autoFocus
              value={guardarComo}
              onChange={(e) => setGuardarComo(e.target.value)}
              className={`mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 ${FOCO}`}
            />
          </label>
        </Modal>
      )}

      {/* ── Renombrar ────────────────────────────────────────────────────── */}
      {renombrando && (
        <Modal
          open
          onClose={() => setRenombrando(null)}
          title="Renombrar"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setRenombrando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={ocupado || !renombrando.nombre.trim()}
                onClick={async () => {
                  const ok = await ejecutar(async () => {
                    const r = await renombrarProyeccion(
                      renombrando.id,
                      renombrando.nombre,
                    );
                    return r.error ?? null;
                  });
                  if (ok) {
                    // Si era la que está abierta, el rótulo de la pantalla tiene
                    // que cambiar también, o diría el nombre viejo.
                    if (renombrando.id === sesionId) {
                      props.onSesion(sesionId, renombrando.nombre.trim());
                    }
                    setRenombrando(null);
                  }
                }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <label className="block text-sm">
            Nombre
            <input
              autoFocus
              value={renombrando.nombre}
              onChange={(e) =>
                setRenombrando({ ...renombrando, nombre: e.target.value })
              }
              className={`mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 ${FOCO}`}
            />
          </label>
        </Modal>
      )}

      {/* ── Confirmar borrado ────────────────────────────────────────────── */}
      {confirmarBorrado && (
        <Modal
          open
          onClose={() => setConfirmarBorrado(null)}
          title="Eliminar la proyección"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmarBorrado(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={ocupado}
                onClick={async () => {
                  const id = confirmarBorrado.id;
                  const ok = await ejecutar(async () => {
                    const r = await eliminarProyeccion(id);
                    return r.error ?? null;
                  });
                  if (ok) {
                    // El escenario NO se tira: si fue un error, lo que estaba en
                    // pantalla sigue ahí y se puede volver a guardar.
                    if (id === sesionId) props.onSesion(null, null);
                    setConfirmarBorrado(null);
                  }
                }}
              >
                Eliminar
              </Button>
            </>
          }
        >
          <p className="text-sm">
            Se elimina «{confirmarBorrado.nombre || 'Sin nombre'}». Lo que tienes en
            pantalla no se toca: si te arrepientes, puedes volver a guardarlo con el
            mismo nombre.
          </p>
        </Modal>
      )}
    </Modal>
  );
}
