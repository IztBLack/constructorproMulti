import type { BadgeTone } from '@/components/ui';
import type { TipoRenglon } from '@/lib/data/notas-obra-calculo';

/**
 * Cómo se ve cada tipo de renglón: su nombre, su color y el signo con el que
 * entra en la cuenta.
 *
 * Vive aparte porque lo usan dos pantallas —la lista de renglones y la vista
 * previa del mensaje pegado— y tienen que verse igual: un mismo renglón no
 * puede ser «Deducción» en ámbar en una y otra cosa en la otra.
 */

export const ETIQUETA_TIPO: Record<TipoRenglon, string> = {
  CONCEPTO: 'Concepto',
  DEDUCCION: 'Deducción',
  PAGO: 'Pago',
  TEXTO: 'Apunte',
};

export const TONO_TIPO: Record<TipoRenglon, BadgeTone> = {
  CONCEPTO: 'blue',
  DEDUCCION: 'amber',
  PAGO: 'green',
  TEXTO: 'neutral',
};

/** El signo con el que el renglón entra en la cuenta, para leerlo de un vistazo. */
export const SIGNO: Record<TipoRenglon, string> = {
  CONCEPTO: '',
  DEDUCCION: '−',
  PAGO: '−',
  TEXTO: '',
};
