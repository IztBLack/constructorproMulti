'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui';
import type { Colaborador } from '@/lib/data/types';
import { guardarAsistencia } from './actions';

export interface DiaSemana {
  ms: number; // medianoche local del día (clave canónica)
  abbr: string; // Lun, Mar, …
  dia: number; // día del mes
  mes: number; // 1–12
}

/** Opciones del submenú de captura del pase de lista. */
const OPCIONES: { valor: number; simbolo: string; etiqueta: string }[] = [
  { valor: 0, simbolo: '·', etiqueta: 'Falta' },
  { valor: 0.5, simbolo: '½', etiqueta: 'Medio' },
  { valor: 0.75, simbolo: '¾', etiqueta: 'Tres cuartos' },
  { valor: 1, simbolo: '1', etiqueta: 'Completo' },
];

function etiquetaFraccion(f: number): string {
  if (f === 1) return '1';
  if (f === 0.75) return '¾';
  if (f === 0.5) return '½';
  return '·';
}

const cellKey = (colaboradorId: string, ms: number) => `${colaboradorId}|${ms}`;

interface MenuAbierto {
  colaboradorId: string;
  ms: number;
  top: number;
  left: number;
}

export default function CuadriculaAsistencia({
  obraId,
  colaboradores,
  dias,
  fraccionesIniciales,
}: {
  obraId: string;
  colaboradores: Colaborador[];
  dias: DiaSemana[];
  fraccionesIniciales: Record<string, number>;
}) {
  const [fracciones, setFracciones] = useState<Record<string, number>>(fraccionesIniciales);
  const [guardando, setGuardando] = useState<Set<string>>(new Set());
  const [conError, setConError] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuAbierto | null>(null);

  function marcarSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string, on: boolean) {
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function abrirMenu(e: React.MouseEvent<HTMLButtonElement>, colaboradorId: string, ms: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    // El submenú se posiciona fijo respecto al viewport para no recortarse
    // dentro del contenedor con scroll horizontal de la tabla.
    setMenu({ colaboradorId, ms, top: rect.bottom + 4, left: rect.left });
  }

  async function elegir(colaboradorId: string, ms: number, valor: number) {
    setMenu(null);
    const key = cellKey(colaboradorId, ms);
    const previo = fracciones[key] ?? 0;
    if (valor === previo) return; // sin cambios

    setFracciones((p) => ({ ...p, [key]: valor }));
    marcarSet(setConError, key, false);
    marcarSet(setGuardando, key, true);

    const result = await guardarAsistencia(obraId, colaboradorId, ms, valor);

    marcarSet(setGuardando, key, false);
    if (!result.ok) {
      setFracciones((p) => ({ ...p, [key]: previo })); // revertir si falló
      marcarSet(setConError, key, true);
    }
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
              const editable = c.tipo_pago === 'DIA';
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
                          disabled={guardando.has(key)}
                          title="Tocar para marcar el pase de lista"
                          className={`h-9 w-9 rounded-lg border text-sm font-semibold transition disabled:opacity-50 ${
                            conError.has(key)
                              ? 'border-red-300 bg-red-50 text-red-600'
                              : tiene
                                ? 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700'
                                : 'border-neutral-200 text-neutral-300 hover:border-neutral-400 hover:text-neutral-500'
                          }`}
                        >
                          {etiquetaFraccion(f)}
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
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-neutral-100 ${
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
