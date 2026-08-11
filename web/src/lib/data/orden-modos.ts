/**
 * Modos de orden (estilo Spotify) — módulo PURO, sin dependencias de servidor.
 *
 * Vive aparte de `empresa-config.ts` a propósito: ese módulo importa el cliente
 * Supabase de servidor (`next/headers`), y los componentes cliente que necesitan
 * las etiquetas o la lista de modos no pueden arrastrar eso al bundle del
 * navegador. Aquí solo hay tipos y constantes, así que lo puede importar
 * cualquiera de los dos lados.
 *
 * MODELO: cada criterio ([OrdenBase]) tiene una dirección natural y su inversa.
 * El menú muestra CUATRO opciones; volver a elegir la activa invierte el sentido
 * (como Spotify). Se guarda como una sola cadena — `nombre`, `nombre_desc`… —
 * que viaja tal cual en el jsonb `empresa_config.ui_orden` y que el móvil lee
 * con las mismas reglas (`lib/data/orden_personalizado.dart`).
 */
export type OrdenBase = 'nombre' | 'recientes' | 'modificados' | 'personalizado';

export type OrdenModo = OrdenBase | `${OrdenBase}_desc`;

/** Criterios que ofrece el menú, en orden de aparición. */
export const ORDEN_BASES: OrdenBase[] = [
  'nombre',
  'recientes',
  'modificados',
  'personalizado',
];

/** Todos los valores válidos (criterio + criterio invertido). */
export const ORDEN_MODOS: OrdenModo[] = ORDEN_BASES.flatMap(
  (b) => [b, `${b}_desc`] as OrdenModo[],
);

export const ORDEN_BASE_LABEL: Record<OrdenBase, string> = {
  nombre: 'Por nombre',
  recientes: 'Agregados recientes',
  modificados: 'Últimos modificados',
  personalizado: 'Orden personalizado',
};

/**
 * Cómo se lee cada sentido. Se nombra el RESULTADO, no "asc/desc": lo que el
 * usuario quiere saber es qué queda arriba de la lista.
 */
export const ORDEN_DIRECCION_LABEL: Record<OrdenBase, [string, string]> = {
  //                          [natural,                 invertido]
  nombre: ['A → Z', 'Z → A'],
  recientes: ['Más nuevos primero', 'Más antiguos primero'],
  modificados: ['Editados al último', 'Editados hace más'],
  personalizado: ['Arriba → abajo', 'Abajo → arriba'],
};

/** Criterio de un modo, ignorando el sentido. */
export function baseDe(m: OrdenModo): OrdenBase {
  return m.endsWith('_desc') ? (m.slice(0, -5) as OrdenBase) : (m as OrdenBase);
}

/** True si el modo va en sentido inverso al natural de su criterio. */
export function esInvertido(m: OrdenModo): boolean {
  return m.endsWith('_desc');
}

export function componer(base: OrdenBase, invertido: boolean): OrdenModo {
  return (invertido ? `${base}_desc` : base) as OrdenModo;
}

/**
 * Qué modo aplicar al tocar [base] estando en [actual]: si es el criterio que ya
 * está activo, invierte el sentido; si es otro, entra en su sentido natural.
 */
export function alternar(actual: OrdenModo, base: OrdenBase): OrdenModo {
  if (baseDe(actual) !== base) return base;
  return componer(base, !esInvertido(actual));
}

/** Etiqueta completa del modo activo (la que muestra el botón). */
export function etiquetaModo(m: OrdenModo): string {
  const base = baseDe(m);
  const [natural, invertido] = ORDEN_DIRECCION_LABEL[base];
  return `${ORDEN_BASE_LABEL[base]} · ${esInvertido(m) ? invertido : natural}`;
}

/** True si el modo respeta la posición manual (`orden`), en cualquier sentido. */
export function esModoPersonalizado(m: OrdenModo): boolean {
  return baseDe(m) === 'personalizado';
}

/** Normaliza un valor crudo del jsonb a un modo válido (default: nombre). */
export function leerModo(crudo: unknown): OrdenModo {
  return ORDEN_MODOS.includes(crudo as OrdenModo) ? (crudo as OrdenModo) : 'nombre';
}
