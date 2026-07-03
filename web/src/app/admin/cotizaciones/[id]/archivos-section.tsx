'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@/components/ui';
import { formatDate } from '@/lib/data/format';
import type { ArchivoCotizacion } from '@/lib/data/archivos';
import {
  subirArchivoAction,
  eliminarArchivoAction,
  obtenerUrlDescargaAction,
} from './archivos-actions';

// ─── Icono de archivo (SVG Heroicons) ─────────────────────────────────────────

function IconoArchivo({ tipo }: { tipo: string }) {
  const esImagen = tipo.startsWith('image/') || tipo === 'image';
  if (esImagen) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5 text-neutral-400 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 9.75h18M3.75 3h16.5A.75.75 0 0121 3.75v16.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 20.25V3.75A.75.75 0 013.75 3z"
        />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 text-neutral-400 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

// ─── Formulario de subida ─────────────────────────────────────────────────────

function FormSubida({
  cotizacionId,
  onDone,
  onCancel,
}: {
  cotizacionId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string>('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setNombreArchivo(f ? f.name : '');
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get('archivo') as File | null;
    if (!file || file.size === 0) {
      setError('Selecciona un archivo antes de subir.');
      return;
    }

    setSubiendo(true);
    setError(null);

    const result = await subirArchivoAction(cotizacionId, formData);
    setSubiendo(false);

    if (!result.ok) {
      setError(result.error ?? 'No se pudo subir el archivo.');
      return;
    }

    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <span className="block text-sm font-medium text-neutral-700">
          Archivo <span className="text-neutral-400">(PDF, imagen — máx. 15 MB)</span>
        </span>
        <label
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 transition hover:border-neutral-400 hover:bg-neutral-100 focus-within:border-neutral-900"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 shrink-0 text-neutral-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <span className="text-sm text-neutral-500">
            {nombreArchivo ? (
              <span className="font-medium text-neutral-800">{nombreArchivo}</span>
            ) : (
              'Haz clic para seleccionar un archivo'
            )}
          </span>
          <input
            ref={inputRef}
            type="file"
            name="archivo"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={onFileChange}
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={subiendo || !nombreArchivo}>
          {subiendo ? 'Subiendo...' : 'Subir archivo'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={subiendo}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ─── Fila de archivo ──────────────────────────────────────────────────────────

function FilaArchivo({
  archivo,
  cotizacionId,
}: {
  archivo: ArchivoCotizacion;
  cotizacionId: string;
}) {
  const router = useRouter();
  const [descargando, setDescargando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDescargar() {
    setDescargando(true);
    setError(null);
    const result = await obtenerUrlDescargaAction(archivo.uri);
    setDescargando(false);
    if (!result.url) {
      setError(result.error ?? 'No se pudo generar el enlace de descarga.');
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  async function onEliminar() {
    if (
      !confirm(
        `¿Eliminar el archivo "${archivo.nombre}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setEliminando(true);
    setError(null);
    const result = await eliminarArchivoAction(archivo.id, archivo.uri, cotizacionId);
    setEliminando(false);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo eliminar el archivo.');
      return;
    }
    router.refresh();
  }

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 transition hover:bg-neutral-50">
      <div className="flex min-w-0 items-center gap-3">
        <IconoArchivo tipo={archivo.tipo} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-800">{archivo.nombre}</p>
          <p className="text-xs text-neutral-400">{formatDate(archivo.fecha_agregado)}</p>
          {error && (
            <p className="mt-0.5 text-xs text-red-600">{error}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onDescargar}
          disabled={descargando || eliminando}
        >
          {descargando ? 'Cargando...' : 'Descargar'}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={onEliminar}
          disabled={eliminando || descargando}
        >
          {eliminando ? 'Eliminando...' : 'Eliminar'}
        </Button>
      </div>
    </li>
  );
}

// ─── Sección principal (export) ────────────────────────────────────────────────

export interface ArchivosSectionProps {
  cotizacionId: string;
  archivos: ArchivoCotizacion[];
}

export default function ArchivosSection({ cotizacionId, archivos }: ArchivosSectionProps) {
  const [mostrandoForm, setMostrandoForm] = useState(false);

  return (
    <section className="space-y-4">
      <Card padding="none">
        <div className="p-5">
          <CardHeader>
            <CardTitle as="h2" className="text-base font-medium text-neutral-900">
              Archivos adjuntos
            </CardTitle>
            {!mostrandoForm && (
              <Button type="button" size="sm" onClick={() => setMostrandoForm(true)}>
                Subir archivo
              </Button>
            )}
          </CardHeader>

          {mostrandoForm && (
            <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-700">Nuevo archivo</p>
              </div>
              <FormSubida
                cotizacionId={cotizacionId}
                onDone={() => setMostrandoForm(false)}
                onCancel={() => setMostrandoForm(false)}
              />
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          {archivos.length === 0 ? (
            <EmptyState
              title="Sin archivos adjuntos"
              description="Sube contratos, planos u otros documentos relacionados con esta cotizacion."
            />
          ) : (
            <ul className="space-y-2">
              {archivos.map((a) => (
                <FilaArchivo key={a.id} archivo={a} cotizacionId={cotizacionId} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}
