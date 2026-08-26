'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  COMANDOS_FIJOS,
  coincide,
  comandosDeCotizacion,
  comandosDeObra,
  type Comando,
} from './comandos';
import { cargarEntidades } from './acciones';

const CLAVE_RECIENTES = 'paleta_recientes';
const MAX_RECIENTES = 5;

/**
 * Paleta de comandos (Ctrl/⌘ + K).
 *
 * Cuando ya sabes lo que quieres hacer, navegar el menú es un rodeo. Esto lo
 * quita: escribes tres letras y saltas.
 *
 * TRES COSAS QUE LA HACEN ÚTIL, más allá de tener muchos comandos:
 *
 *  1. Entiende el vocabulario de la obra, no el de la app: «raya» encuentra la
 *     nómina y «trabajadores» el equipo (ver `alias` en `comandos.ts`).
 *  2. Sabe dónde estás: dentro de una obra, ofrece SUS acciones primero, sin
 *     que haya que volver a nombrarla.
 *  3. Con el campo vacío enseña lo reciente, no un menú alfabético: casi
 *     siempre se vuelve a lo mismo de hace un rato.
 *
 * Solo NAVEGA. Nada que borre, cobre o mande algo a un cliente entra aquí; ver
 * la regla de admisión en `comandos.ts`.
 */
export function PaletaComandos() {
  const [abierta, setAbierta] = useState(false);
  // Las entidades viven en el PADRE para pedirlas una sola vez; el diálogo se
  // remonta en cada apertura y las perdería.
  const [entidades, setEntidades] = useState<Comando[]>([]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierta((v) => !v);
      }
      if (e.key === 'Escape') setAbierta(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // Se piden la PRIMERA vez que se abre, no al pintar el layout: así no se paga
  // en cada pantalla aunque nunca se use la paleta.
  useEffect(() => {
    if (!abierta || entidades.length > 0) return;
    let vivo = true;
    void cargarEntidades().then((e) => {
      if (vivo) setEntidades(e);
    });
    return () => {
      vivo = false;
    };
  }, [abierta, entidades.length]);

  if (!abierta) return null;
  return <Dialogo entidades={entidades} onCerrar={() => setAbierta(false)} />;
}

/**
 * El diálogo en sí. Se monta al abrir y se desmonta al cerrar, así que su
 * estado —lo escrito, la selección, lo reciente— nace limpio cada vez sin que
 * nadie tenga que reiniciarlo. Es lo que evita tener que tocar estado dentro de
 * un efecto, que es de donde salían los avisos del linter.
 */
function Dialogo({ entidades, onCerrar }: { entidades: Comando[]; onCerrar: () => void }) {
  const router = useRouter();
  const ruta = usePathname();

  const [consulta, setConsulta] = useState('');
  const [sel, setSel] = useState(0);
  // Inicializador perezoso: se lee el historial UNA vez, al montar.
  const [recientes] = useState<Comando[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]');
    } catch {
      return [];
    }
  });

  const contextuales = useMemo(() => {
    const obra = ruta.match(/^\/admin\/obras\/([^/]+)/);
    if (obra && obra[1] !== 'importar') return comandosDeObra(obra[1]);
    const cot = ruta.match(/^\/admin\/cotizaciones\/([^/]+)/);
    if (cot && cot[1] !== 'nueva') return comandosDeCotizacion(cot[1]);
    return [];
  }, [ruta]);

  const visibles = useMemo(() => {
    if (!consulta.trim()) return [...contextuales, ...recientes].slice(0, 12);
    return [...contextuales, ...COMANDOS_FIJOS, ...entidades]
      .filter((c) => coincide(c, consulta))
      .slice(0, 40);
  }, [consulta, contextuales, entidades, recientes]);

  const ejecutar = useCallback(
    (c: Comando) => {
      // Se guarda el comando ENTERO y no su id: así lo reciente sigue
      // funcionando aunque la entidad ya no esté en la lista cargada.
      try {
        const previos: Comando[] = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]');
        const nuevos = [
          { ...c, grupo: 'Reciente' },
          ...previos.filter((p) => p.href !== c.href),
        ].slice(0, MAX_RECIENTES);
        localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(nuevos));
      } catch {
        // Sin almacenamiento la paleta sigue navegando; solo pierde el historial.
      }

      onCerrar();
      if (c.nuevaPestana) window.open(c.href, '_blank', 'noopener,noreferrer');
      else router.push(c.href);
    },
    [router, onCerrar],
  );

  let grupoActual: string | null = null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/40 p-4 pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl motion-safe:animate-[aterrizar_.18s_ease-out]"
      >
        <input
          // `autoFocus` en vez de enfocar desde un efecto: el diálogo se monta
          // ya abierto, así que el navegador lo hace sin un render extra.
          autoFocus
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (visibles.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => (s + 1) % visibles.length);
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => (s - 1 + visibles.length) % visibles.length);
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              const c = visibles[sel];
              if (c) ejecutar(c);
            }
          }}
          placeholder="Busca una obra, una persona o una acción…"
          aria-label="Buscar"
          className="w-full border-b border-neutral-200 px-5 py-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
        />

        <ul role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {visibles.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-neutral-500">
              Nada coincide. Prueba con otra palabra.
            </li>
          ) : (
            visibles.map((c, i) => {
              const encabezado = c.grupo !== grupoActual ? c.grupo : null;
              grupoActual = c.grupo;
              return (
                <li key={`${c.href}-${c.titulo}-${i}`}>
                  {encabezado && (
                    <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      {encabezado}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === sel}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => ejecutar(c)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                      i === sel ? 'bg-blue-50 text-neutral-900' : 'text-neutral-700'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.titulo}</span>
                      {c.detalle && (
                        <span className="block truncate text-xs text-neutral-500">{c.detalle}</span>
                      )}
                    </span>
                    {c.nuevaPestana && (
                      <span className="shrink-0 text-xs text-neutral-400">abre aparte</span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex gap-4 border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500">
          <span>↑ ↓ moverse</span>
          <span>↵ abrir</span>
          <span>esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
