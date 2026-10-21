import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getObra } from '@/lib/data/obras';
import { getListaMaterial } from '@/lib/data/listas';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
import { construirListaHtml } from '@/lib/listas/documento-lista-html';
import { folioCorto } from '@/lib/pdf/documento-base';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PDF de una LISTA DE MATERIAL, para imprimir y palomear en obra.
 *
 * Los datos se leen con la sesión del usuario, así que las policies de 0050
 * deciden: quien no tenga un rol que vea listas recibe `null` y aquí sale un
 * 404, no un documento.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; listaId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  const apagado = await bloquearSiApagado('listas');
  if (apagado) return apagado;

  const { id, listaId } = await params;
  const [{ data: obra, error }, { data: lista, error: errorLista }] = await Promise.all([
    getObra(id),
    getListaMaterial(listaId),
  ]);

  if (error || errorLista) {
    return NextResponse.json({ error: `Error al cargar: ${error ?? errorLista}` }, { status: 500 });
  }
  if (!obra || !lista || lista.obra_id !== id) {
    return NextResponse.json({ error: 'Lista no encontrada.' }, { status: 404 });
  }

  const [nombreEmpresa, { pdf }] = await Promise.all([getNombreEmpresa(), getEmpresaConfig()]);
  const html = construirListaHtml({
    obraNombre: obra.nombre,
    lista,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
    conMarcas: request.nextUrl.searchParams.get('marcas') !== '0',
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `lista-material_${folioCorto(lista.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
