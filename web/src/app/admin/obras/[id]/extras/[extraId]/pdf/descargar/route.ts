import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getObra } from '@/lib/data/obras';
import { getExtra, urlFotoExtra } from '@/lib/data/cambios';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
import { construirExtraHtml } from '@/lib/cambios/documento-extra-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PDF de un EXTRA, para mandarlo por WhatsApp (RF1.5).
 *
 * Se lee con la sesión del usuario: las policies de 0036 deciden. Quien no es
 * de oficina en esa empresa recibe `null` y aquí sale un 404, no un documento.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; extraId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  const apagado = await bloquearSiApagado('cambios');
  if (apagado) return apagado;

  const { id, extraId } = await params;
  const [{ data: obra, error }, { data: extra, error: errExtra }] = await Promise.all([
    getObra(id),
    getExtra(extraId),
  ]);

  if (error || errExtra) {
    return NextResponse.json({ error: `Error al cargar: ${error ?? errExtra}` }, { status: 500 });
  }
  if (!obra || !extra || extra.obra_id !== id) {
    return NextResponse.json({ error: 'Extra no encontrado.' }, { status: 404 });
  }

  const [nombreEmpresa, { pdf }, fotoUrl] = await Promise.all([
    getNombreEmpresa(),
    getEmpresaConfig(),
    urlFotoExtra(extra.foto_uri),
  ]);

  const html = construirExtraHtml({
    obra,
    extra,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
    fotoUrl,
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `extra-${extra.folio}_${obra.nombre.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
