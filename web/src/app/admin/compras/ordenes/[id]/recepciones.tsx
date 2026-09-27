'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Field, Input, Textarea } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { comprimirFoto } from '@/lib/imagen/comprimir';
import { formatDate } from '@/lib/data/format';
import {
  crearUrlSubidaRemision,
  eliminarRecepcionAction,
  registrarRecepcionAction,
  registrarRemisionAction,
} from '../../actions';

interface RenglonARecibir {
  id: string;
  descripcion: string;
  unidad: string;
  faltante: number;
}

interface RecepcionVista {
  id: string;
  fecha: number;
  notas: string;
  recibidoPor: string;
  remision: string | null;
  renglones: { descripcion: string; cantidad: number; notas: string }[];
}

const BUCKET = 'compras';

/**
 * Sube la foto (o PDF) de la remisión: comprime si es foto → URL firmada →
 * Storage → liga a la recepción. La recepción ya quedó guardada antes: si la
 * foto falla, se puede subir después desde la lista (nunca se pierde lo recibido).
 */
async function subirRemision(recepcionId: string, archivo: File): Promise<string | null> {
  let blob: Blob = archivo;
  let tipo = archivo.type;
  if (archivo.type.startsWith('image/')) {
    const lista = await comprimirFoto(archivo);
    if (lista) {
      blob = lista.blob;
      tipo = lista.tipo;
    }
  }
  const prep = await crearUrlSubidaRemision(recepcionId, archivo.name, tipo, blob.size);
  if (!prep.ok || !prep.path || !prep.token) return prep.error ?? 'No se pudo preparar la subida.';
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, blob, { contentType: tipo });
  if (error) return `No se pudo subir: ${error.message}`;
  const r = await registrarRemisionAction(recepcionId, prep.path);
  return r.ok ? null : (r.error ?? 'No se pudo guardar la remisión.');
}

export function Recepciones({
  ordenId,
  renglones,
  recepciones,
  puedeRecibir,
  puedeSubirRemision,
  puedeBorrar,
  hoy,
}: {
  ordenId: string;
  renglones: RenglonARecibir[];
  recepciones: RecepcionVista[];
  puedeRecibir: boolean;
  puedeSubirRemision: boolean;
  puedeBorrar: boolean;
  hoy: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2">Entregas en obra</CardTitle>
          <p className="mt-1 text-sm text-neutral-600">
            Lo que llegó, con la foto de la remisión. Lo que falta se calcula solo.
          </p>
        </div>
      </CardHeader>

      {recepciones.length === 0 ? (
        <p className="text-sm text-neutral-600">Todavía no llega nada de esta orden.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {recepciones.map((r) => (
            <FilaRecepcion
              key={r.id}
              r={r}
              puedeSubirRemision={puedeSubirRemision}
              puedeBorrar={puedeBorrar}
            />
          ))}
        </ul>
      )}

      {puedeRecibir && (
        <div className="mt-4 border-t border-neutral-200 pt-4">
          <FormularioRecepcion
            key={renglones.map((r) => r.faltante).join('|')}
            ordenId={ordenId}
            renglones={renglones}
            hoy={hoy}
          />
        </div>
      )}
    </Card>
  );
}

function FilaRecepcion({
  r,
  puedeSubirRemision,
  puedeBorrar,
}: {
  r: RecepcionVista;
  puedeSubirRemision: boolean;
  puedeBorrar: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-neutral-900">
            {formatDate(r.fecha)} · recibió {r.recibidoPor || 'alguien del equipo'}
          </p>
          <ul className="mt-1 text-neutral-700">
            {r.renglones.map((x, i) => (
              <li key={i}>
                {Number(x.cantidad).toLocaleString('es-MX')} · {x.descripcion}
                {x.notas ? <span className="text-neutral-600"> ({x.notas})</span> : null}
              </li>
            ))}
          </ul>
          {r.notas && <p className="mt-1 text-neutral-600">Nota: {r.notas}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {r.remision ? (
            <a
              className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-blue-700 underline"
              href={`/admin/compras/archivo?ruta=${encodeURIComponent(r.remision)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver remisión
            </a>
          ) : (
            <span className="inline-flex min-h-11 items-center text-amber-800">Sin foto de remisión</span>
          )}
          {puedeSubirRemision && (
            <>
              <input
                ref={input}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="sr-only"
                aria-label="Foto de la remisión"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setError(null);
                  startTransition(async () => {
                    const err = await subirRemision(r.id, f);
                    if (input.current) input.current.value = '';
                    if (err) setError(err);
                    else router.refresh();
                  });
                }}
              />
              <Button size="sm" variant="secondary" disabled={pendiente} onClick={() => input.current?.click()}>
                {pendiente ? 'Subiendo…' : r.remision ? 'Cambiar foto' : 'Subir foto'}
              </Button>
            </>
          )}
          {puedeBorrar && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pendiente}
              onClick={() => {
                if (!window.confirm('¿Borrar esta entrega? Lo recibido deja de contar y vuelve a faltar.')) return;
                startTransition(async () => {
                  const res = await eliminarRecepcionAction(r.id);
                  if (!res.ok) setError(res.error ?? 'No se pudo borrar.');
                  else router.refresh();
                });
              }}
            >
              Borrar
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

function FormularioRecepcion({ ordenId, renglones, hoy }: { ordenId: string; renglones: RenglonARecibir[]; hoy: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(renglones.map((r) => [r.id, r.faltante > 0 ? String(r.faltante) : ''])),
  );
  const [notasRenglon, setNotasRenglon] = useState<Record<string, string>>({});
  const [fecha, setFecha] = useState(hoy);
  const [notas, setNotas] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  // Se genera una vez por formulario: un doble envío no duplica la entrega.
  const [id, setId] = useState(() => crypto.randomUUID());

  if (!abierto) {
    return (
      <div className="space-y-2">
        {aviso && (
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {aviso}
          </p>
        )}
        <Button
          onClick={() => {
            setAviso(null);
            setAbierto(true);
          }}
        >
          Registrar lo que llegó
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setAviso(null);
        startTransition(async () => {
          const r = await registrarRecepcionAction({
            id,
            ordenId,
            fecha,
            notas,
            lineas: renglones.map((x) => ({
              renglonId: x.id,
              cantidad: cantidades[x.id] ?? '',
              notas: notasRenglon[x.id] ?? '',
            })),
          });
          if (!r.ok) {
            setError(r.error ?? 'No se pudo registrar.');
            return;
          }
          if (foto) {
            const err = await subirRemision(id, foto);
            if (err) setAviso(`La entrega quedó guardada, pero la foto no: ${err} Súbela desde la lista.`);
          }
          setId(crypto.randomUUID());
          setFoto(null);
          setNotas('');
          setAbierto(false);
          router.refresh();
        });
      }}
    >
      <h3 className="text-sm font-semibold text-neutral-900">¿Qué llegó?</h3>
      <p className="text-sm text-neutral-600">
        Viene lleno con lo que falta. Si llegó menos, corrígelo; si no llegó nada de algo, déjalo vacío.
      </p>
      <ul className="space-y-3">
        {renglones.map((r) => (
          <li key={r.id} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr] sm:items-end">
            <p className="text-sm text-neutral-900">
              {r.descripcion}
              <span className="block text-xs text-neutral-600">
                {r.faltante > 0 ? `Faltan ${r.faltante} ${r.unidad}` : 'Ya llegó completo'}
              </span>
            </p>
            <Field label={`Llegó (${r.unidad || 'cantidad'})`}>
              <Input
                inputMode="decimal"
                value={cantidades[r.id] ?? ''}
                onChange={(e) => setCantidades((c) => ({ ...c, [r.id]: e.target.value }))}
              />
            </Field>
            <Field label="Nota (opcional)">
              <Input
                value={notasRenglon[r.id] ?? ''}
                maxLength={500}
                placeholder="p. ej. 3 bultos rotos"
                onChange={(e) => setNotasRenglon((n) => ({ ...n, [r.id]: e.target.value }))}
              />
            </Field>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </Field>
        <Field label="Foto de la remisión" hint="Foto o PDF, máximo 10 MB. La foto se reduce antes de subir.">
          <Input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea rows={2} value={notas} maxLength={2000} onChange={(e) => setNotas(e.target.value)} />
        </Field>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {aviso}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar entrega'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
