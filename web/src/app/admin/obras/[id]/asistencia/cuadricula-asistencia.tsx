'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui';
import type { Colaborador } from '@/lib/data/types';
import {
  OPCIONES,
  cellKey,
  etiquetaFraccion,
  llevaPaseDeLista,
  type DiaSemana,
} from './tipos';

interface MenuAbierto {
  colaboradorId: string;
  ms: number;
  top: number;
  left: number;
}

/**
 * Cuadrícula semanal (colaboradores × 7 días) del pase de lista, para pantallas
 * con ancho suficiente. Es presentacional: el estado y la escritura viven en
 * `vista-asistencia.tsx`, que los comparte con la vista por día.
 */
export default function CuadriculaAsistencia({
  colaboradores,
  dias,
  fracciones,
  pendientes,
  conError,
  onMarcar,
}: {
  colaboradores: Colaborador[];
  dias: DiaSemana[];
  fracciones: Record<string, number>;
  /** Celdas encoladas en este dispositivo, todavía sin confirmar en el servidor. */
  pendientes: Set<string>;
  conError: Set<string>;
  onMarcar: (colaboradorId: string, ms: number, valor: number) => void;
}) {
  const [menu, setMenu] = useState<MenuAbierto | null>(null);

  function abrirMenu(e: React.MouseEvent<HTMLButtonElement>, colaboradorId: string, ms: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    // El submenú se posiciona fijo respecto al viewport para no recortarse
    // dentro del contenedor con scroll horizontal de la tabla.
    setMenu({ colaboradorId, ms, top: rect.bottom + 4, left: rect.left });
  }

  function elegir(colaboradorId: string, ms: number, valor: number) {
    setMenu(null);
    onMarcar(colaboradorId, ms, valor);
  }

  function totalColaborador(colaboradorId: string): number {
    return dias.reduce((acc, d) => acc + (fracciones[cellKey(colaboradorId, d.ms)] ?? 0), 0);
  }

  const valorMenu = menu ? (fracciones[cellKey(menu.colaboradorId, menu.ms)] ?? 0) : 0;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-medium">Colaborador</th>
              {dias.map((d) => (
                <th key={d.ms} className="px-3 py-3 text-center font-medium">
                  <div>{d.abbr}</div>
                  <div className="text-xs font-normal text-neutral-400">
                    {d.dia}/{d.mes}
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((c) => {
              const editable = llevaPaseDeLista(c.tipo_pago);
              return (
                <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <div className="font-medium text-neutral-900">{c.nombre}</div>
                    <Badge tone={c.tipo_pago === 'DESTAJO' ? 'purple' : 'blue'}>
                      {c.tipo_pago === 'DESTAJO' ? 'Destajo' : 'Por día'}
                    </Badge>
                  </td>
                  {dias.map((d) => {
                    const key = cellKey(c.id, d.ms);
                    const f = fracciones[key] ?? 0;
                    const tiene = f > 0;
                    if (!editable) {
                      return (
                        <td key={d.ms} className="px-3 py-3 text-center text-neutral-300">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={d.ms} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={(e) => abrirMenu(e, c.id, d.ms)}
                          title={
                            pendientes.has(key)
                              ? 'Guardado en este dispositivo, falta enviar'
                              : 'Tocar para marcar el pase de lista'
                          }
                          className={`relative h-9 w-9 cursor-pointer rounded-lg border text-sm font-semibold transition ${
                            conError.has(key)
                              ? 'border-red-300 bg-red-50 text-red-600'
                              : tiene
                                ? 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700'
                                : 'border-neutral-200 text-neutral-300 hover:border-neutral-400 hover:text-neutral-500'
                          }`}
                        >
                          {etiquetaFraccion(f)}
                          {/* Punto de "falta enviar": la celda ya está capturada
                              en este dispositivo pero no confirmada en el servidor. */}
                          {pendientes.has(key) && !conError.has(key) && (
                            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-semibold text-neutral-900">
                    {totalColaborador(c.id).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {menu && (
        <>
          {/* Backdrop para cerrar al tocar fuera */}
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
            style={{ top: menu.top, left: menu.left }}
          >
            <p className="border-b border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-400">
              Pase de lista
            </p>
            {OPCIONES.map((o) => {
              const activo = o.valor === valorMenu;
              return (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => elegir(menu.colaboradorId, menu.ms, o.valor)}
                  className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-neutral-100 ${
                    activo ? 'bg-neutral-50 font-medium text-neutral-900' : 'text-neutral-700'
                  }`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-neutral-300 text-sm font-semibold">
                    {o.simbolo}
                  </span>
                  {o.etiqueta}
                  {activo && <span className="ml-auto text-neutral-400">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
