'use client';

import { useState, useTransition } from 'react';
import { Button, Modal } from '@/components/ui';
import {
  ESTADOS_REPORTE,
  ETIQUETA_ESTADO_REPORTE,
  MAX_DESCRIPCION,
  MAX_RESPUESTA,
  MAX_UBICACION,
  type EstadoReporte,
} from '@/lib/postventa/garantia';
import { actualizarReporte, crearReporteOficina, guardarGarantiaObra } from './actions';

const CAMPO = 'mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900';

function Mensajes({ error, ok }: { error: string | null; ok?: string | null }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {ok && (
        <p role="status" className="text-sm text-green-700">
          {ok}
        </p>
      )}
    </>
  );
}

/** La oficina levanta un reporte a nombre del cliente (llamó, mandó WhatsApp). */
export function NuevoReporteOficina({ obras }: { obras: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [obraId, setObraId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await crearReporteOficina({ id, obraId, descripcion, ubicacion });
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.');
        return;
      }
      setAbierto(false);
      setId(crypto.randomUUID());
      setDescripcion('');
      setUbicacion('');
    });
  }

  return (
    <>
      <Button data-guia="postventa-registrar" onClick={() => setAbierto(true)}>Registrar reporte</Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Registrar un reporte de garantía">
        <form onSubmit={enviar} className="space-y-3">
          <p className="text-sm text-neutral-600">
            Para cuando el cliente te avisa por teléfono o WhatsApp. Lo verá en su portal.
          </p>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Obra</span>
            <select required value={obraId} onChange={(e) => setObraId(e.target.value)} className={CAMPO}>
              <option value="">Elige la obra</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">¿Qué pasa?</span>
            <textarea
              required
              rows={3}
              maxLength={MAX_DESCRIPCION}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">¿Dónde? (opcional)</span>
            <input
              maxLength={MAX_UBICACION}
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Baño de arriba, recámara 2…"
              className={CAMPO}
            />
          </label>
          <Mensajes error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : 'Registrar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Seguimiento: estado, respuesta al cliente y fecha de visita. */
export function Seguimiento({
  id,
  obraId,
  estado: estadoInicial,
  respuesta: respuestaInicial,
  programadoPara,
}: {
  id: string;
  obraId: string;
  estado: EstadoReporte;
  respuesta: string;
  programadoPara: string;
}) {
  const [estado, setEstado] = useState<EstadoReporte>(estadoInicial);
  const [respuesta, setRespuesta] = useState(respuestaInicial);
  const [fecha, setFecha] = useState(programadoPara);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    iniciar(async () => {
      const r = await actualizarReporte(id, obraId, { estado, respuesta, programadoPara: fecha });
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else setOk('Guardado. El cliente lo ve en su portal.');
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-neutral-700">Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoReporte)} className={CAMPO}>
            {ESTADOS_REPORTE.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESTADO_REPORTE[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-neutral-700">
            Fecha de la visita{estado === 'PROGRAMADO' ? '' : ' (opcional)'}
          </span>
          <input
            type="date"
            required={estado === 'PROGRAMADO'}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={CAMPO}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium text-neutral-700">
          Respuesta al cliente{estado === 'NO_PROCEDE' ? ' (obligatoria: di por qué)' : ''}
        </span>
        <textarea
          rows={3}
          maxLength={MAX_RESPUESTA}
          required={estado === 'NO_PROCEDE'}
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-neutral-500">Esto lo lee el cliente tal cual.</span>
      </label>
      <Mensajes error={error} ok={ok} />
      <Button type="submit" disabled={pendiente}>
        {pendiente ? 'Guardando…' : 'Guardar seguimiento'}
      </Button>
    </form>
  );
}

/** Periodo de garantía de una obra (solo admin). */
export function FormGarantiaObra({
  obraId,
  entrega,
  meses,
  notas,
  esAdmin,
}: {
  obraId: string;
  entrega: string;
  meses: number;
  notas: string;
  esAdmin: boolean;
}) {
  const [fecha, setFecha] = useState(entrega);
  const [m, setM] = useState(String(meses));
  const [n, setN] = useState(notas);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    iniciar(async () => {
      const r = await guardarGarantiaObra({ obraId, entregaFecha: fecha, meses: Number(m), notas: n });
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.');
      else setOk('Guardado.');
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
      <fieldset disabled={!esAdmin || pendiente} className="contents">
        <label className="text-sm">
          <span className="block text-neutral-700">Se entregó el</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
        </label>
        <label className="w-24 text-sm">
          <span className="block text-neutral-700">Meses</span>
          <input
            type="number"
            min={0}
            max={120}
            inputMode="numeric"
            value={m}
            onChange={(e) => setM(e.target.value)}
            className={CAMPO}
          />
        </label>
        <label className="min-w-40 flex-1 text-sm">
          <span className="block text-neutral-700">Qué cubre (opcional)</span>
          <input maxLength={500} value={n} onChange={(e) => setN(e.target.value)} className={CAMPO} />
        </label>
        {esAdmin && (
          <Button type="submit" size="sm">
            Guardar
          </Button>
        )}
      </fieldset>
      <div className="w-full">
        <Mensajes error={error} ok={ok} />
      </div>
    </form>
  );
}
