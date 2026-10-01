'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Modal } from '@/components/ui';
import { siguienteTarjeta } from '@/lib/guia/progreso';
import type { ClaveMazo, Mazo } from '@/lib/guia/tipos';
import { useGuia } from './guia-provider';
import { MaquetaGuia } from './maqueta-guia';

/**
 * La Guía: niveles (mazos) de tarjetas que se voltean.
 *
 * Frente: qué es y para qué sirve, con un dibujo de EJEMPLO. Reverso: cómo se
 * hace, paso por paso, y "Llévame ahí" a la pantalla real. El avance sube de
 * rango (de Ayudante a Residente de obra) y cada nivel completo da un sello.
 */
export function GuiaModal() {
  const { abierta, cerrar, bienvenida } = useGuia();
  return (
    <Modal
      open={abierta}
      onClose={cerrar}
      size="lg"
      title={bienvenida ? '¡Bienvenido a ConstructorPro!' : 'Guía de ConstructorPro'}
    >
      {/* El Modal solo pinta a sus hijos abierto: al cerrar, `Cuerpo` se
          desmonta y la próxima vez empieza otra vez en la portada. */}
      <Cuerpo />
    </Modal>
  );
}

function Cuerpo() {
  const { mazos } = useGuia();
  const [vista, setVista] = useState<{ mazo: ClaveMazo; indice: number } | null>(null);
  // Al volver de un nivel, el botón tocado ya no existe: la portada toma el foco.
  const [volvio, setVolvio] = useState(false);
  const mazo = vista ? mazos.find((m) => m.clave === vista.mazo) ?? null : null;

  return mazo && vista ? (
    <VistaMazo
      key={mazo.clave}
      mazo={mazo}
      indice={Math.min(vista.indice, mazo.tarjetas.length - 1)}
      onIndice={(i) => setVista({ mazo: mazo.clave, indice: i })}
      onNiveles={() => {
        setVista(null);
        setVolvio(true);
      }}
    />
  ) : (
    <Portada autoFoco={volvio} onAbrir={(clave, indice) => setVista({ mazo: clave, indice })} />
  );
}

// ── Portada: rango, niveles y sellos ─────────────────────────────────────────

function Portada({
  autoFoco,
  onAbrir,
}: {
  autoFoco: boolean;
  onAbrir: (mazo: ClaveMazo, indice: number) => void;
}) {
  const { mazos, avance, progreso, bienvenida, cerrar, reiniciar } = useGuia();
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);
  const nivelesRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (autoFoco) nivelesRef.current?.focus();
  }, [autoFoco]);
  const proxima = siguienteTarjeta(mazos, progreso);
  const terminada = avance.total > 0 && avance.hechas === avance.total;

  return (
    <div className="space-y-5">
      {bienvenida ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-700">
            Te enseño cómo funciona tu panel en unos minutos, con <strong>tarjetas</strong>: en el frente ves qué es
            cada cosa, la <strong>volteas</strong> para ver cómo se hace, y con <strong>«Llévame ahí»</strong> te
            llevo a la pantalla de verdad.
          </p>
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
            Los datos de las tarjetas son de <strong>ejemplo</strong>: nada de lo que veas en la guía se guarda en tu
            cuenta. Puedes repetirla cuando quieras desde el botón <strong>?</strong> de arriba o en Ajustes.
          </p>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">
          Aprende cada parte de la app con tarjetas. Los ejemplos no se guardan en tu cuenta.
        </p>
      )}

      {/* Rango */}
      <section aria-labelledby="guia-rango" className="rounded-xl border border-neutral-200 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Tu rango</p>
            <p id="guia-rango" className="text-lg font-semibold text-neutral-900">
              {avance.rango}
            </p>
          </div>
          <p className="text-sm tabular-nums text-neutral-600">
            {avance.hechas} de {avance.total} tarjetas
          </p>
        </div>
        <div
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-100"
          role="progressbar"
          aria-label="Avance de la guía"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={avance.porcentaje}
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${avance.porcentaje}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {avance.siguiente
            ? `Te ${avance.siguiente.faltan === 1 ? 'falta 1 tarjeta' : `faltan ${avance.siguiente.faltan} tarjetas`} para subir a ${avance.siguiente.nombre}.`
            : '¡Llegaste al rango más alto!'}
        </p>
      </section>

      {terminada && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700" role="status">
          ¡Terminaste la guía completa! Ya conoces todo lo que tienes prendido.
        </p>
      )}

      {/* Niveles */}
      <section aria-labelledby="guia-niveles">
        <h3 id="guia-niveles" ref={nivelesRef} tabIndex={-1} className="mb-2 text-sm font-semibold text-neutral-900 outline-none">
          Niveles
        </h3>
        <ol className="grid gap-2 sm:grid-cols-2">
          {mazos.map((m, i) => {
            const a = avance.porMazo[i];
            const primeraPendiente = m.tarjetas.findIndex((t) => !progreso.aprendidas.includes(t.id));
            return (
              <li key={m.clave}>
                <button
                  type="button"
                  onClick={() => onAbrir(m.clave, primeraPendiente >= 0 ? primeraPendiente : 0)}
                  className="flex min-h-11 w-full cursor-pointer flex-col gap-1 rounded-xl border border-neutral-200 p-3 text-left outline-none transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-900"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-medium text-neutral-500">Nivel {i + 1}</span>
                    {a.completo ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        ✓ {m.sello}
                      </span>
                    ) : (
                      <span className="text-xs tabular-nums text-neutral-500">
                        {a.hechas}/{a.total}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-neutral-900">{m.titulo}</span>
                  <span className="text-xs text-neutral-600">{m.descripcion}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {avance.sellos.length > 0 && (
        <p className="text-xs text-neutral-600">
          <span className="font-medium text-neutral-800">Sellos ganados:</span> {avance.sellos.join(' · ')}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4">
        <div>
          {avance.hechas > 0 &&
            (confirmarReinicio ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                ¿Borrar tu avance y empezar de cero?
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    reiniciar();
                    setConfirmarReinicio(false);
                  }}
                >
                  Sí, empezar de nuevo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmarReinicio(false)}>
                  No
                </Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmarReinicio(true)}>
                Empezar de nuevo
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          {bienvenida && (
            <Button variant="secondary" size="sm" onClick={cerrar}>
              Ahora no
            </Button>
          )}
          {proxima ? (
            <Button size="sm" onClick={() => onAbrir(proxima.mazo, proxima.indice)}>
              {avance.hechas === 0 ? 'Empezar' : 'Continuar'}
            </Button>
          ) : (
            mazos.length > 0 && (
              <Button size="sm" onClick={() => onAbrir(mazos[0].clave, 0)}>
                Repasar
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Un nivel: la tarjeta que se voltea ───────────────────────────────────────

function VistaMazo({
  mazo,
  indice,
  onIndice,
  onNiveles,
}: {
  mazo: Mazo;
  indice: number;
  onIndice: (i: number) => void;
  onNiveles: () => void;
}) {
  const { progreso, marcar, llevar } = useGuia();
  // Se guarda QUÉ tarjeta está volteada: al pasar a otra, sale de frente sola.
  const [volteadaId, setVolteadaId] = useState<string | null>(null);
  // El sello se festeja en la tarjeta que lo ganó; al moverse, desaparece.
  const [sello, setSello] = useState<{ nombre: string; enTarjeta: string } | null>(null);
  const tituloFrenteRef = useRef<HTMLHeadingElement>(null);
  const tituloReversoRef = useRef<HTMLHeadingElement>(null);
  const tarjeta = mazo.tarjetas[indice];
  const volteada = volteadaId === tarjeta.id;
  const aprendida = progreso.aprendidas.includes(tarjeta.id);
  const ultima = indice === mazo.tarjetas.length - 1;
  const selloNuevo = sello?.enTarjeta === tarjeta.id ? sello.nombre : null;

  // Tarjeta nueva: el foco va a su título. Sin esto, el botón que se tocó
  // queda dentro de una cara `inert` y el foco cae al <body> (y de ahí, con
  // Tab, a la página de atrás del diálogo).
  useEffect(() => {
    tituloFrenteRef.current?.focus();
  }, [tarjeta.id]);

  // Al voltear, el foco va al título de la cara visible.
  const voltear = (aReverso: boolean) => {
    setVolteadaId(aReverso ? tarjeta.id : null);
    requestAnimationFrame(() => (aReverso ? tituloReversoRef : tituloFrenteRef).current?.focus());
  };

  const entendido = () => {
    if (!aprendida) {
      const faltaban = mazo.tarjetas.filter((t) => !progreso.aprendidas.includes(t.id)).length;
      marcar(tarjeta.id);
      if (faltaban === 1) setSello({ nombre: mazo.sello, enTarjeta: tarjeta.id });
    }
    if (!ultima) onIndice(indice + 1);
    // En la última, si ya estaba aprendida ("Listo"), se vuelve a los niveles;
    // si acaba de aprenderse, se queda para que se vea el sello.
    else if (aprendida) onNiveles();
  };

  // Flechas para pasar tarjetas, salvo que el foco esté en un control que las use.
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowRight' && !ultima) onIndice(indice + 1);
    else if (e.key === 'ArrowLeft' && indice > 0) onIndice(indice - 1);
  };

  return (
    <div className="space-y-4" onKeyDown={teclas}>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onNiveles}>
          ← Niveles
        </Button>
        <p className="text-sm font-semibold text-neutral-900">{mazo.titulo}</p>
      </div>

      {/* Un punto por tarjeta. Aprendida = relleno con ✓ (no solo color, para
          quien no distingue el ámbar o usa colores forzados); actual = más grande. */}
      <nav aria-label="Tarjetas del nivel" className="flex flex-wrap items-center justify-center">
        {mazo.tarjetas.map((t, i) => {
          const hecha = progreso.aprendidas.includes(t.id);
          const actual = i === indice;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onIndice(i)}
              aria-label={`Tarjeta ${i + 1}: ${t.titulo}${hecha ? ' (aprendida)' : ''}`}
              aria-current={actual ? 'step' : undefined}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              <span
                aria-hidden="true"
                className={`flex items-center justify-center rounded-full border-2 text-[9px] font-bold leading-none transition-all motion-reduce:transition-none ${
                  actual ? 'h-5 w-5' : 'h-3.5 w-3.5'
                } ${hecha ? 'border-amber-700 bg-amber-600 text-white' : 'border-neutral-500 bg-transparent'}`}
              >
                {hecha && actual ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Lo que se anuncia al lector de pantalla al cambiar de tarjeta o ganar
          un sello. Siempre montado: un `role="status"` que nace ya lleno suele
          no leerse. */}
      <p role="status" className="sr-only">
        {selloNuevo ? `¡Ganaste el ${selloNuevo}! ` : ''}
        {`Tarjeta ${indice + 1} de ${mazo.tarjetas.length}: ${tarjeta.titulo}${aprendida ? ', aprendida' : ''}.`}
      </p>

      {/* La tarjeta: dos caras en la misma celda; la altura la da la más alta. */}
      <div className="[perspective:1400px]">
        <div
          className={`grid transition-transform duration-500 ease-out [transform-style:preserve-3d] motion-reduce:transition-none ${
            volteada ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          <div
            inert={volteada}
            aria-hidden={volteada}
            className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm [backface-visibility:hidden] [grid-area:1/1]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
              Tarjeta {indice + 1} de {mazo.tarjetas.length}
              {aprendida && ' · Aprendida ✓'}
            </p>
            <h3 ref={tituloFrenteRef} tabIndex={-1} className="text-lg font-semibold text-neutral-900 outline-none">
              {tarjeta.titulo}
            </h3>
            <p className="text-sm text-neutral-700">{tarjeta.resumen}</p>
            {tarjeta.maqueta && <MaquetaGuia maqueta={tarjeta.maqueta} />}
            <Button className="w-full" onClick={() => voltear(true)}>
              Voltear: ¿cómo se hace? ↻
            </Button>
          </div>

          <div
            inert={!volteada}
            aria-hidden={!volteada}
            className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Cómo se hace</p>
            <h3 ref={tituloReversoRef} tabIndex={-1} className="text-lg font-semibold text-neutral-900 outline-none">
              {tarjeta.titulo}
            </h3>
            <ol className="space-y-2">
              {tarjeta.pasos.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm text-neutral-800">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{p}</span>
                </li>
              ))}
            </ol>
            {tarjeta.consejo && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <strong>Consejo:</strong> {tarjeta.consejo}
              </p>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Button onClick={entendido}>{aprendida ? (ultima ? 'Listo' : 'Siguiente') : '¡Entendido!'}</Button>
              {tarjeta.destino && (
                <Button variant="secondary" onClick={() => llevar(tarjeta)}>
                  Llévame ahí →
                </Button>
              )}
              <Button variant="ghost" onClick={() => voltear(false)}>
                Ver el frente
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Debajo de la tarjeta, junto al botón que se acaba de tocar: arriba
          quedaba fuera de la vista en el celular. Lo que se lee en voz alta va
          en el `role="status"` de arriba. */}
      {selloNuevo && (
        <p
          ref={(el) => el?.scrollIntoView({ block: 'nearest' })}
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center text-sm font-semibold text-green-700 motion-safe:animate-[aterrizar_300ms_ease-out]"
        >
          ¡Ganaste el {selloNuevo}! Terminaste el nivel «{mazo.titulo}».
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={indice === 0} onClick={() => onIndice(indice - 1)}>
          ← Anterior
        </Button>
        {ultima ? (
          <Button variant="ghost" size="sm" onClick={onNiveles}>
            Ver niveles
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => onIndice(indice + 1)}>
            Siguiente →
          </Button>
        )}
      </div>
    </div>
  );
}
