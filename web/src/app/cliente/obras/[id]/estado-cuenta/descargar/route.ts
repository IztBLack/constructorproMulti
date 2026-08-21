import { NextResponse, type NextRequest } from 'next/server';
import { getObraCliente, getEstadoCuentaObra } from '@/lib/data/portal-cliente';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { hoyMxMs } from '@/lib/data/tz';
import { createClient } from '@/lib/supabase/server';
import { construirEstadoCuentaClienteHtml } from '@/lib/cliente/documento-estado-cuenta-html';
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
  // getObraCliente ya aplica la RLS del cliente: si la obra no es suya, es null.
  const obra = await getObraCliente(id);
  if (!obra) {
    return NextResponse.json({ error: 'Obra no encontrada.' }, { status: 404 });
  }

  const [estado, nombreEmpresa, { pdf }] = await Promise.all([
    getEstadoCuentaObra(obra.id),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  const html = construirEstadoCuentaClienteHtml({
    obra,
    estado,
    nombreEmpresa: nombreEmpresa ?? 'Cimnova',
    pdf,
    hoy: hoyMxMs(),
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
