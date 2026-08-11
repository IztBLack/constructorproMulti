import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Definición de una columna para {@link DataTable}.
 *
 * El mismo arreglo de columnas alimenta las DOS vistas: la tabla de escritorio
 * y las tarjetas de móvil. Así no se duplica el marcado ni los datos.
 */
export type DataColumn<T> = {
  /** Clave estable de la columna (para React keys). */
  key: string;
  /** Encabezado: título de columna en escritorio, etiqueta en la tarjeta móvil. */
  header: string;
  /** Contenido de la celda para una fila. */
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /**
   * Marca la columna "título" de la tarjeta en móvil (una por tabla). Si no se
   * indica ninguna, se usa la primera. En escritorio se resalta igual.
   */
  primary?: boolean;
};

type DataTableProps<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Si se pasa, cada fila (escritorio) y cada tarjeta (móvil) enlaza aquí. */
  href?: (row: T) => string;
  /** Texto para lectores de pantalla del enlace de fila (ej. "Ver obra Torre Norte"). */
  rowLabel?: (row: T) => string;
  /**
   * Props extra por fila (escritorio). Lo usa el ORDEN PERSONALIZADO para montar
   * los handlers de arrastrar-y-soltar sobre cada `<tr>`.
   */
  rowProps?: (row: T, index: number) => HTMLAttributes<HTMLTableRowElement>;
};

const stretchedLink =
  'absolute inset-0 rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900';

/**
 * Tabla responsive: `<table>` en escritorio (≥ md) y lista de tarjetas apiladas
 * en móvil (< md), a partir de una sola definición de columnas.
 *
 * Pensada para las vistas de CONSULTA del panel (listas de obras, clientes,
 * equipo…), donde en el teléfono se quiere leer, no capturar. Reutiliza el
 * patrón "stretched link" accesible de `Table.tsx` (RowLink): un solo tab-stop
 * por fila/tarjeta, con foco visible.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  href,
  rowLabel,
  rowProps,
}: DataTableProps<T>) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secundarias = columns.filter((c) => c !== primary);

  return (
    <>
      {/* Escritorio (≥ md): tabla */}
      <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 font-medium ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, fila) => {
              const extra = rowProps?.(row, fila) ?? {};
              const { className: extraClass = '', ...restoFila } = extra;
              return (
              <tr
                key={rowKey(row)}
                className={`relative border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${extraClass}`}
                {...restoFila}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''} ${
                      c === primary ? 'font-medium text-neutral-900' : 'text-neutral-600'
                    }`}
                  >
                    {href && i === 0 && (
                      <Link href={href(row)} className={stretchedLink}>
                        <span className="sr-only">{rowLabel ? rowLabel(row) : 'Ver detalle'}</span>
                      </Link>
                    )}
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Móvil (< md): tarjetas */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className="relative rounded-xl border border-neutral-200 bg-white p-4"
          >
            {href && (
              <Link href={href(row)} className={stretchedLink}>
                <span className="sr-only">{rowLabel ? rowLabel(row) : 'Ver detalle'}</span>
              </Link>
            )}
            <div className="font-medium text-neutral-900">{primary.cell(row)}</div>
            <dl className="mt-3 space-y-1.5">
              {secundarias.map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="shrink-0 text-neutral-500">{c.header}</dt>
                  <dd className="text-right text-neutral-700">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
