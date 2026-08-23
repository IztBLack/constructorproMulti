import { NextResponse, type NextRequest } from 'next/server';
import { getObra } from '@/lib/data/obras';
import { getNotaObra } from '@/lib/data/notas-obra';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
import { construirNotaObraHtml } from '@/lib/obra/documento-nota-html';
import { folioCorto } from '@/lib/pdf/documento-base';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PDF de una NOTA DE OBRA, para mandársela al socio por WhatsApp.
 *
 * Los datos se leen con la sesión del usuario, así que las policies de 0031
 * deciden: quien no tenga rol de oficina en esa empresa recibe `null` y aquí
 * sale un 404, no un documento.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; notaId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const { id, notaId } = await params;
  const [{ data: obra, error }, { data: nota, error: notaError }] = await Promise.all([
    getObra(id),
    getNotaObra(notaId),
  ]);

  if (error || notaError) {
    return NextResponse.json({ error: `Error al cargar: ${error ?? notaError}` }, { status: 500 });
  }
  if (!obra || !nota || nota.obra_id !== id) {
    return NextResponse.json({ error: 'Nota no encontrada.' }, { status: 404 });
  }

  const [nombreEmpresa, { pdf }] = await Promise.all([getNombreEmpresa(), getEmpresaConfig()]);

  const html = construirNotaObraHtml({
    obra,
    nota,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `nota_${folioCorto(nota.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
