/// Tipos y helpers de la asistencia semanal por obra. Viven aparte para que
/// `page.tsx` (componente de servidor) pueda importarlos sin arrastrar código
/// de cliente.
///
/// El vocabulario del pase de lista (opciones · ½ ¾ 1, etc.) vive en
/// `@/lib/asistencia/fracciones` porque lo comparte con la pantalla de campo
/// (`/campo`); se reexporta aquí para no tocar los imports existentes.

export {
  OPCIONES,
  etiquetaFraccion,
  llevaPaseDeLista,
  formatoJornadas,
} from '@/lib/asistencia/fracciones';

export interface DiaSemana {
  ms: number; // medianoche local del día (clave canónica)
  abbr: string; // Lun, Mar, …
  dia: number; // día del mes
  mes: number; // 1–12
}

export const cellKey = (colaboradorId: string, ms: number) => `${colaboradorId}|${ms}`;
