import type { ReactNode } from 'react';

/**
 * Agrupa tarjetas de ajustes bajo un encabezado con nombre y explicación.
 *
 * POR QUÉ EXISTE: sin esto, Ajustes es una pila de tarjetas donde "tu nombre" y
 * "el nombre de la empresa" se ven exactamente igual, pese a que una solo te
 * afecta a ti y la otra la ven todos tus clientes. El agrupamiento es lo que
 * hace visible el modelo de círculos concéntricos (`lib/auth/secciones.ts`):
 * primero lo tuyo, luego lo del negocio.
 *
 * `alcance` es la etiqueta que responde la pregunta que el usuario se hace al
 * dudar: "¿esto a quién afecta?". Se prefiere decirlo con palabras y no solo con
 * color o posición, para no depender de la vista (`color-not-only`).
 */
export function GrupoAjustes({
  id,
  titulo,
  descripcion,
  alcance,
  children,
}: {
  /** Ancla para el índice lateral. */
  id: string;
  titulo: string;
  descripcion: string;
  /** A quién afecta lo de este grupo. Ej: "Solo a ti", "A toda la empresa". */
  alcance?: string;
  children: ReactNode;
}) {
  return (
    // `scroll-mt` evita que el encabezado quede debajo de la barra fija al
    // llegar desde el índice.
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-24">
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={`${id}-titulo`} className="text-lg font-semibold text-neutral-900">
            {titulo}
          </h2>
          {alcance && (
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              {alcance}
            </span>
          )}
        </div>
        <p className="mt-1 max-w-prose text-sm text-neutral-600">{descripcion}</p>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}
