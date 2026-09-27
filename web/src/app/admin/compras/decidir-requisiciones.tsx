'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Textarea } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { RequisicionConRenglones } from '@/lib/compras/tipos';
import { decidirRequisicionAction } from './actions';

/**
 * Requisiciones por aprobar. El admin aprueba o rechaza (con motivo, que lee
 * quien la pidió); los demás solo las ven. La barrera real es la RLS de 0038:
 * solo el admin puede sacar una requisición de PENDIENTE.
 */
export function DecidirRequisiciones({
  requisiciones,
  obras,
  esAdmin,
}: {
  requisiciones: RequisicionConRenglones[];
  obras: Record<string, string>;
  esAdmin: boolean;
}) {
  return (
    <ul className="divide-y divide-neutral-100">
      {requisiciones.map((r) => (
        <FilaRequisicion key={r.id} r={r} obra={obras[r.obra_id] ?? 'Obra'} esAdmin={esAdmin} />
      ))}
    </ul>
  );
}

function FilaRequisicion({ r, obra, esAdmin }: { r: RequisicionConRenglones; obra: string; esAdmin: boolean }) {
  const router = useRouter();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function decidir(aprobar: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await decidirRequisicionAction(r.id, aprobar, motivo);
      if (!res.ok) {
        setError(res.error ?? 'No se pudo guardar.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">
            Requisición {r.folio} · {obra}
          </p>
          <p className="text-xs text-neutral-600">
            Pidió {r.pedido_por_nombre || 'alguien del equipo'} el {formatDate(r.created_at)}
            {r.para_cuando ? (
              <>
                {' '}
                · <Badge tone="amber">Para el {formatDate(r.para_cuando)}</Badge>
              </>
            ) : null}
          </p>
          <ul className="mt-1 list-inside list-disc text-sm text-neutral-700">
            {r.renglones.map((x) => (
              <li key={x.id}>
                {Number(x.cantidad).toLocaleString('es-MX')} {x.unidad} · {x.descripcion}
                {x.notas ? <span className="text-neutral-500"> ({x.notas})</span> : null}
              </li>
            ))}
          </ul>
          {r.notas && <p className="mt-1 text-sm text-neutral-600">Nota: {r.notas}</p>}
        </div>
        {esAdmin && !rechazando && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => decidir(true)} disabled={pendiente}>
              Aprobar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRechazando(true)} disabled={pendiente}>
              Rechazar
            </Button>
          </div>
        )}
      </div>
      {esAdmin && rechazando && (
        <div className="mt-2 space-y-2">
          <label className="block text-sm font-medium text-neutral-800" htmlFor={`motivo-${r.id}`}>
            ¿Por qué se rechaza? (lo lee quien la pidió)
          </label>
          <Textarea
            id={`motivo-${r.id}`}
            rows={2}
            value={motivo}
            maxLength={1000}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={() => decidir(false)} disabled={pendiente || !motivo.trim()}>
              Rechazar requisición
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRechazando(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
