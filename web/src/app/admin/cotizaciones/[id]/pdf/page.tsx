import { notFound } from 'next/navigation';
import Link from 'next/link';
import { calcularTotales, getCotizacionConDetalle } from '@/lib/data/cotizaciones';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirCotizacionDocumentoHtml } from '@/lib/cotizacion/documento-html';
import { PreviewFrame } from './preview-frame';

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

  const nombreEmpresa: string = empresaData?.nombre ?? 'ConstructorPro';
  const { pdf } = await getEmpresaConfig();
  const totales = calcularTotales(cotizacion);

  // El MISMO HTML alimenta el preview (iframe) y el PDF (ruta /descargar), así que
  // lo que se ve aquí es idéntico a lo que se descarga o imprime.
  const html = construirCotizacionDocumentoHtml({ cotizacion, totales, nombreEmpresa, pdf });
  const descargar = `/admin/cotizaciones/${cotizacion.id}/pdf/descargar`;

  return (
    // `tema-papel` deja esta vista fuera del tema oscuro: es un documento.
    <div className="tema-papel min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-[880px] space-y-5 px-4 py-6">
        {/* Barra de acciones */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/cotizaciones/${cotizacion.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            ← Volver
          </Link>

          <div className="flex-1" />

          {/* Descarga directa: el navegador guarda el .pdf (Content-Disposition attachment). */}
          <a
            href={descargar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Descargar PDF
          </a>

          {/* Abre el mismo PDF en una pestaña, listo para imprimir desde el visor. */}
          <a
            href={`${descargar}?disp=inline`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Imprimir
          </a>
        </div>

        <PreviewFrame html={html} />
      </div>
    </div>
  );
}
