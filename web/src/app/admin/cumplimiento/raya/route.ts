import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import { getEmpresaUsuario, getNombreEmpresa } from '@/lib/data/empresa';
import { puedeCumplimiento, listDatosImss } from '@/lib/data/cumplimiento';
import { listObras } from '@/lib/data/obras';
import { listColaboradores } from '@/lib/data/equipo';
import { listPuestosLite } from '@/lib/data/nomina';
import { cargarActividadPeriodo } from '@/lib/data/raya-periodo';
import { DIA_MS, fechaInputAMs } from '@/lib/data/tz';
import { formatDate } from '@/lib/data/format';
import { armarRaya, construirExcelRaya } from '@/lib/cumplimiento/raya-excel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Excel de la raya del periodo para el contador (RF5.6). Solo admin y contador:
 * lleva sueldos y, si se capturaron, NSS/CURP/RFC. Las fechas viajan en la URL
 * (no son datos personales); los datos personales solo van en el archivo.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const apagado = await bloquearSiApagado('cumplimiento');
  if (apagado) return apagado;

  const rol = await getEmpresaUsuario()
    .then((e) => e.rol)
    .catch(() => '');
  if (!puedeCumplimiento(rol)) {
    return NextResponse.json({ error: 'Solo el administrador o el contador pueden descargar la raya.' }, { status: 403 });
  }

  const desdeTxt = request.nextUrl.searchParams.get('desde') ?? '';
  const hastaTxt = request.nextUrl.searchParams.get('hasta') ?? '';
  if (!FECHA.test(desdeTxt) || !FECHA.test(hastaTxt)) {
    return NextResponse.json({ error: 'Elige las fechas del periodo.' }, { status: 400 });
  }
  const desde = fechaInputAMs(desdeTxt);
  const hasta = fechaInputAMs(hastaTxt) + DIA_MS - 1; // el día "hasta" completo
  if (hasta < desde) return NextResponse.json({ error: 'La fecha final es antes que la inicial.' }, { status: 400 });
  if (hasta - desde > 370 * DIA_MS) {
    return NextResponse.json({ error: 'El periodo puede ser de hasta un año.' }, { status: 400 });
  }

  const [{ data: obras }, { data: colaboradores }, { data: puestos }, actividad, { data: datosImss }, empresa] =
    await Promise.all([
      listObras(),
      listColaboradores(),
      listPuestosLite(),
      cargarActividadPeriodo(desde, hasta),
      listDatosImss(),
      getNombreEmpresa(),
    ]);
  if (actividad.error) return NextResponse.json({ error: actividad.error }, { status: 500 });

  const raya = armarRaya({
    obras: obras.map((o) => ({ id: o.id, nombre: o.nombre })),
    colaboradores,
    puestos,
    asistencias: actividad.asistencias,
    destajos: actividad.destajos,
    datosImss,
  });

  try {
    const buf = await construirExcelRaya(raya, {
      empresa: empresa ?? 'ConstructorPro',
      periodo: `del ${formatDate(desde)} al ${formatDate(hasta)}`,
      conDatosImss: datosImss.size > 0,
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="raya_${desdeTxt}_a_${hastaTxt}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el Excel.' }, { status: 500 });
  }
}
