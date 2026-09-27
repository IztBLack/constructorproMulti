import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getObra } from '@/lib/data/obras';
import { getOrden, listProveedores } from '@/lib/data/compras';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
import { construirOrdenCompraHtml } from '@/lib/compras/documento-orden-compra-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PDF de una ORDEN DE COMPRA para mandarla al proveedor (RF2.3).
 *
 * Se lee con la sesión del usuario: las policies de 0038 deciden. Quien no es
 * de oficina en esa empresa recibe `null` y aquí sale un 404, no un documento.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const apagado = await bloquearSiApagado('compras');
  if (apagado) return apagado;

  const { id } = await params;
  const orden = await getOrden(id);
  if (!orden) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });

  const [{ data: obra }, proveedores, nombreEmpresa, { pdf }] = await Promise.all([
    getObra(orden.obra_id),
    listProveedores(),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);
  const proveedor = proveedores.data.find((p) => p.id === orden.proveedor_id) ?? null;
  const html = construirOrdenCompraHtml({
    orden,
    proveedor,
    obra: { nombre: obra?.nombre ?? 'Obra', ubicacion: obra?.ubicacion ?? null },
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    const prov = (proveedor?.nombre ?? 'proveedor').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40);
    return pdfResponse(bytes, `OC-${orden.folio}_${prov}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
