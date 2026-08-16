/// Clases compartidas por los controles a medida de la proyección.
///
/// Existen porque esta pantalla tiene MUCHOS controles que no son `<Button>`
/// del kit —las celdas de día, los encabezados de columna, el nombre de cada
/// persona, los chips— y todos ellos se quedaron sin estilo de foco. Quien
/// navega con teclado no tenía forma de saber dónde estaba parado.

/// El mismo anillo de foco que `components/ui/Button.tsx`.
///
/// `ring-neutral-900` se invierte con el tema (negro en claro, casi blanco en
/// oscuro), así que el anillo se ve en los dos. El `ring-offset-2` lo separa del
/// borde del propio control para que no se confunda con su estado.
export const FOCO =
  'outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2';

/// Deshabilitado, también igual que el kit: se ve apagado Y el cursor lo dice.
/// No basta con quitar el `onClick` — un control que parece tocable y no hace
/// nada es peor que uno que se ve apagado.
export const APAGADO = 'disabled:cursor-not-allowed disabled:opacity-50';
