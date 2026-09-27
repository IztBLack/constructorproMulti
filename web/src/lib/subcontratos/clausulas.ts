/**
 * CLÁUSULAS BASE del contrato de subcontrato (RF5.8).
 *
 * Son GENÉRICAS a propósito: sirven de punto de partida para que un trato de
 * palabra quede por escrito, no de asesoría legal. Por eso el PDF y el editor
 * llevan siempre `LEYENDA_LEGAL`.
 *
 * Dos niveles, igual que el párrafo final (0032):
 *   1. `subcontrato.clausulas` → el texto que el dueño editó para ESE contrato.
 *   2. Estas cláusulas base, armadas con los datos del contrato.
 * En cuanto alguien escribe las suyas, manda su texto literal (sin plantillas).
 *
 * Módulo puro: lo usan el editor (para proponer el texto) y el PDF.
 */

import { formatCurrency } from '@/lib/data/format';

export const LEYENDA_LEGAL =
  'Modelo de contrato genérico generado con ConstructorPro. No sustituye la asesoría de un abogado o de un contador: revísenlo antes de firmar y ajústenlo a su caso.';

export interface ContextoClausulas {
  contratante: string;
  subcontratista: string;
  obra: string;
  ubicacion: string;
  montoContratado: number;
  retencionPct: number;
  formaPago: string;
}

/** Tope de largo (igual que la columna en 0040). */
export const LARGO_MAXIMO_CLAUSULAS = 20000;

export function clausulasBase(c: ContextoClausulas): string {
  const contratante = c.contratante.trim() || 'EL CONTRATANTE';
  const sub = c.subcontratista.trim() || 'EL SUBCONTRATISTA';
  const lugar = c.ubicacion.trim() ? `, ubicada en ${c.ubicacion.trim()}` : '';
  const forma = c.formaPago.trim() || 'contra avance de los trabajos, previa revisión de lo ejecutado';
  const retencion =
    c.retencionPct > 0
      ? `De cada pago se retendrá el ${c.retencionPct}% como fondo de garantía. Lo retenido se devolverá sin intereses al terminar los trabajos, una vez recibidos a satisfacción y corregidos los defectos que se hayan señalado.`
      : 'Las partes acuerdan no aplicar retención por fondo de garantía.';

  return [
    `PRIMERA. OBJETO. ${sub} se obliga a ejecutar para ${contratante} los trabajos descritos en el alcance de este contrato, en la obra «${c.obra}»${lugar}, con su propio personal, herramienta y dirección técnica.`,
    `SEGUNDA. MONTO. El monto de los trabajos es de ${formatCurrency(c.montoContratado)} (pesos mexicanos). Cualquier trabajo adicional o cambio se acordará por escrito antes de ejecutarse; sin ese acuerdo no se pagará como extra.`,
    `TERCERA. FORMA DE PAGO. ${forma}.`,
    `CUARTA. FONDO DE GARANTÍA. ${retencion}`,
    `QUINTA. PLAZO. Los trabajos se ejecutarán en las fechas indicadas en este contrato. Los retrasos por causas ajenas a ${sub} (lluvia, falta de frente de trabajo, cambios del proyecto) se anotarán para ajustar el plazo.`,
    `SEXTA. PERSONAL Y SEGURIDAD SOCIAL. ${sub} es el único patrón del personal que emplee y responde por sus salarios, prestaciones y obligaciones ante el IMSS, el Infonavit y el SAT. Si presta servicios u obras especializadas, entregará su registro REPSE vigente y, cuando se le pida, sus opiniones de cumplimiento y los acuses de sus informativas (ICSOE y SISUB).`,
    `SÉPTIMA. SEGURIDAD EN LA OBRA. ${sub} dotará a su personal del equipo de protección necesario y seguirá las indicaciones de seguridad de la obra.`,
    `OCTAVA. CALIDAD. Los trabajos se harán conforme al proyecto, a las indicaciones de la supervisión y a las buenas prácticas de construcción. Lo que no cumpla se corregirá a cargo de ${sub}.`,
    'NOVENA. TERMINACIÓN ANTICIPADA. Cualquiera de las partes puede dar por terminado este contrato avisando por escrito. Se pagará lo ejecutado y recibido hasta esa fecha, descontando lo que corresponda al fondo de garantía y a los defectos pendientes.',
    'DÉCIMA. CONTROVERSIAS. Las partes procurarán resolver sus diferencias de común acuerdo. De no lograrlo, se someten a las leyes y tribunales competentes del lugar de la obra.',
  ].join('\n\n');
}

/** Las cláusulas que se imprimen: las del contrato si las hay, si no las base. */
export function resolverClausulas(propias: string | null | undefined, ctx: ContextoClausulas): string {
  if (typeof propias === 'string' && propias.trim() !== '') return propias.trim();
  return clausulasBase(ctx);
}
