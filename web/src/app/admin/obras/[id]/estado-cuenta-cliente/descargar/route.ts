import { NextResponse, type NextRequest } from 'next/server';
import { getEstadoCuentaObraAdmin } from '@/lib/data/estado-cuenta-obra-admin';
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

/**
 * PDF del ESTADO DE CUENTA DEL CLIENTE generado desde OFICINA (admin), para
 * mandárselo a clientes NO registrados en el portal.
 *
 * Reusa el MISMO builder del documento del cliente
 * (`construirEstadoCuentaClienteHtml`) para heredar su garantía: SOLO ENTRADAS,
 * nunca salidas. Pero los datos vienen de `getEstadoCuentaObraAdmin`, que lee
 * con RLS de STAFF y filtra a `tipo='ENTRADA'` — NO de la vía del cliente, que
 * con RLS de cliente le devolvería vacío a un admin.
 */
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
  // El helper valida el acceso con getObra (RLS staff): si la obra no es de la
  // empresa del usuario, `obra` es null.
  const { obra, estado, error } = await getEstadoCuentaObraAdmin(id);
  if (error) {
    return NextResponse.json({ error: `Error al cargar: ${error}` }, { status: 500 });
  }
  if (!obra) {
    return NextResponse.json({ error: 'Obra no encontrada.' }, { status: 404 });
  }

  const [nombreEmpresa, { pdf }] = await Promise.all([
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  const html = construirEstadoCuentaClienteHtml({
    obra,
    estado,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
    hoy: hoyMxMs(),
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `estado-de-cuenta_${folioCorto(obra.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
