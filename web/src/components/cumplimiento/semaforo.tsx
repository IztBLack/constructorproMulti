import { Badge, type BadgeTone } from '@/components/ui';
import type { NivelSemaforo } from '@/lib/cumplimiento/avisos';
import { ENLACES, type ClaveEnlace } from '@/lib/cumplimiento/enlaces';

const TONO: Record<NivelSemaforo, BadgeTone> = {
  VIGENTE: 'green',
  PRONTO: 'amber',
  URGENTE: 'red',
  VENCIDO: 'red',
  SIN_FECHA: 'neutral',
};

/** Nombre corto de cada luz. El color nunca va solo: siempre con palabra. */
const PALABRA: Record<NivelSemaforo, string> = {
  VIGENTE: 'Al día',
  PRONTO: 'Pronto',
  URGENTE: 'Urgente',
  VENCIDO: 'Vencido',
  SIN_FECHA: 'Sin fecha',
};

export function Semaforo({ nivel, texto }: { nivel: NivelSemaforo; texto?: string }) {
  return (
    <Badge tone={TONO[nivel]} title={texto}>
      {PALABRA[nivel]}
    </Badge>
  );
}

/**
 * Enlace a un sitio oficial. Abre en otra pestaña, sin mandar la página de
 * origen (`noreferrer`): la URL de la app no le dice nada al sitio de gobierno.
 */
export function EnlaceOficial({ clave, compacto = false }: { clave: ClaveEnlace; compacto?: boolean }) {
  const e = ENLACES[clave];
  return (
    <span className="block">
      <a
        href={e.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
      >
        {e.texto}
        <span className="sr-only"> (abre el sitio oficial en otra pestaña)</span>
        <span aria-hidden="true">&nbsp;↗</span>
      </a>
      {!compacto && <span className="block text-xs text-neutral-500">{e.ayuda}</span>}
    </span>
  );
}
