import { ETIQUETA_SEMAFORO, type Semaforo } from '@/lib/rentabilidad/calculo';

const ESTILO: Record<Semaforo, { caja: string; punto: string }> = {
  verde: { caja: 'bg-green-100 text-green-800', punto: 'bg-green-600' },
  amarillo: { caja: 'bg-amber-100 text-amber-800', punto: 'bg-amber-500' },
  rojo: { caja: 'bg-red-100 text-red-800', punto: 'bg-red-600' },
  sin_datos: { caja: 'bg-neutral-100 text-neutral-700', punto: 'bg-neutral-400' },
};

/**
 * Semáforo de la utilidad (RF1.7). El color nunca va solo: siempre lleva el
 * texto ("En riesgo"), para quien no distingue colores y para el lector de
 * pantalla.
 */
export function SemaforoUtilidad({ semaforo }: { semaforo: Semaforo }) {
  const e = ESTILO[semaforo];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${e.caja}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${e.punto}`} />
      {ETIQUETA_SEMAFORO[semaforo]}
    </span>
  );
}

/** "12.5 %" o "—" cuando no hay contra qué calcular. */
export function formatoMargen(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return '—';
  return `${m.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
}
