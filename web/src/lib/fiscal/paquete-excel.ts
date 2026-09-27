/**
 * Excel y ZIP del "Paquete para el contador".
 *
 * El Excel lleva las 6 hojas de `armarPaquete`. El ZIP lleva el Excel y, en una
 * carpeta, los XML y PDF de las facturas y complementos del periodo. El ZIP usa
 * `jszip`, que ya venía instalada con `exceljs` (misma versión, ahora declarada
 * como dependencia directa para no depender de una transitiva).
 */

import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { LEYENDA_NO_ES_FACTURA } from './catalogos';
import type { Paquete } from './paquete';

const MONEDA = '"$"#,##0.00';
const FECHA = 'dd/mm/yyyy';

/** epoch ms → Date "de calendario" en la zona del centro de México (UTC−6). */
function fechaMx(ms: number | null): Date | null {
  if (ms == null) return null;
  const d = new Date(ms - 6 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface Columna {
  titulo: string;
  ancho: number;
  formato?: 'moneda' | 'fecha';
}

function hoja(
  libro: ExcelJS.Workbook,
  nombre: string,
  explicacion: string,
  columnas: Columna[],
  filas: (string | number | Date | null)[][],
): ExcelJS.Worksheet {
  const ws = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.getCell('A1').value = nombre;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = explicacion;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF525252' } };
  const encabezado = ws.getRow(3);
  columnas.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    ws.getColumn(i + 1).width = c.ancho;
  });
  for (const fila of filas) {
    const row = ws.addRow(fila);
    columnas.forEach((c, i) => {
      if (c.formato === 'moneda') row.getCell(i + 1).numFmt = MONEDA;
      if (c.formato === 'fecha') row.getCell(i + 1).numFmt = FECHA;
    });
  }
  if (filas.length === 0) ws.addRow(['Nada en este periodo.']);
  return ws;
}

export async function construirExcelPaquete(p: {
  paquete: Paquete;
  empresa: string;
  periodo: string;
}): Promise<Buffer> {
  const { paquete } = p;
  const libro = new ExcelJS.Workbook();
  libro.creator = 'ConstructorPro';
  libro.created = new Date();

  hoja(
    libro,
    'Por facturar',
    `${p.empresa} · ${p.periodo} · Cobros sin folio fiscal. ${LEYENDA_NO_ES_FACTURA}`,
    [
      { titulo: 'Fecha de cobro', ancho: 14, formato: 'fecha' },
      { titulo: 'Obra / cotización', ancho: 28 },
      { titulo: 'Cliente', ancho: 24 },
      { titulo: 'RFC', ancho: 16 },
      { titulo: 'Razón social', ancho: 30 },
      { titulo: 'Régimen', ancho: 9 },
      { titulo: 'C.P.', ancho: 8 },
      { titulo: 'Uso CFDI', ancho: 9 },
      { titulo: 'Concepto', ancho: 26 },
      { titulo: 'Cobrado', ancho: 14, formato: 'moneda' },
      { titulo: 'Subtotal', ancho: 14, formato: 'moneda' },
      { titulo: 'IVA', ancho: 12, formato: 'moneda' },
      { titulo: 'ISR retenido', ancho: 12, formato: 'moneda' },
      { titulo: 'IVA retenido', ancho: 12, formato: 'moneda' },
      { titulo: 'Total', ancho: 14, formato: 'moneda' },
      { titulo: 'Forma de pago', ancho: 10 },
      { titulo: 'Método', ancho: 8 },
      { titulo: 'Falta', ancho: 36 },
    ],
    paquete.porFacturar.map((f) => [
      fechaMx(f.fecha), f.documento, f.cliente, f.rfc, f.razonSocial, f.regimen, f.cp, f.uso,
      f.concepto, f.cobrado, f.subtotal, f.iva, f.retIsr, f.retIva, f.total, f.forma, f.metodo,
      f.faltantes,
    ]),
  );

  hoja(
    libro,
    'Complementos de pago',
    'Abonos recibidos sobre facturas en parcialidades (PPD) que todavía no tienen complemento. Se hacen a más tardar el día 5 del mes siguiente al pago.',
    [
      { titulo: 'Fecha de pago', ancho: 14, formato: 'fecha' },
      { titulo: 'Hacer a más tardar', ancho: 16 },
      { titulo: 'Obra / cotización', ancho: 28 },
      { titulo: 'Cliente', ancho: 24 },
      { titulo: 'RFC', ancho: 16 },
      { titulo: 'Folio de la factura', ancho: 38 },
      { titulo: 'Parcialidad', ancho: 11 },
      { titulo: 'Saldo anterior', ancho: 14, formato: 'moneda' },
      { titulo: 'Pagado', ancho: 14, formato: 'moneda' },
      { titulo: 'Saldo insoluto', ancho: 14, formato: 'moneda' },
      { titulo: 'Forma de pago', ancho: 10 },
    ],
    paquete.complementos.map((f) => [
      fechaMx(f.fechaPago), f.limite, f.documento, f.cliente, f.rfc, f.folioFactura, f.parcialidad,
      f.saldoAnterior, f.pagado, f.saldoInsoluto, f.forma,
    ]),
  );

  hoja(
    libro,
    'Facturado',
    'Cobros que ya tienen factura: folio, montos y si ya se cobró completa.',
    [
      { titulo: 'Fecha de cobro', ancho: 14, formato: 'fecha' },
      { titulo: 'Fecha de factura', ancho: 14, formato: 'fecha' },
      { titulo: 'Obra / cotización', ancho: 28 },
      { titulo: 'Cliente', ancho: 24 },
      { titulo: 'RFC', ancho: 16 },
      { titulo: 'Folio fiscal', ancho: 38 },
      { titulo: 'Método', ancho: 8 },
      { titulo: 'Total factura', ancho: 14, formato: 'moneda' },
      { titulo: 'Cobrado', ancho: 14, formato: 'moneda' },
      { titulo: 'Complemento', ancho: 38 },
      { titulo: 'Estado de cobro', ancho: 22 },
    ],
    paquete.facturado.map((f) => [
      fechaMx(f.fechaCobro), fechaMx(f.fechaFactura), f.documento, f.cliente, f.rfc, f.folio, f.metodo,
      f.totalFactura, f.cobrado, f.complemento, f.estadoCobro,
    ]),
  );

  const columnasGasto: Columna[] = [
    { titulo: 'Obra', ancho: 28 },
    { titulo: 'Fecha', ancho: 12, formato: 'fecha' },
    { titulo: 'Categoría', ancho: 16 },
    { titulo: 'Concepto', ancho: 30 },
    { titulo: 'A quién', ancho: 24 },
    { titulo: 'Monto', ancho: 14, formato: 'moneda' },
    { titulo: 'Método', ancho: 14 },
    { titulo: 'Referencia', ancho: 18 },
  ];
  hoja(
    libro,
    'Gastos por obra',
    'Salidas de caja del periodo, con o sin factura. La app no sabe cuáles tienen factura: márcalas aquí para tus deducciones.',
    [...columnasGasto, { titulo: '¿Tiene factura?', ancho: 14 }],
    paquete.gastos.map((g) => [
      g.obra, fechaMx(g.fecha), g.categoria, g.concepto, g.nombre, g.monto, g.metodo, g.referencia, '',
    ]),
  );

  hoja(
    libro,
    'Raya',
    'Lo que se pagó de raya (nómina) en el periodo, por obra.',
    columnasGasto,
    paquete.raya.map((g) => [
      g.obra, fechaMx(g.fecha), g.categoria, g.concepto, g.nombre, g.monto, g.metodo, g.referencia,
    ]),
  );

  const r = paquete.resumen;
  const ws = hoja(
    libro,
    'Resumen IVA',
    'ESTIMADO, NO ES DECLARACIÓN. Sirve para darte una idea; la declaración la hace tu contador con las facturas reales.',
    [
      { titulo: 'Concepto', ancho: 58 },
      { titulo: 'Monto', ancho: 16, formato: 'moneda' },
    ],
    [
      ['IVA cobrado en cobros ya facturados', r.ivaFacturado],
      ['IVA de cobros todavía por facturar', r.ivaPorFacturar],
      ['IVA pagado en gastos, SI todos tuvieran factura al 16%', r.ivaGastos],
      ['Diferencia (IVA facturado − IVA de gastos)', r.diferencia],
    ],
  );
  ws.addRow([]);
  ws.addRow([`Cobros facturados: ${r.cobrosFacturados}`]);
  ws.addRow([`Cobros por facturar: ${r.cobrosPorFacturar}`]);
  ws.addRow([`Cobros marcados "no requiere factura": ${r.cobrosSinFactura}`]);
  ws.getCell('A2').font = { bold: true, color: { argb: 'FFB91C1C' } };

  const datos = await libro.xlsx.writeBuffer();
  return Buffer.from(datos as ArrayBuffer);
}

export interface ArchivoZip {
  /** Ruta dentro del ZIP (por ejemplo `facturas/2026-09-15_ABCD1234.xml`). */
  ruta: string;
  datos: Uint8Array;
}

/** ZIP con el Excel en la raíz y los archivos de facturas en sus carpetas. */
export async function construirZipPaquete(p: {
  nombreExcel: string;
  excel: Buffer;
  archivos: ArchivoZip[];
  leeme: string;
}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(p.nombreExcel, p.excel);
  zip.file('LEEME.txt', p.leeme);
  const usadas = new Set<string>();
  for (const a of p.archivos) {
    // Nombres únicos: dos archivos con el mismo nombre no se pisan.
    let ruta = a.ruta.replace(/[^\w./-]/g, '_').replace(/\.\.+/g, '.');
    let n = 2;
    while (usadas.has(ruta)) ruta = a.ruta.replace(/(\.[^.]+)?$/, `_${n++}$1`);
    usadas.add(ruta);
    zip.file(ruta, a.datos);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
