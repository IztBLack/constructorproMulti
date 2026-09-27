'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { msAFechaInput } from '@/lib/data/tz';
import {
  ETIQUETA_ESTADO_EXTRA,
  TONO_ESTADO_EXTRA,
  totalExtra,
  totalExtrasAprobados,
  type OrdenCambioConRenglones,
} from '@/lib/cambios/extras';
import { crearExtraAction } from './actions';

/**
 * Lista de extras de una obra. Cada tarjeta enseña lo que importa al abrirla:
 * de qué es, cuánto vale y en qué va (borrador, esperando al cliente, aprobado).
 *
 * El alta pide solo de qué es el extra: los conceptos y precios se capturan
 * dentro, igual que en las notas.
 */
export default function ExtrasLista({
  obraId,
  extras,
  puedeEditar,
  esAdmin,
}: {
  obraId: string;
  extras: OrdenCambioConRenglones[];
  puedeEditar: boolean;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fecha] = useState(() => msAFechaInput(Date.now()));

  const aprobado = totalExtrasAprobados(extras);
  const pendientes = extras.filter((e) => e.estado === 'ENVIADA');
  const porAprobar = pendientes.reduce((acc, e) => acc + totalExtra(e), 0);

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const r = await crearExtraAction(obraId, new FormData(e.currentTarget));
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo crear el extra.');
      return;
    }
    setAbierto(false);
    // Directo a capturar los conceptos: el extra vacío no es la meta de nadie.
    if (r.id) router.push(`/admin/obras/${obraId}/extras/${r.id}`);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="inline text-neutral-600">Aprobados: </dt>
            <dd className="inline font-semibold tabular-nums text-green-700">{formatCurrency(aprobado)}</dd>
          </div>
          {pendientes.length > 0 && (
            <div>
              <dt className="inline text-neutral-600">Esperando al cliente: </dt>
              <dd className="inline font-semibold tabular-nums text-amber-700">
                {formatCurrency(porAprobar)} ({pendientes.length})
              </dd>
            </div>
          )}
        </dl>
        {puedeEditar && <Button onClick={() => setAbierto(true)}>Nuevo extra</Button>}
      </div>

      {extras.length === 0 ? (
        <EmptyState
          title="Todavía no hay extras en esta obra"
          description="Cuando el cliente te pida algo que no estaba en el presupuesto, apúntalo aquí con su precio y mándaselo para que lo apruebe."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {extras.map((x) => (
            <li key={x.id}>
              <Link
                href={`/admin/obras/${obraId}/extras/${x.id}`}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                <Card className="h-full transition hover:border-neutral-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-neutral-600">Extra {x.folio}</p>
                      <p className="truncate font-medium text-neutral-900">{x.titulo || 'Sin título'}</p>
                      <p className="text-xs text-neutral-600">{formatDate(x.fecha)}</p>
                    </div>
                    <Badge tone={TONO_ESTADO_EXTRA[x.estado]}>{ETIQUETA_ESTADO_EXTRA[x.estado]}</Badge>
                  </div>
                  <p className="mt-3 text-lg font-semibold tabular-nums text-neutral-900">
                    {formatCurrency(totalExtra(x))}
                  </p>
                  {x.estado === 'RECHAZADA' && x.motivo_rechazo && (
                    <p className="mt-1 line-clamp-2 text-sm text-red-700">Motivo: {x.motivo_rechazo}</p>
                  )}
                  {x.estado === 'BORRADOR' && esAdmin && (
                    <p className="mt-1 text-xs text-neutral-600">Ábrelo para revisarlo y mandárselo al cliente.</p>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={abierto} onClose={() => setAbierto(false)} title="Nuevo extra">
        <form onSubmit={crear} className="space-y-4">
          <Field label="¿De qué es el extra? *" hint="Por ejemplo: Barda en la azotea, cambio de piso en la sala.">
            <Input name="titulo" required maxLength={120} autoFocus />
          </Field>
          <Field label="¿Por qué se hace?" hint="Opcional. Lo pidió el cliente, cambio de plano, algo que salió en obra…">
            <Textarea name="motivo" rows={3} maxLength={1000} />
          </Field>
          <Field label="Fecha">
            <Input type="date" name="fecha" defaultValue={fecha} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear y agregar conceptos'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
