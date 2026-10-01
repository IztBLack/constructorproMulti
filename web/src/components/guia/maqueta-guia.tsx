import type { Maqueta } from '@/lib/guia/tipos';

const ESTADO: Record<'ok' | 'pendiente' | 'alerta', { clase: string; texto: string }> = {
  ok: { clase: 'bg-green-100 text-green-700', texto: 'Listo' },
  pendiente: { clase: 'bg-amber-100 text-amber-700', texto: 'Pendiente' },
  alerta: { clase: 'bg-red-100 text-red-700', texto: 'Ojo' },
};

const TONO: Record<'positivo' | 'negativo' | 'neutro', string> = {
  positivo: 'text-green-700',
  negativo: 'text-red-600',
  neutro: 'text-neutral-900',
};

/**
 * Dibujo de ejemplo de una pantalla. Es INERTE a propósito: nada es clicable ni
 * se guarda, y siempre lleva la marca EJEMPLO para que nadie confunda estos
 * datos con los suyos.
 */
export function MaquetaGuia({ maqueta }: { maqueta: Maqueta }) {
  return (
    <figure
      className="relative select-none rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3"
      aria-label={`Ejemplo: ${maqueta.titulo}`}
    >
      {/* La marca EJEMPLO va DENTRO del pie (el modelo de <figure> no admite
          nada suelto antes) y a 12px: es el seguro contra confundir estos datos
          con los propios. */}
      <figcaption className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-neutral-700">
        <span>{maqueta.titulo}</span>
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-700">
          Ejemplo
        </span>
      </figcaption>

      {maqueta.tipo === 'lista' && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {maqueta.filas.map((f, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">{f.principal}</p>
                {f.detalle && <p className="truncate text-xs text-neutral-500">{f.detalle}</p>}
              </div>
              {f.valor && <span className="shrink-0 text-sm tabular-nums text-neutral-700">{f.valor}</span>}
              {f.estado && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO[f.estado].clase}`}>
                  {ESTADO[f.estado].texto}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {maqueta.tipo === 'formulario' && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
          {maqueta.campos.map((c, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-neutral-500">{c.etiqueta}</p>
              <p className="rounded-md border border-neutral-200 px-2 py-1 text-sm text-neutral-900">{c.valor}</p>
            </div>
          ))}
          <div className="pt-1">
            <span className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
              {maqueta.boton}
            </span>
          </div>
        </div>
      )}

      {maqueta.tipo === 'resumen' && (
        <dl className="grid grid-cols-2 gap-2">
          {maqueta.cifras.map((c, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
              <dt className="text-xs text-neutral-500">{c.etiqueta}</dt>
              <dd className={`text-sm font-semibold tabular-nums ${TONO[c.tono ?? 'neutro']}`}>{c.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </figure>
  );
}
