'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { calcularTotales, type NotaConRenglones } from '@/lib/data/notas-obra-calculo';
import { msAFechaInput } from '@/lib/data/tz';
import { crearNotaAction } from './actions';

interface ColaboradorLite {
  id: string;
  nombre: string;
}

/**
 * Listado de las notas de una obra, una por socio. Cada tarjeta enseña de un
 * vistazo lo que importa al abrirla: total acordado y cuánto falta.
 *
 * El alta pide solo el destinatario y la fecha; los renglones se capturan
 * dentro. Pedir todo de golpe convertiría "apuntar rápido un trato" en un
 * formulario largo, que es justo lo que hoy se resuelve con una tabla de Word.
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

  /**
   * Al elegir un colaborador se copia su nombre al destinatario si está vacío:
   * el nombre libre sigue mandando (el socio puede firmar distinto a como está
   * dado de alta), pero no hay que teclearlo dos veces.
   */
  function elegirColaborador(id: string) {
    setColaboradorId(id);
    if (!destinatario.trim()) {
      const c = colaboradores.find((x) => x.id === id);
      if (c) setDestinatario(c.nombre);
    }
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

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setAbierto(true)}>
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
                          {nota.destinatario || 'Sin destinatario'}
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
            <Button type="button" onClick={crear} disabled={guardando || !destinatario.trim()}>
              {guardando ? 'Creando…' : 'Crear y capturar'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="A nombre de *" hint="Como lo conoces. No necesita estar dado de alta.">
            <Input
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              placeholder="Ej. Orlando Ramoz"
              required
            />
          </Field>

          {colaboradores.length > 0 && (
            <Field
              label="¿Está en el equipo?"
              hint="Opcional: liga la nota a alguien ya registrado."
            >
              <Select value={colaboradorId} onChange={(e) => elegirColaborador(e.target.value)}>
                <option value="">No está en el sistema</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Título" hint="Opcional. Ej. el lote o la etapa.">
            <Input
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
    </div>
  );
}
