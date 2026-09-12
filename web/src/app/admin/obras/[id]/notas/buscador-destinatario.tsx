'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui';

export interface ColaboradorLite {
  id: string;
  nombre: string;
}

/**
 * Compara ignorando mayúsculas y acentos, igual que la paleta de comandos y el
 * buscador de movimientos: `ramirez` tiene que encontrar «Ramírez». Sin esto el
 * campo obliga a teclear los acentos, que es justo la fricción que venía a
 * quitar.
 *
 * `\u0300-\u036f` es el rango de marcas diacríticas combinantes, escrito con
 * escapes y no con los caracteres literales, que son invisibles en el código.
 */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Parte el nombre en los tres trozos que rodean a la coincidencia, para resaltarla. */
function resaltar(nombre: string, consulta: string): [string, string, string] {
  if (!consulta) return [nombre, '', ''];
  const i = normalizar(nombre).indexOf(normalizar(consulta));
  if (i < 0) return [nombre, '', ''];
  return [nombre.slice(0, i), nombre.slice(i, i + consulta.length), nombre.slice(i + consulta.length)];
}

const MAX_SUGERENCIAS = 6;

/**
 * El campo «A nombre de» de una nota: se escribe libre y va sugiriendo gente del
 * padrón conforme se teclea.
 *
 * POR QUÉ UN SOLO CAMPO Y NO DOS
 * ──────────────────────────────
 * Antes había un texto libre y, aparte, un select «Ligada a» para apuntar al
 * padrón. Decían casi lo mismo y ligar quedaba como un paso suelto que se
 * olvidaba. Aquí elegir una sugerencia guarda el nombre Y el `colaborador_id`;
 * seguir escribiendo lo desliga. El texto libre sigue mandando porque el socio
 * de un trato de palabra normalmente NO está dado de alta —y forzar el alta para
 * poder apuntarle su nota es justo lo que esta pantalla vino a evitar.
 *
 * Ligar no le da acceso a nadie: las policies de 0031 solo dejan leer notas a
 * admin, supervisor y contador. Hoy `colaborador_id` es un puntero al padrón,
 * nada más.
 *
 * No usa <Field> a propósito: mete su propio <label>, porque envolver un
 * listbox dentro de un <label> hace que cada clic en una sugerencia rebote al
 * input y los lectores de pantalla lean la lista entera como nombre del campo.
 */
export default function BuscadorDestinatario({
  valor,
  colaboradorId,
  colaboradores,
  onChange,
  disabled = false,
  autoFocus = false,
  label = 'A nombre de',
}: {
  valor: string;
  colaboradorId: string;
  colaboradores: ColaboradorLite[];
  onChange: (destinatario: string, colaboradorId: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const id = useId();
  const listaId = `${id}-lista`;
  const [abierto, setAbierto] = useState(false);
  const [sel, setSel] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const consulta = valor.trim();

  const sugerencias = useMemo(() => {
    const q = normalizar(consulta);
    const hits = q === '' ? colaboradores : colaboradores.filter((c) => normalizar(c.nombre).includes(q));
    return hits.slice(0, MAX_SUGERENCIAS);
  }, [colaboradores, consulta]);

  // La única sugerencia que se lee igual que lo escrito ES la persona ligada:
  // sugerirla otra vez sería ofrecer lo que ya está puesto.
  const yaElegida =
    sugerencias.length === 1 && normalizar(sugerencias[0].nombre) === normalizar(consulta);
  const visibles = yaElegida ? [] : sugerencias;

  const ligado = colaboradorId ? colaboradores.find((c) => c.id === colaboradorId) : undefined;

  function abrir() {
    setSel(0);
    setAbierto(true);
  }

  function elegir(c: ColaboradorLite) {
    onChange(c.nombre, c.id);
    setAbierto(false);
  }

  function escribir(texto: string) {
    // Escribir a mano desliga: el nombre y la persona del padrón dejan de ser el
    // mismo dato en cuanto uno de los dos cambia.
    onChange(texto, '');
    setSel(0);
    setAbierto(true);
  }

  function teclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setAbierto(false);
      return;
    }
    if (!abierto || visibles.length === 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => (s + 1) % visibles.length);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => (s - 1 + visibles.length) % visibles.length);
    }
    if (e.key === 'Enter') {
      // Enter solo captura cuando hay una sugerencia marcada; si no, deja pasar
      // el nombre libre tal cual se escribió.
      e.preventDefault();
      const c = visibles[sel];
      if (c) elegir(c);
    }
  }

  return (
    <div
      ref={contenedor}
      className="relative"
      onBlur={(e) => {
        // Solo se cierra si el foco salió del componente entero: pasar del input
        // a una sugerencia es moverse DENTRO del control, no abandonarlo.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>

      <Input
        id={id}
        className="mt-1"
        value={valor}
        onChange={(e) => escribir(e.target.value)}
        onFocus={abrir}
        onKeyDown={teclear}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Ej. Orlando Ramoz"
        role="combobox"
        aria-expanded={abierto && visibles.length > 0}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={
          abierto && visibles[sel] ? `${listaId}-${visibles[sel].id}` : undefined
        }
      />

      {abierto && visibles.length > 0 && (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Gente del equipo"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-1 shadow-lg"
        >
          {visibles.map((c, i) => {
            const [antes, medio, despues] = resaltar(c.nombre, consulta);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  id={`${listaId}-${c.id}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => elegir(c)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                    i === sel ? 'bg-blue-50 text-neutral-900' : 'text-neutral-700'
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {antes}
                    <span className="font-semibold text-blue-700">{medio}</span>
                    {despues}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">del equipo</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-1 text-xs text-neutral-500">
        {ligado
          ? `Ligada a ${ligado.nombre}, del equipo.`
          : consulta
            ? 'Nombre libre: no necesita estar dado de alta.'
            : 'Opcional. Si lo dejas vacío, la nota queda «por completar».'}
      </p>
    </div>
  );
}
