import { NextResponse, type NextRequest } from 'next/server';
import { bloquearSiApagado } from '@/lib/data/modulos';
import {
  descargarArchivoFiscal,
  getAccesoFiscal,
  listEntradasPeriodo,
  listGastosPeriodo,
} from '@/lib/data/fiscal';
import { getNombreEmpresa } from '@/lib/data/empresa';
import { descargarArchivoCompras } from '@/lib/data/compras';
import { hoyMxMs } from '@/lib/data/tz';
import { LEYENDA_NO_ES_FACTURA } from '@/lib/fiscal/catalogos';
import { armarPaquete } from '@/lib/fiscal/paquete';
import { construirExcelPaquete, construirZipPaquete, type ArchivoZip } from '@/lib/fiscal/paquete-excel';
import { periodoDeMes } from '@/lib/fiscal/periodo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Un ZIP con cientos de facturas no debe tumbar la función. */
const MAX_ARCHIVOS = 300;

/**
 * Paquete para el contador (RF1b.5): Excel de 6 hojas del mes y, en el ZIP, los
 * XML y PDF de facturas y complementos de los cobros del mes.
 * `?mes=AAAA-MM` (por omisión, el mes actual) y `&formato=xlsx` para solo el Excel.
 */
export async function GET(request: NextRequest) {
  const apagado = await bloquearSiApagado('fiscal');
  if (apagado) return apagado;
  const acceso = await getAccesoFiscal();
  if (!acceso.puede) {
    return NextResponse.json({ error: 'Solo el administrador o el contador.' }, { status: 403 });
  }

  const periodo = periodoDeMes(request.nextUrl.searchParams.get('mes'), hoyMxMs());
  const [entradas, gastos, nombreEmpresa] = await Promise.all([
    listEntradasPeriodo(periodo.desde, periodo.hasta),
    listGastosPeriodo(periodo.desde, periodo.hasta),
    getNombreEmpresa(),
  ]);
  const error = entradas.error ?? gastos.error;
  if (error) return NextResponse.json({ error }, { status: 500 });

  const empresa = nombreEmpresa ?? 'ConstructorPro';
  const paquete = armarPaquete(entradas.data, gastos.data);
  const excel = await construirExcelPaquete({ paquete, empresa, periodo: periodo.nombre });
  const nombreExcel = `paquete-contador_${periodo.clave}.xlsx`;

  if (request.nextUrl.searchParams.get('formato') === 'xlsx') {
    return new NextResponse(new Uint8Array(excel), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombreExcel}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Archivos de las facturas del mes (sin repetir: una PPD se comparte entre abonos).
  const rutas = new Map<string, string>();
  for (const e of entradas.data) {
    const f = e.cobro.fiscal;
    if (!f) continue;
    const base = f.uuid ?? e.cobro.id;
    if (f.xml_path) rutas.set(f.xml_path, `facturas/${base}.xml`);
    if (f.pdf_path) rutas.set(f.pdf_path, `facturas/${base}.pdf`);
    if (f.complemento_xml_path) {
      rutas.set(f.complemento_xml_path, `complementos/${f.complemento_uuid ?? e.cobro.id}.xml`);
    }
  }
  // Facturas de proveedores de las compras pagadas en el mes (bucket `compras`).
  const rutasCompras = new Map<string, string>();
  for (const f of gastos.facturasProveedor) {
    const base = f.uuid ?? `OC-${f.ordenFolio}`;
    if (f.xmlPath) rutasCompras.set(f.xmlPath, `facturas-proveedores/${base}.xml`);
    if (f.pdfPath) rutasCompras.set(f.pdfPath, `facturas-proveedores/${base}.pdf`);
  }

  const archivos: ArchivoZip[] = [];
  const faltaron: string[] = [];
  const todas: [string, string, 'fiscal' | 'compras'][] = [
    ...[...rutas].map(([r, d]) => [r, d, 'fiscal'] as [string, string, 'fiscal']),
    ...[...rutasCompras].map(([r, d]) => [r, d, 'compras'] as [string, string, 'compras']),
  ];
  for (const [ruta, destino, bucket] of todas.slice(0, MAX_ARCHIVOS)) {
    const datos = bucket === 'fiscal' ? await descargarArchivoFiscal(ruta) : await descargarArchivoCompras(ruta);
    if (datos) archivos.push({ ruta: destino, datos });
    else faltaron.push(destino);
  }

  const leeme = [
    `Paquete para el contador — ${empresa} — ${periodo.nombre}`,
    '',
    `${nombreExcel}: por facturar, complementos de pago, facturado, gastos por obra, raya y resumen de IVA.`,
    'El resumen de IVA es un ESTIMADO, no es declaración.',
    'facturas/ y complementos/: los XML y PDF que se subieron a la app.',
    rutasCompras.size ? 'facturas-proveedores/: las facturas de las compras pagadas en el mes.' : '',
    todas.length > MAX_ARCHIVOS ? `Solo se incluyeron ${MAX_ARCHIVOS} archivos de ${todas.length}.` : '',
    faltaron.length ? `No se pudieron incluir: ${faltaron.join(', ')}` : '',
    '',
    LEYENDA_NO_ES_FACTURA,
  ]
    .filter((l) => l !== '')
    .join('\r\n');

  const zip = await construirZipPaquete({ nombreExcel, excel, archivos, leeme });
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="paquete-contador_${periodo.clave}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
