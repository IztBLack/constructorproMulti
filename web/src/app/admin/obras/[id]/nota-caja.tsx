'use client';

import { useState } from 'react';
import { Card, CardTitle, Button } from '@/components/ui';
import { guardarNotaCajaAction } from './nota-caja-actions';

/**
 * Nota de conciliación de caja de la obra.
 *
 * Reproduce el apunte que la contadora pone al pie de su Excel ("diferencia a
 * favor con tal proveedor…"). Es de la obra, no de un movimiento suelto.
 *
 * `puedeEditar` viene del rol: admin, supervisor y contador editan; el resto
 * solo lee. Es cosmético — la barrera real es la policy de 0023—, pero evita
 * mostrarle a un colaborador un formulario que le fallaría al guardar.
 */
export function NotaCaja({
  obraId,
  notaInicial,
  puedeEditar,
}: {
  obraId: string;
  notaInicial: string;
  puedeEditar: boolean;
}) {
  const [nota, setNota] = useState(notaInicial);
  const [guardada, setGuardada] = useState(notaInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState(false);

  // Si no hay nota y no se puede editar, no se ocupa espacio con una tarjeta vacía.
  if (!puedeEditar && !guardada.trim()) return null;

  const sinCambios = nota.trim() === guardada.trim();

  async function guardar() {
    setCargando(true);
    setError(null);
    setAviso(false);
    const r = await guardarNotaCajaAction(obraId, nota);
    setCargando(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar la nota.');
      return;
    }
    setGuardada(nota);
    setAviso(true);
    window.setTimeout(() => setAviso(false), 2500);
  }

  return (
    <Card>
      <CardTitle as="h2" className="mb-2 text-sm font-semibold text-neutral-700">
        Nota de conciliación
      </CardTitle>

      {puedeEditar ? (
        <div className="space-y-3">
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={cargando}
            rows={3}
            maxLength={2000}
            placeholder="Ej. Diferencia a favor por $20,957.46 con Concretos de Veracruz."
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-neutral-900"
          />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={guardar} disabled={cargando || sinCambios}>
              {cargando ? 'Guardando…' : 'Guardar nota'}
            </Button>
            {aviso && <span role="status" className="text-sm text-green-700">Guardada.</span>}
          </div>
        </div>
      ) : (
        // Solo lectura: se respetan los saltos de línea del apunte original.
        <p className="whitespace-pre-wrap text-sm text-neutral-700">{guardada}</p>
      )}
    </Card>
  );
}
