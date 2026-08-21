import { notFound } from 'next/navigation';
import { calcularTotales, getCotizacionConDetalle } from '@/lib/data/cotizaciones';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirCotizacionDocumentoHtml } from '@/lib/cotizacion/documento-html';
import { DocumentShell } from '@/components/pdf/document-shell';
import { DocumentActions } from '@/components/pdf/document-actions';
import { PreviewFrame } from '@/components/pdf/preview-frame';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CotizacionPdfPage({ params }: Props) {
  const { id } = await params;

  const { data: cotizacion, error } = await getCotizacionConDetalle(id);

  if (error) {
    return (
      <div className="p-8 text-sm text-red-700">No se pudo cargar la cotización: {error}</div>
    );
  }

  if (!cotizacion) notFound();

  const supabase = await createClient();
  const { data: empresaData } = await supabase
    .from('empresas')
    .select('nombre')
    .eq('id', cotizacion.empresa_id)
    .maybeSingle();

  const nombreEmpresa: string = empresaData?.nombre ?? 'Cimnova';
  const { pdf } = await getEmpresaConfig();
  const totales = calcularTotales(cotizacion);

  // El MISMO HTML alimenta el preview (iframe) y el PDF (ruta /descargar).
  const html = construirCotizacionDocumentoHtml({ cotizacion, totales, nombreEmpresa, pdf });

  return (
    <DocumentShell>
      <DocumentActions
        volverHref={`/admin/cotizaciones/${cotizacion.id}`}
        descargarHref={`/admin/cotizaciones/${cotizacion.id}/pdf/descargar`}
      />
      <PreviewFrame html={html} />
    </DocumentShell>
  );
}
