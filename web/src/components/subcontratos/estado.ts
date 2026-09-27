import type { BadgeTone } from '@/components/ui';
import { ESTADOS_SUBCONTRATO, type EstadoSubcontrato } from '@/lib/subcontratos/calculo';

/** Color de la insignia de cada estado del contrato (siempre con su palabra). */
export const TONO_ESTADO: Record<EstadoSubcontrato, BadgeTone> = {
  BORRADOR: 'neutral',
  FIRMADO: 'blue',
  TERMINADO: 'green',
  CANCELADO: 'red',
};

export const TEXTO_ESTADO = new Map<EstadoSubcontrato, string>(ESTADOS_SUBCONTRATO.map((e) => [e.valor, e.texto]));
