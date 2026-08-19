import { NextResponse, type NextRequest } from 'next/server';
import { getObra } from '@/lib/data/obras';
import {
  calcularNomina,
  listAsistenciasObraRango,
  listColaboradoresActivosObra,
  listDestajosObraRango,
  listPuestosLite,
  semanaDe,
} from '@/lib/data/nomina';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { puedeVerSueldos } from '@/lib/auth/sueldos';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { createClient } from '@/lib/supabase/server';
import { construirNominaDocumentoHtml } from '@/lib/obra/documento-nomina-html';
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

  // Misma puerta que `/admin/proyeccion/pdf`: este documento lleva el sueldo de
  // cada persona, así que no basta con estar autenticado. Faltaba hasta agosto
  // de 2026 — la pantalla y el PDF enseñan el mismo dato y tenían permisos
  // distintos, así que bastaba conocer la URL para saltarse la pantalla.
  const { rol } = await getEmpresaUsuario();
  if (!puedeVerSueldos(rol)) {
    return NextResponse.json({ error: 'Sin permiso.' }, { status: 403 });
  }

  const { id } = await params;
  const { data: obra, error } = await getObra(id);
  if (error) {
    return NextResponse.json({ error: `Error al cargar: ${error}` }, { status: 500 });
  }
  if (!obra) {
    return NextResponse.json({ error: 'Obra no encontrada.' }, { status: 404 });
  }

  const inicioParam = request.nextUrl.searchParams.get('inicio');
  const ancla = inicioParam ? new Date(Number(inicioParam)) : new Date();
  const { inicioMs, finMs } = semanaDe(ancla);

  const [
    { data: colaboradores },
    { data: asistencias },
    { data: destajos },
    { data: puestos },
    nombreEmpresa,
    { pdf },
  ] = await Promise.all([
    listColaboradoresActivosObra(id, inicioMs),
    listAsistenciasObraRango(id, inicioMs, finMs),
    listDestajosObraRango(id, inicioMs, finMs),
    listPuestosLite(),
    getNombreEmpresa(),
    getEmpresaConfig(),
  ]);

  const summary = calcularNomina({ colaboradores, asistencias, destajos, puestos });
  const html = construirNominaDocumentoHtml({
    obra,
    summary,
    inicioMs,
    finMs,
    nombreEmpresa: nombreEmpresa ?? 'ConstructorPro',
    pdf,
  });

  try {
    const bytes = await renderHtmlToPdf(html);
    const inline = request.nextUrl.searchParams.get('disp') === 'inline';
    return pdfResponse(bytes, `nomina_${folioCorto(obra.id)}.pdf`, inline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al generar el PDF.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
