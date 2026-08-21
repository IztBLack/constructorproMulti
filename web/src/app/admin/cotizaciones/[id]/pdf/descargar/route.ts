import { NextResponse, type NextRequest } from 'next/server';
import { getCotizacionConDetalle, calcularTotales } from '@/lib/data/cotizaciones';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirCotizacionDocumentoHtml } from '@/lib/cotizacion/documento-html';
import { folioCorto } from '@/lib/pdf/documento-base';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const { id } = await params;
  const { data: cotizacion, error } = await getCotizacionConDetalle(id);
  if (error) {
    return NextResponse.json({ error: `Error al cargar: ${error}` }, { status: 500 });
  }
  if (!cotizacion) {
    return NextResponse.json({ error: 'Cotización no encontrada.' }, { status: 404 });
  }

  const { data: empresaData } = await supabase
    .from('empresas')
    .select('nombre')
    .eq('id', cotizacion.empresa_id)
    .maybeSingle();
  const nombreEmpresa: string = empresaData?.nombre ?? 'Cimnova';
  const { pdf } = await getEmpresaConfig();
  const totales = calcularTotales(cotizacion);

  const html = construirCotizacionDocumentoHtml({ cotizacion, totales, nombreEmpresa, pdf });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `cotizacion_${folioCorto(cotizacion.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
