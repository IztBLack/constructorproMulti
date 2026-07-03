'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input, THead, Th, TBody, Tr, Td } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { PartidaPresupuesto } from '@/lib/data/types';
import {
  crearPartidaPresupuestoAction,
  actualizarPartidaPresupuestoAction,
  eliminarPartidaPresupuestoAction,
} from './actions';

interface PartidaFormState {
  concepto: string;
  unidad: string;
  cantidad: string;
  precio_unitario: string;
}

const FORM_VACÍO: PartidaFormState = {
  concepto: '',
  unidad: '',
  cantidad: '1',
  precio_unitario: '',
};

function partidaToForm(p: PartidaPresupuesto): PartidaFormState {
  return {
    concepto: p.concepto,
    unidad: p.unidad,
    cantidad: String(p.cantidad),
    precio_unitario: String(p.precio_unitario),
  };
}

function totalPartida(cantidad: string, precio: string): number {
  const c = Number(cantidad);
  const p = Number(precio);
  return Number.isFinite(c) && Number.isFinite(p) ? c * p : 0;
}

interface Props {
  obraId: string;
  partidas: PartidaPresupuesto[];
}

export default function PresupuestoObra({ obraId, partidas }: Props) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [form, setForm] = useState<PartidaFormState>(FORM_VACÍO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = partidas.reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0);

  function startEdit(p: PartidaPresupuesto) {
    setEditandoId(p.id);
    setForm(partidaToForm(p));
    setAgregando(false);
    setError(null);
  }

  function cancelEdit() {
    setEditandoId(null);
    setAgregando(false);
    setForm(FORM_VACÍO);
    setError(null);
  }

  function startAgregar() {
    setAgregando(true);
    setEditandoId(null);
    setForm(FORM_VACÍO);
    setError(null);
  }

  function buildFormData(orden: number): FormData {
    const fd = new FormData();
    fd.set('concepto', form.concepto);
    fd.set('unidad', form.unidad);
    fd.set('cantidad', form.cantidad);
    fd.set('precio_unitario', form.precio_unitario);
    fd.set('orden', String(orden));
    return fd;
  }

  async function onGuardarNueva() {
    setLoading(true);
    setError(null);
    const orden = partidas.length;
    const fd = buildFormData(orden);
    let result;
    try {
      result = await crearPartidaPresupuestoAction(obraId, fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
      setLoading(false);
      return;
    }
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo crear la partida.');
      return;
    }
    setAgregando(false);
    setForm(FORM_VACÍO);
    router.refresh();
  }

  async function onGuardarEdicion(id: string, orden: number) {
    setLoading(true);
    setError(null);
    const fd = buildFormData(orden);
    const result = await actualizarPartidaPresupuestoAction(id, obraId, fd);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar.');
      return;
    }
    setEditandoId(null);
    setForm(FORM_VACÍO);
    router.refresh();
  }

  async function onEliminar(id: string) {
    if (!confirm('¿Eliminar esta partida del presupuesto? Esta acción no se puede deshacer.')) return;
    setEliminandoId(id);
    setError(null);
    const result = await eliminarPartidaPresupuestoAction(id, obraId);
    setEliminandoId(null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo eliminar.');
      return;
    }
    router.refresh();
  }

  const hayPartidas = partidas.length > 0 || agregando;

  return (
    <Card padding="none">
      <div className="px-5 pt-5 pb-4">
        <CardHeader className="mb-0">
          <CardTitle as="h2" className="text-base font-semibold text-neutral-800">
            Presupuesto por partidas
          </CardTitle>
          {!agregando && !editandoId && (
            <Button type="button" variant="secondary" size="sm" onClick={startAgregar}>
              + Agregar partida
            </Button>
          )}
        </CardHeader>
      </div>

      {error && (
        <p className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {hayPartidas ? (
        <div className="overflow-x-auto border-t border-neutral-200">
          <table className="w-full text-sm">
            <THead>
              <Th>Concepto</Th>
              <Th>Unidad</Th>
              <Th className="text-right">Cantidad</Th>
              <Th className="text-right">Precio unit.</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Acciones</Th>
            </THead>
            <TBody>
              {partidas.map((p) =>
                editandoId === p.id ? (
                  <tr key={p.id} className="border-b border-neutral-100 bg-neutral-50">
                    <td colSpan={6} className="px-4 py-4">
                      <PartidaInlineForm
                        form={form}
                        onChange={setForm}
                        loading={loading}
                        onGuardar={() => onGuardarEdicion(p.id, p.orden)}
                        onCancelar={cancelEdit}
                      />
                    </td>
                  </tr>
                ) : (
                  <Tr key={p.id}>
                    <Td className="font-medium text-neutral-900">{p.concepto || '—'}</Td>
                    <Td>{p.unidad || '—'}</Td>
                    <Td className="text-right tabular-nums">{p.cantidad}</Td>
                    <Td className="text-right tabular-nums">{formatCurrency(p.precio_unitario)}</Td>
                    <Td className="text-right font-semibold tabular-nums text-neutral-900">
                      {formatCurrency(p.cantidad * p.precio_unitario)}
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => startEdit(p)}
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

              {agregando && (
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <td colSpan={6} className="px-4 py-4">
                    <PartidaInlineForm
                      form={form}
                      onChange={setForm}
                      loading={loading}
                      onGuardar={onGuardarNueva}
                      onCancelar={cancelEdit}
                    />
                  </td>
                </tr>
              )}

              {/* Fila de total */}
              <tr className="border-t-2 border-neutral-300 bg-neutral-50">
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-neutral-700">
                  COSTO TOTAL
                </td>
                <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-neutral-900">
                  {formatCurrency(total)}
                </td>
                <td />
              </tr>
            </TBody>
          </table>
        </div>
      ) : (
        <div className="border-t border-neutral-200 px-5 py-8 text-center">
          <p className="text-sm text-neutral-500">
            Sin partidas de presupuesto. Agrega la primera partida.
          </p>
          <div className="mt-4">
            <Button type="button" variant="secondary" size="sm" onClick={startAgregar}>
              + Agregar partida
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Formulario inline de partida ────────────────────────────────────────────

function PartidaInlineForm({
  form,
  onChange,
  loading,
  onGuardar,
  onCancelar,
}: {
  form: PartidaFormState;
  onChange: (f: PartidaFormState) => void;
  loading: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const previewTotal = totalPartida(form.cantidad, form.precio_unitario);

  function set(key: keyof PartidaFormState, value: string) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto]">
      <Field label="Concepto *">
        <Input
          value={form.concepto}
          onChange={(e) => set('concepto', e.target.value)}
          placeholder="Ej. Construcción"
          required
        />
      </Field>
      <Field label="Unidad">
        <Input
          value={form.unidad}
          onChange={(e) => set('unidad', e.target.value)}
          placeholder="m2"
          className="w-20"
        />
      </Field>
      <Field label="Cantidad *">
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={form.cantidad}
          onChange={(e) => set('cantidad', e.target.value)}
          className="w-24"
          required
        />
      </Field>
      <Field label="Precio unit. *">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={form.precio_unitario}
          onChange={(e) => set('precio_unitario', e.target.value)}
          className="w-32"
          required
        />
      </Field>
      <Field label="Total">
        <div className="flex h-9 items-center rounded-lg border border-neutral-200 bg-neutral-100 px-3 text-sm font-semibold tabular-nums text-neutral-700 w-36">
          {formatCurrency(previewTotal)}
        </div>
      </Field>
      <div className="flex items-end gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={onGuardar}>
          {loading ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
