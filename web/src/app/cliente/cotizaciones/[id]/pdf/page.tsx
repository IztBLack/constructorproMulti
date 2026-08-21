import { notFound } from 'next/navigation';
import { calcularTotales, getCotizacionClienteConDetalle } from '@/lib/data/portal-cliente';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirCotizacionDocumentoHtml } from '@/lib/cotizacion/documento-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CotizacionClientePdfPage({ params }: Props) {
  const { id } = await params;

  const cotizacion = await getCotizacionClienteConDetalle(id);
  if (!cotizacion) notFound();

  const [nombreEmpresa, { pdf }] = await Promise.all([getNombreEmpresa(), getEmpresaConfig()]);
  const totales = calcularTotales(cotizacion);

  const html = construirCotizacionDocumentoHtml({
    cotizacion,
    totales,
    nombreEmpresa: nombreEmpresa ?? 'Cimnova',
    pdf,
  });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/cliente/cotizaciones/${cotizacion.id}`}
        descargarHref={`/cliente/cotizaciones/${cotizacion.id}/pdf/descargar`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
