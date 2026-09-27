'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import { msAFechaInput } from '@/lib/data/tz';
import {
  ETIQUETA_ESTADO,
  diasDeAtraso,
  duracionDias,
  estadoPartida,
  geometriaBarra,
  posicionHoy,
  rangoPrograma,
  type EstadoPartida,
  type PartidaPrograma,
} from '@/lib/programa/programa';
import {
  borrarPartidaPrograma,
  crearPartidaPrograma,
  editarPartidaPrograma,
  marcarTerminada,
  traerPartidasDelPresupuesto,
  type PartidaProgramaInput,
} from './actions';

export interface OpcionPresupuesto {
  id: string;
  concepto: string;
  seccion: string | null;
}

const TONO: Record<EstadoPartida, 'green' | 'red' | 'blue' | 'neutral'> = {
  terminada: 'green',
  vencida: 'red',
  en_curso: 'blue',
  por_empezar: 'neutral',
};

// Colores de barra con contraste suficiente contra el carril gris (no son texto).
const BARRA: Record<EstadoPartida, string> = {
  terminada: 'bg-green-600',
  vencida: 'bg-red-600',
  en_curso: 'bg-blue-600',
  por_empezar: 'bg-neutral-500',
};

export function ProgramaObra({
  obraId,
  partidas,
  presupuesto,
  puedeEditar,
  ahora,
  hoy,
}: {
  obraId: string;
  partidas: PartidaPrograma[];
  presupuesto: OpcionPresupuesto[];
  puedeEditar: boolean;
  ahora: number;
  hoy: string;
}) {
  const router = useRouter();
  const [agregando, setAgregando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const rango = rangoPrograma(partidas);
  const lineaHoy = rango ? posicionHoy(rango, ahora) : null;
  const vencidas = partidas.filter((p) => estadoPartida(p, ahora) === 'vencida');

  function correr(fn: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'No se pudo.');
        return;
      }
      despues?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {vencidas.length > 0 && (
        <div role="status" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">
            {vencidas.length === 1 ? '1 partida va atrasada' : `${vencidas.length} partidas van atrasadas`}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {vencidas.map((p) => (
              <li key={p.id}>
                {p.concepto}: debía terminar el {formatDate(p.fecha_fin)} ({diasDeAtraso(p, ahora)} día
                {diasDeAtraso(p, ahora) === 1 ? '' : 's'} de atraso)
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-red-800">
            Si ya se terminó, márcala como terminada; si cambió el plan, mueve sus fechas.
          </p>
        </div>
      )}

      {puedeEditar && (
        <div className="flex flex-wrap gap-2">
          {!agregando && (
            <Button type="button" onClick={() => setAgregando(true)}>
              Agregar partida
            </Button>
          )}
          {presupuesto.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              disabled={pendiente}
              onClick={() =>
                correr(async () => {
                  const r = await traerPartidasDelPresupuesto(obraId);
                  if (r.ok) {
                    setAviso(
                      r.agregadas
                        ? `Se agregaron ${r.agregadas} partidas del presupuesto con una semana cada una. Ajusta sus fechas.`
                        : 'Todas las partidas del presupuesto ya están en el programa.',
                    );
                  }
                  return r;
                })
              }
            >
              Traer partidas del presupuesto
            </Button>
          )}
        </div>
      )}

      <div aria-live="polite">
        {aviso && <p className="text-sm text-neutral-800">{aviso}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {agregando && (
        <Card padding="md">
          <h2 className="mb-3 text-base font-semibold text-neutral-900">Nueva partida del programa</h2>
          <FormularioPartida
            presupuesto={presupuesto}
            inicial={{ concepto: '', presupuestoId: null, seccion: null, inicio: hoy, fin: hoy }}
            pendiente={pendiente}
            alGuardar={(input) => correr(() => crearPartidaPrograma(obraId, input), () => setAgregando(false))}
            alCancelar={() => setAgregando(false)}
          />
        </Card>
      )}

      {partidas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-700">
          Todavía no hay programa. Agrega las partidas con su fecha de inicio y de fin
          {presupuesto.length > 0 ? ', o tráelas del presupuesto de la obra' : ''}.
        </p>
      ) : (
        <>
          {/* ── Vista de barras (CSS, sin librería) ─────────────────────── */}
          {rango && (
            <section aria-labelledby="barras-titulo" className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="barras-titulo" className="text-sm font-medium text-neutral-700">
                  Vista de barras
                </h2>
                <p className="text-xs text-neutral-600">
                  {formatDate(rango.inicio)} – {formatDate(rango.fin - 1)}
                </p>
              </div>
              <ul className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
                {partidas.map((p) => {
                  const g = geometriaBarra(p, rango);
                  const estado = estadoPartida(p, ahora);
                  return (
                    <li key={p.id} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-center sm:gap-3">
                      <span className="truncate text-sm text-neutral-900" title={p.concepto}>
                        {p.concepto}
                      </span>
                      <div className="relative h-6 rounded bg-neutral-100">
                        {lineaHoy !== null && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 w-0.5 bg-neutral-900"
                            style={{ left: `${lineaHoy}%` }}
                          />
                        )}
                        <span
                          className={`absolute inset-y-1 rounded ${BARRA[estado]}`}
                          style={{ left: `${g.left}%`, width: `${g.width}%` }}
                          role="img"
                          aria-label={`${p.concepto}: del ${formatDate(p.fecha_inicio)} al ${formatDate(p.fecha_fin)}, ${ETIQUETA_ESTADO[estado].toLowerCase()}`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="flex flex-wrap gap-3 text-xs text-neutral-700">
                {(Object.keys(BARRA) as EstadoPartida[]).map((e) => (
                  <span key={e} className="inline-flex items-center gap-1">
                    <span aria-hidden="true" className={`inline-block h-3 w-3 rounded ${BARRA[e]}`} />
                    {ETIQUETA_ESTADO[e]}
                  </span>
                ))}
                {lineaHoy !== null && (
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-neutral-900" /> Hoy
                  </span>
                )}
              </p>
            </section>
          )}

          {/* ── Tabla ───────────────────────────────────────────────────── */}
          <section aria-labelledby="tabla-titulo" className="space-y-2">
            <h2 id="tabla-titulo" className="text-sm font-medium text-neutral-700">
              Partidas
            </h2>
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
              {partidas.map((p) => {
                const estado = estadoPartida(p, ahora);
                if (editandoId === p.id) {
                  return (
                    <li key={p.id} className="p-3">
                      <FormularioPartida
                        presupuesto={presupuesto}
                        inicial={{
                          concepto: p.concepto,
                          presupuestoId: p.presupuesto_id,
                          seccion: p.seccion,
                          inicio: msAFechaInput(p.fecha_inicio),
                          fin: msAFechaInput(p.fecha_fin),
                        }}
                        pendiente={pendiente}
                        alGuardar={(input) =>
                          correr(() => editarPartidaPrograma(obraId, p.id, input), () => setEditandoId(null))
                        }
                        alCancelar={() => setEditandoId(null)}
                      />
                    </li>
                  );
                }
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900">{p.concepto}</p>
                      <p className="text-xs text-neutral-700">
                        {p.seccion ? `${p.seccion} · ` : ''}
                        {formatDate(p.fecha_inicio)} – {formatDate(p.fecha_fin)} · {duracionDias(p)} día
                        {duracionDias(p) === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Badge tone={TONO[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>
                    {puedeEditar && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-neutral-800">
                          <input
                            type="checkbox"
                            checked={p.terminada}
                            disabled={pendiente}
                            onChange={(e) => correr(() => marcarTerminada(obraId, p.id, e.target.checked))}
                            className="h-5 w-5 rounded border-neutral-300"
                          />
                          Terminada
                        </label>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setEditandoId(p.id)}>
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pendiente}
                          onClick={() => {
                            if (window.confirm(`¿Quitar «${p.concepto}» del programa?`)) {
                              correr(() => borrarPartidaPrograma(obraId, p.id));
                            }
                          }}
                        >
                          Quitar
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function FormularioPartida({
  presupuesto,
  inicial,
  pendiente,
  alGuardar,
  alCancelar,
}: {
  presupuesto: OpcionPresupuesto[];
  inicial: PartidaProgramaInput;
  pendiente: boolean;
  alGuardar: (input: PartidaProgramaInput) => void;
  alCancelar: () => void;
}) {
  const secciones = [...new Set(presupuesto.map((p) => p.seccion).filter((s): s is string => Boolean(s)))];
  // Valor del selector de origen: 'p:<id>' partida, 's:<nombre>' sección, '' libre.
  const [origen, setOrigen] = useState(
    inicial.presupuestoId ? `p:${inicial.presupuestoId}` : inicial.seccion ? `s:${inicial.seccion}` : '',
  );
  const [concepto, setConcepto] = useState(inicial.concepto);
  const [inicio, setInicio] = useState(inicial.inicio);
  const [fin, setFin] = useState(inicial.fin);

  function cambiarOrigen(v: string) {
    setOrigen(v);
    if (v.startsWith('p:')) {
      const p = presupuesto.find((x) => x.id === v.slice(2));
      if (p) setConcepto(p.concepto);
    } else if (v.startsWith('s:')) {
      setConcepto(v.slice(2));
    }
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const partida = origen.startsWith('p:') ? presupuesto.find((x) => x.id === origen.slice(2)) : undefined;
        alGuardar({
          concepto,
          presupuestoId: partida?.id ?? null,
          seccion: partida ? partida.seccion : origen.startsWith('s:') ? origen.slice(2) : null,
          inicio,
          fin,
        });
      }}
    >
      {presupuesto.length > 0 && (
        <Field label="Del presupuesto" className="sm:col-span-2">
          <Select value={origen} onChange={(e) => cambiarOrigen(e.target.value)}>
            <option value="">Otra (escribirla)</option>
            {secciones.length > 0 && (
              <optgroup label="Secciones">
                {secciones.map((s) => (
                  <option key={`s:${s}`} value={`s:${s}`}>
                    {s}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Partidas">
              {presupuesto.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.seccion ? `${p.seccion} · ` : ''}
                  {p.concepto}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
      )}
      <Field label="Partida" className="sm:col-span-2">
        <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={300} required />
      </Field>
      <Field label="Empieza">
        <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
      </Field>
      <Field label="Termina">
        <Input type="date" value={fin} min={inicio} onChange={(e) => setFin(e.target.value)} required />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button type="button" variant="ghost" onClick={alCancelar} disabled={pendiente}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
