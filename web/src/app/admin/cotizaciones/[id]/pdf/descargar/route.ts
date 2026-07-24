import { NextResponse, type NextRequest } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { getCotizacionConDetalle, calcularTotales } from '@/lib/data/cotizaciones';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { construirCotizacionDocumentoHtml } from '@/lib/cotizacion/documento-html';

// Genera el PDF con Chromium headless: es la ÚNICA forma de que el archivo salga
// con texto vectorial seleccionable y, a la vez, idéntico al preview (renderiza
// el MISMO HTML que el preview muestra en su iframe).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function folioCorto(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  // ── Datos (mismos que el preview) ────────────────────────────────────────
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
  const nombreEmpresa: string = empresaData?.nombre ?? 'ConstructorPro';
  const { pdf } = await getEmpresaConfig();
  const totales = calcularTotales(cotizacion);

  const html = construirCotizacionDocumentoHtml({ cotizacion, totales, nombreEmpresa, pdf });

  // ── Render a PDF ─────────────────────────────────────────────────────────
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    // El HTML es autocontenido (sin recursos externos), así que 'load' basta.
    await page.setContent(html, { waitUntil: 'load' });
    const bytes = await page.pdf({
      printBackground: true,
      // Toma el tamaño y márgenes del `@page` del documento (Letter): así el PDF
      // respeta exactamente el diseño y los `break-inside: avoid` mantienen cada
      // sección entera entre hojas.
      preferCSSPageSize: true,
    });

    const folio = folioCorto(cotizacion.id);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="cotizacion_${folio}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
