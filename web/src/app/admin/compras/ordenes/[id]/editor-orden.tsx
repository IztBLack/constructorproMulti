'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input, Select, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import { importeRenglon, totalesOrden } from '@/lib/compras/calculo';
import type { EstadoOrden, OrdenConRenglones, RenglonOrden } from '@/lib/compras/tipos';
import {
  actualizarRenglonOrdenAction,
  agregarRenglonOrdenAction,
  cancelarOrdenAction,
  eliminarOrdenBorradorAction,
  eliminarRenglonOrdenAction,
  emitirOrdenAction,
  guardarDatosOrdenAction,
} from '../../actions';

interface MaterialOpcion {
  id: string;
  nombre: string;
  unidad: string;
  precio: number | null;
}

function MensajeError({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {mensaje}
    </p>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Emitir / cancelar / borrar (solo admin)
// ════════════════════════════════════════════════════════════════════════════

export function AccionesOrden({
  ordenId,
  estado,
  tieneRenglones,
}: {
  ordenId: string;
  estado: EstadoOrden;
  tieneRenglones: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function correr(fn: () => Promise<{ ok: boolean; error?: string }>, confirmar: string, despues?: () => void) {
    if (!window.confirm(confirmar)) return;
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'No se pudo.');
        return;
      }
      if (despues) despues();
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {estado === 'BORRADOR' && (
          <>
            <Button
              size="sm"
              disabled={pendiente || !tieneRenglones}
              onClick={() =>
                correr(
                  () => emitirOrdenAction(ordenId),
                  'Al emitirla, la orden queda fija (precios, cantidades y proveedor) para mandársela al proveedor. ¿Emitir?',
                )
              }
            >
              Emitir orden
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pendiente}
              onClick={() =>
                correr(
                  () => eliminarOrdenBorradorAction(ordenId),
                  '¿Borrar este borrador? Lo que venía de requisiciones vuelve a quedar por comprar.',
                  () => router.push('/admin/compras'),
                )
              }
            >
              Borrar borrador
            </Button>
          </>
        )}
        {estado === 'EMITIDA' && (
          <Button
            size="sm"
            variant="danger"
            disabled={pendiente}
            onClick={() =>
              correr(
                () => cancelarOrdenAction(ordenId),
                '¿Cancelar la orden? Avísale al proveedor. Solo se puede si no ha llegado nada ni tiene pagos.',
              )
            }
          >
            Cancelar orden
          </Button>
        )}
      </div>
      <MensajeError mensaje={error} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Editor del borrador
// ════════════════════════════════════════════════════════════════════════════

export function EditorOrden({
  orden,
  proveedores,
  materiales,
  fechaEntrega,
}: {
  orden: OrdenConRenglones;
  proveedores: { id: string; nombre: string; dias: number }[];
  materiales: MaterialOpcion[];
  fechaEntrega: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [ivaPct, setIvaPct] = useState(String(orden.iva_pct));
  const t = totalesOrden(orden.renglones, Number(ivaPct) || 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Datos de la orden</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">Borrador: puedes cambiar todo hasta que la emitas.</p>
          </div>
        </CardHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setError(null);
            setGuardado(false);
            startTransition(async () => {
              const r = await guardarDatosOrdenAction(orden.id, fd);
              if (!r.ok) {
                setError(r.error ?? 'No se pudo guardar.');
                return;
              }
              setGuardado(true);
              router.refresh();
            });
          }}
        >
          <Field label="Proveedor">
            <Select name="proveedor_id" defaultValue={orden.proveedor_id} required>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="IVA (%)" hint="0 si el proveedor no cobra IVA.">
            <Input
              name="iva_pct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={ivaPct}
              onChange={(e) => setIvaPct(e.target.value)}
              required
            />
          </Field>
          <Field label="Días de crédito" hint="0 = de contado.">
            <Input name="dias_credito" type="number" min="0" max="365" step="1" defaultValue={orden.dias_credito} />
          </Field>
          <Field label="Para cuándo en obra">
            <Input name="fecha_entrega" type="date" defaultValue={fechaEntrega} />
          </Field>
          <Field label="Condiciones" hint="Entrega, flete, forma de pago…" className="sm:col-span-2">
            <Textarea name="condiciones" rows={2} maxLength={2000} defaultValue={orden.condiciones} />
          </Field>
          <Field label="Notas para el proveedor" className="sm:col-span-2">
            <Textarea name="notas" rows={2} maxLength={2000} defaultValue={orden.notas} />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : 'Guardar datos'}
            </Button>
            {guardado && <span className="text-sm text-green-700">Guardado.</span>}
          </div>
          <div className="sm:col-span-2">
            <MensajeError mensaje={error} />
          </div>
        </form>
      </Card>

      <Card padding="none">
        <div className="px-5 pb-2 pt-4">
          <CardTitle as="h2">Material</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">Precios sin IVA.</p>
        </div>
        <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
          {orden.renglones.map((r) => (
            <RenglonEditable key={r.id} ordenId={orden.id} renglon={r} />
          ))}
          {orden.renglones.length === 0 && (
            <li className="px-5 py-3 text-sm text-neutral-600">Todavía no hay material en esta orden.</li>
          )}
        </ul>
        <div className="border-t border-neutral-200 px-5 py-4">
          <NuevoRenglon ordenId={orden.id} materiales={materiales} />
        </div>
        <dl className="space-y-1 border-t border-neutral-200 px-5 py-3 text-sm">
          <div className="flex justify-between text-neutral-700">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatCurrency(t.subtotal)}</dd>
          </div>
          <div className="flex justify-between text-neutral-700">
            <dt>IVA ({Number(ivaPct) || 0}%)</dt>
            <dd className="tabular-nums">{formatCurrency(t.iva)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-neutral-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCurrency(t.total)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

function RenglonEditable({ ordenId, renglon }: { ordenId: string; renglon: RenglonOrden }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (!editando) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
        <span className="min-w-0 text-neutral-900">
          {Number(renglon.cantidad).toLocaleString('es-MX')} {renglon.unidad} · {renglon.descripcion}
          <span className="block text-xs text-neutral-600">
            {formatCurrency(renglon.precio_unitario)} c/u
            {renglon.requisicion_renglon_id ? ' · de una requisición' : ''}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-medium tabular-nums">{formatCurrency(importeRenglon(renglon))}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                const r = await eliminarRenglonOrdenAction(ordenId, renglon.id);
                if (!r.ok) setError(r.error ?? 'No se pudo quitar.');
                else router.refresh();
              })
            }
          >
            Quitar
          </Button>
        </span>
        {error && (
          <p role="alert" className="w-full text-sm text-red-700">
            {error}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="px-5 py-3">
      <form
        className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (renglon.material_id) fd.set('material_id', renglon.material_id);
          setError(null);
          startTransition(async () => {
            const r = await actualizarRenglonOrdenAction(ordenId, renglon.id, fd);
            if (!r.ok) {
              setError(r.error ?? 'No se pudo guardar.');
              return;
            }
            setEditando(false);
            router.refresh();
          });
        }}
      >
        <Field label="Descripción">
          <Input name="descripcion" defaultValue={renglon.descripcion} maxLength={300} required />
        </Field>
        <Field label="Unidad">
          <Input name="unidad" defaultValue={renglon.unidad} maxLength={20} />
        </Field>
        <Field label="Cantidad">
          <Input name="cantidad" inputMode="decimal" defaultValue={renglon.cantidad} required />
        </Field>
        <Field label="Precio sin IVA">
          <Input name="precio_unitario" inputMode="decimal" defaultValue={renglon.precio_unitario} required />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pendiente}>
            Guardar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 sm:col-span-5">
            {error}
          </p>
        )}
      </form>
    </li>
  );
}

function NuevoRenglon({ ordenId, materiales }: { ordenId: string; materiales: MaterialOpcion[] }) {
  const router = useRouter();
  const [materialId, setMaterialId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [unidad, setUnidad] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function elegir(id: string) {
    setMaterialId(id);
    const m = materiales.find((x) => x.id === id);
    if (m) {
      setDescripcion(m.nombre);
      setUnidad(m.unidad);
      if (m.precio != null) setPrecio(String(m.precio));
    }
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set('material_id', materialId);
        fd.set('descripcion', descripcion);
        fd.set('unidad', unidad);
        fd.set('cantidad', cantidad);
        fd.set('precio_unitario', precio || '0');
        setError(null);
        startTransition(async () => {
          const r = await agregarRenglonOrdenAction(ordenId, fd);
          if (!r.ok) {
            setError(r.error ?? 'No se pudo agregar.');
            return;
          }
          setMaterialId('');
          setDescripcion('');
          setUnidad('');
          setCantidad('');
          setPrecio('');
          router.refresh();
        });
      }}
    >
      <Field label="Del catálogo (opcional)">
        <Select value={materialId} onChange={(e) => elegir(e.target.value)}>
          <option value="">Escribir a mano…</option>
          {materiales.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Descripción">
        <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} required />
      </Field>
      <Field label="Unidad">
        <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} maxLength={20} />
      </Field>
      <Field label="Cantidad">
        <Input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" required />
      </Field>
      <Field label="Precio sin IVA">
        <Input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="0.00" />
      </Field>
      <Button type="submit" disabled={pendiente}>
        Agregar
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-6">
          {error}
        </p>
      )}
    </form>
  );
}
