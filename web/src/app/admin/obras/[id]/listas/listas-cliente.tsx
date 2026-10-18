'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Field, Input, Modal } from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { ListaConRenglones } from '@/lib/data/listas';
import { listaCompleta, metros2, tipoRenglonLista, totalesDe } from '@/lib/listas/calculo';
import { crearListaAction } from './actions';

/**
 * Las listas de una obra en tarjetas: cada una dice de un vistazo cuánto va
 * palomeado («12 de 20») y los metros que suma, que es lo que se busca al abrir.
 */
export default function ListasCliente({
  obraId,
  listas,
  puedeEditar,
}: {
  obraId: string;
  listas: ListaConRenglones[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [plano, setPlano] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    setAbierto(false);
    setTitulo('');
    setPlano('');
    setError(null);
  }

  async function crear() {
    setGuardando(true);
    setError(null);
    const r = await crearListaAction(obraId, { titulo, plano });
    setGuardando(false);
    if (!r.ok || !r.id) {
      setError(r.error ?? 'No se pudo crear la lista.');
      return;
    }
    cerrar();
    // Recién creada, lo que sigue es pegar la nota o capturar los renglones.
    router.push(`/admin/obras/${obraId}/listas/${r.id}?pegar=1`);
  }

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setAbierto(true)}>
            + Nueva lista
          </Button>
        </div>
      )}

      {listas.length === 0 ? (
        <EmptyState
          title="Sin listas todavía"
          description="Haz una lista por cada parte del plano (trabes, castillos, pasillo…) y palomea en la obra lo que ya está."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {listas.map((l) => {
            const t = totalesDe(
              l.renglones.map((r) => ({
                tipo: tipoRenglonLista(r.tipo),
                cantidad: r.cantidad,
                largo: r.largo,
                separacion_cm: r.separacion_cm,
                marcado: r.marcado,
              })),
            );
            const cerrada = l.estado === 'CERRADA';
            return (
              <li key={l.id}>
                <Link
                  href={`/admin/obras/${obraId}/listas/${l.id}`}
                  className="block rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                >
                  <Card className="h-full transition hover:border-neutral-400">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-neutral-900">{l.titulo || 'Lista sin título'}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {[l.plano ? `Plano ${l.plano}` : '', formatDate(l.fecha)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {cerrada ? (
                        <Badge tone="neutral">Cerrada</Badge>
                      ) : listaCompleta(t) ? (
                        <Badge tone="green">Completa</Badge>
                      ) : null}
                    </div>
                    <dl className="mt-4 flex items-end justify-between gap-3 border-t border-neutral-200 pt-3">
                      <div>
                        <dt className="text-xs text-neutral-500">Palomeado</dt>
                        <dd className="font-semibold tabular-nums text-neutral-900">
                          {t.renglones === 0 ? 'Vacía' : `${t.marcados} de ${t.renglones}`}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-neutral-500">Metros lineales</dt>
                        <dd className="font-semibold tabular-nums text-neutral-900">
                          {t.metros > 0 ? `${metros2(t.metros)} m` : '—'}
                        </dd>
                      </div>
                    </dl>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={abierto}
        onClose={cerrar}
        title="Nueva lista"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="button" onClick={crear} disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear lista'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Nombre de la lista">
            <Input
              value={titulo}
              maxLength={200}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Trabes y pasillo planta alta"
              autoFocus
            />
          </Field>
          <Field label="Plano" hint="Opcional. Clave u hoja del plano, ej. E-03.">
            <Input value={plano} maxLength={60} onChange={(e) => setPlano(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
