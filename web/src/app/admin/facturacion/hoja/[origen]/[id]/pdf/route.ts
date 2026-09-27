import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getAccesoFiscal, getEntradaHoja } from '@/lib/data/fiscal';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { formatCurrency, formatDate } from '@/lib/data/format';
import { armarHoja } from '@/lib/fiscal/hoja';
import { construirHojaHtml } from '@/lib/fiscal/documento-hoja-html';
import { esOrigenCobro } from '@/lib/fiscal/tipos';
import { folioCorto } from '@/lib/pdf/documento-base';
import { pdfResponse, renderHtmlToPdf } from '@/lib/pdf/render-html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** PDF de la hoja para facturar de un cobro (RF1b.4). Solo admin y contador. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ origen: string; id: string }> },
) {
  const apagado = await bloquearSiApagado('fiscal');
  if (apagado) return apagado;
  const acceso = await getAccesoFiscal();
  if (!acceso.puede) {
    return NextResponse.json({ error: 'Solo el administrador o el contador.' }, { status: 403 });
  }
  const { origen, id } = await params;
  if (!esOrigenCobro(origen)) return NextResponse.json({ error: 'Cobro no válido.' }, { status: 400 });

  const entrada = await getEntradaHoja(origen, id);
  if (!entrada) return NextResponse.json({ error: 'Cobro no encontrado.' }, { status: 404 });
  const hoja = armarHoja(entrada);
  const [nombreEmpresa, { pdf }] = await Promise.all([getNombreEmpresa(), getEmpresaConfig()]);
  const c = entrada.cobro;

  const html = construirHojaHtml({
    hoja,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    documento: `${origen === 'pago' ? 'Cotización' : 'Obra'}: ${c.documentoNombre}`,
    cobroTexto: `Cobro del ${formatDate(c.fecha)} por ${formatCurrency(c.monto)}`,
    pdf,
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `hoja-para-facturar_${folioCorto(c.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
