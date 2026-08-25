'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import BarraOffline from '@/components/offline/barra-offline';
import { OPCIONES, formatoJornadas } from '@/lib/asistencia/fracciones';
import {
  cargarExtrasCampo,
  cargarPaseLista,
  claveFraccion,
  puedeAltaRapida,
  type ColaboradorPaseLista,
  type DatosPaseLista,
  type ExtrasCampo,
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
import {
  asignarObraColaborador,
  crearColaboradorRapido,
  desvincularObraColaborador,
} from '@/app/admin/equipo/actions';

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

  // "Mover a otra obra" desde el pase (paridad móvil). `recargar` fuerza recargar
  // el día tras mover, para que la persona reaparezca bajo la obra nueva.
  const [recargar, setRecargar] = useState(0);
  const [moviendoKey, setMoviendoKey] = useState<string | null>(null);

  // Extras del alta rápida. Se piden UNA vez y solo sirven en línea; si fallan,
  // `rol` queda en null y la pantalla no ofrece el alta (ver cargarExtrasCampo).
  const [extras, setExtras] = useState<ExtrasCampo>({ rol: null, puestos: [], equipo: [] });
  const [altaEnObra, setAltaEnObra] = useState<string | null>(null);
  const [filtroEquipo, setFiltroEquipo] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [altaPend, setAltaPend] = useState(false);
  const [altaError, setAltaError] = useState<string | null>(null);
  const [obraDestino, setObraDestino] = useState('');
  const [movPend, setMovPend] = useState(false);
  const [movError, setMovError] = useState<string | null>(null);

  /// Trae a alguien del equipo a esta obra. `asignarObraColaborador` cierra sus
  /// asignaciones anteriores por defecto, así que "agregar a otra obra" es en
  /// realidad MOVER — que es lo que se espera al usarlo desde el pase de lista.
  async function traerAObra(colaboradorId: string, obraId: string) {
    setAltaPend(true);
    setAltaError(null);
    try {
      const r = await asignarObraColaborador(colaboradorId, obraId);
      if (!r.ok) {
        setAltaError(r.error ?? 'No se pudo agregar.');
        return;
      }
      setAltaEnObra(null);
      setFiltroEquipo('');
      setRecargar((n) => n + 1);
    } catch {
      setAltaError('No se pudo agregar (¿sin conexión?).');
    } finally {
      setAltaPend(false);
    }
  }

  /// Alta con SOLO el nombre. El resto queda pendiente y la persona se marca
  /// como incompleta; el aviso de abajo es el que empuja a completarla.
  async function crearYAgregar(obraId: string) {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setAltaPend(true);
    setAltaError(null);
    try {
      const r = await crearColaboradorRapido(nombre, obraId);
      if (!r.ok) {
        setAltaError(r.error ?? 'No se pudo crear.');
        return;
      }
      setNuevoNombre('');
      setAltaEnObra(null);
      setRecargar((n) => n + 1);
    } catch {
      setAltaError('No se pudo crear (¿sin conexión?).');
    } finally {
      setAltaPend(false);
    }
  }

  /// Quitar NO es eliminar: cierra la asignación (`fecha_salida`) y conserva el
  /// historial y la asistencia ya registrada. La baja real vive en Equipo.
  async function quitarDeObra(colaboradorId: string, obraId: string, nombre: string) {
    if (!confirm(`¿Quitar a ${nombre} de esta obra? Se conserva su historial y su asistencia ya registrada.`)) {
      return;
    }
    try {
      const r = await desvincularObraColaborador(colaboradorId, obraId);
      if (!r.ok) {
        setMovError(r.error ?? 'No se pudo quitar.');
        return;
      }
      setRecargar((n) => n + 1);
    } catch {
      setMovError('No se pudo quitar (¿sin conexión?).');
    }
  }

  async function mover(colaboradorId: string, destinoId: string) {
    if (!destinoId) return;
    setMovPend(true);
    setMovError(null);
    try {
      const r = await asignarObraColaborador(colaboradorId, destinoId);
      if (!r.ok) {
        setMovError(r.error ?? 'No se pudo mover.');
        return;
      }
      setMoviendoKey(null);
      setObraDestino('');
      setRecargar((n) => n + 1);
    } catch {
      setMovError('No se pudo mover (¿sin conexión?).');
    } finally {
      setMovPend(false);
    }
  }

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

  // Extras del "+": solo sirven en línea y no entran en el snapshot offline.
  useEffect(() => {
    let vivo = true;
    void cargarExtrasCampo().then((e) => {
      if (vivo) setExtras(e);
    });
    return () => {
      vivo = false;
    };
  }, [recargar]);

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
  }, [dia, recargar]);

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

                {/* El "+" solo aparece para quien puede escribir: `colaboradores`
                    y `colaborador_sueldo` únicamente aceptan alta de admin y
                    supervisor (0014 y 0027). Enseñárselo a un usuario de campo
                    sería ofrecerle una acción que el servidor va a rechazar. */}
                {puedeAltaRapida(extras.rol) && (
                  <button
                    type="button"
                    aria-label={`Agregar personas a ${obra.nombre}`}
                    aria-expanded={altaEnObra === obra.id}
                    onClick={(e) => {
                      // El encabezado es un <summary>: sin esto, el clic también
                      // pliega la obra entera.
                      e.preventDefault();
                      e.stopPropagation();
                      setAltaEnObra(altaEnObra === obra.id ? null : obra.id);
                      setFiltroEquipo('');
                      setNuevoNombre('');
                      setAltaError(null);
                    }}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-xl leading-none text-neutral-700 transition hover:bg-neutral-100"
                  >
                    +
                  </button>
                )}
              </div>
            </summary>

            {altaEnObra === obra.id && (
              <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3">
                {/* Crear va PRIMERO: cuando alguien abre esto en la obra suele
                    ser porque llegó una persona que no está en la lista. */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder="Nombre de alguien nuevo"
                    className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                  />
                  <Button
                    size="sm"
                    disabled={altaPend || !nuevoNombre.trim()}
                    onClick={() => void crearYAgregar(obra.id)}
                  >
                    {altaPend ? '…' : 'Crear y agregar'}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Se crea solo con el nombre. El puesto y el sueldo quedan pendientes.
                </p>

                <div className="mt-3 border-t border-neutral-200 pt-3">
                  <input
                    value={filtroEquipo}
                    onChange={(e) => setFiltroEquipo(e.target.value)}
                    placeholder="…o busca a alguien del equipo"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                  />
                  <ul className="mt-2 max-h-56 divide-y divide-neutral-200 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
                    {extras.equipo
                      .filter(
                        (c) =>
                          !obra.colaboradores.some((x) => x.id === c.id) &&
                          c.nombre.toLowerCase().includes(filtroEquipo.trim().toLowerCase()),
                      )
                      .map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            disabled={altaPend}
                            onClick={() => void traerAObra(c.id, obra.id)}
                            className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-neutral-900">{c.nombre}</span>
                              {/* Se dice de dónde viene: agregarlo aquí lo DA DE
                                  BAJA de su obra actual, y eso no debe pasar a
                                  ciegas. */}
                              {c.obraActual && (
                                <span className="block truncate text-xs text-amber-700">
                                  Hoy está en {c.obraActual} · se moverá
                                </span>
                              )}
                            </span>
                            {c.incompleto && (
                              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                                Sin datos
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    {extras.equipo.length === 0 && (
                      <li className="px-3 py-3 text-sm text-neutral-500">
                        No se pudo cargar el equipo (¿sin conexión?).
                      </li>
                    )}
                  </ul>
                </div>

                {altaError && <p className="mt-2 text-xs text-red-600">{altaError}</p>}
              </div>
            )}

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

                            {obras.length > 1 &&
                              (moviendoKey === k ? (
                                <div className="mt-2 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select
                                      value={obraDestino}
                                      onChange={(e) => setObraDestino(e.target.value)}
                                      disabled={movPend}
                                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                                    >
                                      <option value="">Mover a…</option>
                                      {obras
                                        .filter((o) => o.id !== obra.id)
                                        .map((o) => (
                                          <option key={o.id} value={o.id}>
                                            {o.nombre}
                                          </option>
                                        ))}
                                    </select>
                                    <Button
                                      size="sm"
                                      disabled={movPend || !obraDestino}
                                      onClick={() => void mover(c.id, obraDestino)}
                                    >
                                      {movPend ? '…' : 'Mover'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={movPend}
                                      onClick={() => {
                                        setMoviendoKey(null);
                                        setObraDestino('');
                                        setMovError(null);
                                      }}
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                  {movError && <p className="text-xs text-red-600">{movError}</p>}
                                </div>
                              ) : (
                                <div className="mt-2 flex flex-wrap items-center gap-4">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMoviendoKey(k);
                                      setObraDestino('');
                                      setMovError(null);
                                    }}
                                    className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                                  >
                                    Mover a otra obra
                                  </button>
                                  {/* Quitar NO elimina a la persona: cierra su
                                      asignación y conserva historial y
                                      asistencia. La baja real vive en Equipo. */}
                                  <button
                                    type="button"
                                    onClick={() => void quitarDeObra(c.id, obra.id, c.nombre)}
                                    className="text-xs text-neutral-500 underline underline-offset-2 hover:text-red-700"
                                  >
                                    Quitar de esta obra
                                  </button>
                                </div>
                              ))}
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
