'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { comprimirFoto } from '@/lib/imagen/comprimir';
import { formatDate } from '@/lib/data/format';
import type { Reporte } from '@/lib/data/postventa';
import {
  ETIQUETA_ESTADO_REPORTE,
  MAX_DESCRIPCION,
  MAX_FOTOS_REPORTE,
  MAX_UBICACION,
  TEXTO_GARANTIA,
  TONO_ESTADO_REPORTE,
  clienteAgregaFotos,
  type Garantia,
} from '@/lib/postventa/garantia';
import { crearUrlFotoGarantia, registrarFotoGarantia, reportarProblemaAction } from './postventa-actions';

const TONO_GARANTIA = { SIN_DATOS: 'neutral', VIGENTE: 'green', POR_VENCER: 'amber', VENCIDA: 'red' } as const;

/** Sube fotos a un reporte, una por una (comprimidas). Devuelve los errores. */
async function subirFotos(obraId: string, reporteId: string, archivos: File[], ordenInicial: number): Promise<string[]> {
  const supabase = createClient();
  const errores: string[] = [];
  for (let i = 0; i < archivos.length; i++) {
    const a = archivos[i];
    const lista = await comprimirFoto(a);
    if (!lista) {
      errores.push(`${a.name}: no es una foto JPG, PNG o WEBP.`);
      continue;
    }
    const prep = await crearUrlFotoGarantia(obraId, reporteId, lista.tipo, lista.blob.size);
    if (!prep.ok || !prep.path || !prep.token) {
      errores.push(`${a.name}: ${prep.error ?? 'no se pudo preparar.'}`);
      continue;
    }
    const { error } = await supabase.storage
      .from('postventa')
      .uploadToSignedUrl(prep.path, prep.token, lista.blob, { contentType: lista.tipo });
    if (error) {
      errores.push(`${a.name}: no se pudo subir.`);
      continue;
    }
    const r = await registrarFotoGarantia(obraId, reporteId, prep.path, lista.tipo, lista.blob.size, ordenInicial + i);
    if (!r.ok) errores.push(`${a.name}: ${r.error ?? 'no se pudo guardar.'}`);
  }
  return errores;
}

function AgregarFotos({ obraId, reporte }: { obraId: string; reporte: Reporte }) {
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const libres = MAX_FOTOS_REPORTE - reporte.fotos.length;
  if (libres <= 0) return null;
  return (
    <div className="space-y-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50 focus-within:ring-2 focus-within:ring-neutral-900">
        {pendiente ? 'Subiendo…' : 'Agregar fotos'}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={pendiente}
          onChange={(e) => {
            const archivos = Array.from(e.target.files ?? []).slice(0, libres);
            e.target.value = '';
            if (archivos.length === 0) return;
            setAviso(null);
            iniciar(async () => {
              const errores = await subirFotos(obraId, reporte.id, archivos, reporte.fotos.length);
              if (errores.length) setAviso(errores.join(' '));
            });
          }}
        />
      </label>
      {aviso && (
        <p role="alert" className="text-sm text-red-700">
          {aviso}
        </p>
      )}
    </div>
  );
}

function NuevoReporte({ obraId, alTerminar }: { obraId: string; alTerminar: () => void }) {
  const [id] = useState(() => crypto.randomUUID());
  const [descripcion, setDescripcion] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  // El reporte ya llegó: un reintento solo vuelve a subir fotos.
  const [enviado, setEnviado] = useState(false);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      if (!enviado) {
        const r = await reportarProblemaAction(obraId, id, descripcion, ubicacion);
        if (!r.ok) {
          setError(r.error ?? 'No se pudo enviar.');
          return;
        }
        setEnviado(true);
      }
      if (fotos.length > 0) {
        const errores = await subirFotos(obraId, id, fotos, 0);
        if (errores.length) {
          setAviso(`Tu reporte llegó, pero algunas fotos no: ${errores.join(' ')} Puedes agregarlas desde el reporte.`);
          return;
        }
      }
      alTerminar();
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <label className="block text-sm">
        <span className="font-medium text-neutral-700">¿Qué pasa?</span>
        <textarea
          required
          rows={4}
          minLength={5}
          maxLength={MAX_DESCRIPCION}
          value={descripcion}
          disabled={enviado}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej.: se está filtrando agua en el techo del baño cuando llueve"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-neutral-700">¿Dónde? (opcional)</span>
        <input
          maxLength={MAX_UBICACION}
          value={ubicacion}
          disabled={enviado}
          onChange={(e) => setUbicacion(e.target.value)}
          placeholder="Baño de arriba, recámara 2, fachada…"
          className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-neutral-700">Fotos (opcional, hasta {MAX_FOTOS_REPORTE})</span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFotos(Array.from(e.target.files ?? []).slice(0, MAX_FOTOS_REPORTE))}
          className="mt-1 block min-h-11 text-sm"
        />
        {fotos.length > 0 && (
          <span className="text-xs text-neutral-500">
            {fotos.length} foto{fotos.length === 1 ? '' : 's'} lista{fotos.length === 1 ? '' : 's'}. Se reducen
            antes de subir.
          </span>
        )}
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {aviso}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {aviso ? (
          <Button type="button" onClick={alTerminar}>
            Listo
          </Button>
        ) : (
          <Button type="submit" disabled={pendiente}>
            {pendiente ? 'Enviando…' : 'Enviar reporte'}
          </Button>
        )}
        {!enviado && (
          <Button type="button" variant="secondary" onClick={alTerminar} disabled={pendiente}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Portal del cliente: su garantía y "Reportar un problema" (0043, RF7.2).
 * El botón solo sale si su contratista usa el módulo (RPC
 * `postventa_disponible`); lo ya reportado se sigue viendo siempre.
 */
export function PostventaCliente({
  obraId,
  disponible,
  garantia,
  reportes,
}: {
  obraId: string;
  disponible: boolean;
  garantia: Garantia;
  reportes: Reporte[];
}) {
  const [abierto, setAbierto] = useState(false);
  if (!disponible && reportes.length === 0 && garantia.estado === 'SIN_DATOS') return null;

  return (
    <section aria-labelledby="garantia-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="garantia-heading" className="text-base font-semibold text-neutral-900">
            Garantía y reportes
          </h2>
          {garantia.estado !== 'SIN_DATOS' && garantia.vence !== null && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
              <Badge tone={TONO_GARANTIA[garantia.estado]}>{TEXTO_GARANTIA[garantia.estado]}</Badge>
              {garantia.estado === 'VENCIDA' ? 'Venció' : 'Cubierta hasta'} el {formatDate(garantia.vence)}
            </p>
          )}
        </div>
        {disponible && !abierto && <Button onClick={() => setAbierto(true)}>Reportar un problema</Button>}
      </div>

      {abierto && (
        <Card padding="md">
          <NuevoReporte obraId={obraId} alTerminar={() => setAbierto(false)} />
        </Card>
      )}

      {reportes.length > 0 && (
        <ul className="space-y-3">
          {reportes.map((r) => (
            <li key={r.id} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONO_ESTADO_REPORTE[r.estado]}>{ETIQUETA_ESTADO_REPORTE[r.estado]}</Badge>
                <span className="text-xs text-neutral-500">Reportado el {formatDate(r.reportado_en)}</span>
              </div>
              <p className="whitespace-pre-line text-sm text-neutral-800">
                {r.ubicacion ? <span className="font-medium">{r.ubicacion}: </span> : null}
                {r.descripcion}
              </p>
              {r.programado_para !== null && r.estado === 'PROGRAMADO' && (
                <p className="text-sm font-medium text-neutral-900">Visita programada: {formatDate(r.programado_para)}</p>
              )}
              {r.respuesta && (
                <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-800">
                  <p className="text-xs font-medium text-neutral-500">Respuesta de tu constructora</p>
                  <p className="mt-1 whitespace-pre-line">{r.respuesta}</p>
                </div>
              )}
              {r.fotos.some((f) => f.url) && (
                <ul className="flex flex-wrap gap-2">
                  {r.fotos.map((f, i) =>
                    f.url ? (
                      <li key={f.id}>
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, temporal */}
                          <img
                            src={f.url}
                            alt={`Foto ${i + 1} del reporte`}
                            className="h-20 w-20 rounded-lg border border-neutral-200 object-cover"
                            loading="lazy"
                          />
                        </a>
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
              {disponible && clienteAgregaFotos(r.estado) && <AgregarFotos obraId={obraId} reporte={r} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
