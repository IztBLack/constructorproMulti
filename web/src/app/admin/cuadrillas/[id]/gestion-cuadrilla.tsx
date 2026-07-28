'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, MultiSelectList } from '@/components/ui';
import type { CuadrillaDetalle } from '@/lib/data/cuadrillas';
import {
  agregarMiembros,
  asignarObras,
  desasignarObra,
  mandarEquipoAObra,
  quitarMiembro,
  setJefe,
} from '../actions';

type Opcion = { id: string; nombre: string };

export default function GestionCuadrilla({
  cuadrilla,
  colaboradores,
  obras,
}: {
  cuadrilla: CuadrillaDetalle;
  colaboradores: Opcion[];
  obras: Opcion[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [nuevosMiembros, setNuevosMiembros] = useState<string[]>([]);
  const [nuevasObras, setNuevasObras] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const miembroIds = new Set(cuadrilla.miembros.map((m) => m.id));
  const obraIds = new Set(cuadrilla.obras.map((o) => o.id));
  const colaboradoresDisponibles = colaboradores.filter((c) => !miembroIds.has(c.id));
  const obrasDisponibles = obras.filter((o) => !obraIds.has(o.id));

  const nombrePorId = new Map<string, string>([
    ...colaboradores.map((c) => [c.id, c.nombre] as const),
    ...cuadrilla.miembros.map((m) => [m.id, m.nombre] as const),
  ]);
  const nombres = (ids: string[]) => ids.map((id) => nombrePorId.get(id) ?? id).join(', ');

  /**
   * Ejecuta una acción y refresca. `alTerminar` corre SIEMPRE (con éxito o sin
   * él) y después de fijar el error genérico, para que pueda enriquecerlo con
   * nombres o agregar un aviso. Las operaciones en lote pueden salir con
   * `ok:false` y aun así haber aplicado parte: por eso siempre se refresca.
   */
  async function run<T extends { ok: boolean; error?: string }>(
    fn: () => Promise<T>,
    alTerminar?: (r: T) => void,
  ) {
    setBusy(true);
    setError(null);
    setAviso(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'No se pudo completar la acción.');
    alTerminar?.(r);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          {aviso}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Miembros ── */}
        <section className="space-y-3 rounded-xl border border-neutral-100 p-4">
          <h2 className="text-sm font-medium text-neutral-700">
            Miembros ({cuadrilla.miembros.length})
          </h2>

          <div className="space-y-2">
            <MultiSelectList
              etiqueta="Colaboradores por agregar"
              opciones={colaboradoresDisponibles}
              seleccionados={nuevosMiembros}
              onChange={setNuevosMiembros}
              buscarPlaceholder="Buscar colaborador…"
              vacioTexto="No hay colaboradores disponibles."
              disabled={busy}
            />
            {colaboradoresDisponibles.length > 0 && (
              <Button
                size="sm"
                disabled={busy || nuevosMiembros.length === 0}
                onClick={() =>
                  run(
                    () => agregarMiembros(cuadrilla.id, nuevosMiembros),
                    (r) => {
                      const partes: string[] = [];
                      if (r.aplicados.length) partes.push(`Se agregó a ${nombres(r.aplicados)}.`);
                      if (r.omitidos.length)
                        partes.push(`Ya eran miembros: ${nombres(r.omitidos)}.`);
                      if (r.fallidos.length)
                        setError(
                          `No se pudo agregar a ${nombres(r.fallidos.map((f) => f.id))}: ${r.fallidos[0].error}`,
                        );
                      if (partes.length) setAviso(partes.join(' '));
                      // Se limpia siempre: lo aplicado ya no está disponible y lo
                      // fallido se vuelve a elegir con la lista ya refrescada.
                      setNuevosMiembros([]);
                    },
                  )
                }
              >
                {nuevosMiembros.length > 1
                  ? `Agregar ${nuevosMiembros.length}`
                  : 'Agregar'}
              </Button>
            )}
          </div>

          {cuadrilla.miembros.length === 0 ? (
            <p className="text-sm text-neutral-400">Aún no hay miembros.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {cuadrilla.miembros.map((m) => {
                const esJefe = m.id === cuadrilla.jefe_colaborador_id;
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2 text-sm text-neutral-800">
                      {m.nombre}
                      {esJefe && <Badge tone="amber">Cabo</Badge>}
                    </span>
                    <span className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => run(() => setJefe(cuadrilla.id, esJefe ? '' : m.id))}
                      >
                        {esJefe ? 'Quitar cabo' : 'Hacer cabo'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => run(() => quitarMiembro(cuadrilla.id, m.id))}
                      >
                        Quitar
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Obras ── */}
        <section className="space-y-3 rounded-xl border border-neutral-100 p-4">
          <h2 className="text-sm font-medium text-neutral-700">
            Obras asignadas ({cuadrilla.obras.length})
          </h2>

          <div className="space-y-2">
            <MultiSelectList
              etiqueta="Obras por asignar"
              opciones={obrasDisponibles}
              seleccionados={nuevasObras}
              onChange={setNuevasObras}
              buscarPlaceholder="Buscar obra…"
              vacioTexto="No hay obras disponibles."
              disabled={busy}
            />
            {obrasDisponibles.length > 0 && (
              <Button
                size="sm"
                disabled={busy || nuevasObras.length === 0}
                onClick={() =>
                  run(
                    () => asignarObras(cuadrilla.id, nuevasObras),
                    (r) => {
                      if (!r.fallidos.length)
                        setAviso(
                          'Cuadrilla asignada. Usa «Mandar equipo» para que sus miembros aparezcan en el pase de lista.',
                        );
                      setNuevasObras([]);
                    },
                  )
                }
              >
                {nuevasObras.length > 1 ? `Asignar ${nuevasObras.length}` : 'Asignar'}
              </Button>
            )}
          </div>

          {cuadrilla.obras.length === 0 ? (
            <p className="text-sm text-neutral-400">Sin obras asignadas.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {cuadrilla.obras.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-neutral-800">{o.nombre}</span>
                  <span className="flex items-center gap-2">
                    {/* El vínculo cuadrilla↔obra NO mete a la gente en la obra:
                        esto es lo que la hace aparecer en el pase de lista. */}
                    <Button
                      size="sm"
                      disabled={busy || cuadrilla.miembros.length === 0}
                      title="Asigna a todos los miembros vigentes a esta obra"
                      onClick={() =>
                        run(
                          () => mandarEquipoAObra(cuadrilla.id, o.id),
                          (r) => {
                            const partes: string[] = [];
                            if (r.asignados.length)
                              partes.push(
                                `${r.asignados.length} colaborador(es) asignados a ${o.nombre}.`,
                              );
                            if (r.omitidos.length)
                              partes.push(`${r.omitidos.length} ya estaban ahí.`);
                            if (r.cerradas.length)
                              partes.push(`Se dieron de baja de: ${r.cerradas.join(', ')}.`);
                            setAviso(partes.join(' ') || 'Sin cambios.');
                          },
                        )
                      }
                    >
                      Mandar equipo
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => run(() => desasignarObra(cuadrilla.id, o.id))}
                    >
                      Desasignar
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
