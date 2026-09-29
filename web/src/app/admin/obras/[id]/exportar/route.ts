import { NextResponse } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getObra, listMovimientosByObra } from '@/lib/data/obras';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
import { getNotaCaja } from '@/lib/data/caja-nota';
import { listExtrasAprobadosObra } from '@/lib/data/cambios';
import { getIvaEstadoCuenta } from '@/lib/data/iva-obra';
import { createClient } from '@/lib/supabase/server';
import { construirExcelEstadoCuenta } from '@/lib/excel/estado-cuenta-excel';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  const apagado = await bloquearSiApagado('caja');
  if (apagado) return apagado;

  // ── Cargar datos ───────────────────────────────────────────────────────────
  const { id } = await params;

  const [
    { data: obra, error: obraError },
    { data: partidas, error: partidasError },
    { data: movimientos, error: movError },
    notaCaja,
    extras,
    iva,
  ] = await Promise.all([
    getObra(id),
    listPresupuestoObra(id),
    listMovimientosByObra(id),
    getNotaCaja(id),
    // Mismos totales que el estado de cuenta: extras aprobados en el costo y el
    // IVA cobrado aparte. Si falla (0036/0047 sin aplicar): cero y sin IVA.
    listExtrasAprobadosObra(id),
    getIvaEstadoCuenta(id),
  ]);

  if (obraError) {
    return NextResponse.json({ error: `Error al cargar la obra: ${obraError}` }, { status: 500 });
  }
  if (!obra) {
    return NextResponse.json({ error: 'Obra no encontrada.' }, { status: 404 });
  }
  if (partidasError) {
    return NextResponse.json({ error: `Error al cargar partidas: ${partidasError}` }, { status: 500 });
  }
  if (movError) {
    return NextResponse.json({ error: `Error al cargar movimientos: ${movError}` }, { status: 500 });
  }

  // ── Generar Excel ──────────────────────────────────────────────────────────
  let buffer: Buffer;
  try {
    buffer = await construirExcelEstadoCuenta({
      obra,
      partidas: partidas ?? [],
      movimientos: movimientos ?? [],
      notaCaja,
      extras: extras.error ? [] : extras.data,
      iva,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido al generar el Excel.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Nombre de archivo seguro
  const nombreSeguro = obra.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);

  const filename = `${nombreSeguro || 'obra'}_estado-cuenta.xlsx`;

  // Un Buffer de Node se toma de un pool compartido, así que `buffer.buffer`
  // devuelve el ArrayBuffer del pool ENTERO (mucho más grande que estos datos)
  // y el .xlsx sale corrupto. `new Uint8Array(buffer)` copia solo la vista real.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
