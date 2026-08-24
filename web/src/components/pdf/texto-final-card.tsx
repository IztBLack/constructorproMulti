'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardTitle } from '@/components/ui';
import { LARGO_MAXIMO, type OrigenTexto, type TipoDocumento } from '@/lib/pdf/textos-finales';
import { guardarTextoFinalAction } from './texto-final-actions';

/**
 * Tarjeta para leer y editar el PÁRRAFO FINAL de un documento imprimible.
 *
 * Una sola para cotizaciones, notas de obra y estado de cuenta: la operación es
 * la misma en las tres, y tenerlas separadas garantizaría que con el tiempo se
 * comportaran distinto.
 *
 * Enseña el texto YA RESUELTO —el que se va a imprimir, con el nombre de la
 * empresa y la leyenda del IVA sustituidos— y no una plantilla con huecos: lo
 * que se lee aquí es literalmente lo que va a decir la hoja.
 */
export function TextoFinalCard({
  tipo,
  documentoId,
  resuelto,
  integrado,
  origen,
  puedeEditar,
  compacta = false,
}: {
  tipo: TipoDocumento;
  documentoId: string;
  /** El texto que se imprime hoy. */
  resuelto: string;
  /** El que trae la app, para el botón de copiar. */
  integrado: string;
  origen: OrigenTexto;
  puedeEditar: boolean;
  /** Variante apretada, para pantallas angostas. */
  compacta?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(resuelto);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propio = origen === 'documento';

  async function aplicar(texto: string | null) {
    setOcupado(true);
    setError(null);
    const r = await guardarTextoFinalAction(tipo, documentoId, texto);
    setOcupado(false);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo guardar el texto.');
      return;
    }
    setEditando(false);
    router.refresh();
  }

  const etiquetaOrigen =
    origen === 'documento'
      ? 'Editado aquí'
      : origen === 'empresa'
        ? 'Texto de tus ajustes'
        : 'Texto por defecto';

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <CardTitle as="h2" className="text-sm font-semibold text-neutral-700">
          Texto final del PDF
        </CardTitle>
        <Badge tone={propio ? 'amber' : 'neutral'}>{etiquetaOrigen}</Badge>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {editando ? (
        <div className="space-y-3">
          <label htmlFor={`texto-final-${documentoId}`} className="block text-xs text-neutral-500">
            Cambia lo que necesites. Se guarda solo en este documento.
          </label>
          <textarea
            id={`texto-final-${documentoId}`}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            disabled={ocupado}
            rows={compacta ? 5 : 4}
            maxLength={LARGO_MAXIMO}
            className="w-full rounded-lg border border-neutral-900 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-500"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setBorrador(integrado)}
              disabled={ocupado}
              className="text-xs text-neutral-500 underline underline-offset-2 transition hover:text-neutral-900"
            >
              Volver al texto por defecto
            </button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={ocupado}
                onClick={() => {
                  setBorrador(resuelto);
                  setEditando(false);
                  setError(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={ocupado} onClick={() => aplicar(borrador)}>
                {ocupado ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="whitespace-pre-line border-l-2 border-neutral-300 pl-3.5 text-sm leading-relaxed text-neutral-700">
            {resuelto}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              Se imprime al pie, arriba de tu pie de página.
            </p>
            {puedeEditar && (
              <div className="flex items-center gap-3">
                {propio && (
                  <button
                    type="button"
                    onClick={() => aplicar(null)}
                    disabled={ocupado}
                    className="text-xs text-neutral-500 underline underline-offset-2 transition hover:text-neutral-900"
                  >
                    Restaurar el general
                  </button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setBorrador(resuelto);
                    setEditando(true);
                  }}
                >
                  Editar
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
