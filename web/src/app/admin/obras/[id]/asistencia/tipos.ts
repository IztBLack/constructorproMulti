/// Tipos y helpers compartidos por las dos vistas del pase de lista
/// (cuadrícula semanal y vista por día). Viven aparte para que `page.tsx`
/// (componente de servidor) pueda importarlos sin arrastrar código de cliente.

export interface DiaSemana {
  ms: number; // medianoche local del día (clave canónica)
  abbr: string; // Lun, Mar, …
  dia: number; // día del mes
  mes: number; // 1–12
}

/** Opciones de captura del pase de lista. Paridad con el `SegmentedButton` del
 *  móvil (`lib/presentation/asistencia/pase_lista_screen.dart`). */
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

export const cellKey = (colaboradorId: string, ms: number) => `${colaboradorId}|${ms}`;

/** Solo los colaboradores por día llevan pase de lista; los de destajo se pagan
 *  por avance, no por asistencia. Misma regla que el móvil (`tipoPago == 'DIA'`). */
export const llevaPaseDeLista = (tipoPago: string) => tipoPago === 'DIA';
