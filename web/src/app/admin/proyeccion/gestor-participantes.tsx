'use client';

import { useMemo, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import type { Colaborador } from '@/lib/data/types';

interface Props {
  colaboradores: Colaborador[];
  /// Ids que hoy están en el escenario.
  participantes: string[];
  /// Obra base efectiva (la real más la asignada dentro del escenario).
  obraDe: Record<string, string>;
  obras: { id: string; nombre: string }[];
  /// Obra preseleccionada al agregar a alguien sin asignar (la del filtro).
  obraSugerida: string | null;
  onAgregar: (colaboradorId: string, obraId: string | null) => void;
  onQuitar: (colaboradorId: string) => void;
  onCerrar: () => void;
}

/// Quién entra a la proyección.
///
/// Vive en su propio diálogo y NO en una lista al pie de la tabla porque esa
/// lista se filtraba junto con la tabla: al elegir una obra desaparecía —los
/// únicos candidatos eran gente sin obra, que nunca coincide con el filtro— y
/// no había manera de agregar a nadie. Aquí el filtro de la tabla no manda.
///
/// La distinción que hay que dejar clarísima: quitar a alguien de AQUÍ no lo da
/// de baja de su obra ni de la app. Es solo esta cuenta.
export function GestorParticipantes(props: Props) {
  const { colaboradores, participantes, obraDe, obras, obraSugerida } = props;
  const [busqueda, setBusqueda] = useState('');
  /// Obra elegida para cada persona sin asignar, antes de agregarla.
  const [obraElegida, setObraElegida] = useState<Record<string, string>>({});

  const dentro = useMemo(() => new Set(participantes), [participantes]);

  const { enProyeccion, fuera } = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = (c: Colaborador) => !q || c.nombre.toLowerCase().includes(q);
    const orden = (a: Colaborador, b: Colaborador) => a.nombre.localeCompare(b.nombre);
    const visibles = colaboradores.filter(coincide);
    return {
      enProyeccion: visibles.filter((c) => dentro.has(c.id)).sort(orden),
      fuera: visibles.filter((c) => !dentro.has(c.id)).sort(orden),
    };
  }, [colaboradores, dentro, busqueda]);

  const nombreObra = (id: string | undefined) =>
    obras.find((o) => o.id === id)?.nombre ?? null;

  return (
    <Modal open onClose={props.onCerrar} title="Quién entra a la proyección" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">
          Al abrir, la proyección trae a todos los colaboradores asignados a una obra
          activa. Aquí puedes sacar o meter gente <strong>solo para esta cuenta</strong>:
          nadie se da de baja de su obra ni de la app.
        </p>

        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre…"
          aria-label="Buscar colaborador"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
        />

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            En la proyección · {enProyeccion.length}
          </h3>
          {enProyeccion.length === 0 ? (
            <p className="text-sm text-neutral-500">Nadie todavía.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {enProyeccion.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {c.nombre}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {nombreObra(obraDe[c.id]) ?? 'Sin obra asignada'}
                      {c.tipo_pago === 'DESTAJO' && ' · a destajo'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => props.onQuitar(c.id)}
                    className="min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Fuera de la proyección · {fuera.length}
          </h3>
          {fuera.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Ya están todos los colaboradores activos.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {fuera.map((c) => {
                const suObra = obraDe[c.id];
                const sinObra = !suObra;
                // A quien no tiene obra hay que darle una: si no, sus días no
                // pertenecerían a ninguna y no sumarían a la raya de nadie.
                const elegida = obraElegida[c.id] ?? obraSugerida ?? obras[0]?.id ?? '';
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900">
                        {c.nombre}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">
                        {nombreObra(suObra) ?? 'Sin obra asignada'}
                        {c.tipo_pago === 'DESTAJO' && ' · a destajo'}
                      </span>
                    </span>

                    {sinObra && (
                      <select
                        value={elegida}
                        onChange={(e) =>
                          setObraElegida((m) => ({ ...m, [c.id]: e.target.value }))
                        }
                        aria-label={`Obra para ${c.nombre}`}
                        className="min-h-9 rounded-lg border border-neutral-300 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                      >
                        {obras.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      disabled={sinObra && !elegida}
                      onClick={() => props.onAgregar(c.id, sinObra ? elegida : null)}
                      className="min-h-9 shrink-0 rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-700 hover:border-blue-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                    >
                      Agregar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex justify-end">
          <Button onClick={props.onCerrar}>Listo</Button>
        </div>
      </div>
    </Modal>
  );
}
