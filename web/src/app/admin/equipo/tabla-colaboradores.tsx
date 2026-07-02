'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Colaborador, Puesto } from '@/lib/data/types';
import { formatCurrency } from '@/lib/data/format';
import { alternarActivoColaborador } from './actions';

const TIPO_PAGO_LABEL: Record<string, string> = {
  DIA: 'Por día',
  DESTAJO: 'Por destajo',
};

export default function TablaColaboradores({
  colaboradores,
  puestos,
}: {
  colaboradores: Colaborador[];
  puestos: Puesto[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const puestoNombre = (puestoId: string | null) =>
    puestos.find((p) => p.id === puestoId)?.nombre ?? '—';

  const salarioPuesto = (puestoId: string | null) =>
    puestos.find((p) => p.id === puestoId)?.salario_dia_default ?? null;

  async function onToggleActivo(id: string, activo: boolean) {
    setLoadingId(id);
    await alternarActivoColaborador(id, !activo);
    setLoadingId(null);
    router.refresh();
  }

  if (colaboradores.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
        Aún no hay colaboradores registrados.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="px-4 py-3 font-medium">Nombre</th>
            <th className="px-4 py-3 font-medium">Puesto</th>
            <th className="px-4 py-3 font-medium">Tipo de pago</th>
            <th className="px-4 py-3 text-right font-medium">Salario/día</th>
            <th className="px-4 py-3 font-medium">Teléfono</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {colaboradores.map((c) => {
            const salario = c.salario_personalizado ?? salarioPuesto(c.puesto_id);
            return (
              <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  <Link href={`/admin/equipo/${c.id}`} className="hover:underline">
                    {c.nombre}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{puestoNombre(c.puesto_id)}</td>
                <td className="px-4 py-3 text-neutral-600">{TIPO_PAGO_LABEL[c.tipo_pago] ?? c.tipo_pago}</td>
                <td className="px-4 py-3 text-right text-neutral-600">
                  {salario !== null ? formatCurrency(salario) : '—'}
                </td>
                <td className="px-4 py-3 text-neutral-600">{c.telefono || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.activo ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {c.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onToggleActivo(c.id, c.activo)}
                    disabled={loadingId === c.id}
                    className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                  >
                    {c.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
