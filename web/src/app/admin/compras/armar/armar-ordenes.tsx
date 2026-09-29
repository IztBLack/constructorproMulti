'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { agruparEnOrdenes } from '@/lib/compras/calculo';
import { crearOrdenesDesdeRequisicionesAction } from '../actions';

export interface FilaPorComprar {
  renglonId: string;
  requisicionFolio: number;
  obraId: string;
  obra: string;
  paraCuando: number | null;
  descripcion: string;
  unidad: string;
  falta: number;
  proveedorSugerido: string;
  precioSugerido: number | null;
}

interface Eleccion {
  incluir: boolean;
  proveedorId: string;
  cantidad: string;
  precio: string;
}

const inputClase =
  'min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900';

export function ArmarOrdenes({
  filas,
  proveedores,
}: {
  filas: FilaPorComprar[];
  proveedores: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>(() =>
    Object.fromEntries(
      filas.map((f) => [
        f.renglonId,
        {
          incluir: true,
          proveedorId: f.proveedorSugerido,
          cantidad: String(f.falta),
          precio: f.precioSugerido != null ? String(f.precioSugerido) : '',
        },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const cambiar = (id: string, c: Partial<Eleccion>) =>
    setElecciones((e) => ({ ...e, [id]: { ...e[id], ...c } }));

  // Vista previa: las órdenes que van a salir, con la misma regla que el servidor.
  const propuesta = useMemo(
    () =>
      agruparEnOrdenes(
        filas
          .filter((f) => elecciones[f.renglonId]?.incluir)
          .map((f) => ({
            requisicionRenglonId: f.renglonId,
            obraId: f.obraId,
            proveedorId: elecciones[f.renglonId].proveedorId,
            materialId: null,
            descripcion: f.descripcion,
            unidad: f.unidad,
            cantidad: Number(elecciones[f.renglonId].cantidad) || 0,
            precioUnitario: Number(elecciones[f.renglonId].precio) || 0,
          })),
      ),
    [filas, elecciones],
  );

  if (filas.length === 0) {
    return <EmptyState title="Nada por comprar" description="Todo lo aprobado ya está en una orden de compra." />;
  }
  if (proveedores.length === 0) {
    return (
      <p className="text-sm text-neutral-700">
        Primero da de alta a tus proveedores en{' '}
        <a className="font-medium text-blue-700 underline" href="/admin/compras/proveedores">
          Proveedores
        </a>
        .
      </p>
    );
  }

  const incluidos = filas.filter((f) => elecciones[f.renglonId]?.incluir);
  const sinProveedor = incluidos.filter((f) => !elecciones[f.renglonId].proveedorId).length;
  const nombreProv = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const nombreObra = new Map(filas.map((f) => [f.obraId, f.obra]));

  function crear() {
    setError(null);
    startTransition(async () => {
      const r = await crearOrdenesDesdeRequisicionesAction(
        incluidos.map((f) => ({
          requisicionRenglonId: f.renglonId,
          proveedorId: elecciones[f.renglonId].proveedorId,
          cantidad: elecciones[f.renglonId].cantidad,
          precio: elecciones[f.renglonId].precio || '0',
        })),
      );
      if (!r.ok) {
        setError(r.error ?? 'No se pudieron crear las órdenes.');
        if (r.ids?.length) router.refresh();
        return;
      }
      if (r.ids?.length === 1) router.push(`/admin/compras/ordenes/${r.ids[0]}`);
      else router.push('/admin/compras');
    });
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-600">
              <th className="px-3 py-3 font-medium">Comprar</th>
              <th className="px-3 py-3 font-medium">Material</th>
              <th className="px-3 py-3 font-medium">Obra</th>
              <th className="px-3 py-3 font-medium">Cantidad</th>
              <th className="px-3 py-3 font-medium">Proveedor</th>
              <th className="px-3 py-3 font-medium">Precio sin IVA</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const e = elecciones[f.renglonId];
              const idBase = `armar-${f.renglonId}`;
              return (
                <tr key={f.renglonId} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      id={`${idBase}-incluir`}
                      type="checkbox"
                      className="h-5 w-5"
                      checked={e.incluir}
                      onChange={(ev) => cambiar(f.renglonId, { incluir: ev.target.checked })}
                      aria-label={`Comprar ${f.descripcion}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-neutral-900">{f.descripcion}</span>
                    <span className="block text-xs text-neutral-600">
                      Requisición {f.requisicionFolio} · faltan {f.falta} {f.unidad}
                      {f.paraCuando ? ` · para el ${formatDate(f.paraCuando)}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-700">{f.obra}</td>
                  <td className="w-28 px-3 py-2">
                    <input
                      className={inputClase}
                      inputMode="decimal"
                      value={e.cantidad}
                      aria-label={`Cantidad de ${f.descripcion}`}
                      disabled={!e.incluir}
                      onChange={(ev) => cambiar(f.renglonId, { cantidad: ev.target.value })}
                    />
                  </td>
                  <td className="w-52 px-3 py-2">
                    <select
                      className={inputClase}
                      value={e.proveedorId}
                      aria-label={`Proveedor de ${f.descripcion}`}
                      disabled={!e.incluir}
                      onChange={(ev) => cambiar(f.renglonId, { proveedorId: ev.target.value })}
                    >
                      <option value="">Elige…</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-32 px-3 py-2">
                    <input
                      className={inputClase}
                      inputMode="decimal"
                      value={e.precio}
                      placeholder="0.00"
                      aria-label={`Precio unitario de ${f.descripcion}`}
                      disabled={!e.incluir}
                      onChange={(ev) => cambiar(f.renglonId, { precio: ev.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="vista-previa" className="space-y-2">
        <h2 id="vista-previa" className="text-base font-semibold text-neutral-900">
          Se van a crear {propuesta.length} {propuesta.length === 1 ? 'orden' : 'órdenes'}
        </h2>
        <ul className="space-y-1 text-sm text-neutral-700">
          {propuesta.map((g) => (
            <li key={`${g.obraId}|${g.proveedorId}`}>
              {nombreProv.get(g.proveedorId)} → {nombreObra.get(g.obraId)}: {g.renglones.length}{' '}
              {g.renglones.length === 1 ? 'material' : 'materiales'}, {formatCurrency(g.subtotal)} sin IVA
            </li>
          ))}
        </ul>
        {sinProveedor > 0 && (
          <p className="text-sm text-amber-800">
            {sinProveedor} {sinProveedor === 1 ? 'material no tiene' : 'materiales no tienen'} proveedor: elige uno o
            desmárcalos.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button onClick={crear} disabled={pendiente || incluidos.length === 0 || sinProveedor > 0}>
        {pendiente ? 'Creando…' : 'Crear órdenes en borrador'}
      </Button>
    </div>
  );
}
