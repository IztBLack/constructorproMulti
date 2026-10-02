'use client';

import { Ayuda } from '@/components/guia/ayuda';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Field, Input, Modal } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { calcularTotales, type NotaConRenglones } from '@/lib/data/notas-obra-calculo';
import { msAFechaInput } from '@/lib/data/tz';
import { crearNotaAction, crearNotaDesdeTextoAction } from './actions';
import BuscadorDestinatario, { type ColaboradorLite } from './buscador-destinatario';
import PegarMensaje from './pegar-mensaje';

/**
 * Listado de las notas de una obra, una por socio. Cada tarjeta enseña de un
 * vistazo lo que importa al abrirla: total acordado y cuánto falta.
 *
 * El alta no pide nada obligatorio: los renglones —y hasta el nombre— se
 * capturan dentro. Pedir todo de golpe convertiría "apuntar rápido un trato" en
 * un formulario largo, que es justo lo que hoy se resuelve con una tabla de
 * Word.
 */
export default function NotasLista({
  obraId,
  notas,
  colaboradores,
  puedeEditar,
}: {
  obraId: string;
  notas: NotaConRenglones[];
  colaboradores: ColaboradorLite[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pegando, setPegando] = useState(false);
  const [destinatario, setDestinatario] = useState('');
  const [colaboradorId, setColaboradorId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(() => msAFechaInput(Date.now()));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    setAbierto(false);
    setDestinatario('');
    setColaboradorId('');
    setTitulo('');
    setError(null);
  }

  async function crear() {
    setGuardando(true);
    setError(null);

    const fd = new FormData();
    fd.set('destinatario', destinatario);
    fd.set('colaborador_id', colaboradorId);
    fd.set('titulo', titulo);
    fd.set('fecha', fecha);
    fd.set('estado', 'ABIERTA');
    fd.set('cuantas_hay', String(notas.length));

    const r = await crearNotaAction(obraId, fd);
    setGuardando(false);

    if (!r.ok) {
      setError(r.error ?? 'No se pudo crear la nota.');
      return;
    }

    cerrar();
    // Se entra directo a capturar los renglones: crear la nota vacía no es la
    // meta de nadie, es el paso previo.
    if (r.id) router.push(`/admin/obras/${obraId}/notas/${r.id}`);
    else router.refresh();
  }

  /**
   * Alta desde un mensaje pegado. Se manda el texto crudo y lo lee el servidor;
   * de vuelta se entra a la nota, igual que en el alta normal: lo que sigue es
   * revisar lo que el parser entendió.
   */
  async function crearDesdeMensaje(mensaje: string) {
    const r = await crearNotaDesdeTextoAction(obraId, mensaje, notas.length);
    if (r.ok && r.id) router.push(`/admin/obras/${obraId}/notas/${r.id}`);
    else if (r.ok) router.refresh();
    return r;
  }

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="flex justify-end gap-2">
          <Ayuda clave="notas.pegar-mensaje" className="self-center" />
          <Button type="button" variant="secondary" onClick={() => setPegando(true)} data-guia="notas-pegar">
            Pegar mensaje
          </Button>
          <Button type="button" onClick={() => setAbierto(true)} data-guia="notas-nueva">
            + Nueva nota
          </Button>
        </div>
      )}

      {notas.length === 0 ? (
        <EmptyState
          title="Sin notas todavía"
          description="Aquí van las cuentas de los tratos de esta obra: cuánto se acordó por cada trabajo, qué se ha pagado y qué falta."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {notas.map((nota) => {
            const t = calcularTotales(nota, nota.renglones);
            const liquidada = nota.estado === 'LIQUIDADA';

            return (
              <li key={nota.id}>
                <Link
                  href={`/admin/obras/${obraId}/notas/${nota.id}`}
                  className="block rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                >
                  <Card className="h-full transition hover:border-neutral-400">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-neutral-900">
                          {nota.destinatario || (
                            <span className="text-neutral-400" title="Por completar">
                              *
                            </span>
                          )}
                        </p>
                        {nota.titulo && (
                          <p className="truncate text-sm text-neutral-600">{nota.titulo}</p>
                        )}
                        <p className="mt-0.5 text-xs text-neutral-500">{formatDate(nota.fecha)}</p>
                      </div>
                      <Badge tone={liquidada ? 'green' : 'amber'}>
                        {liquidada ? 'Liquidada' : 'Abierta'}
                      </Badge>
                    </div>

                    <dl className="mt-4 flex items-end justify-between gap-3 border-t border-neutral-200 pt-3">
                      <div>
                        <dt className="text-xs text-neutral-500">Total</dt>
                        <dd className="font-semibold tabular-nums text-neutral-900">
                          {formatCurrency(t.total)}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-neutral-500">Saldo</dt>
                        <dd
                          className={`font-semibold tabular-nums ${
                            t.saldo > 0 ? 'text-red-700' : 'text-green-700'
                          }`}
                        >
                          {formatCurrency(t.saldo)}
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
        title="Nueva nota"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="button" onClick={crear} disabled={guardando} data-guia="nota-form-crear">
              {guardando ? 'Creando…' : 'Crear y capturar'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <BuscadorDestinatario
            valor={destinatario}
            colaboradorId={colaboradorId}
            colaboradores={colaboradores}
            onChange={(nombre, id) => {
              setDestinatario(nombre);
              setColaboradorId(id);
            }}
          />

          <Field label="Título" hint="Opcional. Ej. el lote o la etapa.">
            <Input
              data-guia="nota-form-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. MZ 2 LT 1"
            />
          </Field>

          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal>

      <PegarMensaje
        abierto={pegando}
        onCerrar={() => setPegando(false)}
        modo="crear"
        onConfirmar={crearDesdeMensaje}
      />
    </div>
  );
}
