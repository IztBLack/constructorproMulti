'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button } from '@/components/ui';
import type { CuadrillaDetalle } from '@/lib/data/cuadrillas';
import {
  agregarMiembro,
  asignarObra,
  desasignarObra,
  quitarMiembro,
  setJefe,
} from '../actions';

type Opcion = { id: string; nombre: string };

const SELECT_CLASS =
  'flex-1 cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10';

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
  const [nuevoMiembro, setNuevoMiembro] = useState('');
  const [nuevaObra, setNuevaObra] = useState('');

  const miembroIds = new Set(cuadrilla.miembros.map((m) => m.id));
  const obraIds = new Set(cuadrilla.obras.map((o) => o.id));
  const colaboradoresDisponibles = colaboradores.filter((c) => !miembroIds.has(c.id));
  const obrasDisponibles = obras.filter((o) => !obraIds.has(o.id));

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      alert(r.error ?? 'No se pudo completar la acción.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Miembros ── */}
      <section className="space-y-3 rounded-xl border border-neutral-100 p-4">
        <h2 className="text-sm font-medium text-neutral-700">
          Miembros ({cuadrilla.miembros.length})
        </h2>

        <div className="flex items-center gap-2">
          <select
            className={SELECT_CLASS}
            value={nuevoMiembro}
            onChange={(e) => setNuevoMiembro(e.target.value)}
            disabled={busy || colaboradoresDisponibles.length === 0}
          >
            <option value="">
              {colaboradoresDisponibles.length === 0
                ? 'No hay colaboradores disponibles'
                : 'Selecciona un colaborador…'}
            </option>
            {colaboradoresDisponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={busy || !nuevoMiembro}
            onClick={() =>
              run(() => agregarMiembro(cuadrilla.id, nuevoMiembro)).then(() => setNuevoMiembro(''))
            }
          >
            Agregar
          </Button>
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

        <div className="flex items-center gap-2">
          <select
            className={SELECT_CLASS}
            value={nuevaObra}
            onChange={(e) => setNuevaObra(e.target.value)}
            disabled={busy || obrasDisponibles.length === 0}
          >
            <option value="">
              {obrasDisponibles.length === 0 ? 'No hay obras disponibles' : 'Selecciona una obra…'}
            </option>
            {obrasDisponibles.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={busy || !nuevaObra}
            onClick={() =>
              run(() => asignarObra(cuadrilla.id, nuevaObra)).then(() => setNuevaObra(''))
            }
          >
            Asignar
          </Button>
        </div>

        {cuadrilla.obras.length === 0 ? (
          <p className="text-sm text-neutral-400">Sin obras asignadas.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {cuadrilla.obras.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-neutral-800">{o.nombre}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => desasignarObra(cuadrilla.id, o.id))}
                >
                  Desasignar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
