'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { infoAlcance, rutaCoincide, type Corrida } from '@/lib/guia/recorrido/motor';
import type { Objetivo, PasoRecorrido, Tema } from '@/lib/guia/recorrido/tipos';
import { useGuia } from '../guia-provider';
import { MaquetaGuia } from '../maqueta-guia';
import { cerrarDialogos, EVENTO_BLOQUEO, ponerCandado, quitarCandado } from './candado';
import { CierreRecorrido } from './cierre';

/** Margen del hueco alrededor de lo señalado. */
const HOLGURA = 6;
/**
 * Dos esperas distintas: llegar a la pantalla (una navegación lenta en
 * producción puede tardar) y, YA en ella, que aparezca lo señalado. Contarlas
 * juntas hacía que una página lenta saltara pasos en cadena.
 */
const ESPERA_RUTA_MS = 12000;
const ESPERA_OBJETIVO_MS = 3500;
const INTERVALO_MS = 150;

type Modo = 'buscando' | 'foco' | 'centro' | 'ejemplo' | 'navegar';

function selectorDe(o: Objetivo): string {
  return 'ancla' in o ? `[data-guia="${CSS.escape(o.ancla)}"]` : `a[href="${CSS.escape(o.enlace)}"]`;
}

/** El primero VISIBLE: la barra existe dos veces (escritorio y celular). */
function visible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

function campoDe(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  return el.querySelector('input:not([type=hidden]), textarea');
}

/** Escribe en un campo controlado por React (setter nativo + evento `input`). */
function escribirEnCampo(campo: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto = campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(campo, valor);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * El recorrido en pantalla. Solo existe mientras hay uno en curso (o su cierre).
 *
 * El candado lo pone el provider de forma síncrona al iniciar o retomar; aquí
 * solo queda de respaldo, y al desmontar (por la vía que sea) se cierran los
 * formularios de ejemplo ANTES de quitarlo.
 */
export function CapaRecorrido() {
  const { enCurso, terminado } = useGuia();
  const activo = !!enCurso;

  useEffect(() => {
    if (!activo) return;
    ponerCandado();
    return () => {
      cerrarDialogos();
      quitarCandado();
    };
  }, [activo]);

  if (terminado) return <CierreRecorrido alcance={terminado} />;
  if (!enCurso) return null;
  const { corrida, temas, tema } = enCurso;
  // La `key` reinicia el estado local en cada paso.
  return (
    <PasoEnPantalla
      key={`${tema.id}:${corrida.paso}`}
      corrida={corrida}
      temas={temas}
      tema={tema}
      paso={tema.pasos[corrida.paso]}
    />
  );
}

function PasoEnPantalla({
  corrida,
  temas,
  tema,
  paso,
}: {
  corrida: Corrida;
  temas: Tema[];
  tema: Tema;
  paso: PasoRecorrido;
}) {
  const { avanzar, retroceder, omitirTema, salir } = useGuia();
  const pathname = usePathname();
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('buscando');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [conValor, setConValor] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [bloqueos, setBloqueos] = useState(0);
  const objetivoRef = useRef<HTMLElement | null>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  /** Mientras se busca no hay tarjeta: el foco se queda aquí, no en la app de atrás. */
  const esperaRef = useRef<HTMLParagraphElement>(null);
  const selector = paso.objetivo ? selectorDe(paso.objetivo) : null;
  const huecoAbierto = modo === 'foco' && (paso.accion === 'tocar' || paso.accion === 'escribir');
  const ultimo = corrida.paso + 1 === tema.pasos.length;

  // `avanzar` cambia de identidad cuando el panel se vuelve a pintar; leerlo por
  // ref evita reiniciar las esperas a la mitad.
  const avanzarRef = useRef(avanzar);
  useEffect(() => {
    avanzarRef.current = avanzar;
  }, [avanzar]);

  const siguientePaso = useCallback(() => {
    if (paso.cerrarDialogo) cerrarDialogos();
    avanzarRef.current();
  }, [paso.cerrarDialogo]);

  // "Abrir la pantalla" (menú escondido): se avanza cuando la ruta YA cambió,
  // no antes, para que el paso siguiente arranque en su pantalla.
  const [navegando, setNavegando] = useState<string | null>(null);
  useEffect(() => {
    if (navegando !== null && pathname !== navegando) avanzarRef.current();
  }, [navegando, pathname]);

  // Primer paso del tema y la pantalla no es la suya (p. ej. tras recargar): ir a su inicio.
  const irAlInicio = corrida.paso === 0 && !rutaCoincide(pathname, paso.ruta);
  const inicioPedido = useRef(false);
  useEffect(() => {
    if (irAlInicio && !inicioPedido.current) {
      inicioPedido.current = true;
      router.push(tema.inicio);
    }
  }, [irAlInicio, router, tema.inicio]);

  // Resolver el paso: esperar la pantalla y lo señalado; si no aparece, vista
  // de ejemplo (si hay maqueta) o saltarlo (no aplica a esta cuenta).
  useEffect(() => {
    const inicio = Date.now();
    let enRutaDesde: number | null = null;
    const noAplica = () => {
      if (paso.maqueta) setModo('ejemplo');
      else avanzarRef.current({ saltado: true });
    };
    const id = window.setInterval(() => {
      const enRuta = rutaCoincide(pathname, paso.ruta);
      if (!enRuta) {
        // Aún navegando (o la cuenta no tiene esa pantalla, p. ej. sin obras).
        if (Date.now() - inicio >= ESPERA_RUTA_MS) {
          window.clearInterval(id);
          noAplica();
        }
        return;
      }
      enRutaDesde ??= Date.now();
      if (!selector) {
        window.clearInterval(id);
        setModo('centro');
        return;
      }
      const el = visible(selector);
      if (el) {
        window.clearInterval(id);
        objetivoRef.current = el;
        // En el celular la tarjeta va abajo: lo señalado se sube al tercio de arriba.
        el.scrollIntoView({ block: window.innerWidth < 640 ? 'start' : 'center', behavior: 'auto' });
        if (window.innerWidth < 640) window.scrollBy(0, -96);
        setModo('foco');
        return;
      }
      // Enlace del menú escondido (menú agrupado o celular): la tarjeta lleva.
      if (paso.objetivo && 'enlace' in paso.objetivo) {
        window.clearInterval(id);
        setModo('navegar');
        return;
      }
      if (Date.now() - enRutaDesde >= ESPERA_OBJETIVO_MS) {
        window.clearInterval(id);
        noAplica();
      }
    }, INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [pathname, paso, selector]);

  // Seguir a lo señalado si la página se mueve (scroll, imágenes que cargan…).
  useEffect(() => {
    if (modo !== 'foco') return;
    let raf = 0;
    const medir = () => {
      if (selector && !objetivoRef.current?.isConnected) objetivoRef.current = visible(selector);
      const r = objetivoRef.current?.getBoundingClientRect() ?? null;
      setRect((prev) =>
        prev && r && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : r,
      );
      raf = requestAnimationFrame(medir);
    };
    raf = requestAnimationFrame(medir);
    return () => cancelAnimationFrame(raf);
  }, [modo, selector]);

  // `tocar`: avanza cuando toca lo señalado. Se escucha en el documento porque
  // React puede reemplazar el elemento.
  useEffect(() => {
    if (modo !== 'foco' || paso.accion !== 'tocar' || !selector) return;
    const alTocar = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest(selector)) window.setTimeout(() => avanzarRef.current(), 0);
    };
    document.addEventListener('click', alTocar, true);
    return () => document.removeEventListener('click', alTocar, true);
  }, [modo, paso.accion, selector]);

  // `escribir`: Siguiente se habilita cuando el campo tiene algo.
  useEffect(() => {
    if (modo !== 'foco' || paso.accion !== 'escribir' || !objetivoRef.current) return;
    const campo = campoDe(objetivoRef.current);
    if (!campo) return;
    const revisar = () => setConValor(campo.value.trim().length > 0);
    revisar();
    campo.addEventListener('input', revisar);
    return () => campo.removeEventListener('input', revisar);
  }, [modo, paso.accion]);

  // Teclado: Esc pregunta antes de salir (y no cierra el formulario de atrás);
  // el foco no puede irse a lo bloqueado.
  useEffect(() => {
    // Esc pregunta si salir; un segundo Esc cancela la pregunta.
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setConfirmarSalida((c) => !c);
    };
    const alEnfocar = (e: FocusEvent) => {
      const t = e.target as Node | null;
      if (!t || tarjetaRef.current?.contains(t) || esperaRef.current === t) return;
      if (huecoAbierto && objetivoRef.current?.contains(t)) return;
      (tituloRef.current ?? esperaRef.current)?.focus();
    };
    window.addEventListener('keydown', alTeclear, true);
    document.addEventListener('focusin', alEnfocar);
    return () => {
      window.removeEventListener('keydown', alTeclear, true);
      document.removeEventListener('focusin', alEnfocar);
    };
  }, [huecoAbierto]);

  // Avisar cuando el candado frena un guardado.
  useEffect(() => {
    const alBloquear = () => setBloqueos((n) => n + 1);
    window.addEventListener(EVENTO_BLOQUEO, alBloquear);
    return () => window.removeEventListener(EVENTO_BLOQUEO, alBloquear);
  }, []);

  // Paso listo: el foco al título de la tarjeta (lector de pantalla y teclado).
  useEffect(() => {
    (modo === 'buscando' ? esperaRef : tituloRef).current?.focus();
  }, [modo]);

  const alcance = infoAlcance(corrida.alcance);
  const h =
    modo === 'foco' && rect
      ? { top: rect.top - HOLGURA, left: rect.left - HOLGURA, width: rect.width + HOLGURA * 2, height: rect.height + HOLGURA * 2 }
      : null;

  // Dónde va la tarjeta: abajo en el celular, al centro sin hueco, junto a lo señalado en escritorio.
  const movil = window.innerWidth < 640;
  let posTarjeta: CSSProperties;
  if (movil) {
    posTarjeta = { left: 12, right: 12, bottom: 12 };
  } else if (!h) {
    posTarjeta = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 420 };
  } else {
    const ancho = 360;
    const left = Math.min(Math.max(12, h.left), window.innerWidth - ancho - 12);
    const abajo = window.innerHeight - (h.top + h.height) > 280;
    posTarjeta = abajo
      ? { left, top: h.top + h.height + 12, width: ancho }
      : { left, bottom: window.innerHeight - h.top + 12, width: ancho };
  }

  const velo = 'fixed z-[70] bg-black/55';

  return createPortal(
    <div data-recorrido className="print:hidden">
      {/* La capa tapa y bloquea todo menos el hueco. */}
      {h ? (
        <>
          <div aria-hidden="true" className={velo} style={{ top: 0, left: 0, right: 0, height: Math.max(0, h.top) }} />
          <div aria-hidden="true" className={velo} style={{ top: h.top + h.height, left: 0, right: 0, bottom: 0 }} />
          <div aria-hidden="true" className={velo} style={{ top: h.top, left: 0, width: Math.max(0, h.left), height: h.height }} />
          <div aria-hidden="true" className={velo} style={{ top: h.top, left: h.left + h.width, right: 0, height: h.height }} />
          {/* Contorno de lo señalado; si no se debe tocar, también lo tapa. */}
          <div
            aria-hidden="true"
            className={`fixed z-[70] rounded-lg outline outline-[3px] outline-amber-600 ${
              huecoAbierto ? 'pointer-events-none' : 'cursor-not-allowed'
            }`}
            style={h}
          />
        </>
      ) : (
        <div aria-hidden="true" className={`${velo} inset-0`} />
      )}

      {modo === 'buscando' && (
        <p
          ref={esperaRef}
          tabIndex={-1}
          role="status"
          className="fixed left-1/2 top-1/2 z-[72] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-4 py-2 text-sm text-neutral-700 shadow outline-none"
        >
          Abriendo la pantalla…
        </p>
      )}

      {modo !== 'buscando' && (
        <div
          ref={tarjetaRef}
          role="dialog"
          aria-labelledby="recorrido-titulo"
          className={`fixed z-[72] rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl ${
            movil ? 'max-h-[50dvh] overflow-y-auto' : ''
          }`}
          style={posTarjeta}
        >
          <p className="text-xs font-medium text-neutral-500">
            Recorrido {alcance.titulo.toLowerCase()} · Tema {corrida.tema + 1} de {temas.length}: {tema.titulo}
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"
            role="progressbar"
            aria-label={`Paso ${corrida.paso + 1} de ${tema.pasos.length} del tema`}
            aria-valuemin={1}
            aria-valuemax={tema.pasos.length}
            aria-valuenow={corrida.paso + 1}
          >
            <div
              className="h-full rounded-full bg-neutral-900 transition-[width] motion-reduce:transition-none"
              style={{ width: `${((corrida.paso + 1) / tema.pasos.length) * 100}%` }}
            />
          </div>

          <h2
            id="recorrido-titulo"
            ref={tituloRef}
            tabIndex={-1}
            className="mt-3 text-base font-semibold text-neutral-900 outline-none"
          >
            {paso.titulo}
          </h2>
          <p className="mt-1 text-sm text-neutral-700">{paso.texto}</p>

          {modo === 'ejemplo' && paso.maqueta && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-neutral-600">
                Vista de ejemplo: así se ve esta sección cuando ya tienes información registrada.
              </p>
              <MaquetaGuia maqueta={paso.maqueta} />
            </div>
          )}

          {modo === 'foco' && paso.accion === 'tocar' && (
            <p className="mt-2 text-xs font-medium text-neutral-600">Toca lo señalado o usa Continuar.</p>
          )}
          {modo === 'foco' && paso.accion === 'bloqueado' && (
            <p className="mt-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
              Este botón está bloqueado durante el recorrido: no se guarda nada de lo que captures.
            </p>
          )}
          {modo === 'foco' && paso.accion === 'escribir' && paso.ejemplo && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => {
                const campo = objetivoRef.current && campoDe(objetivoRef.current);
                if (campo) escribirEnCampo(campo, paso.ejemplo!);
              }}
            >
              Escribir el ejemplo
            </Button>
          )}

          {bloqueos > 0 && (
            <p role="status" className="mt-2 text-xs text-amber-700">
              Se evitó un guardado: durante el recorrido la app no guarda información.
            </p>
          )}

          {confirmarSalida ? (
            <div className="mt-4 rounded-lg border border-neutral-200 p-3">
              <p className="text-sm text-neutral-800">¿Salir del recorrido? Los temas que ya terminaste se conservan.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={salir}>
                  Salir
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmarSalida(false)}>
                  Continuar recorrido
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex">
                <Button size="sm" variant="ghost" onClick={() => setConfirmarSalida(true)}>
                  Salir
                </Button>
                <Button size="sm" variant="ghost" onClick={omitirTema}>
                  Omitir tema
                </Button>
              </div>
              <div className="flex gap-2">
                {corrida.paso > 0 && (
                  <Button size="sm" variant="secondary" onClick={retroceder}>
                    Atrás
                  </Button>
                )}
                {modo === 'navegar' && paso.objetivo && 'enlace' in paso.objetivo ? (
                  <Button
                    size="sm"
                    disabled={navegando !== null}
                    onClick={() => {
                      setNavegando(pathname);
                      router.push((paso.objetivo as { enlace: string }).enlace);
                    }}
                  >
                    Abrir la pantalla
                  </Button>
                ) : modo === 'foco' && paso.accion === 'tocar' ? (
                  // Para teclado y lector de pantalla (y quien prefiera no
                  // apuntar): activa lo señalado igual que tocarlo. El clic
                  // lo recoge el mismo detector que avanza el paso.
                  <Button size="sm" onClick={() => objetivoRef.current?.click()}>
                    Continuar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={siguientePaso}
                    disabled={modo === 'foco' && paso.accion === 'escribir' && !conValor}
                  >
                    {ultimo ? 'Terminar tema' : 'Siguiente'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
