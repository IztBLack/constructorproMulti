'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Card, CardTitle } from '@/components/ui';
import { previsualizarImportacion, confirmarImportacion } from './actions';
import type { PreviewImportacion } from './actions';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMXN(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ImportarObraForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewImportacion | null>(null);
  const [nombreEditable, setNombreEditable] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [obraIdCreada, setObraIdCreada] = useState<string | null>(null);

  // ── Paso 1: previsualizar ─────────────────────────────────────────────────
  function handlePrevisualizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorGlobal(null);
    setPreview(null);
    setConfirmado(false);
    setObraIdCreada(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await previsualizarImportacion(formData);
      if (!result.ok) {
        setErrorGlobal(result.error ?? 'Error al procesar el archivo.');
        return;
      }
      const data = result.data!;
      setPreview(data);
      setNombreEditable(data.obraNombre);
    });
  }

  // ── Paso 2: confirmar importación ─────────────────────────────────────────
  function handleConfirmar() {
    if (!preview) return;
    setErrorGlobal(null);

    startTransition(async () => {
      const result = await confirmarImportacion({
        obraNombre: nombreEditable.trim() || preview.obraNombre,
        partidas: preview._partidas,
        movimientos: preview._movimientos,
      });

      if (!result.ok) {
        setErrorGlobal(result.error ?? 'Error al importar la obra.');
        return;
      }

      setConfirmado(true);
      setObraIdCreada(result.data!.obraId);
    });
  }

  // ── Reiniciar ─────────────────────────────────────────────────────────────
  function handleReiniciar() {
    setPreview(null);
    setErrorGlobal(null);
    setNombreEditable('');
    setConfirmado(false);
    setObraIdCreada(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── Render: éxito ─────────────────────────────────────────────────────────
  if (confirmado && obraIdCreada) {
    return (
      <Card>
        <div className="space-y-4">
          <CardTitle as="h2" className="text-base font-semibold text-neutral-800">
            Importacion completada
          </CardTitle>
          <p className="text-sm text-neutral-600">
            La obra <span className="font-semibold">{nombreEditable}</span> fue creada
            correctamente con {preview?.numPartidas ?? 0} partida(s) y{' '}
            {preview?.numMovimientos ?? 0} movimiento(s).
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push(`/admin/obras/${obraIdCreada}`)}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white outline-none transition hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
            >
              Ver obra
            </button>
            <button
              type="button"
              onClick={handleReiniciar}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 outline-none transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
            >
              Importar otra obra
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Paso 1: subir archivo ─────────────────────────────────────────── */}
      <Card>
        <CardTitle as="h2" className="mb-4 text-base font-semibold text-neutral-800">
          Seleccionar archivo
        </CardTitle>
        <form onSubmit={handlePrevisualizar} className="space-y-4">
          <Field label="Archivo Excel (.xlsx)" hint="Tamano maximo: 10 MB. Solo se acepta formato .xlsx.">
            {/* Usamos <input> nativo para poder adjuntar ref; los estilos replican el kit */}
            <input
              ref={fileRef}
              type="file"
              name="archivo"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              disabled={isPending}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 file:transition hover:file:bg-neutral-200 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>

          {errorGlobal && !preview && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorGlobal}
            </p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending && !preview ? 'Analizando...' : 'Analizar archivo'}
            </Button>
            <button
              type="button"
              onClick={() => router.push('/admin/obras')}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 outline-none transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Card>

      {/* ── Paso 2: preview + confirmación ───────────────────────────────── */}
      {preview && (
        <Card>
          <CardTitle as="h2" className="mb-4 text-base font-semibold text-neutral-800">
            Vista previa de la importacion
          </CardTitle>

          <div className="space-y-5">
            {/* Nombre editable */}
            <Field label="Nombre de la obra (editable)">
              <Input
                value={nombreEditable}
                onChange={(e) => setNombreEditable(e.target.value)}
                disabled={isPending}
                maxLength={200}
                placeholder="Nombre de la obra"
              />
            </Field>

            {/* Resumen de datos */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryBox label="Partidas de presupuesto" value={String(preview.numPartidas)} />
              <SummaryBox label="Movimientos" value={String(preview.numMovimientos)} />
              <SummaryBox label="Total recibido" value={formatMXN(preview.totalRecibido)} />
            </div>

            {/* Advertencias */}
            {preview.advertencias.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-800">
                  Advertencias ({preview.advertencias.length})
                </p>
                <ul className="space-y-1">
                  {preview.advertencias.map((adv, i) => (
                    <li key={i} className="text-xs text-amber-700">
                      {adv}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Error de confirmacion */}
            {errorGlobal && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorGlobal}
              </p>
            )}

            {/* Aviso antes de confirmar */}
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              Al confirmar se creara la obra con las {preview.numPartidas} partida(s) y los{' '}
              {preview.numMovimientos} movimiento(s) mostrados. Esta accion no se puede deshacer.
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={handleConfirmar}
                disabled={isPending || !nombreEditable.trim()}
              >
                {isPending ? 'Importando...' : 'Confirmar importacion'}
              </Button>
              <button
                type="button"
                onClick={handleReiniciar}
                disabled={isPending}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 outline-none transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Elegir otro archivo
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Componente auxiliar ───────────────────────────────────────────────────────

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}
