'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { Partida } from '@/lib/data/types';
import {
  actualizarPartidaAction,
  buscarCatalogoAction,
  crearPartidaAction,
  type ConceptoCatalogo,
} from './actions';

type Props =
  | { mode: 'crear'; seccionId: string; cotizacionId: string; siguienteOrden: number; onListo: () => void }
  | { mode: 'editar'; partida: Partida; cotizacionId: string; onListo: () => void };

export function PartidaForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const partida = props.mode === 'editar' ? props.partida : null;

  // Campos controlados para poder precargarlos desde el catálogo.
  const [clave, setClave] = useState(partida?.clave ?? '');
  const [descripcion, setDescripcion] = useState(partida?.descripcion ?? '');
  const [unidad, setUnidad] = useState(partida?.unidad ?? '');
  const [cantidadTexto, setCantidadTexto] = useState(String(partida?.cantidad ?? 1));
  const [precioTexto, setPrecioTexto] = useState(String(partida?.precio_unitario ?? 0));
  const importe = (Number.parseFloat(cantidadTexto) || 0) * (Number.parseFloat(precioTexto) || 0);

  // ── Autocompletado desde el catálogo de conceptos ──────────────────────────
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<ConceptoCatalogo[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscandoCat, startBusqueda] = useTransition();
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = busqueda.trim();
    // Todo el setState ocurre dentro del timeout (no síncrono en el effect).
    const t = setTimeout(() => {
      if (q.length < 2) {
        setResultados([]);
        setAbierto(false);
        return;
      }
      startBusqueda(async () => {
        const res = await buscarCatalogoAction(q);
        setResultados(res);
        setAbierto(true);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Cerrar el dropdown al hacer clic fuera.
  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function elegirConcepto(c: ConceptoCatalogo) {
    setClave(c.clave);
    setDescripcion(c.descripcion);
    setUnidad(c.unidad);
    if (c.precio > 0) setPrecioTexto(String(c.precio));
    setBusqueda('');
    setResultados([]);
    setAbierto(false);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        props.mode === 'crear'
          ? await crearPartidaAction(props.seccionId, props.cotizacionId, formData)
          : await actualizarPartidaAction(props.partida.id, props.cotizacionId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      props.onListo();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      {/* Buscador de catálogo */}
      <div ref={cajaRef} className="relative">
        <Input
          type="search"
          placeholder="Buscar en catálogo (clave o descripción)…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onFocus={() => resultados.length > 0 && setAbierto(true)}
          disabled={pending}
          aria-label="Buscar concepto en el catálogo"
        />
        {abierto && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
            {buscandoCat && resultados.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-400">Buscando…</li>
            ) : resultados.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-400">Sin coincidencias en el catálogo.</li>
            ) : (
              resultados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => elegirConcepto(c)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    <span className="min-w-0 truncate text-neutral-900">
                      {c.clave && <span className="mr-1 text-neutral-400">{c.clave}</span>}
                      {c.descripcion}
                    </span>
                    <span className="shrink-0 tabular-nums text-neutral-500">
                      {c.unidad && <span className="mr-2">{c.unidad}</span>}
                      {c.precio > 0 ? formatCurrency(c.precio) : '—'}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Input
          name="clave"
          placeholder="Clave"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          disabled={pending}
          className="sm:col-span-1"
        />
        <Input
          name="descripcion"
          placeholder="Descripción"
          required
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          disabled={pending}
          className="col-span-2 sm:col-span-2"
        />
        <Input
          name="unidad"
          placeholder="Unidad"
          value={unidad}
          onChange={(e) => setUnidad(e.target.value)}
          disabled={pending}
        />
        <Input
          type="number"
          name="cantidad"
          placeholder="Cantidad"
          step="0.01"
          min={0}
          required
          value={cantidadTexto}
          onChange={(e) => setCantidadTexto(e.target.value)}
          disabled={pending}
        />
        <Input
          type="number"
          name="precio_unitario"
          placeholder="Precio unitario"
          step="0.01"
          min={0}
          required
          value={precioTexto}
          onChange={(e) => setPrecioTexto(e.target.value)}
          disabled={pending}
        />
      </div>

      <input
        type="hidden"
        name="orden"
        value={props.mode === 'crear' ? props.siguienteOrden : partida!.orden}
      />

      {/* Importe en vivo (cantidad × precio unitario), como en una hoja de cálculo */}
      <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
        <span className="text-neutral-500">Importe</span>
        <span className="font-medium tabular-nums text-neutral-900">{formatCurrency(importe)}</span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Guardando…' : props.mode === 'crear' ? 'Agregar partida' : 'Guardar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={props.onListo}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
