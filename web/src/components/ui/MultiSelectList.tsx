'use client';

import { useId, useMemo, useState } from 'react';

export type OpcionMulti = { id: string; nombre: string };

/**
 * Quita acentos y pasa a minúsculas para buscar.
 *
 * Importa de verdad en este dominio: los nombres reales traen acentos ("Martín",
 * "Muñoz") y quien captura casi siempre teclea sin ellos. Sin normalizar, buscar
 * "martin" no encontraría a "Martín" y parecería que la persona no existe.
 */
// Construido con RegExp y escapes explícitos en vez de un literal /[..]/: el
// rango son marcas combinantes invisibles, y escritas tal cual en el fuente
// cualquier reformateo o copia/pega las puede corromper sin que se note.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g');

function normaliza(s: string): string {
  return s.normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
}

/**
 * Lista de casillas con buscador para elegir VARIOS elementos a la vez.
 *
 * Sustituye al patrón de `<select>` + botón que obligaba a repetir la operación
 * una vez por persona. "Seleccionar todos" opera sobre lo FILTRADO, no sobre el
 * catálogo completo: con el buscador puesto, lo que se ve es lo que se marca —
 * si actuara sobre todo, marcaría gente que el usuario ni siquiera tiene enfrente.
 */
export function MultiSelectList({
  opciones,
  seleccionados,
  onChange,
  etiqueta,
  buscarPlaceholder = 'Buscar…',
  vacioTexto = 'No hay opciones disponibles.',
  disabled = false,
  umbralBuscador = 8,
}: {
  opciones: OpcionMulti[];
  seleccionados: string[];
  onChange: (ids: string[]) => void;
  etiqueta: string;
  buscarPlaceholder?: string;
  vacioTexto?: string;
  disabled?: boolean;
  /** A partir de cuántas opciones aparece el buscador. */
  umbralBuscador?: number;
}) {
  const [busqueda, setBusqueda] = useState('');
  const groupId = useId();

  const marcados = useMemo(() => new Set(seleccionados), [seleccionados]);

  const filtradas = useMemo(() => {
    const q = normaliza(busqueda.trim());
    if (!q) return opciones;
    return opciones.filter((o) => normaliza(o.nombre).includes(q));
  }, [opciones, busqueda]);

  const idsFiltrados = filtradas.map((o) => o.id);
  const todosFiltradosMarcados =
    idsFiltrados.length > 0 && idsFiltrados.every((id) => marcados.has(id));

  function alternar(id: string) {
    const siguiente = new Set(marcados);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    onChange([...siguiente]);
  }

  function alternarTodosFiltrados() {
    const siguiente = new Set(marcados);
    if (todosFiltradosMarcados) idsFiltrados.forEach((id) => siguiente.delete(id));
    else idsFiltrados.forEach((id) => siguiente.add(id));
    onChange([...siguiente]);
  }

  if (opciones.length === 0) {
    return <p className="text-sm text-neutral-400">{vacioTexto}</p>;
  }

  return (
    <div className="space-y-2">
      {opciones.length >= umbralBuscador && (
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={buscarPlaceholder}
          disabled={disabled}
          aria-label={`Buscar en ${etiqueta}`}
          // `bg-white` explícito: ver la nota en Field.tsx sobre tema oscuro.
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
        />
      )}

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-neutral-500">
          {marcados.size > 0 ? `${marcados.size} seleccionado(s)` : 'Ninguno seleccionado'}
        </span>
        {idsFiltrados.length > 0 && (
          <button
            type="button"
            onClick={alternarTodosFiltrados}
            disabled={disabled}
            className="cursor-pointer rounded font-medium text-neutral-700 underline underline-offset-2 outline-none hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {todosFiltradosMarcados ? 'Quitar todos' : 'Seleccionar todos'}
            {busqueda.trim() ? ` (${idsFiltrados.length})` : ''}
          </button>
        )}
      </div>

      <div
        role="group"
        aria-labelledby={groupId}
        className="max-h-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white"
      >
        <span id={groupId} className="sr-only">
          {etiqueta}
        </span>
        {filtradas.length === 0 ? (
          <p className="px-3 py-3 text-sm text-neutral-400">Sin coincidencias.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {filtradas.map((o) => (
              <li key={o.id}>
                {/* min-h-11: área táctil mínima WCAG 2.5.8, igual que Button. */}
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                  <input
                    type="checkbox"
                    checked={marcados.has(o.id)}
                    onChange={() => alternar(o.id)}
                    disabled={disabled}
                    className="size-4 shrink-0 cursor-pointer accent-neutral-900"
                  />
                  <span className="text-sm text-neutral-800">{o.nombre}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
