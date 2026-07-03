import { NextResponse } from 'next/server';
import { getObra, listMovimientosByObra } from '@/lib/data/obras';
import { listPresupuestoObra } from '@/lib/data/presupuesto-obra';
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

  // ── Cargar datos ───────────────────────────────────────────────────────────
  const { id } = await params;

  const [
    { data: obra, error: obraError },
    { data: partidas, error: partidasError },
    { data: movimientos, error: movError },
  ] = await Promise.all([
    getObra(id),
    listPresupuestoObra(id),
    listMovimientosByObra(id),
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

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
