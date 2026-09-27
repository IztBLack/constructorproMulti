import { Badge } from '@/components/ui';
import type { EstadoPrestamo, Semaforo } from '@/lib/herramienta/herramienta';

const TONO: Record<Semaforo, 'green' | 'amber' | 'red' | 'neutral'> = {
  VERDE: 'green',
  AMARILLO: 'amber',
  ROJO: 'red',
  DEVUELTA: 'neutral',
};

const PALABRA: Record<Semaforo, string> = {
  VERDE: 'A tiempo',
  AMARILLO: 'Revisar',
  ROJO: 'Vencida',
  DEVUELTA: 'Devuelta',
};

/** Semáforo de un préstamo: el color siempre va con texto (accesibilidad). */
export function SemaforoPrestamo({ estado }: { estado: EstadoPrestamo }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={TONO[estado.semaforo]}>{PALABRA[estado.semaforo]}</Badge>
      <span className="text-xs text-neutral-600">{estado.texto}</span>
    </span>
  );
}
