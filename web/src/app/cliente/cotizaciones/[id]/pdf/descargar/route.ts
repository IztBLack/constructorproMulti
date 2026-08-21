import { NextResponse, type NextRequest } from 'next/server';
import { calcularTotales, getCotizacionClienteConDetalle } from '@/lib/data/portal-cliente';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
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
  // getCotizacionClienteConDetalle aplica la RLS del cliente: null si no es suya.
  const cotizacion = await getCotizacionClienteConDetalle(id);
  if (!cotizacion) {
    return NextResponse.json({ error: 'Cotización no encontrada.' }, { status: 404 });
  }

  const [nombreEmpresa, { pdf }] = await Promise.all([getNombreEmpresa(), getEmpresaConfig()]);
  const totales = calcularTotales(cotizacion);

  const html = construirCotizacionDocumentoHtml({
    cotizacion,
    totales,
    nombreEmpresa: nombreEmpresa ?? 'Cimnova',
    pdf,
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `cotizacion_${folioCorto(cotizacion.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
