/**
 * RAYA DEL PERIODO para el contador (RF5.6): Excel con lo que se pagó por obra
 * y por persona, con NSS/CURP/RFC cuando se capturaron.
 *
 * NO es nómina fiscal: no calcula cuotas IMSS, ISR ni Infonavit (plan §6). Es
 * la lista de raya tal cual la saca la app (asistencia × salario del día +
 * destajos, la misma fórmula de `calcularNomina`), para que el contador la
 * cargue en su sistema.
 *
 * F1b (paquete para el contador, RF1b.5 hoja 5 "Raya del periodo") reutiliza
 * `armarRaya` + `agregarHojasRaya` en su propio libro; por eso la construcción
 * del libro y el armado de filas van separados.
 */

import ExcelJS from 'exceljs';
import { calcularNomina } from '@/lib/data/nomina-calculo';
import type { Asistencia, Colaborador, Destajo, Puesto } from '@/lib/data/types';

export interface DatosImssRaya {
  nss: string | null;
  curp: string | null;
  rfc: string | null;
}

export interface FilaRaya {
  obraId: string;
  obra: string;
  colaboradorId: string;
  colaborador: string;
  puesto: string;
  tipoPago: 'DIA' | 'DESTAJO';
  dias: number;
  salarioDia: number;
  destajos: number;
  total: number;
  nss: string;
  curp: string;
  rfc: string;
}

export interface ResumenObraRaya {
  obraId: string;
  obra: string;
  personas: number;
  total: number;
}

export interface Raya {
  filas: FilaRaya[];
  porObra: ResumenObraRaya[];
  total: number;
}

/**
 * Arma la raya del periodo a partir de lo ya filtrado por fechas.
 * Por obra se incluye a quien tuvo asistencia o destajo EN ESA OBRA dentro del
 * periodo (no a quien solo estaba asignado): es lo que se pagó.
 */
export function armarRaya(p: {
  obras: { id: string; nombre: string }[];
  colaboradores: Colaborador[];
  puestos: Puesto[];
  asistencias: Asistencia[];
  destajos: Destajo[];
  datosImss?: Map<string, DatosImssRaya>;
}): Raya {
  const colabPorId = new Map(p.colaboradores.map((c) => [c.id, c]));
  const filas: FilaRaya[] = [];
  const porObra: ResumenObraRaya[] = [];

  for (const obra of [...p.obras].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
    const asist = p.asistencias.filter((a) => a.obra_id === obra.id);
    const dest = p.destajos.filter((d) => d.obra_id === obra.id);
    const ids = new Set([...asist.map((a) => a.colaborador_id), ...dest.map((d) => d.colaborador_id)]);
    const gente = [...ids]
      .map((id) => colabPorId.get(id))
      .filter((c): c is Colaborador => Boolean(c))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (gente.length === 0) continue;

    const nomina = calcularNomina({ colaboradores: gente, asistencias: asist, destajos: dest, puestos: p.puestos });
    for (const it of nomina.items) {
      // Misma regla que la raya de la obra y el móvil (`calcularNomina`): a
      // quien cobra por día solo le cuentan los días; a quien va a destajo,
      // solo sus destajos. Así el Excel cuadra con lo que se pagó en pantalla.
      const imss = p.datosImss?.get(it.colaborador.id);
      filas.push({
        obraId: obra.id,
        obra: obra.nombre,
        colaboradorId: it.colaborador.id,
        colaborador: it.colaborador.nombre,
        puesto: it.puestoNombre,
        tipoPago: it.colaborador.tipo_pago === 'DESTAJO' ? 'DESTAJO' : 'DIA',
        dias: it.totalDias,
        salarioDia: it.salarioBaseCalculado,
        destajos: it.totalDestajos,
        total: Math.round(it.totalPagar * 100) / 100,
        nss: imss?.nss ?? '',
        curp: imss?.curp ?? '',
        rfc: imss?.rfc ?? '',
      });
    }
    porObra.push({
      obraId: obra.id,
      obra: obra.nombre,
      personas: gente.length,
      total: Math.round(nomina.totalNomina * 100) / 100,
    });
  }

  return { filas, porObra, total: Math.round(porObra.reduce((s, o) => s + o.total, 0) * 100) / 100 };
}

const ENCABEZADO: Partial<ExcelJS.Fill> = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
const MONEDA = '#,##0.00';

function encabezar(ws: ExcelJS.Worksheet, fila: number) {
  const row = ws.getRow(fila);
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = ENCABEZADO as ExcelJS.Fill;
  });
}

/** Agrega las hojas "Raya" y "Resumen por obra" a un libro existente. */
export function agregarHojasRaya(
  wb: ExcelJS.Workbook,
  raya: Raya,
  meta: { empresa: string; periodo: string; conDatosImss: boolean },
): void {
  const ws = wb.addWorksheet('Raya');
  ws.addRow([`${meta.empresa} — Lista de raya ${meta.periodo}`]).font = { bold: true, size: 13 };
  ws.addRow([
    'Raya tal como la registra la app (asistencia × salario del día + destajos). No incluye cuotas IMSS, ISR ni Infonavit.',
  ]).font = { italic: true, color: { argb: 'FF64748B' } };
  ws.addRow([]);

  const columnas = [
    { titulo: 'Obra', ancho: 28 },
    { titulo: 'Colaborador', ancho: 28 },
    { titulo: 'Puesto', ancho: 18 },
    { titulo: 'Pago', ancho: 10 },
    { titulo: 'Días', ancho: 8 },
    { titulo: 'Salario día', ancho: 13 },
    { titulo: 'Destajos', ancho: 13 },
    { titulo: 'Total', ancho: 14 },
    ...(meta.conDatosImss
      ? [
          { titulo: 'NSS', ancho: 14 },
          { titulo: 'CURP', ancho: 22 },
          { titulo: 'RFC', ancho: 16 },
        ]
      : []),
  ];
  columnas.forEach((c, i) => (ws.getColumn(i + 1).width = c.ancho));
  const filaEnc = ws.addRow(columnas.map((c) => c.titulo)).number;
  encabezar(ws, filaEnc);

  for (const f of raya.filas) {
    const row = ws.addRow([
      f.obra,
      f.colaborador,
      f.puesto,
      f.tipoPago === 'DIA' ? 'Por día' : 'Destajo',
      f.dias,
      f.salarioDia,
      f.destajos,
      f.total,
      ...(meta.conDatosImss ? [f.nss, f.curp, f.rfc] : []),
    ]);
    [6, 7, 8].forEach((c) => (row.getCell(c).numFmt = MONEDA));
    // NSS como texto: con número Excel se come los ceros a la izquierda.
    if (meta.conDatosImss) row.getCell(9).numFmt = '@';
  }
  const tot = ws.addRow(['', '', '', '', '', '', 'TOTAL', raya.total]);
  tot.font = { bold: true };
  tot.getCell(8).numFmt = MONEDA;
  ws.views = [{ state: 'frozen', ySplit: filaEnc }];

  const res = wb.addWorksheet('Resumen por obra');
  res.getColumn(1).width = 32;
  res.getColumn(2).width = 12;
  res.getColumn(3).width = 16;
  const enc = res.addRow(['Obra', 'Personas', 'Total raya']).number;
  encabezar(res, enc);
  for (const o of raya.porObra) res.addRow([o.obra, o.personas, o.total]).getCell(3).numFmt = MONEDA;
  const t = res.addRow(['TOTAL', '', raya.total]);
  t.font = { bold: true };
  t.getCell(3).numFmt = MONEDA;
}

export async function construirExcelRaya(
  raya: Raya,
  meta: { empresa: string; periodo: string; conDatosImss: boolean },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ConstructorPro';
  wb.created = new Date();
  agregarHojasRaya(wb, raya, meta);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
