import { describe, expect, test } from 'vitest';
import { armarHoja, hojaComoTexto, type DocumentoOrigen, type EntradaHoja } from './hoja';
import { armarPaquete, esRaya, ivaSiTuvieraFactura } from './paquete';
import { construirExcelPaquete, construirZipPaquete } from './paquete-excel';
import type { ClienteFiscal, Cobro, CobroFiscal, EmpresaFiscal } from './tipos';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const EMISOR: EmpresaFiscal = {
  rfc: 'CPR200101AB1',
  razon_social: 'CONSTRUCTORA DE PRUEBA',
  regimen: '601',
  cp_fiscal: '64000',
};

const RECEPTOR: ClienteFiscal = {
  cliente_id: 'cli',
  rfc: 'GODE561231GR8',
  razon_social: 'EMILIO GOMEZ DIAZ',
  regimen: '612',
  cp_fiscal: '06300',
  uso_cfdi: 'I01',
  correo_factura: null,
  constancia_path: null,
  fiscales_confirmados_at: 1,
};

const DOC: DocumentoOrigen = {
  titulo: 'Casa Gómez',
  total: 116000,
  conIva: true,
  ivaPct: 16,
  conceptos: [
    { id: 'p1', tabla: 'partidas', descripcion: 'Muro', cantidad: 100, unidad: 'm2', precioUnitario: 600, claveSat: '72151900', unidadSat: 'MTK' },
    { id: 'p2', tabla: 'partidas', descripcion: 'Losa', cantidad: 1, unidad: 'lote', precioUnitario: 40000, claveSat: null, unidadSat: null },
  ],
};

function fiscal(parcial: Partial<CobroFiscal>): CobroFiscal {
  return {
    id: 'f', pago_id: null, movimiento_id: null, estado: 'por_facturar', metodo_pago: null, forma_pago: null,
    uso_cfdi: null, iva_modo: null, ret_isr_pct: null, ret_iva_pct: null, uuid: null, fecha_factura: null,
    total_factura: null, xml_path: null, pdf_path: null, parcialidad: null, complemento_uuid: null,
    complemento_fecha: null, complemento_xml_path: null, notas: '', ...parcial,
  };
}

function cobro(id: string, fecha: number, monto: number, concepto: string, f: CobroFiscal | null = null): Cobro {
  return {
    origen: 'pago', id, fecha, monto, metodo: 'TRANSFERENCIA', concepto, referencia: '',
    documentoId: 'cot', documentoNombre: 'Casa Gómez', clienteId: 'cli', clienteNombre: 'Emilio', fiscal: f,
  };
}

function entrada(c: Cobro, otros: Cobro[] = [], extra: Partial<EntradaHoja> = {}): EntradaHoja {
  return { cobro: c, documento: DOC, emisor: EMISOR, receptor: RECEPTOR, otrosCobros: otros, ivaPorDefecto: 16, ...extra };
}

const valor = (campos: { etiqueta: string; valor: string }[], etiqueta: string) =>
  campos.find((c) => c.etiqueta.startsWith(etiqueta))?.valor;

describe('armarHoja', () => {
  test('los 4 pasos en el orden del facturador y sin faltantes', () => {
    const h = armarHoja(entrada(cobro('c1', 100, 116000, 'Liquidación')));
    expect(h.tipo).toBe('factura');
    expect(h.emisor.map((c) => c.etiqueta)[0]).toBe('RFC');
    expect(valor(h.receptor, 'Uso del CFDI')).toBe('I01');
    expect(h.faltantes).toEqual([]);
    expect(h.avisos.some((a) => a.tipo === 'ok')).toBe(true); // cliente confirmó
  });

  test('si el cobro paga todo, van los conceptos del documento y suman el subtotal', () => {
    const h = armarHoja(entrada(cobro('c1', 100, 116000, 'Liquidación')));
    expect(h.conceptos).toHaveLength(2);
    expect(h.conceptos[0]).toMatchObject({ claveProdServ: '72151900', claveUnidad: 'MTK', claveSugerida: false });
    expect(h.conceptos[1]).toMatchObject({ claveProdServ: '72111000', claveSugerida: true, unidadSugerida: true });
    expect(h.conceptos.reduce((s, c) => s + c.importe, 0)).toBeCloseTo(h.desglose.subtotal, 2);
    expect(h.avisos.some((a) => /sugeridas/.test(a.texto))).toBe(true);
    expect(valor(h.pago, 'Método de pago')).toBe('PUE');
    expect(valor(h.pago, 'Forma de pago')).toBe('03');
  });

  test('el primer cobro "anticipo" se factura con la clave del SAT para anticipos', () => {
    const h = armarHoja(entrada(cobro('c1', 100, 58000, 'Anticipo 50%')));
    expect(h.conceptos).toEqual([
      expect.objectContaining({ claveProdServ: '84111506', claveUnidad: 'ACT', descripcion: 'Anticipo del bien o servicio' }),
    ]);
    expect(h.notas.some((n) => /relación 07/.test(n))).toBe(true);
  });

  test('un pago posterior avisa que hay que relacionar el anticipo facturado', () => {
    const anticipo = cobro('c1', 100, 58000, 'Anticipo', fiscal({ estado: 'facturado', metodo_pago: 'PUE', uuid: 'AAAA' }));
    const h = armarHoja(entrada(cobro('c2', 200, 20000, 'Avance'), [anticipo]));
    expect(h.conceptos).toHaveLength(1);
    expect(h.conceptos[0].claveProdServ).toBe('72151900'); // la clave con más importe
    expect(h.notas.some((n) => n.includes('AAAA') && /07/.test(n))).toBe(true);
  });

  test('abono a una factura PPD: hoja de complemento de pago con su parcialidad', () => {
    const ppd = cobro('c1', 100, 58000, 'Primer pago',
      fiscal({ estado: 'facturado', metodo_pago: 'PPD', uuid: 'PPD-1', total_factura: 116000 }));
    const h = armarHoja(entrada(cobro('c2', 200, 58000, 'Segundo pago'), [ppd]));
    expect(h.tipo).toBe('complemento');
    expect(h.facturaRelacionada).toBe('PPD-1');
    expect(h.parcialidad).toEqual({ numero: 2, saldoAnterior: 58000, pagado: 58000, saldoInsoluto: 0 });
    expect(valor(h.receptor, 'Uso del CFDI')).toBe('CP01');
    expect(h.notas.some((n) => /complemento de pago/.test(n))).toBe(true);
  });

  test('una PPD ya pagada completa no convierte el siguiente cobro en complemento', () => {
    const ppd = cobro('c1', 100, 116000, 'Pago',
      fiscal({ estado: 'facturado', metodo_pago: 'PPD', uuid: 'PPD-1', total_factura: 116000 }));
    expect(armarHoja(entrada(cobro('c2', 200, 5000, 'Extra'), [ppd])).tipo).toBe('factura');
  });

  test('cotización sin IVA: se avisa que el IVA va encima y se sugiere PPD', () => {
    const h = armarHoja(entrada(cobro('c1', 100, 10000, 'Pago'), [], { documento: { ...DOC, conIva: false } }));
    expect(h.ivaModo).toBe('aparte');
    expect(h.desglose.total).toBe(11600);
    expect(valor(h.pago, 'Método de pago')).toBe('PPD');
    expect(h.avisos.some((a) => /sin IVA/.test(a.texto))).toBe(true);
  });

  test('público en general: régimen 616, uso S01 y el CP del emisor', () => {
    const h = armarHoja(entrada(cobro('c1', 100, 1000, 'Pago'), [], {
      receptor: { ...RECEPTOR, rfc: 'XAXX010101000', fiscales_confirmados_at: null },
    }));
    expect(valor(h.receptor, 'Régimen')).toBe('616');
    expect(valor(h.receptor, 'Uso del CFDI')).toBe('S01');
    expect(valor(h.receptor, 'Código postal')).toBe('64000');
  });

  test('sin datos fiscales: dice qué falta', () => {
    const h = armarHoja(entrada(cobro('c1', 100, 1000, 'Pago'), [], { emisor: null, receptor: null }));
    expect(h.faltantes).toEqual(expect.arrayContaining(['Tu rfc', 'RFC de tu cliente']));
  });

  test('siempre lleva la nota del fondo de garantía y sale como texto', () => {
    const h = armarHoja(entrada(cobro('c1', 100, 1000, 'Pago')));
    expect(h.notas.some((n) => /fondo de garantía/.test(n))).toBe(true);
    const t = hojaComoTexto(h);
    expect(t).toMatch(/1\. EMISOR[\s\S]*2\. RECEPTOR[\s\S]*3\. CONCEPTOS[\s\S]*4\. PAGO/);
  });
});

describe('paquete para el contador', () => {
  const ppd = cobro('c1', 100, 58000, 'Primer pago',
    fiscal({ estado: 'facturado', metodo_pago: 'PPD', uuid: 'PPD-1', total_factura: 116000 }));
  const abono = cobro('c2', 200, 58000, 'Segundo pago');
  const pue = cobro('c3', 300, 11600, 'Extra', fiscal({ estado: 'facturado', metodo_pago: 'PUE', uuid: 'PUE-1', total_factura: 11600 }));
  const pendiente = cobro('c4', 400, 23200, 'Avance');
  const sinFactura = cobro('c5', 500, 100, 'Propina', fiscal({ estado: 'no_requiere' }));
  const todos = [ppd, abono, pue, pendiente, sinFactura];
  const entradas = todos.map((c) => entrada(c, todos.filter((o) => o.id !== c.id)));
  const gastos = [
    { obra: 'Casa', fecha: 1, categoria: 'MATERIAL', concepto: 'Cemento', nombre: 'Ferre', monto: 1160, metodo: 'EFECTIVO', referencia: '' },
    { obra: 'Casa', fecha: 2, categoria: 'NOMINA', concepto: 'Raya semana 1', nombre: '', monto: 9000, metodo: 'EFECTIVO', referencia: '' },
  ];
  const p = armarPaquete(entradas, gastos);

  test('cada cobro cae en su hoja', () => {
    expect(p.porFacturar.map((f) => f.concepto)).toEqual(['Avance']);
    expect(p.complementos.map((f) => f.pagado)).toEqual([58000, 58000]);
    expect(p.complementos[1]).toMatchObject({ folioFactura: 'PPD-1', parcialidad: 2, saldoInsoluto: 0 });
    expect(p.facturado.map((f) => f.folio)).toEqual(['PPD-1', 'PUE-1']);
    expect(p.facturado[0].estadoCobro).toBe('Cobrada');
    expect(p.resumen.cobrosSinFactura).toBe(1);
  });

  test('raya y gastos por separado; IVA estimado', () => {
    expect(esRaya('NOMINA')).toBe(true);
    expect(esRaya('MATERIAL')).toBe(false);
    expect(p.gastos).toHaveLength(1);
    expect(p.raya).toHaveLength(1);
    expect(ivaSiTuvieraFactura(1160)).toBe(160);
    expect(p.resumen.ivaGastos).toBe(160);
    expect(p.resumen.ivaPorFacturar).toBe(3200);
    expect(p.resumen.ivaFacturado).toBe(8000 + 1600);
  });

  test('el Excel trae las 6 hojas y el ZIP el Excel y los XML', async () => {
    const excel = await construirExcelPaquete({ paquete: p, empresa: 'Prueba', periodo: 'sept 2026' });
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(excel as unknown as ArrayBuffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual([
      'Por facturar', 'Complementos de pago', 'Facturado', 'Gastos por obra', 'Raya', 'Resumen IVA',
    ]);
    expect(String(libro.getWorksheet('Resumen IVA')!.getCell('A2').value)).toMatch(/ESTIMADO, NO ES DECLARACIÓN/);

    const zip = await construirZipPaquete({
      nombreExcel: 'paquete.xlsx',
      excel,
      archivos: [
        { ruta: 'facturas/a.xml', datos: new TextEncoder().encode('<x/>') },
        { ruta: 'facturas/a.xml', datos: new TextEncoder().encode('<y/>') },
      ],
      leeme: 'hola',
    });
    const leido = await JSZip.loadAsync(zip);
    expect(Object.keys(leido.files).sort()).toEqual(
      expect.arrayContaining(['paquete.xlsx', 'LEEME.txt', 'facturas/a.xml', 'facturas/a_2.xml']),
    );
  });
});

describe('hoja de una ESTIMACIÓN (F3)', () => {
  const est = {
    folio: 3,
    obra: 'Casa Gómez',
    periodo: '1 sep al 15 sep',
    importe: 11_000,
    amortizacion: 3_300,
    fondoGarantia: 550,
    retenciones: [{ concepto: '5 al millar', importe: 55 }],
    neto: 8_327,
    ivaPct: 16,
    renglones: [
      { presupuestoId: 'p1', descripcion: 'Muro', cantidad: 10, unidad: 'm2', precioUnitario: 1_000, importe: 10_000, claveSat: '72151900', unidadSat: 'MTK' },
      { presupuestoId: 'p2', descripcion: 'Losa', cantidad: 2.5, unidad: 'm2', precioUnitario: 400, importe: 1_000, claveSat: null, unidadSat: null },
    ],
    anticipoUuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    esFiniquito: false,
  };
  const c: Cobro = { ...cobro('e1', 500, 8_327, 'Estimación 3'), origen: 'estimacion', documentoId: 'obra' };

  test('factura el IMPORTE de lo ejecutado + IVA, con sus renglones y sus claves', () => {
    const h = armarHoja(entrada(c, [], { estimacion: est }));
    expect(h.tipo).toBe('factura');
    expect(h.desglose.subtotal).toBe(11_000);
    expect(h.desglose.iva).toBe(1_760);
    expect(h.conceptos.map((x) => [x.claveProdServ, x.importe])).toEqual([
      ['72151900', 10_000],
      ['72111000', 1_000],
    ]);
    expect(h.conceptos[1].claveSugerida).toBe(true);
  });

  test('anticipo relacionado tipo 07; fondo y retenciones NO van en la factura', () => {
    const h = armarHoja(entrada(c, [], { estimacion: est }));
    const texto = h.notas.join(' ');
    expect(texto).toMatch(/tipo 07/);
    expect(texto).toMatch(/AAAAAAAA-BBBB/);
    expect(texto).toMatch(/fondo de garantía .* NO se resta/);
    expect(texto).toMatch(/5 al millar.*no va en el CFDI/);
  });

  test('sin IVA pactado usa el IVA de la empresa (el IVA va encima)', () => {
    const h = armarHoja(entrada(c, [], { estimacion: { ...est, ivaPct: 0 }, ivaPorDefecto: 16 }));
    expect(h.ivaModo).toBe('aparte');
    expect(h.desglose.total).toBe(12_760);
  });
});
