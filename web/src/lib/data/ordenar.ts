import { baseDe, esInvertido, type OrdenModo } from './orden-modos';

/**
 * Aplica el modo de orden a una lista ya entregada por el servidor en
 * (`orden`, natural). Espeja `ordenarPorModo` del móvil
 * (`lib/presentation/common/orden_modo_toggle.dart`) para que ambas plataformas
 * muestren exactamente la misma secuencia.
 *
 * Cada criterio se resuelve en su sentido NATURAL y, si el modo está invertido
 * (`…_desc`), se voltea al final. Así "invertir" significa siempre lo mismo y no
 * hay que duplicar la lógica de cada criterio.
 *
 * - `nombre`       → alfabético (A→Z).
 * - `recientes`    → created_at desc (más nuevos primero).
 * - `modificados`  → updated_at desc (editados al último primero).
 * - `personalizado`→ tal cual viene (posición manual arrastrada).
 */
export function ordenarPorModo<T>(
  items: T[],
  modo: OrdenModo,
  campos: {
    nombre: (item: T) => string;
    creado?: (item: T) => number | null | undefined;
    modificado?: (item: T) => number | null | undefined;
  },
): T[] {
  const num = (v: number | null | undefined) => v ?? 0;
  let base: T[];

  switch (baseDe(modo)) {
    case 'personalizado':
      base = items;
      break;
    case 'recientes':
      base = campos.creado
        ? [...items].sort((a, b) => num(campos.creado!(b)) - num(campos.creado!(a)))
        : items;
      break;
    case 'modificados':
      base = campos.modificado
        ? [...items].sort((a, b) => num(campos.modificado!(b)) - num(campos.modificado!(a)))
        : items;
      break;
    default:
      base = [...items].sort((a, b) => campos.nombre(a).localeCompare(campos.nombre(b)));
  }

  return esInvertido(modo) ? [...base].reverse() : base;
}
