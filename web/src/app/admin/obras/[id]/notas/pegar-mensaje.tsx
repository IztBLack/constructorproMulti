'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, Textarea } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import {
  calcularTotales,
  montoEfectivo,
  type RenglonNota,
} from '@/lib/data/notas-obra-calculo';
import { parsearNotaTexto, type NotaParseada } from '@/lib/data/notas-obra-texto';
import { ETIQUETA_TIPO, SIGNO, TONO_TIPO } from './etiquetas-renglon';

const EJEMPLO =
  'Terminación de módulo 2 y 3 — 120 000(60 y 60) retención del 4%(3k) final 117';

/**
 * Pegar el mensaje tal como llegó y ver, antes de guardar, en qué se convierte.
 *
 * Lo que se manda al servidor es el TEXTO CRUDO, no lo que se ve aquí: el
 * parser vuelve a leerlo allá (`crearNotaDesdeTextoAction`). Así la vista previa
 * no puede enseñar una cosa y guardarse otra, que es el único defecto grave que
 * puede tener una pantalla como esta.
 *
 * No se edita nada en la vista previa, a propósito: el editor de la nota está a
 * un clic y ahí cada renglón ya se corrige solo. Duplicar aquí ese formulario
 * sería una segunda forma de capturar una nota, con sus propios errores.
 */
export default function PegarMensaje({
  abierto,
  onCerrar,
  modo,
  onConfirmar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** 'crear' arma una nota nueva; 'agregar' añade los renglones a una que ya existe. */
  modo: 'crear' | 'agregar';
  onConfirmar: (texto: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leida = useMemo(() => parsearNotaTexto(texto), [texto]);
  const hayAlgo = leida.renglones.length > 0;

  function cerrar() {
    setTexto('');
    setError(null);
    onCerrar();
  }

  async function confirmar() {
    setOcupado(true);
    setError(null);
    const r = await onConfirmar(texto);
    setOcupado(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar la nota.');
      return;
    }
    setTexto('');
    onCerrar();
  }

  return (
    <Modal
      open={abierto}
      onClose={cerrar}
      size="lg"
      title={modo === 'crear' ? 'Nota desde un mensaje' : 'Agregar renglones desde un mensaje'}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={ocupado || !hayAlgo}>
            {ocupado
              ? 'Guardando…'
              : modo === 'crear'
                ? `Crear la nota (${leida.renglones.length})`
                : `Agregar ${leida.renglones.length} renglón(es)`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field
          label="Pega el mensaje tal como llegó"
          hint="Se entienden «120 000», «3k», «$12,300», los porcentajes y las fechas. Lo que quede mal se corrige después, renglón por renglón."
        >
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder={EJEMPLO}
            disabled={ocupado}
            autoFocus
          />
        </Field>

        {texto.trim().length > 0 && (
          <VistaPrevia leida={leida} modo={modo} />
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ── Vista previa ────────────────────────────────────────────────────────────

/** Los renglones leídos, en la forma que pide `calcularTotales`. */
function comoRenglones(rs: NotaParseada['renglones']): RenglonNota[] {
  return rs.map((r, i) => ({
    ...r,
    id: `previo-${i}`,
    nota_id: 'previo',
    mostrar_porcentaje: false,
    orden: (i + 1) * 100,
  }));
}

function VistaPrevia({ leida, modo }: { leida: NotaParseada; modo: 'crear' | 'agregar' }) {
  const renglones = comoRenglones(leida.renglones);
  const totales = calcularTotales(
    { total_override: leida.total_override, saldo_override: leida.saldo_override },
    renglones,
  );

  // En una nota que ya existe, el total y el saldo del mensaje no se aplican:
  // el parser los midió contra estos renglones y esa nota ya trae otros.
  const declaraCuentas = leida.total_override !== null || leida.saldo_override !== null;
  const avisoDeCuentas = modo === 'agregar' && declaraCuentas;

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Así quedaría
      </p>

      {modo === 'crear' && (leida.destinatario || leida.titulo) && (
        <div>
          <p className="font-semibold text-neutral-900">{leida.destinatario || '—'}</p>
          {leida.titulo && <p className="text-sm text-neutral-600">{leida.titulo}</p>}
        </div>
      )}

      {renglones.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Todavía no se reconoce ningún renglón en el mensaje.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {renglones.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONO_TIPO[r.tipo]}>{ETIQUETA_TIPO[r.tipo]}</Badge>
                  <span className="text-sm font-medium text-neutral-900">{r.etiqueta}</span>
                  {r.fecha !== null && (
                    <span className="text-xs text-neutral-500">{formatDate(r.fecha)}</span>
                  )}
                </div>
                {r.texto && <p className="mt-0.5 text-xs text-neutral-600">{r.texto}</p>}
                {r.monto_base !== null && r.porcentaje !== null && (
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {formatCurrency(r.monto_base)} − {r.porcentaje}% ={' '}
                    {formatCurrency(montoEfectivo(r))}
                  </p>
                )}
              </div>
              {r.tipo !== 'TEXTO' && (
                <p className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">
                  {SIGNO[r.tipo]}
                  {formatCurrency(montoEfectivo(r))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {renglones.length > 0 && !avisoDeCuentas && (
        <dl className="flex items-end justify-between gap-3 border-t border-neutral-200 pt-2">
          <div>
            <dt className="text-xs text-neutral-500">
              Total{totales.totalFijado && ' (fijado)'}
            </dt>
            <dd className="font-semibold tabular-nums text-neutral-900">
              {formatCurrency(totales.total)}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-xs text-neutral-500">
              Saldo{totales.saldoFijado && ' (fijado)'}
            </dt>
            <dd className="font-semibold tabular-nums text-neutral-900">
              {formatCurrency(totales.saldo)}
            </dd>
          </div>
        </dl>
      )}

      {avisoDeCuentas && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El mensaje declara un total o un saldo. Aquí solo se agregan los renglones: esa
          cuenta se hizo con este mensaje y la nota ya trae otros. Si el número acordado es
          otro, fíjalo en la tarjeta «Cuentas».
        </p>
      )}

      {leida.advertencias.length > 0 && (
        <ul className="space-y-1">
          {leida.advertencias.map((a, i) => (
            <li key={i} className="text-xs text-neutral-600">
              · {a}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
