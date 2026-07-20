/// Vocabulario del pase de lista, compartido por las dos pantallas que lo usan:
/// la asistencia semanal por obra (`/admin/obras/[id]/asistencia`) y el pase de
/// lista unificado de campo (`/campo`).
///
/// Paridad con el `SegmentedButton` del móvil
/// (`lib/presentation/asistencia/pase_lista_screen.dart`).

export const OPCIONES: { valor: number; simbolo: string; etiqueta: string }[] = [
  { valor: 0, simbolo: '·', etiqueta: 'Falta' },
  { valor: 0.5, simbolo: '½', etiqueta: 'Medio' },
  { valor: 0.75, simbolo: '¾', etiqueta: 'Tres cuartos' },
  { valor: 1, simbolo: '1', etiqueta: 'Completo' },
];

export function etiquetaFraccion(f: number): string {
  if (f === 1) return '1';
  if (f === 0.75) return '¾';
  if (f === 0.5) return '½';
  return '·';
}

/** Solo los colaboradores por día llevan pase de lista; los de destajo se pagan
 *  por avance, no por asistencia. Misma regla que el móvil (`tipoPago == 'DIA'`). */
export const llevaPaseDeLista = (tipoPago: string) => tipoPago === 'DIA';

/** Formatea un total de jornadas sin decimales inútiles: 3 en vez de 3.00. */
export function formatoJornadas(total: number): string {
  return total.toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
}
