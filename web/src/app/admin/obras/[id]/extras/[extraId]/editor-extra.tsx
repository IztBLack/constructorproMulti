'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardTitle, Field, Input, LinkButton, Textarea } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/data/format';
import { msAFechaInput } from '@/lib/data/tz';
import {
  ETIQUETA_ESTADO_EXTRA,
  TONO_ESTADO_EXTRA,
  importeRenglon,
  leerSnapshot,
  totalExtra,
  type OrdenCambioConRenglones,
  type RenglonExtra,
} from '@/lib/cambios/extras';
import {
  actualizarRenglonExtraAction,
  agregarRenglonExtraAction,
  cancelarExtraAction,
  crearUrlSubidaFotoExtra,
  duplicarExtraAction,
  eliminarExtraAction,
  eliminarRenglonExtraAction,
  enviarExtraAction,
  guardarDatosExtraAction,
  quitarFotoExtra,
  registrarFotoExtra,
} from '../actions';
import { PedirVistoBueno } from '@/components/aprobaciones/pedir-visto-bueno';

const PASO = 100;

type Confirmacion = 'enviar' | 'cancelar' | 'borrar' | null;

/**
 * Un extra: sus datos, sus conceptos, su foto y lo que se puede hacer con él.
 *
 * Mientras es BORRADOR se edita todo. En cuanto se envía, la pantalla enseña la
 * FOTO de lo que se mandó (lo mismo que ve el cliente) y ya no se puede tocar:
 * lo exige la base (0036), aquí solo se evita ofrecer botones que fallarían.
 * Para corregir uno enviado se DUPLICA: sale un borrador nuevo con el
 * siguiente folio y el original queda como evidencia.
 */
export default function EditorExtra({
  obraId,
  extra,
  fotoUrl,
  puedeEditar,
  esAdmin,
  puedeEnviar,
  pedirVistoBueno,
  puedeDuplicar,
  tieneCliente,
}: {
  obraId: string;
  extra: OrdenCambioConRenglones;
  fotoUrl: string | null;
  puedeEditar: boolean;
  esAdmin: boolean;
  /** Admin, o supervisor/residente con regla de visto bueno activa (0042). */
  puedeEnviar: boolean;
  /** Ofrecer "Pedir visto bueno" (no admin, con regla activa). */
  pedirVistoBueno: boolean;
  puedeDuplicar: boolean;
  tieneCliente: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<Confirmacion>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const foto = leerSnapshot(extra.snapshot_json);
  const total = totalExtra(extra);
  const borrador = extra.estado === 'BORRADOR';
  const base = `/admin/obras/${obraId}/extras`;

  async function correr(
    fn: () => Promise<{ ok: boolean; error?: string; id?: string }>,
    alTerminar?: (id?: string) => void,
  ) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const r = await fn();
    setOcupado(false);
    setConfirmando(null);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo completar.');
      return;
    }
    if (alTerminar) alTerminar(r.id);
    else router.refresh();
  }

  const textoConfirmacion: Record<Exclude<Confirmacion, null>, string> = {
    enviar: tieneCliente
      ? 'Al enviarlo, el extra queda congelado tal como está y el cliente lo ve en su portal para aprobarlo o rechazarlo. Ya no se podrá cambiar; si hay que corregirlo, se cancela y se hace otro.'
      : 'Al enviarlo, el extra queda congelado tal como está. Esta obra no tiene cliente del portal: mándale el PDF por WhatsApp. Ya no se podrá cambiar.',
    cancelar:
      extra.estado === 'ENVIADA'
        ? 'El cliente dejará de verlo y ya no lo podrá aprobar. El extra queda en la lista como cancelado.'
        : 'El borrador queda como cancelado.',
    borrar: 'El borrador se quita de la lista.',
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={base} className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline">
          ← Extras de la obra
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-neutral-900">Extra {extra.folio}</h1>
              <Badge tone={TONO_ESTADO_EXTRA[extra.estado]}>{ETIQUETA_ESTADO_EXTRA[extra.estado]}</Badge>
            </div>
            {extra.enviado_at && (
              <p className="text-sm text-neutral-600">Enviado el {formatDateTime(extra.enviado_at)}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`${base}/${extra.id}/pdf`} variant="secondary" size="sm">
              Ver PDF
            </LinkButton>
            {puedeEnviar && borrador && (
              <Button size="sm" onClick={() => setConfirmando('enviar')} disabled={ocupado}>
                Enviar al cliente
              </Button>
            )}
            {pedirVistoBueno && borrador && <PedirVistoBueno tipo="EXTRA" objetoId={extra.id} />}
            {puedeDuplicar && !borrador && (
              <Button
                size="sm"
                variant="secondary"
                disabled={ocupado}
                onClick={() =>
                  correr(
                    () => duplicarExtraAction(obraId, extra.id),
                    (id) => router.push(id ? `${base}/${id}` : base),
                  )
                }
              >
                Hacer uno nuevo a partir de este
              </Button>
            )}
            {esAdmin && (borrador || extra.estado === 'ENVIADA') && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmando('cancelar')} disabled={ocupado}>
                Cancelar extra
              </Button>
            )}
            {puedeEditar && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmando('borrar')} disabled={ocupado}>
                Borrar borrador
              </Button>
            )}
          </div>
        </div>
      </div>

      {confirmando && (
        <div role="alertdialog" aria-labelledby="confirmar-extra" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p id="confirmar-extra" className="text-sm font-medium text-neutral-900">
            {textoConfirmacion[confirmando]}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={confirmando === 'enviar' ? 'primary' : 'danger'}
              disabled={ocupado}
              onClick={() => {
                if (confirmando === 'enviar') correr(() => enviarExtraAction(obraId, extra.id));
                else if (confirmando === 'cancelar') correr(() => cancelarExtraAction(obraId, extra.id));
                else correr(() => eliminarExtraAction(obraId, extra.id), () => router.push(base));
              }}
            >
              {confirmando === 'enviar' ? 'Sí, enviar' : confirmando === 'cancelar' ? 'Sí, cancelar' : 'Sí, borrar'}
            </Button>
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setConfirmando(null)}>
              No
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {aviso}
        </p>
      )}

      <RespuestaCliente extra={extra} />

      {puedeEditar ? (
        <DatosEditables obraId={obraId} extra={extra} onGuardado={() => setAviso('Datos guardados.')} />
      ) : (
        <Card>
          <CardTitle as="h2">{foto?.titulo ?? extra.titulo}</CardTitle>
          {(foto?.motivo ?? extra.motivo) && (
            <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{foto?.motivo ?? extra.motivo}</p>
          )}
          <p className="mt-2 text-sm text-neutral-600">Fecha: {formatDate(foto?.fecha ?? extra.fecha)}</p>
        </Card>
      )}

      <Card padding="none">
        <div className="px-5 pb-3 pt-4">
          <CardTitle as="h2">Conceptos</CardTitle>
          <p className="text-sm text-neutral-600">Sin IVA, igual que el presupuesto de la obra.</p>
        </div>
        {puedeEditar ? (
          <RenglonesEditables obraId={obraId} extraId={extra.id} renglones={extra.renglones} />
        ) : (
          <TablaFoto
            renglones={
              foto?.renglones ??
              extra.renglones.map((r) => ({ ...r, importe: importeRenglon(r) }))
            }
          />
        )}
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
          <span className="text-sm font-semibold text-neutral-700">Total del extra</span>
          <span className="text-lg font-bold tabular-nums text-neutral-900">{formatCurrency(total)}</span>
        </div>
      </Card>

      <FotoExtra obraId={obraId} extraId={extra.id} fotoUrl={fotoUrl} puedeEditar={puedeEditar} />
    </div>
  );
}

function RespuestaCliente({ extra }: { extra: OrdenCambioConRenglones }) {
  if (extra.estado === 'APROBADA') {
    return (
      <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
        Aprobado{extra.respondido_nombre ? ` por ${extra.respondido_nombre}` : ''} el{' '}
        {formatDateTime(extra.respondido_at)}. Ya se suma al estado de cuenta de la obra.
      </p>
    );
  }
  if (extra.estado === 'RECHAZADA') {
    return (
      <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        <p>
          Rechazado{extra.respondido_nombre ? ` por ${extra.respondido_nombre}` : ''} el{' '}
          {formatDateTime(extra.respondido_at)}.
        </p>
        {extra.motivo_rechazo && <p className="mt-1">Motivo: {extra.motivo_rechazo}</p>}
      </div>
    );
  }
  if (extra.estado === 'ENVIADA') {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Esperando la respuesta del cliente. Lo que se envió ya no se puede cambiar.
      </p>
    );
  }
  if (extra.estado === 'CANCELADA') {
    return (
      <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
        Cancelado el {formatDateTime(extra.cancelado_at)}. No suma al estado de cuenta.
      </p>
    );
  }
  return null;
}

function DatosEditables({
  obraId,
  extra,
  onGuardado,
}: {
  obraId: string;
  extra: OrdenCambioConRenglones;
  onGuardado: () => void;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const r = await guardarDatosExtraAction(obraId, extra.id, new FormData(e.currentTarget));
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar.');
      return;
    }
    onGuardado();
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Field label="¿De qué es el extra? *" className="sm:col-span-2">
          <Input name="titulo" required maxLength={120} defaultValue={extra.titulo} />
        </Field>
        <Field label="¿Por qué se hace?" className="sm:col-span-2">
          <Textarea name="motivo" rows={3} maxLength={1000} defaultValue={extra.motivo} />
        </Field>
        <Field label="Fecha">
          <Input type="date" name="fecha" defaultValue={msAFechaInput(extra.fecha)} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar datos'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TablaFoto({
  renglones,
}: {
  renglones: { concepto: string; unidad: string; cantidad: number; precio_unitario: number; importe: number }[];
}) {
  if (renglones.length === 0) {
    return <p className="border-t border-neutral-200 px-5 py-6 text-sm text-neutral-600">Sin conceptos.</p>;
  }
  return (
    <div className="overflow-x-auto border-t border-neutral-200">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Concepto</th>
            <th scope="col" className="px-4 py-2 font-medium">Unidad</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Cantidad</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Precio</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Importe</th>
          </tr>
        </thead>
        <tbody>
          {renglones.map((r, i) => (
            <tr key={i} className="border-t border-neutral-100">
              <td className="px-4 py-2 text-neutral-900">{r.concepto}</td>
              <td className="px-4 py-2 text-neutral-700">{r.unidad || '—'}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.cantidad.toLocaleString('es-MX')}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.precio_unitario)}</td>
              <td className="px-4 py-2 text-right font-medium tabular-nums">{formatCurrency(r.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RenglonesEditables({
  obraId,
  extraId,
  renglones,
}: {
  obraId: string;
  extraId: string;
  renglones: RenglonExtra[];
}) {
  const siguienteOrden = (renglones.at(-1)?.orden ?? 0) + PASO;
  return (
    <div className="space-y-3 border-t border-neutral-200 px-5 py-4">
      {renglones.length === 0 && (
        <p className="text-sm text-neutral-600">Agrega lo que se va a hacer, con su cantidad y precio.</p>
      )}
      {renglones.map((r) => (
        <FilaRenglon key={r.id} obraId={obraId} extraId={extraId} renglon={r} />
      ))}
      <FilaRenglon obraId={obraId} extraId={extraId} ordenNuevo={siguienteOrden} />
    </div>
  );
}

/** Una fila editable. Sin `renglon`, es la fila para agregar uno nuevo. */
function FilaRenglon({
  obraId,
  extraId,
  renglon,
  ordenNuevo = 0,
}: {
  obraId: string;
  extraId: string;
  renglon?: RenglonExtra;
  ordenNuevo?: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const r = renglon
      ? await actualizarRenglonExtraAction(obraId, extraId, renglon.id, fd)
      : await agregarRenglonExtraAction(obraId, extraId, fd);
    setOcupado(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar el concepto.');
      return;
    }
    if (!renglon) formRef.current?.reset();
    router.refresh();
  }

  async function quitar() {
    if (!renglon) return;
    setOcupado(true);
    setError(null);
    const r = await eliminarRenglonExtraAction(obraId, extraId, renglon.id);
    setOcupado(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo quitar.');
      return;
    }
    router.refresh();
  }

  const etiqueta = renglon ? 'Concepto' : 'Nuevo concepto';

  return (
    <form
      ref={formRef}
      onSubmit={guardar}
      aria-label={renglon ? `Concepto ${renglon.concepto}` : 'Agregar concepto'}
      className={`grid gap-2 rounded-lg p-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-end ${
        renglon ? 'bg-neutral-50' : 'border border-dashed border-neutral-300'
      }`}
    >
      <input type="hidden" name="orden" value={renglon?.orden ?? ordenNuevo} />
      <Field label={etiqueta}>
        <Input name="concepto" required maxLength={300} defaultValue={renglon?.concepto ?? ''} placeholder="Ej. Barda de block 15 cm" />
      </Field>
      <Field label="Unidad">
        <Input name="unidad" maxLength={20} defaultValue={renglon?.unidad ?? ''} placeholder="m2" />
      </Field>
      <Field label="Cantidad">
        <Input name="cantidad" type="number" step="any" min="0" required defaultValue={renglon?.cantidad ?? 1} />
      </Field>
      <Field label="Precio unitario">
        <Input name="precio_unitario" type="number" step="0.01" required defaultValue={renglon?.precio_unitario ?? ''} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant={renglon ? 'secondary' : 'primary'} disabled={ocupado}>
          {renglon ? 'Guardar' : 'Agregar'}
        </Button>
        {renglon && (
          <Button type="button" size="sm" variant="ghost" onClick={quitar} disabled={ocupado} aria-label={`Quitar ${renglon.concepto}`}>
            Quitar
          </Button>
        )}
      </div>
      {renglon && (
        <p className="text-xs text-neutral-600 sm:col-span-5">
          Importe: <span className="font-medium tabular-nums text-neutral-900">{formatCurrency(importeRenglon(renglon))}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-5">
          {error}
        </p>
      )}
    </form>
  );
}

function FotoExtra({
  obraId,
  extraId,
  fotoUrl,
  puedeEditar,
}: {
  obraId: string;
  extraId: string;
  fotoUrl: string | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!fotoUrl && !puedeEditar) return null;

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCargando(true);
    setError(null);
    const fallar = (msg: string) => {
      setCargando(false);
      if (inputRef.current) inputRef.current.value = '';
      setError(msg);
    };

    const prep = await crearUrlSubidaFotoExtra(obraId, extraId, file.name, file.type, file.size);
    if (!prep.ok || !prep.path || !prep.token) {
      fallar(prep.error ?? 'No se pudo preparar la subida.');
      return;
    }
    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from('extras')
      .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
    if (upErr) {
      fallar(`No se pudo subir: ${upErr.message}`);
      return;
    }
    const r = await registrarFotoExtra(obraId, extraId, prep.path);
    setCargando(false);
    if (inputRef.current) inputRef.current.value = '';
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar la foto.');
      return;
    }
    router.refresh();
  }

  async function quitar() {
    setCargando(true);
    setError(null);
    const r = await quitarFotoExtra(obraId, extraId);
    setCargando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo quitar la foto.');
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardTitle as="h2">Foto</CardTitle>
      <p className="mt-1 text-sm text-neutral-600">
        Opcional: cómo está el lugar o qué se pidió. El cliente la ve junto al extra.
      </p>
      {fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage que vence en 1 h; no pasa por el optimizador.
        <img src={fotoUrl} alt="Foto del extra" className="mt-3 max-h-80 rounded-lg border border-neutral-200 object-contain" />
      )}
      {puedeEditar && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            id={`foto-${extraId}`}
            onChange={alElegir}
            disabled={cargando}
          />
          <label
            htmlFor={`foto-${extraId}`}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-within:ring-2 focus-within:ring-neutral-900"
          >
            {cargando ? 'Subiendo…' : fotoUrl ? 'Cambiar foto' : 'Agregar foto'}
          </label>
          {fotoUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={quitar} disabled={cargando}>
              Quitar foto
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Card>
  );
}
