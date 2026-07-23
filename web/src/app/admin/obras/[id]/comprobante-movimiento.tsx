'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { subirComprobante, quitarComprobante, urlComprobante } from './comprobante-actions';

/**
 * Comprobante de un movimiento (imagen o PDF de la transferencia).
 *
 * Compacto a propósito: vive en la celda de acciones de una fila de la tabla, al
 * lado de Editar/Eliminar. Tres estados:
 *   · con comprobante  → "Ver" (abre URL firmada) + "Quitar" (si es de oficina)
 *   · sin comprobante y de oficina → "Adjuntar" (input de archivo oculto)
 *   · sin comprobante y sin permiso → nada
 *
 * `puedeGestionar` = personal de oficina (admin/supervisor/contador). Es
 * cosmético; la barrera real es la policy del bucket (0024).
 */
export function ComprobanteMovimiento({
  obraId,
  movimientoId,
  uri,
  puedeGestionar,
}: {
  obraId: string;
  movimientoId: string;
  uri: string | null | undefined;
  puedeGestionar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ver() {
    setError(null);
    if (!uri) return;
    const url = await urlComprobante(uri);
    if (!url) {
      setError('No se pudo abrir.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCargando(true);
    setError(null);

    const fd = new FormData();
    fd.set('comprobante', file);
    const r = await subirComprobante(obraId, movimientoId, fd);
    setCargando(false);
    if (inputRef.current) inputRef.current.value = '';
    if (!r.ok) {
      setError(r.error ?? 'No se pudo subir.');
      return;
    }
    router.refresh();
  }

  async function quitar() {
    if (!uri) return;
    setCargando(true);
    setError(null);
    const r = await quitarComprobante(obraId, movimientoId, uri);
    setCargando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo quitar.');
      return;
    }
    router.refresh();
  }

  // Si no hay comprobante y no puede gestionar, no ocupa lugar.
  if (!uri && !puedeGestionar) return null;

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1">
        {uri && (
          <Button type="button" variant="ghost" size="sm" onClick={ver} disabled={cargando}>
            Ver comprobante
          </Button>
        )}

        {puedeGestionar && (
          <>
            {!uri && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={cargando}
                onClick={() => inputRef.current?.click()}
              >
                {cargando ? 'Subiendo…' : 'Adjuntar'}
              </Button>
            )}
            {uri && (
              <Button type="button" variant="ghost" size="sm" onClick={quitar} disabled={cargando}>
                Quitar
              </Button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={alElegirArchivo}
              className="hidden"
            />
          </>
        )}
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
