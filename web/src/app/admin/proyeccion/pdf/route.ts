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
  puedeVerProyeccion,
  type ProyeccionEstado,
} from '@/lib/data/proyeccion-nomina';
import { cargarDatosProyeccion } from '@/lib/data/proyeccion-nomina-server';
import { construirProyeccionDocumentoHtml } from '@/lib/nomina/documento-proyeccion-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/pdf/render-html-to-pdf';
import { createClient } from '@/lib/supabase/server';
import { partesTz } from '@/lib/data/tz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/// Valida lo que llega por la red. Un escenario mal formado no debe reventar el
/// render ni colarse como `any` hasta el cálculo.
function leerEstado(x: unknown): ProyeccionEstado | null {
  if (typeof x !== 'object' || x === null) return null;
  const e = x as Record<string, unknown>;
  if (typeof e.lunesMs !== 'number' || !Number.isFinite(e.lunesMs)) return null;
  if (!Array.isArray(e.participantes)) return null;
  const mapa = (v: unknown) => (typeof v === 'object' && v !== null ? v : {});
  return {
    lunesMs: e.lunesMs,
    participantes: e.participantes.filter((p): p is string => typeof p === 'string'),
    diasProyectados: mapa(e.diasProyectados) as Record<string, number[]>,
    destajoEstimado: mapa(e.destajoEstimado) as Record<string, number>,
    salarioOverride: mapa(e.salarioOverride) as Record<string, number>,
    ajustes: Array.isArray(e.ajustes) ? e.ajustes : [],
    simularCompleta: e.simularCompleta === true,
    obraPorDia: mapa(e.obraPorDia) as Record<string, Record<number, string>>,
    obraBase: mapa(e.obraBase) as Record<string, string>,
  } as ProyeccionEstado;
}

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
  if (!puedeVerProyeccion(rol)) {
    return NextResponse.json({ error: 'Sin permiso.' }, { status: 403 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const payload = cuerpo as { estado?: unknown; obraFiltro?: unknown };
  const estado = leerEstado(payload.estado);
  if (!estado) {
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
    colaboradores: datos.colaboradores,
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
