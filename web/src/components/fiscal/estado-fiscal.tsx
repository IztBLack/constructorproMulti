import Link from 'next/link';
import { Badge, type BadgeTone } from '@/components/ui';
import type { EstadoFiscal, OrigenCobro } from '@/lib/fiscal/tipos';

const TEXTO: Record<EstadoFiscal, { texto: string; tono: BadgeTone }> = {
  por_facturar: { texto: 'Por facturar', tono: 'amber' },
  facturado: { texto: 'Facturado', tono: 'green' },
  no_requiere: { texto: 'Sin factura', tono: 'neutral' },
};

/** Etiqueta del estado fiscal de un cobro (texto + color, nunca solo color). */
export function EstadoFiscalBadge({ estado }: { estado: EstadoFiscal }) {
  const t = TEXTO[estado];
  return <Badge tone={t.tono}>{t.texto}</Badge>;
}

/** Enlace a la hoja de un cobro, con área táctil de 44 px. */
export function EnlaceHoja({ origen, id, texto = 'Hoja para facturar' }: { origen: OrigenCobro; id: string; texto?: string }) {
  return (
    <Link
      href={`/admin/facturacion/hoja/${origen}/${id}`}
      className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
    >
      {texto}
    </Link>
  );
}
