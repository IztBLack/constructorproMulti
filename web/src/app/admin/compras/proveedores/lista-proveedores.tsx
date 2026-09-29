'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, EmptyState, Field, Input, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { Proveedor } from '@/lib/compras/tipos';
import { eliminarProveedorAction, guardarProveedorAction } from '../actions';

type ProveedorConSaldo = Proveedor & { saldo: number; vencido: number };

export function ListaProveedores({
  proveedores,
  puedeEditar,
  veSaldos,
}: {
  proveedores: ProveedorConSaldo[];
  puedeEditar: boolean;
  veSaldos: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <Card>
          {editando === 'nuevo' ? (
            <FormularioProveedor proveedor={null} alTerminar={() => setEditando(null)} />
          ) : (
            <Button onClick={() => setEditando('nuevo')}>+ Nuevo proveedor</Button>
          )}
        </Card>
      )}

      {proveedores.length === 0 ? (
        <EmptyState title="Sin proveedores" description="Da de alta la casa de materiales, la ferretería o la concretera." />
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {proveedores.map((p) => (
            <li key={p.id} className="px-4 py-3">
              {editando === p.id ? (
                <FormularioProveedor proveedor={p} alTerminar={() => setEditando(null)} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-neutral-900">{p.nombre}</p>
                    <p className="text-neutral-600">
                      {[p.rfc ? `RFC ${p.rfc}` : 'Sin RFC', p.contacto, p.telefono, p.correo].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-neutral-600">
                      {p.dias_credito > 0 ? `${p.dias_credito} días de crédito` : 'De contado'}
                      {veSaldos && p.saldo > 0 && (
                        <>
                          {' · '}
                          <span className="font-medium text-amber-800">Se le debe {formatCurrency(p.saldo)}</span>
                          {p.vencido > 0 && (
                            <span className="font-medium text-red-700"> ({formatCurrency(p.vencido)} vencido)</span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  {puedeEditar && (
                    <Button size="sm" variant="secondary" onClick={() => setEditando(p.id)}>
                      Editar
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormularioProveedor({ proveedor, alTerminar }: { proveedor: Proveedor | null; alTerminar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const r = await guardarProveedorAction(proveedor?.id ?? null, fd);
          if (!r.ok) {
            setError(r.error ?? 'No se pudo guardar.');
            return;
          }
          alTerminar();
          router.refresh();
        });
      }}
    >
      <Field label="Nombre">
        <Input name="nombre" defaultValue={proveedor?.nombre} maxLength={200} required />
      </Field>
      <Field label="RFC (opcional)" hint="12 caracteres si es empresa, 13 si es persona.">
        <Input name="rfc" defaultValue={proveedor?.rfc ?? ''} maxLength={13} autoCapitalize="characters" />
      </Field>
      <Field label="Contacto">
        <Input name="contacto" defaultValue={proveedor?.contacto} maxLength={200} />
      </Field>
      <Field label="Teléfono">
        <Input name="telefono" type="tel" defaultValue={proveedor?.telefono} maxLength={40} />
      </Field>
      <Field label="Correo">
        <Input name="correo" type="email" defaultValue={proveedor?.correo} maxLength={200} />
      </Field>
      <Field label="Días de crédito" hint="0 = de contado.">
        <Input name="dias_credito" type="number" min="0" max="365" step="1" defaultValue={proveedor?.dias_credito ?? 0} />
      </Field>
      <Field label="Notas" className="sm:col-span-2">
        <Textarea name="notas" rows={2} defaultValue={proveedor?.notas} maxLength={2000} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button type="button" variant="ghost" onClick={alTerminar} disabled={pendiente}>
          Cancelar
        </Button>
        {proveedor && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-red-700"
            disabled={pendiente}
            onClick={() => {
              if (!window.confirm(`¿Quitar a ${proveedor.nombre}? Sus órdenes pasadas se conservan.`)) return;
              startTransition(async () => {
                const r = await eliminarProveedorAction(proveedor.id);
                if (!r.ok) setError(r.error ?? 'No se pudo quitar.');
                else {
                  alTerminar();
                  router.refresh();
                }
              });
            }}
          >
            Quitar proveedor
          </Button>
        )}
      </div>
    </form>
  );
}
