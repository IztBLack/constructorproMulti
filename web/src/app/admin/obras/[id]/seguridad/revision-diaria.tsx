'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import {
  ETIQUETA_RESULTADO,
  RESULTADOS,
  TEXTO_NIVEL,
  cumplimiento,
  nivelCumplimiento,
  type PuntoChecklist,
  type ResultadoPunto,
} from '@/lib/seguridad/checklist';
import { citaDe } from '@/lib/seguridad/plantilla';
import type { Checklist } from '@/lib/data/seguridad';
import { guardarChecklist } from './actions';

const TONO = { BIEN: 'green', REVISAR: 'amber', MAL: 'red', SIN_DATOS: 'neutral' } as const;

const ESTILO_RESULTADO: Record<ResultadoPunto, string> = {
  CUMPLE: 'border-green-600 bg-green-50 text-green-800',
  NO_CUMPLE: 'border-red-600 bg-red-50 text-red-800',
  NO_APLICA: 'border-neutral-500 bg-neutral-100 text-neutral-800',
};

interface Historial {
  id: string;
  fecha: number;
  firmo: string;
  observaciones: string;
  porcentaje: number | null;
  noCumple: string[];
}

export function RevisionDiaria({
  obraId,
  hoy,
  escribe,
  deHoy,
  puntosVacios,
  historial,
}: {
  obraId: string;
  hoy: string;
  escribe: boolean;
  deHoy: Checklist | null;
  puntosVacios: PuntoChecklist[];
  historial: Historial[];
}) {
  const [id] = useState(() => deHoy?.id ?? crypto.randomUUID());
  const [puntos, setPuntos] = useState<PuntoChecklist[]>(deHoy?.puntos ?? puntosVacios);
  const [observaciones, setObservaciones] = useState(deHoy?.observaciones ?? '');
  const [firmo, setFirmo] = useState(deHoy?.firmo_nombre ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const c = cumplimiento(puntos);
  const nivel = nivelCumplimiento(c.porcentaje);

  function cambiar(clave: string, cambio: Partial<PuntoChecklist>) {
    setGuardado(false);
    setPuntos((ps) => ps.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)));
  }

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await guardarChecklist(obraId, { id, fecha: hoy, puntos, observaciones, firmoNombre: firmo });
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else setGuardado(true);
    });
  }

  return (
    <section aria-labelledby="revision-heading" className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="revision-heading" className="text-base font-semibold text-neutral-900">
              Revisión de hoy
            </h2>
            <p className="text-sm text-neutral-600">
              Recorre la obra y marca cada punto. &quot;No aplica&quot; no cuenta en el porcentaje.
            </p>
          </div>
          <div className="text-right" aria-live="polite">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900">
              {c.porcentaje !== null ? `${c.porcentaje}%` : '—'}
            </p>
            <Badge tone={TONO[nivel]}>{TEXTO_NIVEL[nivel]}</Badge>
            {c.sinResponder > 0 && (
              <p className="mt-1 text-xs text-neutral-500">{c.sinResponder} sin contestar</p>
            )}
          </div>
        </div>

        <ol className="mt-4 divide-y divide-neutral-100">
          {puntos.map((p) => (
            <li key={p.clave} className="py-3">
              <fieldset disabled={!escribe || pendiente}>
                <legend className="text-sm font-medium text-neutral-900">
                  {p.texto}
                  {citaDe(p.clave) && (
                    <span className="ml-2 text-xs font-normal text-neutral-500">NOM-031 {citaDe(p.clave)}</span>
                  )}
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RESULTADOS.map((r) => {
                    const activo = p.resultado === r;
                    return (
                      <label
                        key={r}
                        className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-neutral-900 ${
                          activo ? ESTILO_RESULTADO[r] : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`punto-${p.clave}`}
                          value={r}
                          checked={activo}
                          onChange={() => cambiar(p.clave, { resultado: r })}
                        />
                        {ETIQUETA_RESULTADO[r]}
                      </label>
                    );
                  })}
                </div>
                {p.resultado === 'NO_CUMPLE' && (
                  <label className="mt-2 block text-sm">
                    <span className="text-neutral-700">¿Qué falta? (opcional)</span>
                    <input
                      type="text"
                      maxLength={500}
                      value={p.nota ?? ''}
                      onChange={(e) => cambiar(p.clave, { nota: e.target.value })}
                      className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm"
                    />
                  </label>
                )}
              </fieldset>
            </li>
          ))}
        </ol>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-neutral-700">Observaciones</span>
            <textarea
              rows={3}
              maxLength={3000}
              value={observaciones}
              disabled={!escribe || pendiente}
              onChange={(e) => {
                setGuardado(false);
                setObservaciones(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Revisó (nombre)</span>
            <input
              type="text"
              maxLength={120}
              value={firmo}
              placeholder="Si lo dejas vacío, va tu nombre"
              disabled={!escribe || pendiente}
              onChange={(e) => {
                setGuardado(false);
                setFirmo(e.target.value);
              }}
              className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {guardado && (
          <p role="status" className="mt-3 text-sm text-green-700">
            Revisión guardada.
          </p>
        )}
        {escribe && (
          <div className="mt-4">
            <Button onClick={guardar} disabled={pendiente}>
              {pendiente ? 'Guardando…' : deHoy ? 'Guardar cambios' : 'Guardar revisión'}
            </Button>
          </div>
        )}
      </Card>

      {historial.length > 0 && (
        <details className="rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="min-h-11 cursor-pointer text-sm font-medium text-neutral-900">
            Revisiones anteriores ({historial.length})
          </summary>
          <ul className="mt-2 divide-y divide-neutral-100">
            {historial.map((h) => {
              const n = nivelCumplimiento(h.porcentaje);
              return (
                <li key={h.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-900">{formatDate(h.fecha)}</span>
                    <Badge tone={TONO[n]}>
                      {h.porcentaje !== null ? `${h.porcentaje}%` : 'Sin datos'} · {TEXTO_NIVEL[n]}
                    </Badge>
                    {h.firmo && <span className="text-neutral-500">Revisó: {h.firmo}</span>}
                  </div>
                  {h.noCumple.length > 0 && (
                    <p className="mt-1 text-neutral-700">No cumplió: {h.noCumple.join(' · ')}</p>
                  )}
                  {h.observaciones && <p className="mt-1 text-neutral-600">{h.observaciones}</p>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
