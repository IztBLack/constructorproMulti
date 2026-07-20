'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import BarraOffline from '@/components/offline/barra-offline';
import { OPCIONES, formatoJornadas } from '@/lib/asistencia/fracciones';
import {
  cargarPaseLista,
  claveFraccion,
  type ColaboradorPaseLista,
  type DatosPaseLista,
} from '@/lib/data/pase-lista-cliente';
import {
  guardarSnapshotDia,
  leerSnapshotDiaConMotivo,
  podarSnapshotsDia,
  type MotivoSinCopia,
} from '@/lib/offline/snapshot-pase-lista';
import {
  encolarMarca,
  flush,
  iniciarAutoFlush,
  listarPendientes,
  suscribirEstado,
  type EstadoOffline,
} from '@/lib/offline/cola-asistencia';
import { hoyMxMs, partesTz, medianocheMx, sumarDiasCalendario } from '@/lib/data/tz';

/**
 * Instante en que la persona tocó el botón.
 *
 * Es lo que decide el last-write-wins contra la app móvil, así que tiene que ser
 * el momento de la CAPTURA y no el del envío (ver `cola-asistencia.ts`). Vive
 * fuera del componente porque `Date.now()` es impuro y no debe ejecutarse
 * durante el render; aquí solo lo llaman los manejadores de eventos.
 */
function selloDeCaptura(): number {
  return Date.now();
}

/** Suma días de calendario a una medianoche de México, sin salirse de la zona. */
function sumarDias(diaMs: number, n: number): number {
  const p = partesTz(diaMs);
  const c = sumarDiasCalendario(p.year, p.month, p.day, n);
  return medianocheMx(c.y, c.m0, c.d);
}

const FMT_DIA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Agrupa por cuadrilla vigente. Cuadrillas primero (por nombre), "sin
 *  cuadrilla" al final — mismo orden que el pase de lista del móvil. */
function agruparPorCuadrilla(cols: ColaboradorPaseLista[]) {
  const grupos = new Map<string | null, { nombre: string | null; miembros: ColaboradorPaseLista[] }>();
  for (const c of cols) {
    const k = c.cuadrillaId;
    if (!grupos.has(k)) grupos.set(k, { nombre: c.cuadrillaNombre, miembros: [] });
    grupos.get(k)!.miembros.push(c);
  }
  return [...grupos.entries()].sort((a, b) => {
    if (a[0] === null) return 1;
    if (b[0] === null) return -1;
    return (a[1].nombre ?? '').localeCompare(b[1].nombre ?? '');
  });
}

/**
 * Superpone la cola pendiente sobre un conjunto de fracciones.
 *
 * Imprescindible: ni el servidor ni la copia local conocen lo capturado sin
 * señal (eso vive en la cola). Sin esta fusión, recargar la pantalla en obra
 * mostraría valores viejos y el capturista creería que sus marcas se perdieron.
 */
async function conPendientes(base: Record<string, number>, diaMs: number) {
  const marcas = await listarPendientes();
  const out = { ...base };
  for (const m of marcas) {
    if (m.fecha !== diaMs) continue;
    out[claveFraccion(m.obraId, m.colaboradorId)] = m.fraccion;
  }
  return out;
}

export default function PaseLista() {
  // "Hoy" se lee como estado externo del navegador. No puede calcularse durante
  // el render (la página se prerenderiza estática: quedaría congelada la fecha
  // del build) ni con `useEffect` + `setState` (render en cascada). El snapshot
  // del servidor es 0 → pinta "Cargando…" hasta hidratar en el cliente.
  const hoy = useSyncExternalStore(
    () => () => {},
    () => hoyMxMs(),
    () => 0,
  );
  const [diaElegido, setDiaElegido] = useState<number | null>(null);
  const dia = diaElegido ?? (hoy || null);

  const [datos, setDatos] = useState<DatosPaseLista | null>(null);
  const [fracciones, setFracciones] = useState<Record<string, number>>({});
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());
  const [conError, setConError] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<EstadoOffline | null>(null);
  const [desdeRespaldo, setDesdeRespaldo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [motivoSinCopia, setMotivoSinCopia] = useState<MotivoSinCopia | null>(null);

  /** Estado por celda, reconstruido desde la cola (solo el día en pantalla). */
  const refrescarPendientes = useCallback(async () => {
    if (dia === null) return;
    const marcas = await listarPendientes();
    const pend = new Set<string>();
    const err = new Set<string>();
    for (const m of marcas) {
      if (m.fecha !== dia) continue;
      const k = claveFraccion(m.obraId, m.colaboradorId);
      pend.add(k);
      if (m.ultimoError) err.add(k);
    }
    setPendientes(pend);
    setConError(err);
  }, [dia]);

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

  // Carga del día: primero la copia local (instantánea y funciona sin señal),
  // luego el servidor si hay red. Ese orden es lo que permite abrir la app en
  // frío dentro de la obra y empezar a capturar de inmediato.
  useEffect(() => {
    if (dia === null) return;
    let cancelado = false;

    void (async () => {
      setCargando(true);
      setError(null);

      const { datos: copia, motivo } = await leerSnapshotDiaConMotivo(dia);
      if (cancelado) return;
      setMotivoSinCopia(copia ? null : (motivo ?? null));
      if (copia) {
        setDatos(copia);
        setFracciones(await conPendientes(copia.fracciones, dia));
        setDesdeRespaldo(true);
        setCargando(false);
      }

      try {
        const frescos = await cargarPaseLista(dia);
        if (cancelado) return;
        setDatos(frescos);
        // Lo encolado gana sobre lo que traiga el servidor: son marcas que aún
        // no llegaron allá.
        setFracciones(await conPendientes(frescos.fracciones, dia));
        setDesdeRespaldo(false);
        setError(null);
        await guardarSnapshotDia(frescos);
        void podarSnapshotsDia();
      } catch (e) {
        if (cancelado) return;
        if (!copia) {
          setError(
            e instanceof Error && /sesi[oó]n|JWT|auth/i.test(e.message)
              ? 'sesion'
              : 'No se pudo cargar el pase de lista y no hay copia guardada en este dispositivo.',
          );
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [dia]);

  async function marcar(obraId: string, colaboradorId: string, valor: number) {
    if (dia === null || !datos) return;
    const k = claveFraccion(obraId, colaboradorId);
    if ((fracciones[k] ?? 0) === valor) return;

    setFracciones((p) => ({ ...p, [k]: valor }));
    setPendientes((p) => new Set(p).add(k));

    await encolarMarca({
      obraId,
      colaboradorId,
      fecha: dia,
      fraccion: valor,
      empresaId: datos.empresaId,
      updatedAt: selloDeCaptura(),
    });
    void flush();
  }

  function marcarTodos(obraId: string, miembros: ColaboradorPaseLista[]) {
    for (const c of miembros) {
      if ((fracciones[claveFraccion(obraId, c.id)] ?? 0) !== 1) {
        void marcar(obraId, c.id, 1);
      }
    }
    setConfirmando(null);
  }

  if (dia === null) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  if (error === 'sesion') {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
        <p className="font-medium text-neutral-900">Necesitas iniciar sesión</p>
        <p className="mt-1 text-sm text-neutral-500">
          Esta pantalla usa tu cuenta para saber de qué obras pasar lista.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium underline">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  const obras = datos?.obras ?? [];

  return (
    <div className="space-y-4">
      {/* Selector de día */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-2 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDiaElegido(sumarDias(dia, -1))}
          aria-label="Día anterior"
        >
          ←
        </Button>
        <div className="text-center">
          <p className="text-sm font-medium capitalize text-neutral-900">
            {FMT_DIA.format(new Date(dia))}
          </p>
          {dia !== hoy && (
            <button
              type="button"
              onClick={() => setDiaElegido(hoy)}
              className="cursor-pointer text-xs text-neutral-500 underline"
            >
              Ir a hoy
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDiaElegido(sumarDias(dia, 1))}
          aria-label="Día siguiente"
        >
          →
        </Button>
      </div>

      {estado && <BarraOffline estado={estado} onReintentar={() => void flush()} />}

      {desdeRespaldo && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Mostrando la copia guardada en este dispositivo. Lo que marques se envía al
          recuperar la señal.
        </p>
      )}

      {error && error !== 'sesion' && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {cargando && obras.length === 0 && <p className="text-sm text-neutral-500">Cargando…</p>}

      {/* Sin datos hay que decir POR QUÉ. Una pantalla vacía en obra, sin señal,
          es indistinguible de "no tienes gente asignada" y no da qué hacer. */}
      {!cargando && obras.length === 0 && !error && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
          {motivoSinCopia && motivoSinCopia !== 'sin-copia' ? (
            <>
              <p className="font-medium text-neutral-900">
                {motivoSinCopia === 'otra-empresa'
                  ? 'La copia de este dispositivo es de otra empresa'
                  : 'No se pudo validar tu sesión sin conexión'}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {motivoSinCopia === 'otra-empresa'
                  ? 'Se descartó por seguridad. Conéctate para cargar la tuya.'
                  : 'Tus marcas guardadas siguen a salvo. Conéctate una vez y vuelve a abrir esta pantalla.'}
              </p>
            </>
          ) : motivoSinCopia === 'sin-copia' ? (
            <>
              <p className="font-medium text-neutral-900">
                No hay copia de este día en el dispositivo
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Abre esta pantalla con señal al menos una vez para poder usarla sin
                conexión.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-neutral-900">
                No hay obras activas con personal por día.
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Activa una obra y asígnale colaboradores para pasar lista.
              </p>
            </>
          )}
        </div>
      )}

      {obras.map((obra) => {
        const sinMarcar = obra.colaboradores.filter(
          (c) => (fracciones[claveFraccion(obra.id, c.id)] ?? 0) === 0,
        ).length;
        const totalObra = obra.colaboradores.reduce(
          (acc, c) => acc + (fracciones[claveFraccion(obra.id, c.id)] ?? 0),
          0,
        );

        return (
          <details key={obra.id} open className="rounded-xl border border-neutral-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900">{obra.nombre}</p>
                  <p className="text-xs text-neutral-500">
                    {obra.colaboradores.length} por día · {formatoJornadas(totalObra)} jornadas
                    {sinMarcar > 0 && ` · ${sinMarcar} sin marcar`}
                  </p>
                </div>
              </div>
            </summary>

            <div className="space-y-3 border-t border-neutral-100 px-3 py-3">
              {agruparPorCuadrilla(obra.colaboradores).map(([cuadrillaId, grupo]) => {
                const claveGrupo = `${obra.id}|${cuadrillaId ?? '-'}`;
                const faltan = grupo.miembros.filter(
                  (c) => (fracciones[claveFraccion(obra.id, c.id)] ?? 0) !== 1,
                ).length;

                return (
                  <div key={claveGrupo} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        {grupo.nombre ?? 'Sin cuadrilla'}
                      </p>
                      {confirmando === claveGrupo ? (
                        <span className="flex items-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setConfirmando(null)}>
                            Cancelar
                          </Button>
                          <Button size="sm" onClick={() => marcarTodos(obra.id, grupo.miembros)}>
                            Confirmar
                          </Button>
                        </span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={faltan === 0}
                          onClick={() => setConfirmando(claveGrupo)}
                        >
                          Todos ✓
                        </Button>
                      )}
                    </div>

                    {confirmando === claveGrupo && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Se marcará día completo a {grupo.miembros.length} persona(s). Los que
                        tengan ½ o ¾ se sobrescriben.
                      </p>
                    )}

                    <ul className="space-y-2">
                      {grupo.miembros.map((c) => {
                        const k = claveFraccion(obra.id, c.id);
                        const actual = fracciones[k] ?? 0;
                        const fallo = conError.has(k);
                        return (
                          <li
                            key={c.id}
                            className={`rounded-lg border p-2.5 ${
                              fallo ? 'border-red-300' : 'border-neutral-200'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-neutral-900">{c.nombre}</span>
                              {fallo ? (
                                <span className="text-xs font-medium text-red-600">No se guardó</span>
                              ) : pendientes.has(k) ? (
                                <span className="text-xs text-neutral-400">● por enviar</span>
                              ) : null}
                            </div>
                            <div
                              className="grid grid-cols-4 gap-1.5"
                              role="group"
                              aria-label={`Pase de lista de ${c.nombre}`}
                            >
                              {OPCIONES.map((o) => {
                                const elegido = o.valor === actual;
                                return (
                                  <button
                                    key={o.valor}
                                    type="button"
                                    aria-pressed={elegido}
                                    aria-label={o.etiqueta}
                                    onClick={() => void marcar(obra.id, c.id, o.valor)}
                                    className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border text-sm transition ${
                                      elegido
                                        ? 'border-neutral-900 bg-neutral-900 text-white'
                                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50'
                                    }`}
                                  >
                                    <span className="text-base font-semibold leading-none">
                                      {o.simbolo}
                                    </span>
                                    <span
                                      className={`mt-0.5 text-[10px] leading-none ${
                                        elegido ? 'text-neutral-300' : 'text-neutral-400'
                                      }`}
                                    >
                                      {o.etiqueta}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
