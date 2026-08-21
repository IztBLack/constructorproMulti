/**
 * Utilidades de Excel para el Estado de Cuenta de una obra.
 *
 * Exportar: construirExcelEstadoCuenta → genera un .xlsx con el formato de la plantilla real.
 * Importar: parsearExcelObra → extrae datos de un .xlsx con esa plantilla.
 */

import ExcelJS from 'exceljs';
import type { Movimiento, PartidaPresupuesto, Obra } from '@/lib/data/types';
import { medianocheMx } from '@/lib/data/tz';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ExcelPartida {
  concepto: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
}

export interface ExcelMovimiento {
  fecha: number;       // epoch ms
  categoria: string;
  monto: number;
  nombre: string;
  metodoPago: string;
  tipo: 'ENTRADA' | 'SALIDA';
  referencia: string;
}

export interface ParsedObraData {
  obraNombre: string;
  partidas: ExcelPartida[];
  movimientos: ExcelMovimiento[];
  advertencias: string[];
}

// ── Helpers internos ─────────────────────────────────────────────────────────

/** Fecha Excel serial → epoch ms. Excel cuenta desde 1900-01-00 (bug del lotus123). */
function excelSerialToMs(serial: number): number {
  // Excel serial 1 = 1900-01-01. El serial 60 es el falso 29-feb-1900.
  // Ajuste: (serial - 25569) días desde epoch Unix (1970-01-01).
  const MS_PER_DAY = 86400000;
  return Math.round((serial - 25569) * MS_PER_DAY);
}

/** Convierte un valor de celda a número, o undefined si no es numérico. */
function toNumber(val: ExcelJS.CellValue): number | undefined {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Convierte un valor de celda a string limpio. */
function toStr(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object' && 'text' in (val as object)) {
    return String((val as { text: string }).text).trim();
  }
  return String(val).trim();
}

/**
 * Convierte valor de celda de fecha a epoch ms, normalizado a **medianoche de
 * México** de esa fecha de calendario (para que coincida con la convención del
 * resto de la app y se muestre en el día correcto). Acepta seriales, Date y strings.
 */
function toDateMs(val: ExcelJS.CellValue): number | undefined {
  let base: number | undefined;
  if (val === null || val === undefined) return undefined;
  if (val instanceof Date) base = val.getTime();
  else if (typeof val === 'number') {
    if (val > 25569 && val < 73049) base = excelSerialToMs(val); // serial 1970-2100
    else if (val > 1000000000000) base = val; // ya es epoch ms
  } else if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) base = d.getTime();
  }
  if (base === undefined) return undefined;
  // Re-ancla a medianoche de México usando la fecha de calendario (UTC) del valor.
  const u = new Date(base);
  return medianocheMx(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
}

/** Normaliza TIPO de movimiento: acepta variantes en español y mayúsculas/minúsculas. */
export function normalizarTipo(raw: string): 'ENTRADA' | 'SALIDA' | undefined {
  const s = raw.toUpperCase().trim();
  if (s === 'ENTRADA' || s === 'INGRESO' || s === 'DEPOSITO' || s === 'DEPÓSITO') return 'ENTRADA';
  if (s === 'SALIDA' || s === 'EGRESO' || s === 'GASTO' || s === 'PAGO') return 'SALIDA';
  return undefined;
}

/** Normaliza metodo_pago. */
export function normalizarMetodoPago(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const u = s.toUpperCase();
  if (u.includes('TRANSFER') || u.includes('TRANSF')) return 'Transferencia';
  if (u.includes('CHEQUE')) return 'Cheque';
  if (u.includes('EFECTIVO') || u.includes('CASH')) return 'Efectivo';
  if (u.includes('TARJETA') || u.includes('CARD')) return 'Tarjeta';
  return s;
}

/** Extrae el valor bruto de una celda (resuelve celdas de fórmula). */
function cellValue(cell: ExcelJS.Cell): ExcelJS.CellValue {
  if (cell.type === ExcelJS.ValueType.Formula) {
    return cell.result ?? null;
  }
  return cell.value;
}

// ── Exportar ─────────────────────────────────────────────────────────────────

export interface ExportInput {
  obra: Obra;
  partidas: PartidaPresupuesto[];
  movimientos: Movimiento[];
  /** Nota de conciliación de caja (migración 0023). Opcional. */
  notaCaja?: string;
}

export async function construirExcelEstadoCuenta({
  obra,
  partidas,
  movimientos,
  notaCaja,
}: ExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cimnova';
  wb.created = new Date();

  const ws = wb.addWorksheet('Estado de Cuenta');

  // Anchos de columna fijos
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 28;

  // Helpers de estilo
  const boldFont: Partial<ExcelJS.Font> = { bold: true };
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' },
  };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
  const moneyFmt = '#,##0.00';
  const dateFmt = 'DD/MM/YYYY';

  const applyBorder = (cell: ExcelJS.Cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  };

  // ── Fila 1: OBRA: ────────────────────────────────────────────────────────
  let rowIdx = 1;
  {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = 'OBRA:';
    row.getCell(1).font = boldFont;
    row.getCell(2).value = obra.nombre;
    row.getCell(2).font = boldFont;
    row.commit();
    rowIdx++;
  }

  // ── Filas de partidas del presupuesto ────────────────────────────────────
  for (const p of partidas) {
    const row = ws.getRow(rowIdx);
    // A: concepto
    row.getCell(1).value = p.concepto;
    row.getCell(1).font = boldFont;
    // B: cantidad + unidad
    row.getCell(2).value = p.unidad ? `${p.cantidad} ${p.unidad}` : p.cantidad;
    // C: etiqueta
    row.getCell(3).value = 'PRECIO UNITARIO:';
    row.getCell(3).font = boldFont;
    // D: precio unitario
    row.getCell(4).value = p.precio_unitario;
    row.getCell(4).numFmt = moneyFmt;
    // E: etiqueta
    row.getCell(5).value = 'TOTAL';
    row.getCell(5).font = boldFont;
    // F: total
    const total = p.cantidad * p.precio_unitario;
    row.getCell(6).value = total;
    row.getCell(6).numFmt = moneyFmt;
    row.commit();
    rowIdx++;
  }

  // ── Fila COSTO TOTAL ─────────────────────────────────────────────────────
  const costoTotalVal = partidas.reduce((s, p) => s + p.cantidad * p.precio_unitario, 0);
  {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = 'COSTO TOTAL:';
    row.getCell(1).font = boldFont;
    row.getCell(3).value = costoTotalVal;
    row.getCell(3).numFmt = moneyFmt;
    row.getCell(3).font = boldFont;
    row.commit();
    rowIdx++;
  }

  // ── Fila RECIBIDO / PENDIENTE ────────────────────────────────────────────
  const recibido = movimientos
    .filter((m) => m.tipo === 'ENTRADA')
    .reduce((s, m) => s + m.monto, 0);
  const pendiente = costoTotalVal - recibido;

  {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = 'RECIBIDO:';
    row.getCell(1).font = boldFont;
    row.getCell(3).value = recibido;
    row.getCell(3).numFmt = moneyFmt;
    row.commit();
    rowIdx++;
  }
  {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = 'PENDIENTE:';
    row.getCell(1).font = boldFont;
    row.getCell(3).value = pendiente;
    row.getCell(3).numFmt = moneyFmt;
    row.commit();
    rowIdx++;
  }

  // ── Fila en blanco separadora ────────────────────────────────────────────
  rowIdx++;

  // ── Encabezados del libro de movimientos ─────────────────────────────────
  const headerRowIdx = rowIdx;
  {
    const row = ws.getRow(rowIdx);
    const headers = ['FECHA', 'CONCEPTO', 'CANTIDAD', 'NOMBRE', 'CANAL', 'TIPO', 'OBSERVACIONES'];
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      applyBorder(cell);
    });
    row.height = 20;
    row.commit();
    rowIdx++;
  }

  // ── Filas de movimientos ──────────────────────────────────────────────────
  // Ordenar por fecha ascendente para el libro
  const movsOrdenados = [...movimientos].sort((a, b) => a.fecha - b.fecha);

  const altFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };

  for (let i = 0; i < movsOrdenados.length; i++) {
    const m = movsOrdenados[i];
    const row = ws.getRow(rowIdx);
    const isAlt = i % 2 === 1;

    const fechaCell = row.getCell(1);
    fechaCell.value = new Date(m.fecha);
    fechaCell.numFmt = dateFmt;
    if (isAlt) fechaCell.fill = altFill;
    applyBorder(fechaCell);

    const conceptoCell = row.getCell(2);
    conceptoCell.value = m.categoria ?? m.concepto ?? '';
    if (isAlt) conceptoCell.fill = altFill;
    applyBorder(conceptoCell);

    const montoCell = row.getCell(3);
    montoCell.value = m.monto;
    montoCell.numFmt = moneyFmt;
    if (isAlt) montoCell.fill = altFill;
    applyBorder(montoCell);

    const nombreCell = row.getCell(4);
    nombreCell.value = m.nombre ?? '';
    if (isAlt) nombreCell.fill = altFill;
    applyBorder(nombreCell);

    const canalCell = row.getCell(5);
    canalCell.value = m.metodo_pago ?? '';
    if (isAlt) canalCell.fill = altFill;
    applyBorder(canalCell);

    const tipoCell = row.getCell(6);
    tipoCell.value = m.tipo;
    tipoCell.font = {
      bold: true,
      color: { argb: m.tipo === 'ENTRADA' ? 'FF166534' : 'FF991B1B' },
    };
    if (isAlt) tipoCell.fill = altFill;
    applyBorder(tipoCell);

    const obsCell = row.getCell(7);
    obsCell.value = m.referencia ?? '';
    if (isAlt) obsCell.fill = altFill;
    applyBorder(obsCell);

    row.commit();
    rowIdx++;
  }

  // ── Fila en blanco separadora ────────────────────────────────────────────
  rowIdx++;
  rowIdx++;

  // ── Resumen 1: Pagado por persona (SALIDAS agrupadas por nombre) ──────────
  {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = 'PAGADO POR PERSONA';
    row.getCell(1).font = { ...boldFont, size: 12 };
    row.commit();
    rowIdx++;
  }

  const porPersona = new Map<string, number>();
  for (const m of movimientos) {
    if (m.tipo !== 'SALIDA') continue;
    const key = m.nombre?.trim() || 'Sin nombre';
    porPersona.set(key, (porPersona.get(key) ?? 0) + m.monto);
  }
  const porPersonaEntries = [...porPersona.entries()].sort((a, b) => b[1] - a[1]);

  // Sub-encabezado
  {
    const row = ws.getRow(rowIdx);
    ['NOMBRE', 'TOTAL PAGADO'].forEach((h, i) => {
      const cell = row.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = headerFill;
      applyBorder(cell);
    });
    row.commit();
    rowIdx++;
  }

  let totalSalidas = 0;
  for (const [nombre, monto] of porPersonaEntries) {
    totalSalidas += monto;
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = nombre;
    row.getCell(2).value = monto;
    row.getCell(2).numFmt = moneyFmt;
    [1, 2].forEach((c) => applyBorder(row.getCell(c)));
    row.commit();
    rowIdx++;
  }
  {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = 'TOTAL';
    row.getCell(1).font = boldFont;
    row.getCell(2).value = totalSalidas;
    row.getCell(2).numFmt = moneyFmt;
    row.getCell(2).font = boldFont;
    [1, 2].forEach((c) => applyBorder(row.getCell(c)));
    row.commit();
    rowIdx++;
  }

  // ── Espacio ───────────────────────────────────────────────────────────────
  rowIdx++;

  // ── Resumen 2: Recibido por tipo (ENTRADAS agrupadas por categoría) ───────
  {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = 'RECIBIDO POR TIPO';
    row.getCell(1).font = { ...boldFont, size: 12 };
    row.commit();
    rowIdx++;
  }

  const porTipo = new Map<string, number>();
  for (const m of movimientos) {
    if (m.tipo !== 'ENTRADA') continue;
    const key = m.categoria?.trim() || m.concepto?.trim() || 'Sin categoría';
    porTipo.set(key, (porTipo.get(key) ?? 0) + m.monto);
  }
  const porTipoEntries = [...porTipo.entries()].sort((a, b) => b[1] - a[1]);

  {
    const row = ws.getRow(rowIdx);
    ['CONCEPTO / CATEGORÍA', 'TOTAL RECIBIDO'].forEach((h, i) => {
      const cell = row.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = headerFill;
      applyBorder(cell);
    });
    row.commit();
    rowIdx++;
  }

  let totalEntradas = 0;
  for (const [tipo, monto] of porTipoEntries) {
    totalEntradas += monto;
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = tipo;
    row.getCell(2).value = monto;
    row.getCell(2).numFmt = moneyFmt;
    [1, 2].forEach((c) => applyBorder(row.getCell(c)));
    row.commit();
    rowIdx++;
  }
  {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = 'TOTAL';
    row.getCell(1).font = boldFont;
    row.getCell(2).value = totalEntradas;
    row.getCell(2).numFmt = moneyFmt;
    row.getCell(2).font = boldFont;
    [1, 2].forEach((c) => applyBorder(row.getCell(c)));
    row.commit();
    rowIdx++;
  }

  // ── Nota de conciliación al pie (como el apunte del Excel de la contadora) ──
  const textoNota = notaCaja?.trim();
  if (textoNota) {
    rowIdx += 1; // renglón en blanco de separación
    const etiqueta = ws.getRow(rowIdx);
    etiqueta.getCell(1).value = 'NOTA DE CONCILIACIÓN';
    etiqueta.getCell(1).font = boldFont;
    etiqueta.commit();
    rowIdx++;
    const filaNota = ws.getRow(rowIdx);
    filaNota.getCell(1).value = textoNota;
    // Que la nota se lea completa a lo ancho de las columnas del libro.
    ws.mergeCells(rowIdx, 1, rowIdx, 7);
    filaNota.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    filaNota.commit();
    rowIdx++;
  }

  // Freeze la fila de encabezados del libro
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx, topLeftCell: `A${headerRowIdx + 1}` }];

  // Generar buffer
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Importar ─────────────────────────────────────────────────────────────────

export async function parsearExcelObra(buffer: ArrayBuffer): Promise<ParsedObraData> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS acepta Buffer o ArrayBuffer; cast a any para evitar discrepancias de tipos entre versiones
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('El archivo Excel no contiene hojas.');

  const advertencias: string[] = [];
  let obraNombre = '';
  const partidas: ExcelPartida[] = [];
  const movimientos: ExcelMovimiento[] = [];

  // ── 1. Nombre de la obra (fila 1, col B) ─────────────────────────────────
  {
    const fila1 = ws.getRow(1);
    const a1 = toStr(cellValue(fila1.getCell(1))).toUpperCase();
    if (a1.includes('OBRA')) {
      obraNombre = toStr(cellValue(fila1.getCell(2)));
    }
    if (!obraNombre) {
      // Fallback: usar valor completo col B fila 1
      obraNombre = toStr(cellValue(fila1.getCell(2))) || 'Obra sin nombre';
    }
  }

  // ── 2. Buscar fila de encabezados del libro ───────────────────────────────
  let headerRow = -1;
  let colFecha = -1;
  let colConcepto = -1;
  let colCantidad = -1;
  let colNombre = -1;
  let colCanal = -1;
  let colTipo = -1;
  let colObs = -1;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRow !== -1) return; // ya encontrada
    let hasFecha = false;
    let hasConcepto = false;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const v = toStr(cellValue(cell)).toUpperCase();
      if (v === 'FECHA') { hasFecha = true; colFecha = colNumber; }
      else if (v === 'CONCEPTO') { hasConcepto = true; colConcepto = colNumber; }
      else if (v === 'CANTIDAD') colCantidad = colNumber;
      else if (v === 'NOMBRE') colNombre = colNumber;
      else if (v === 'CANAL') colCanal = colNumber;
      else if (v === 'TIPO') colTipo = colNumber;
      else if (v === 'OBSERVACIONES' || v === 'OBS') colObs = colNumber;
    });

    if (hasFecha && hasConcepto) {
      headerRow = rowNumber;
    }
  });

  // ── 3. Parsear partidas (filas 2..headerRow-1, antes de encabezados) ──────
  if (headerRow > 2) {
    for (let r = 2; r < headerRow; r++) {
      const row = ws.getRow(r);
      const a = toStr(cellValue(row.getCell(1))).toUpperCase();

      // Filas de resumen/totales: saltar
      if (
        a.includes('COSTO TOTAL') ||
        a.includes('RECIBIDO') ||
        a.includes('PENDIENTE') ||
        a === ''
      ) continue;

      // Detectar si la fila tiene precio unitario (col D o col 4) y total (col F o col 6)
      // Formato: A=concepto, B=cantidad+unidad, C="PRECIO UNITARIO:", D=precio, E="TOTAL", F=total
      const bRaw = toStr(cellValue(row.getCell(2)));
      const dRaw = cellValue(row.getCell(4));
      const fRaw = cellValue(row.getCell(6));

      const precioUnitario = toNumber(dRaw);
      const totalPartida = toNumber(fRaw);

      // La fila es válida si tiene concepto + al menos precio unitario o total
      if (!a || (!precioUnitario && !totalPartida)) continue;

      // Parsear cantidad y unidad de col B (ej "344 m2", "1", "3.5 ml")
      let cantidad = 1;
      let unidad = '';
      if (bRaw) {
        const match = bRaw.match(/^([\d,.]+)\s*(.*)$/);
        if (match) {
          const n = parseFloat(match[1].replace(/,/g, ''));
          if (Number.isFinite(n)) cantidad = n;
          unidad = match[2].trim();
        } else {
          const n = toNumber(cellValue(row.getCell(2)));
          if (n !== undefined) cantidad = n;
        }
      }

      // Derivar precio unitario si falta: total / cantidad
      let pu = precioUnitario;
      if (!pu && totalPartida && cantidad > 0) {
        pu = totalPartida / cantidad;
      }
      if (!pu) {
        pu = totalPartida ?? 0;
      }

      const conceptoLimpio = a.replace(/:$/, '').trim();
      if (!conceptoLimpio) continue;

      partidas.push({
        concepto: conceptoLimpio,
        unidad,
        cantidad,
        precioUnitario: pu,
      });
    }
  } else if (headerRow === -1) {
    advertencias.push('No se encontró la fila de encabezados (FECHA | CONCEPTO ...). No se importaron movimientos.');
  }

  // ── 4. Parsear movimientos (filas después de headerRow) ───────────────────
  if (headerRow !== -1) {
    let blancasConsecutivas = 0;

    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return;

      const fechaVal = colFecha > 0 ? cellValue(row.getCell(colFecha)) : null;
      const conceptoVal = colConcepto > 0 ? cellValue(row.getCell(colConcepto)) : null;
      const cantidadVal = colCantidad > 0 ? cellValue(row.getCell(colCantidad)) : null;
      const nombreVal = colNombre > 0 ? cellValue(row.getCell(colNombre)) : null;
      const canalVal = colCanal > 0 ? cellValue(row.getCell(colCanal)) : null;
      const tipoVal = colTipo > 0 ? cellValue(row.getCell(colTipo)) : null;
      const obsVal = colObs > 0 ? cellValue(row.getCell(colObs)) : null;

      const fechaMs = toDateMs(fechaVal);
      const concepto = toStr(conceptoVal);
      const monto = toNumber(cantidadVal);
      const tipoStr = toStr(tipoVal);

      // Fila en blanco: contar para detener
      if (!fechaMs && !concepto && !monto) {
        blancasConsecutivas++;
        if (blancasConsecutivas >= 2) return; // detener iteración no es posible en eachRow, pero marcamos
        return;
      }

      // Si hay varias en blanco consecutivas y de repente aparece texto, puede ser resumen → ignorar
      if (blancasConsecutivas >= 2) {
        // Ya estamos en zona de resúmenes, ignorar
        return;
      }

      blancasConsecutivas = 0;

      // Validar campos mínimos
      if (!fechaMs) {
        if (concepto || monto) {
          advertencias.push(`Fila ${rowNumber}: se omitió (fecha inválida o ausente).`);
        }
        return;
      }

      if (!monto || monto <= 0) {
        advertencias.push(`Fila ${rowNumber}: se omitió (monto inválido o cero).`);
        return;
      }

      const tipo = normalizarTipo(tipoStr);
      if (!tipo) {
        advertencias.push(`Fila ${rowNumber}: TIPO "${tipoStr}" no reconocido, se omitió.`);
        return;
      }

      movimientos.push({
        fecha: fechaMs,
        categoria: concepto,
        monto,
        nombre: toStr(nombreVal),
        metodoPago: normalizarMetodoPago(toStr(canalVal)),
        tipo,
        referencia: toStr(obsVal),
      });
    });
  }

  return { obraNombre, partidas, movimientos, advertencias };
}

// ── Importar CSV ─────────────────────────────────────────────────────────────
// Formato plano: una fila de encabezados (FECHA, CONCEPTO, CANTIDAD, NOMBRE,
// CANAL, TIPO, OBSERVACIONES) seguida de filas de movimientos. A diferencia del
// .xlsx, el CSV no trae bloque de partidas de presupuesto (por eso `partidas`
// siempre viene vacío desde este parser).

/** Parsea una línea CSV respetando comillas dobles (soporta el delimitador y comillas escapadas ""). */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

/** Convierte texto de monto ("$1,234.50", "1234.50", etc.) a número. */
export function parseMontoCsv(raw: string): number | undefined {
  const s = raw.trim().replace(/[$\s]/g, '').replace(/,/g, '');
  if (!s) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Convierte texto de fecha ("DD/MM/YYYY", "YYYY-MM-DD" u otro formato reconocido
 * por `Date`) a epoch ms anclado a medianoche de México, igual que `toDateMs`.
 */
function parseFechaCsv(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;

  // DD/MM/YYYY o DD-MM-YYYY (convención usada en México / la plantilla .xlsx)
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return medianocheMx(y, mo - 1, d);
    }
  }

  // YYYY-MM-DD (ISO)
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    return medianocheMx(y, mo - 1, d);
  }

  // Fallback: dejar que Date lo intente (acepta "2024-01-05T00:00:00Z", etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return medianocheMx(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  return undefined;
}

/**
 * Parsea un CSV de movimientos (mismas columnas que el .xlsx: FECHA, CONCEPTO,
 * CANTIDAD, NOMBRE, CANAL, TIPO, OBSERVACIONES). No produce partidas de
 * presupuesto (el CSV es solo el libro de movimientos).
 */
export { parseFechaCsv };

export function parsearCsvObra(texto: string): ParsedObraData {
  const advertencias: string[] = [];
  const partidas: ExcelPartida[] = [];
  const movimientos: ExcelMovimiento[] = [];

  // Quitar BOM si el archivo lo trae (común en exportes de Excel).
  const limpio = texto.replace(/^﻿/, '');
  const lineas = limpio.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');

  if (lineas.length === 0) {
    return { obraNombre: '', partidas, movimientos, advertencias: ['El archivo CSV está vacío.'] };
  }

  // Detectar delimitador: coma o punto y coma (exportes de Excel en es-MX usan ;).
  const primeraLinea = lineas[0];
  const numComas = (primeraLinea.match(/,/g) ?? []).length;
  const numPuntoYComa = (primeraLinea.match(/;/g) ?? []).length;
  const delimiter = numPuntoYComa > numComas ? ';' : ',';

  const filas = lineas.map((l) => parseCsvLine(l, delimiter));

  // ── Encabezados ────────────────────────────────────────────────────────────
  let colFecha = -1;
  let colConcepto = -1;
  let colCantidad = -1;
  let colNombre = -1;
  let colCanal = -1;
  let colTipo = -1;
  let colObs = -1;
  let headerRowIdx = -1;

  for (let r = 0; r < filas.length; r++) {
    const fila = filas[r];
    let hasFecha = false;
    let hasConcepto = false;
    fila.forEach((valor, i) => {
      const v = valor.trim().toUpperCase();
      if (v === 'FECHA') { hasFecha = true; colFecha = i; }
      else if (v === 'CONCEPTO') { hasConcepto = true; colConcepto = i; }
      else if (v === 'CANTIDAD') colCantidad = i;
      else if (v === 'NOMBRE') colNombre = i;
      else if (v === 'CANAL') colCanal = i;
      else if (v === 'TIPO') colTipo = i;
      else if (v === 'OBSERVACIONES' || v === 'OBS') colObs = i;
    });
    if (hasFecha && hasConcepto) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      obraNombre: '',
      partidas,
      movimientos,
      advertencias: ['No se encontró la fila de encabezados (FECHA, CONCEPTO, ...) en el CSV.'],
    };
  }

  // ── Filas de movimientos ─────────────────────────────────────────────────────
  for (let r = headerRowIdx + 1; r < filas.length; r++) {
    const fila = filas[r];
    const rowNumber = r + 1; // 1-based, coincide con el número de línea del archivo

    const fechaRaw = colFecha >= 0 ? (fila[colFecha] ?? '') : '';
    const conceptoRaw = colConcepto >= 0 ? (fila[colConcepto] ?? '') : '';
    const cantidadRaw = colCantidad >= 0 ? (fila[colCantidad] ?? '') : '';
    const nombreRaw = colNombre >= 0 ? (fila[colNombre] ?? '') : '';
    const canalRaw = colCanal >= 0 ? (fila[colCanal] ?? '') : '';
    const tipoRaw = colTipo >= 0 ? (fila[colTipo] ?? '') : '';
    const obsRaw = colObs >= 0 ? (fila[colObs] ?? '') : '';

    const fechaMs = parseFechaCsv(fechaRaw);
    const concepto = conceptoRaw.trim();
    const monto = parseMontoCsv(cantidadRaw);
    const tipoStr = tipoRaw.trim();

    // Fila en blanco: ignorar silenciosamente.
    if (!fechaMs && !concepto && !monto) continue;

    if (!fechaMs) {
      if (concepto || monto) {
        advertencias.push(`Fila ${rowNumber}: se omitió (fecha inválida o ausente).`);
      }
      continue;
    }

    if (!monto || monto <= 0) {
      advertencias.push(`Fila ${rowNumber}: se omitió (monto inválido o cero).`);
      continue;
    }

    const tipo = normalizarTipo(tipoStr);
    if (!tipo) {
      advertencias.push(`Fila ${rowNumber}: TIPO "${tipoStr}" no reconocido, se omitió.`);
      continue;
    }

    movimientos.push({
      fecha: fechaMs,
      categoria: concepto,
      monto,
      nombre: nombreRaw.trim(),
      metodoPago: normalizarMetodoPago(canalRaw.trim()),
      tipo,
      referencia: obsRaw.trim(),
    });
  }

  if (movimientos.length === 0 && advertencias.length === 0) {
    advertencias.push('El CSV no contiene filas de movimientos después del encabezado.');
  }

  return { obraNombre: '', partidas, movimientos, advertencias };
}
