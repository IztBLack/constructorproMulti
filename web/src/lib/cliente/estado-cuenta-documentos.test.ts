// El IVA cobrado en los documentos del estado de cuenta: el PDF del cliente,
// el PDF de caja interno y el Excel. Mismos números que `totalesEstadoCuenta`;
// la nota "se entera al SAT" solo en lo interno.

import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import { PDF_CONFIG_POR_DEFECTO } from '@/lib/data/empresa-config';
import type { Movimiento, Obra, PartidaPresupuesto } from '@/lib/data/types';
import type { EstadoCuentaObra, ObraPortal } from '@/lib/data/portal-cliente';
import { construirCajaDocumentoHtml } from '@/lib/obra/documento-caja-html';
import { construirExcelEstadoCuenta, parsearExcelObra } from '@/lib/excel/estado-cuenta-excel';
import { construirEstadoCuentaClienteHtml } from './documento-estado-cuenta-html';
import { totalesEstadoCuenta } from './estado-cuenta-calculo';

const NOTA_SAT = 'se entera al SAT';

const obra: Obra = {
  id: '11111111-1111-4111-8111-111111111111',
  empresa_id: 'e',
  nombre: 'Casa Norte',
  cliente: 'Cliente',
  cliente_id: null,
  ubicacion: null,
  fecha_inicio: 1_788_000_000_000,
  activa: true,
  avance: 0,
  cotizacion_origen_id: null,
  pdf_config_json: null,
  texto_final: null,
  created_at: 0,
  updated_at: 0,
  server_updated_at: 0,
  deleted_at: null,
};

const partidas: PartidaPresupuesto[] = [
  {
    id: 'p1',
    obra_id: obra.id,
    empresa_id: 'e',
    concepto: 'Obra negra',
    seccion: null,
    unidad: 'lote',
    cantidad: 1,
    precio_unitario: 4_862_550,
    orden: 1,
  } as PartidaPresupuesto,
];

function mov(id: string, tipo: 'ENTRADA' | 'SALIDA', monto: number): Movimiento {
  return {
    id,
    empresa_id: 'e',
    obra_id: obra.id,
    fecha: 1_788_000_000_000,
    tipo,
    categoria: tipo === 'ENTRADA' ? 'Anticipo' : 'Material',
    concepto: tipo === 'ENTRADA' ? 'Anticipo 30 % más IVA' : 'Cemento',
    monto,
    metodo_pago: 'TRANSFERENCIA',
    referencia: null,
    nombre: null,
    cotizacion_id: null,
    partida_id: null,
    created_at: 0,
    updated_at: 0,
  } as Movimiento;
}

const movimientos = [mov('m1', 'ENTRADA', 1_692_167.4), mov('m2', 'SALIDA', 100_000)];
const iva16 = { tasaPct: 16 };

function estadoCliente(ivaPct: number): EstadoCuentaObra {
  const entradas = movimientos
    .filter((m) => m.tipo === 'ENTRADA')
    .map((m) => ({
      id: m.id,
      fecha: m.fecha,
      concepto: m.concepto,
      categoria: m.categoria,
      monto: m.monto,
      metodo_pago: m.metodo_pago,
      referencia: m.referencia,
    }));
  const t = totalesEstadoCuenta({ partidas, entradas, extras: [], iva: { tasaPct: ivaPct } });
  return { ...t, partidas, extras: [], entradas };
}

const obraPortal: ObraPortal = {
  id: obra.id,
  nombre: obra.nombre,
  cliente: obra.cliente,
  ubicacion: null,
  fecha_inicio: obra.fecha_inicio,
  activa: true,
  avance: 0,
  cliente_id: null,
  texto_final: null,
};

// formatCurrency usa es-MX: $1,458,765.00
const pesos = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

describe('PDF del estado de cuenta del CLIENTE', () => {
  test('con IVA: pagado sin IVA, el IVA pagado aparte y sin la nota del SAT', () => {
    const html = construirEstadoCuentaClienteHtml({
      obra: obraPortal,
      estado: estadoCliente(16),
      nombreEmpresa: 'Constructora',
      pdf: PDF_CONFIG_POR_DEFECTO,
      hoy: 1_788_000_000_000,
    });
    expect(html).toContain('Pagado (sin IVA) (30%)');
    expect(html).toContain(pesos(1_458_765));
    expect(html).toContain('IVA pagado (16 %)');
    expect(html).toContain(pesos(233_402.4));
    expect(html).toContain('PENDIENTE (SIN IVA)');
    expect(html).toContain(pesos(3_403_785));
    expect(html).not.toContain(NOTA_SAT);
  });

  test('sin IVA: el documento de siempre', () => {
    const html = construirEstadoCuentaClienteHtml({
      obra: obraPortal,
      estado: estadoCliente(0),
      nombreEmpresa: 'Constructora',
      pdf: PDF_CONFIG_POR_DEFECTO,
      hoy: 1_788_000_000_000,
    });
    expect(html).toContain('Pagado (35%)');
    expect(html).not.toContain('IVA pagado');
    expect(html).not.toContain('sin IVA');
  });
});

describe('PDF de caja INTERNO', () => {
  test('con IVA: cobrado y por cobrar sin IVA, IVA cobrado con la nota del SAT; el saldo de caja no cambia', () => {
    const html = construirCajaDocumentoHtml({
      obra,
      partidas,
      movimientos,
      nombreEmpresa: 'Constructora',
      pdf: PDF_CONFIG_POR_DEFECTO,
      iva: iva16,
    });
    expect(html).toContain('Cobrado (sin IVA)');
    expect(html).toContain('Por cobrar (sin IVA)');
    expect(html).toContain(pesos(3_403_785));
    expect(html).toContain(`IVA cobrado (16 %): <strong>$${pesos(233_402.4)}</strong>`);
    expect(html).toContain(NOTA_SAT);
    // Saldo de caja = entradas − salidas, tal como entró el dinero.
    expect(html).toContain(pesos(1_592_167.4));
  });

  test('los extras aprobados ya suman al costo total', () => {
    const html = construirCajaDocumentoHtml({
      obra,
      partidas,
      movimientos,
      nombreEmpresa: 'Constructora',
      pdf: PDF_CONFIG_POR_DEFECTO,
      extras: [{ total: 37_450 }],
    });
    expect(html).toContain(pesos(4_900_000));
    expect(html).toContain('extras aprobados');
    expect(html).not.toContain(NOTA_SAT);
  });
});

describe('Excel del estado de cuenta', () => {
  async function filas(buf: Buffer): Promise<Map<string, unknown>> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(buf).buffer);
    const ws = wb.worksheets[0];
    const m = new Map<string, unknown>();
    ws.eachRow((row) => {
      const a = row.getCell(1).value;
      if (typeof a === 'string') m.set(a, row.getCell(3).value);
    });
    return m;
  }

  test('con IVA: renglones de IVA y el importador los ignora (el presupuesto regresa igual)', async () => {
    const buf = await construirExcelEstadoCuenta({
      obra,
      partidas,
      movimientos,
      extras: [{ total: 37_450 }],
      iva: iva16,
    });
    const f = await filas(buf);
    expect(f.get('EXTRAS APROBADOS:')).toBe(37_450);
    expect(f.get('COSTO TOTAL (SIN IVA):')).toBe(4_900_000);
    expect(f.get('RECIBIDO (CON IVA):')).toBe(1_692_167.4);
    expect(f.get('IVA COBRADO (16 %):')).toBe(233_402.4);
    expect(f.get('COBRADO (SIN IVA):')).toBe(1_458_765);
    expect(f.get('POR COBRAR (SIN IVA):')).toBe(3_441_235);
    expect(f.has('El IVA cobrado no es tuyo: se entera al SAT.')).toBe(true);

    const parsed = await parsearExcelObra(new Uint8Array(buf).buffer as ArrayBuffer);
    expect(parsed.partidas.map((p) => p.concepto.toUpperCase())).toEqual(['OBRA NEGRA']);
    expect(parsed.movimientos).toHaveLength(2);
  });

  test('sin IVA: las filas de siempre', async () => {
    const f = await filas(await construirExcelEstadoCuenta({ obra, partidas, movimientos }));
    expect(f.get('COSTO TOTAL:')).toBe(4_862_550);
    expect(f.get('RECIBIDO:')).toBe(1_692_167.4);
    expect(f.get('PENDIENTE:')).toBe(3_170_382.6);
    expect(f.has('IVA COBRADO (16 %):')).toBe(false);
  });
});
