import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { createClient } from '@/lib/supabase/server';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';
import { htmlBitacoraPdf } from '../datos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PDF de BITÁCORA por periodo (RF4.5). Los datos se leen con la sesión del
 * usuario: las policies de 0041 deciden qué entra. `?cliente=1` = solo lo
 * publicado en el portal.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const apagado = await bloquearSiApagado('bitacora');
  if (apagado) return apagado;

  const { id } = await params;
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const r = await htmlBitacoraPdf(id, sp);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  try {
    const bytes = await renderHtmlToPdf(r.html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    const sufijo = r.paraCliente ? '_cliente' : '';
    return pdfResponse(
      bytes,
      `bitacora_${r.periodo.desdeInput}_${r.periodo.hastaInput}${sufijo}.pdf`,
      inline,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
