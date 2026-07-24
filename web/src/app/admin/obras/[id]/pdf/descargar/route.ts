import { NextResponse, type NextRequest } from 'next/server';
import { getObra, listMovimientosByObra } from '@/lib/data/obras';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
import { getNotaCaja } from '@/lib/data/caja-nota';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
import { construirCajaDocumentoHtml } from '@/lib/obra/documento-caja-html';
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
  const [{ data: obra, error }, { data: partidas }, { data: movimientos }, notaCaja, nombreEmpresa, { pdf }] =
    await Promise.all([
      getObra(id),
      listPresupuestoObra(id),
      listMovimientosByObra(id),
      getNotaCaja(id),
      getNombreEmpresa(),
      getEmpresaConfig(),
    ]);

  if (error) {
    return NextResponse.json({ error: `Error al cargar: ${error}` }, { status: 500 });
  }
  if (!obra) {
    return NextResponse.json({ error: 'Obra no encontrada.' }, { status: 404 });
  }

  const html = construirCajaDocumentoHtml({
    obra,
    partidas,
    movimientos,
    notaCaja,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `estado-cuenta_${folioCorto(obra.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
