'use client';

import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import type { Colaborador } from '@/lib/data/types';
import { OPCIONES, cellKey, llevaPaseDeLista, type DiaSemana } from './tipos';

/**
 * Vista "día primero" del pase de lista, pensada para capturar en campo desde el
 * teléfono: se elige un día y se marca la lista completa de colaboradores en
 * vertical, con un toque por marca.
 *
 * Es el mismo flujo que la app móvil nativa (`pase_lista_screen.dart`): selector
 * de día + `SegmentedButton` de · ½ ¾ 1 + acción "Todos ✓". La cuadrícula
 * semanal (colaboradores × 7 días) sigue existiendo para escritorio, donde sí
 * hay ancho para una matriz.
 */
export default function VistaDia({
  colaboradores,
  dias,
  fracciones,
  pendientes,
  conError,
  onMarcar,
  diaSeleccionadoMs,
  onCambiarDia,
}: {
  colaboradores: Colaborador[];
  dias: DiaSemana[];
  fracciones: Record<string, number>;
  /** Celdas encoladas en este dispositivo, todavía sin confirmar en el servidor. */
  pendientes: Set<string>;
  conError: Set<string>;
  onMarcar: (colaboradorId: string, ms: number, valor: number) => void;
  diaSeleccionadoMs: number;
  onCambiarDia: (ms: number) => void;
}) {
  const [confirmandoTodos, setConfirmandoTodos] = useState(false);

  const delDia = colaboradores.filter((c) => llevaPaseDeLista(c.tipo_pago));
  const deDestajo = colaboradores.filter((c) => !llevaPaseDeLista(c.tipo_pago));

  /** Suma de fracciones de un día — sirve de avance visible en el selector. */
  function totalDia(ms: number): number {
    return delDia.reduce((acc, c) => acc + (fracciones[cellKey(c.id, ms)] ?? 0), 0);
  }

  const sinMarcar = delDia.filter(
    (c) => (fracciones[cellKey(c.id, diaSeleccionadoMs)] ?? 0) === 0,
  ).length;

  function marcarTodos() {
    for (const c of delDia) {
      if ((fracciones[cellKey(c.id, diaSeleccionadoMs)] ?? 0) !== 1) {
        onMarcar(c.id, diaSeleccionadoMs, 1);
      }
    }
    setConfirmandoTodos(false);
  }

  return (
    <div className="space-y-4">
      {/* Selector de día. 7 columnas fijas: caben en cualquier teléfono sin
          scroll horizontal, que es justo lo que hacía impracticable la matriz. */}
      <div
        className="grid grid-cols-7 gap-1 rounded-xl border border-neutral-200 bg-white p-1"
        role="tablist"
        aria-label="Día de la semana"
      >
        {dias.map((d) => {
          const activo = d.ms === diaSeleccionadoMs;
          const total = totalDia(d.ms);
          return (
            <button
              key={d.ms}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => onCambiarDia(d.ms)}
              className={`flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-lg px-0.5 py-2 transition ${
                activo
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <span className="text-[11px] font-medium uppercase">{d.abbr}</span>
              <span className="text-base font-semibold leading-tight">{d.dia}</span>
              <span
                className={`text-[10px] leading-tight ${
                  activo ? 'text-neutral-300' : 'text-neutral-400'
                }`}
              >
                {total > 0 ? total.toFixed(2).replace(/\.00$/, '') : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {delDia.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-500">
            {sinMarcar === 0
              ? `${delDia.length} marcados`
              : `${sinMarcar} de ${delDia.length} sin marcar`}
          </p>
          {confirmandoTodos ? (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmandoTodos(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={marcarTodos}>
                Confirmar
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmandoTodos(true)}
              disabled={sinMarcar === 0}
            >
              Todos ✓
            </Button>
          )}
        </div>
      )}

      {/* Confirmación explícita: "Todos ✓" escribe una fila por colaborador y
          pisa lo ya capturado; un toque accidental en campo sería costoso. */}
      {confirmandoTodos && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Se marcará día completo a los {delDia.length} colaboradores por día. Los que ya
          tengan ½ o ¾ se sobrescriben.
        </p>
      )}

      <ul className="space-y-2">
        {delDia.map((c) => {
          const key = cellKey(c.id, diaSeleccionadoMs);
          const actual = fracciones[key] ?? 0;
          const pendiente = pendientes.has(key);
          const fallo = conError.has(key);
          return (
            <li
              key={c.id}
              className={`rounded-xl border bg-white p-3 ${
                fallo ? 'border-red-300' : 'border-neutral-200'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-neutral-900">{c.nombre}</span>
                {fallo ? (
                  <span className="text-xs font-medium text-red-600">No se guardó</span>
                ) : pendiente ? (
                  <span className="text-xs text-neutral-400" title="Guardado en este dispositivo, falta enviar">
                    ● por enviar
                  </span>
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
                      // Sin `disabled` mientras se envía: la captura en campo no
                      // puede quedar bloqueada esperando a la red. La cola
                      // reemplaza la entrada de esa celda, así que re-marcar
                      // rápido no genera escrituras contradictorias.
                      onClick={() => onMarcar(c.id, diaSeleccionadoMs, o.valor)}
                      className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border text-sm transition ${
                        elegido
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="text-base font-semibold leading-none">{o.simbolo}</span>
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

      {/* Los de destajo no llevan pase de lista: se dicen explícitamente en vez
          de mostrarlos como una fila de guiones sin explicación. */}
      {deDestajo.length > 0 && (
        <details className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <summary className="cursor-pointer text-sm text-neutral-600">
            {deDestajo.length} por destajo · sin pase de lista
          </summary>
          <ul className="mt-2 space-y-1">
            {deDestajo.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm text-neutral-700">
                {c.nombre}
                <Badge tone="purple">Destajo</Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
