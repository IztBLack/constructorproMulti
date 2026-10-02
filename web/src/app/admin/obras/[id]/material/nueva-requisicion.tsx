'use client';

import { Ayuda } from '@/components/guia/ayuda';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input, Textarea } from '@/components/ui';
import { crearRequisicionAction } from '@/app/admin/compras/actions';

interface Renglon {
  clave: string;
  materialId: string | null;
  descripcion: string;
  unidad: string;
  cantidad: string;
}

const nuevoRenglon = (): Renglon => ({
  clave: crypto.randomUUID(),
  materialId: null,
  descripcion: '',
  unidad: '',
  cantidad: '',
});

/**
 * Pedir material para la obra (RF2.2). Se escribe el material (con sugerencias
 * del catálogo; si no está, se pide igual con texto libre), la cantidad y para
 * cuándo. El `id` lo genera el navegador: un doble envío no duplica.
 */
export function NuevaRequisicion({
  obraId,
  materiales,
}: {
  obraId: string;
  materiales: { id: string; nombre: string; unidad: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [renglones, setRenglones] = useState<Renglon[]>(() => [nuevoRenglon()]);
  const [paraCuando, setParaCuando] = useState('');
  const [notas, setNotas] = useState('');
  const [id, setId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const porNombre = new Map(materiales.map((m) => [m.nombre.toLowerCase(), m]));
  const listaId = `materiales-${obraId}`;

  function cambiar(clave: string, c: Partial<Renglon>) {
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...c } : r)));
  }

  function escribirMaterial(clave: string, texto: string) {
    const m = porNombre.get(texto.trim().toLowerCase());
    setRenglones((rs) =>
      rs.map((r) =>
        r.clave === clave
          ? { ...r, descripcion: texto, materialId: m?.id ?? null, unidad: m ? m.unidad : r.unidad }
          : r,
      ),
    );
  }

  if (!abierto) {
    return (
      <div className="space-y-2">
        {exito && (
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            {exito}
          </p>
        )}
        <Button onClick={() => { setExito(null); setAbierto(true); }}>+ Pedir material</Button>
      </div>
    );
  }

  return (
    <Card data-guia="material-pedir">
      <CardHeader>
        <div>
          <CardTitle as="h2">
            Pedir material <Ayuda clave="material.pedir" />
          </CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Lo aprueba el administrador y después se compra. Si el material no está en el catálogo, escríbelo igual.
          </p>
        </div>
      </CardHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const r = await crearRequisicionAction({
              id,
              obraId,
              paraCuando,
              notas,
              renglones: renglones
                .filter((x) => x.descripcion.trim() || x.cantidad.trim())
                .map((x) => ({
                  materialId: x.materialId,
                  descripcion: x.descripcion,
                  unidad: x.unidad,
                  cantidad: x.cantidad,
                })),
            });
            if (!r.ok) {
              setError(r.error ?? 'No se pudo guardar.');
              return;
            }
            setId(crypto.randomUUID());
            setRenglones([nuevoRenglon()]);
            setNotas('');
            setParaCuando('');
            setExito('Listo: la requisición quedó por aprobar.');
            setAbierto(false);
            router.refresh();
          });
        }}
      >
        <datalist id={listaId}>
          {materiales.map((m) => (
            <option key={m.id} value={m.nombre} />
          ))}
        </datalist>
        <ul className="space-y-3">
          {renglones.map((r, i) => (
            <li key={r.clave} className="grid gap-2 sm:grid-cols-[3fr_1fr_1fr_auto] sm:items-end">
              <Field label={`Material ${i + 1}`}>
                <Input
                  list={listaId}
                  value={r.descripcion}
                  maxLength={300}
                  placeholder="Cemento gris 50 kg"
                  onChange={(e) => escribirMaterial(r.clave, e.target.value)}
                />
              </Field>
              <Field label="Cantidad">
                <Input
                  inputMode="decimal"
                  value={r.cantidad}
                  onChange={(e) => cambiar(r.clave, { cantidad: e.target.value })}
                />
              </Field>
              <Field label="Unidad">
                <Input
                  value={r.unidad}
                  maxLength={20}
                  placeholder="bulto"
                  onChange={(e) => cambiar(r.clave, { unidad: e.target.value })}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                disabled={renglones.length === 1}
                onClick={() => setRenglones((rs) => rs.filter((x) => x.clave !== r.clave))}
                aria-label={`Quitar material ${i + 1}`}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRenglones((rs) => [...rs, nuevoRenglon()])}>
          + Otro material
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="¿Para cuándo se necesita?">
            <Input type="date" value={paraCuando} onChange={(e) => setParaCuando(e.target.value)} />
          </Field>
          <Field label="Notas (opcional)">
            <Textarea rows={2} value={notas} maxLength={2000} onChange={(e) => setNotas(e.target.value)} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={pendiente}>
            {pendiente ? 'Enviando…' : 'Enviar requisición'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
