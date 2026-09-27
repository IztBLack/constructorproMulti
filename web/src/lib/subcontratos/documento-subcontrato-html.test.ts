import { describe, expect, test } from 'vitest';
import { construirSubcontratoHtml } from './documento-subcontrato-html';
import { LEYENDA_LEGAL } from './clausulas';
import type { SubcontratoCompleto } from '@/lib/data/subcontratos';
import type { PdfConfig } from '@/lib/data/empresa-config';

const pdf = { colorHex: '#0369A1', textos: {} } as unknown as PdfConfig;

function contrato(extra: Partial<SubcontratoCompleto> = {}): SubcontratoCompleto {
  return {
    id: '00000000-0000-0000-0000-00000000abcd',
    obra_id: 'o1',
    subcontratista_id: 's1',
    subcontratista_nombre: 'Orlando <Ramoz>',
    nota_obra_id: null,
    alcance: 'Base de tinacos',
    monto: null,
    retencion_pct: 4,
    forma_pago: '',
    fecha_inicio: null,
    fecha_fin: null,
    fecha_firma: null,
    estado: 'BORRADOR',
    clausulas: null,
    texto_final: null,
    notas: 'nota interna que no sale',
    created_at: 0,
    renglones: [
      { id: 'r1', subcontrato_id: 'c', concepto: 'Base de tinacos', unidad: '', cantidad: null, precio_unitario: null, importe: 123000, orden: 100 },
    ],
    pagos: [{ id: 'p1', subcontrato_id: 'c', fecha: 0, monto: 62000, retencion: 2480, metodo_pago: '', referencia: '', notas: '', movimiento_id: null }],
    ...extra,
  };
}

describe('PDF del contrato de subcontrato', () => {
  test('escapa el texto del usuario, lleva la leyenda legal y las firmas de las partes', () => {
    const html = construirSubcontratoHtml({ contrato: contrato(), obra: null, nombreEmpresa: 'Constructora Uno', pdf });
    expect(html).not.toContain('<Ramoz>');
    expect(html).toContain('Orlando &lt;Ramoz&gt;');
    expect(html).toContain(LEYENDA_LEGAL);
    expect(html).toContain('Contratante · Constructora Uno');
    expect(html).toContain('PRIMERA. OBJETO.');
    expect(html).not.toContain('nota interna que no sale');
  });

  test('cláusulas propias mandan tal cual', () => {
    const html = construirSubcontratoHtml({
      contrato: contrato({ clausulas: 'ÚNICA. Todo de palabra.' }),
      obra: null,
      nombreEmpresa: 'X',
      pdf,
    });
    expect(html).toContain('ÚNICA. Todo de palabra.');
    expect(html).not.toContain('PRIMERA. OBJETO.');
  });
});
