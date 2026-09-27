import { describe, expect, test } from 'vitest';
import { PDF_CONFIG_POR_DEFECTO } from '@/lib/data/empresa-config';
import { construirEstimacionHtml } from './documento-estimacion-html';
import { leerFoto } from './snapshot';

const obra = { nombre: 'Casa Bienestar MZ 2', cliente: 'Desarrolladora <Norte>', ubicacion: null };

const foto = leerFoto({
  folio: 2,
  obra: 'Casa Bienestar MZ 2',
  periodo_inicio: 1_788_000_000_000,
  periodo_fin: 1_789_000_000_000,
  renglones: [
    {
      origen: 'presupuesto',
      concepto: 'Firme <de> concreto',
      unidad: 'm2',
      contratado: 100,
      anterior: 40,
      cantidad: 20,
      acumulado: 60,
      precio_unitario: 250,
      importe: 5000,
      generadores: [{ fecha: 1_788_500_000_000, cantidad: 20, nota: 'eje 1-3' }],
    },
  ],
  importes: {
    bruto: 5000,
    amortizacion: 1500,
    subtotal: 3500,
    iva_pct: 16,
    iva: 560,
    total: 4060,
    fondo_garantia_pct: 5,
    fondo_garantia: 250,
    retenciones: [{ concepto: '5 al millar', tipo: 'PORCENTAJE', valor: 0.5, importe: 25 }],
    retenciones_total: 25,
    neto: 3785,
  },
  contrato: { anticipo: 10000, amortizacion_pct: 30, amortizado_previo: 3000, anticipo_por_amortizar: 5500 },
  acumulados: { bruto_previo: 10000, bruto_acumulado: 15000, fondo_previo: 500, fondo_acumulado: 750 },
})!;

const base = {
  folio: 2,
  texto_final: null,
  respondido_at: null,
  respondido_nombre: null,
  respuesta_origen: null,
  motivo_rechazo: null,
  cobrado_at: null,
} as const;

describe('PDF de la estimación', () => {
  test('carátula, cuerpo con acumulados, deducciones y alcance líquido', () => {
    const html = construirEstimacionHtml({
      obra,
      estimacion: { ...base, estado: 'ENVIADA' },
      foto,
      nombreEmpresa: 'Mi Empresa',
      pdf: PDF_CONFIG_POR_DEFECTO,
    });
    expect(html).toContain('#2');
    expect(html).toContain('Amortización del anticipo');
    expect(html).toContain('Fondo de garantía');
    expect(html).toContain('5 al millar');
    expect(html).toMatch(/A PAGAR[\s\S]*3,785\.00/);
    expect(html).toContain('Anticipo por amortizar');
    // Se escapa lo que capturó el usuario.
    expect(html).toContain('Firme &lt;de&gt; concreto');
    expect(html).toContain('Desarrolladora &lt;Norte&gt;');
    expect(html).not.toContain('<Norte>');
  });

  test('anexo de números generadores con lo medido en campo', () => {
    const html = construirEstimacionHtml({
      obra,
      estimacion: { ...base, estado: 'BORRADOR' },
      foto,
      nombreEmpresa: 'Mi Empresa',
      pdf: PDF_CONFIG_POR_DEFECTO,
    });
    expect(html).toContain('Números generadores');
    expect(html).toContain('eje 1-3');
    expect(html).toContain('borrador sin enviar');
  });

  test('autorizada por la oficina lo dice en el sello', () => {
    const html = construirEstimacionHtml({
      obra,
      estimacion: {
        ...base,
        estado: 'AUTORIZADA',
        respondido_at: 1_789_100_000_000,
        respondido_nombre: 'Ing. Pérez',
        respuesta_origen: 'OFICINA',
      },
      foto,
      nombreEmpresa: 'Mi Empresa',
      pdf: PDF_CONFIG_POR_DEFECTO,
    });
    expect(html).toContain('AUTORIZADA por Ing. Pérez');
    expect(html).toContain('registrada por la oficina');
  });
});
