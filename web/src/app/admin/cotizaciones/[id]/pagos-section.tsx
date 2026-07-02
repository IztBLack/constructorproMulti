'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/format';
import type { Pago } from '@/lib/data/pagos';
import { actualizarPagoAction, crearPagoAction, eliminarPagoAction } from './pagos-actions';

const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'OTRO'];

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Formulario de pago (crear / editar) ───────────────────────────────────

type PagoFormMode =
  | { mode: 'crear'; pago?: undefined }
  | { mode: 'editar'; pago: Pago };

type PagoFormProps = PagoFormMode & {
  cotizacionId: string;
  onDone?: () => void;
  onCancel?: () => void;
};

function PagoForm({ cotizacionId, mode, pago, onDone, onCancel }: PagoFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fechaDefault] = useState(() => toDateInputValue(pago?.fecha ?? Date.now()));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);

    const result =
      mode === 'editar'
        ? await actualizarPagoAction(pago.id, cotizacionId, formData)
        : await crearPagoAction(cotizacionId, formData);

    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar el pago.');
      return;
    }

    formRef.current?.reset();
    router.refresh();
    onDone?.();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Fecha *">
        <Input type="date" name="fecha" required defaultValue={fechaDefault} />
      </Field>

      <Field label="Monto (MXN) *">
        <Input
          type="number"
          name="monto"
          step="0.01"
          min="0.01"
          required
          defaultValue={pago?.monto ?? ''}
          placeholder="0.00"
          className="tabular-nums"
        />
      </Field>

      <Field label="Método de pago *">
        <select
          name="metodo"
          defaultValue={pago?.metodo ?? 'EFECTIVO'}
          className="w-full cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900"
        >
          {METODOS_PAGO.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Concepto *">
        <Input
          name="concepto"
          required
          defaultValue={pago?.concepto ?? ''}
          placeholder="Ej. Anticipo inicial"
        />
      </Field>

      <Field label="Referencia" hint="Opcional. Folio, número de cheque, etc." className="sm:col-span-2">
        <Input
          name="referencia"
          defaultValue={pago?.referencia ?? ''}
          placeholder="Ej. TRF-001234"
        />
      </Field>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? 'Guardando…'
            : mode === 'editar'
              ? 'Guardar cambios'
              : 'Registrar pago'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

// ─── Tabla de pagos ────────────────────────────────────────────────────────

function PagosTabla({
  cotizacionId,
  pagos,
}: {
  cotizacionId: string;
  pagos: Pago[];
}) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onEliminar(id: string) {
    if (!confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;
    setEliminandoId(id);
    setError(null);
    const result = await eliminarPagoAction(id, cotizacionId);
    setEliminandoId(null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo eliminar el pago.');
      return;
    }
    router.refresh();
  }

  if (pagos.length === 0) {
    return (
      <EmptyState
        title="Aún no hay pagos registrados para esta cotización."
        description="Usa el formulario de abajo para registrar el primer anticipo o abono del cliente."
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <TableContainer>
        <THead>
          <Th>Fecha</Th>
          <Th>Concepto</Th>
          <Th>Método</Th>
          <Th>Referencia</Th>
          <Th className="text-right">Monto</Th>
          <Th className="text-right">Acciones</Th>
        </THead>
        <TBody>
          {pagos.map((p) =>
            editandoId === p.id ? (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                <td colSpan={6} className="px-4 py-4">
                  <PagoForm
                    cotizacionId={cotizacionId}
                    mode="editar"
                    pago={p}
                    onDone={() => setEditandoId(null)}
                    onCancel={() => setEditandoId(null)}
                  />
                </td>
              </tr>
            ) : (
              <Tr key={p.id}>
                <Td>{formatDate(p.fecha)}</Td>
                <Td>{p.concepto || '—'}</Td>
                <Td>
                  <Badge tone="blue">
                    {p.metodo.charAt(0) + p.metodo.slice(1).toLowerCase()}
                  </Badge>
                </Td>
                <Td>{p.referencia || '—'}</Td>
                <Td className="text-right tabular-nums font-medium text-neutral-900">
                  {formatCurrency(p.monto)}
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditandoId(p.id)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={eliminandoId === p.id}
                      onClick={() => onEliminar(p.id)}
                    >
                      {eliminandoId === p.id ? 'Eliminando…' : 'Eliminar'}
                    </Button>
                  </div>
                </Td>
              </Tr>
            ),
          )}
        </TBody>
      </TableContainer>
    </div>
  );
}

// ─── Sección principal (export) ────────────────────────────────────────────

export interface PagosSectionProps {
  cotizacionId: string;
  totalCotizacion: number;
  pagos: Pago[];
  totalPagado: number;
}

export default function PagosSection({
  cotizacionId,
  totalCotizacion,
  pagos,
  totalPagado,
}: PagosSectionProps) {
  const [mostrandoForm, setMostrandoForm] = useState(false);
  const saldo = totalCotizacion - totalPagado;
  const liquidado = saldo <= 0;

  return (
    <section className="space-y-4">
      {/* KPI cards: total cotización / pagado / saldo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Total cotización</p>
          <p className="mt-1 tabular-nums text-lg font-semibold text-neutral-900">
            {formatCurrency(totalCotizacion)}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Total pagado</p>
          <p className="mt-1 tabular-nums text-lg font-semibold text-neutral-900">
            {formatCurrency(totalPagado)}
          </p>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            liquidado
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <p
            className={`text-xs font-medium ${
              liquidado ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {liquidado ? 'Liquidado' : 'Saldo pendiente'}
          </p>
          <p
            className={`mt-1 tabular-nums text-lg font-semibold ${
              liquidado ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {formatCurrency(Math.abs(saldo))}
          </p>
        </div>
      </div>

      {/* Tabla de pagos */}
      <Card padding="none">
        <div className="p-5">
          <CardHeader>
            <CardTitle as="h2" className="text-base font-medium text-neutral-900">
              Pagos y abonos
            </CardTitle>
            {!mostrandoForm && (
              <Button type="button" size="sm" onClick={() => setMostrandoForm(true)}>
                Registrar pago
              </Button>
            )}
          </CardHeader>

          {mostrandoForm && (
            <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-700">Nuevo pago</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMostrandoForm(false)}
                >
                  Cancelar
                </Button>
              </div>
              <PagoForm
                cotizacionId={cotizacionId}
                mode="crear"
                onDone={() => setMostrandoForm(false)}
              />
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <PagosTabla cotizacionId={cotizacionId} pagos={pagos} />
        </div>
      </Card>
    </section>
  );
}
