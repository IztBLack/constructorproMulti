import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getObra } from '@/lib/data/obras';
import { getVistaEstimacion } from '@/lib/data/estimaciones';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
import { construirEstimacionHtml } from '@/lib/estimaciones/documento-estimacion-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PDF de una ESTIMACIÓN con sus números generadores (RF3.6).
 *
 * Se lee con la sesión del usuario: las policies de 0039 deciden. Quien no es
 * de oficina en esa empresa recibe `null` y aquí sale un 404, no un documento.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; estId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const apagado = await bloquearSiApagado('estimaciones');
  if (apagado) return apagado;

  const { id, estId } = await params;
  const { data: obra, error } = await getObra(id);
  if (error) return NextResponse.json({ error: `Error al cargar: ${error}` }, { status: 500 });
  if (!obra) return NextResponse.json({ error: 'Obra no encontrada.' }, { status: 404 });

  const [{ data: vista, error: errV }, nombreEmpresa, { pdf }] = await Promise.all([
    getVistaEstimacion(id, estId, obra.nombre),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);
  if (errV) return NextResponse.json({ error: `Error al cargar: ${errV}` }, { status: 500 });
  if (!vista) return NextResponse.json({ error: 'Estimación no encontrada.' }, { status: 404 });

  const html = construirEstimacionHtml({
    obra,
    estimacion: vista.estimacion,
    foto: vista.foto,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    const nombre = obra.nombre.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40);
    return pdfResponse(bytes, `estimacion-${vista.estimacion.folio}_${nombre}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
