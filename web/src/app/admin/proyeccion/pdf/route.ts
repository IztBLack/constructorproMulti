/// PDF de la proyección.
///
/// Es POST y no GET —al revés que los demás PDF de la app— porque el escenario
/// vive en el cliente y no está guardado en ninguna tabla: no hay un id que el
/// servidor pueda ir a buscar. El cliente manda el escenario y el servidor
/// **vuelve a calcular** con `calcularProyeccion`; no acepta cifras ya sumadas.
/// Así el PDF no puede decir un número distinto al de la pantalla ni al de la
/// nómina real, aunque alguien manipule la petición.

import { NextResponse, type NextRequest } from 'next/server';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { getEmpresaConfig } from '@/lib/data/empresa-config';
import { navegarSemana } from '@/lib/data/nomina';
import {
  calcularProyeccion,
  fechaDelDia,
  participantesDeObra,
  obraBaseEfectiva,
  plazasComoColaboradores,
} from '@/lib/data/proyeccion-nomina';
import { deserializarEscenario } from '@/lib/data/proyeccion-contrato';
import { vistaRedondeada } from '@/lib/data/redondeo';
import { cargarDatosProyeccion } from '@/lib/data/proyeccion-nomina-server';
import { puedeVerSueldos } from '@/lib/auth/sueldos';
import { construirProyeccionDocumentoHtml } from '@/lib/nomina/documento-proyeccion-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';
import { createClient } from '@/lib/supabase/server';
import { partesTz } from '@/lib/data/tz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;


function rangoTexto(lunesMs: number): string {
  const l = partesTz(lunesMs);
  const d = partesTz(fechaDelDia(lunesMs, 6));
  return `${l.day}/${l.month}/${l.year} al ${d.day}/${d.month}/${d.year}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  // Misma puerta que la pantalla: este documento lleva el salario de cada
  // persona, así que no basta con estar autenticado.
  const { rol } = await getEmpresaUsuario();
  if (!puedeVerSueldos(rol)) {
    return NextResponse.json({ error: 'Sin permiso.' }, { status: 403 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const payload = cuerpo as { estado?: unknown; obraFiltro?: unknown };
  // Un solo lector, el mismo que abre las proyecciones guardadas: tolerante a
  // llaves faltantes y a valores mal tipados, y probado contra el fixture que
  // comparten las dos plataformas. El lector a mano que vivía aquí se quedó sin
  // `plazas`, `sueldoOverride` ni `redondeo` cuando aparecieron, y un `as` lo
  // dejó compilar en silencio: el papel salía sin las plazas y sin redondear.
  const estado = deserializarEscenario(payload.estado);
  if (!Number.isFinite(estado.lunesMs) || estado.lunesMs <= 0) {
    return NextResponse.json({ error: 'Escenario inválido.' }, { status: 400 });
  }
  const obraFiltro =
    typeof payload.obraFiltro === 'string' && payload.obraFiltro ? payload.obraFiltro : null;

  const { inicioMs, finMs } = navegarSemana(estado.lunesMs, 0);
  const datos = await cargarDatosProyeccion(inicioMs, finMs);
  if (datos.error) {
    return NextResponse.json({ error: datos.error }, { status: 500 });
  }

  const obraDe = obraBaseEfectiva(estado, datos.obraPorColaborador);
  const resultado = calcularProyeccion({
    estado: {
      ...estado,
      participantes: participantesDeObra(estado, obraDe, obraFiltro),
    },
    // Las plazas van disfrazadas de colaborador, igual que en la pantalla: sin
    // esto el papel no las imprime y su costo desaparece del total.
    colaboradores: [...datos.colaboradores, ...plazasComoColaboradores(estado)],
    puestos: datos.puestos,
    asistenciasReales: datos.asistencias,
    destajosReales: datos.destajos,
    cuadrillaPorColaborador: datos.cuadrillaPorColaborador,
    obraPorColaborador: obraDe,
    obraFiltro,
  });

  const [empresa, config] = await Promise.all([getNombreEmpresa(), getEmpresaConfig()]);
  const moneda = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });

  const html = construirProyeccionDocumentoHtml({
    empresa,
    // El papel imprime lo MISMO que la pantalla, y dice con qué regla. Un PDF
    // que redondea distinto a la pantalla es dos cifras para la misma semana.
    vista: vistaRedondeada(resultado, estado.redondeo),
    rangoSemana: rangoTexto(estado.lunesMs),
    obraNombre: obraFiltro ? datos.nombreObra[obraFiltro] ?? null : null,
    resultado,
    nombreObra: datos.nombreObra,
    pdf: config.pdf,
    moneda: (v) => moneda.format(v),
  });

  const bytes = await renderHtmlToPdf(html);
  return pdfResponse(bytes, 'proyeccion-nomina.pdf', false);
}
