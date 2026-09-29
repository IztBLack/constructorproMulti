import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getSubcontrato } from '@/lib/data/subcontratos';
import { getObra } from '@/lib/data/obras';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
import { construirSubcontratoHtml } from '@/lib/subcontratos/documento-subcontrato-html';
import { folioCorto } from '@/lib/pdf/documento-base';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PDF del contrato de subcontrato. Los datos se leen con la sesión del
 * usuario: la RLS de 0040 decide (admin, contador y supervisor lo ven; los
 * demás reciben 404).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const apagado = await bloquearSiApagado('subcontratos');
  if (apagado) return apagado;

  const { id } = await params;
  const { data: contrato, error } = await getSubcontrato(id);
  if (error) return NextResponse.json({ error: 'Error al cargar el contrato.' }, { status: 500 });
  if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado.' }, { status: 404 });

  const [{ data: obra }, nombreEmpresa, { pdf }] = await Promise.all([
    getObra(contrato.obra_id),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);
  const html = construirSubcontratoHtml({ contrato, obra, nombreEmpresa: nombreEmpresa ?? 'ConstructorPro', pdf });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `contrato_${folioCorto(contrato.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
