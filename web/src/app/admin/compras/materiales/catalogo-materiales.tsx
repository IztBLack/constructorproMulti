'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, EmptyState, Field, Input, Select } from '@/components/ui';
import { formatCurrency } from '@/lib/data/format';
import type { Material } from '@/lib/compras/tipos';
import { eliminarMaterialAction, guardarMaterialAction } from '../actions';

export function CatalogoMateriales({
  materiales,
  proveedores,
  puedeEditar,
}: {
  materiales: Material[];
  proveedores: { id: string; nombre: string }[];
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const nombreProv = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? materiales.filter((m) => m.nombre.toLowerCase().includes(q)) : materiales;
  }, [materiales, buscar]);

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <Card>
          {editando === 'nuevo' ? (
            <FormularioMaterial material={null} proveedores={proveedores} alTerminar={() => setEditando(null)} />
          ) : (
            <Button onClick={() => setEditando('nuevo')}>+ Nuevo material</Button>
          )}
        </Card>
      )}

      {materiales.length > 8 && (
        <Field label="Buscar material">
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="cemento, varilla…" />
        </Field>
      )}

      {visibles.length === 0 ? (
        <EmptyState
          title={materiales.length ? 'Nada coincide' : 'Catálogo vacío'}
          description="Da de alta lo que compras seguido: cemento, varilla, block, arena…"
        />
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {visibles.map((m) => (
            <li key={m.id} className="px-4 py-3">
              {editando === m.id ? (
                <FormularioMaterial material={m} proveedores={proveedores} alTerminar={() => setEditando(null)} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900">
                      {m.nombre} <span className="font-normal text-neutral-600">({m.unidad})</span>
                    </p>
                    <p className="text-neutral-600">
                      {m.ultimo_precio != null ? `Último precio ${formatCurrency(m.ultimo_precio)} sin IVA` : 'Sin precio'}
                      {m.proveedor_id ? ` · ${nombreProv.get(m.proveedor_id) ?? 'Proveedor'}` : ''}
                      {m.clave_sat ? ` · SAT ${m.clave_sat}${m.unidad_sat ? `/${m.unidad_sat}` : ''}` : ''}
                    </p>
                  </div>
                  {puedeEditar && (
                    <Button size="sm" variant="secondary" onClick={() => setEditando(m.id)}>
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

function FormularioMaterial({
  material,
  proveedores,
  alTerminar,
}: {
  material: Material | null;
  proveedores: { id: string; nombre: string }[];
  alTerminar: () => void;
}) {
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
          const r = await guardarMaterialAction(material?.id ?? null, fd);
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
        <Input name="nombre" defaultValue={material?.nombre} maxLength={200} required />
      </Field>
      <Field label="Unidad" hint="bulto, pza, m³, kg, tramo…">
        <Input name="unidad" defaultValue={material?.unidad ?? 'pza'} maxLength={20} />
      </Field>
      <Field label="Último precio sin IVA" hint="Se actualiza solo al emitir una orden.">
        <Input name="ultimo_precio" inputMode="decimal" defaultValue={material?.ultimo_precio ?? ''} />
      </Field>
      <Field label="Proveedor habitual">
        <Select name="proveedor_id" defaultValue={material?.proveedor_id ?? ''}>
          <option value="">Ninguno</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Clave SAT (opcional)" hint="8 dígitos. Confírmala con tu contador.">
        <Input name="clave_sat" inputMode="numeric" defaultValue={material?.clave_sat ?? ''} maxLength={8} />
      </Field>
      <Field label="Unidad SAT (opcional)" hint="p. ej. H87 pieza, KGM kilo, XBG bolsa.">
        <Input name="unidad_sat" defaultValue={material?.unidad_sat ?? ''} maxLength={3} autoCapitalize="characters" />
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
        {material && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-red-700"
            disabled={pendiente}
            onClick={() => {
              if (!window.confirm(`¿Quitar «${material.nombre}» del catálogo? Lo ya pedido y comprado se conserva.`)) return;
              startTransition(async () => {
                const r = await eliminarMaterialAction(material.id);
                if (!r.ok) setError(r.error ?? 'No se pudo quitar.');
                else {
                  alTerminar();
                  router.refresh();
                }
              });
            }}
          >
            Quitar material
          </Button>
        )}
      </div>
    </form>
  );
}
