import { describe, expect, test } from 'vitest';
import { construirCotizacionDocumentoHtml, type CotizacionDocData } from './documento-html';
import { PDF_CONFIG_POR_DEFECTO } from '@/lib/data/empresa-config';
import { textoIntegrado } from '@/lib/pdf/textos-finales';

/// El párrafo final se resuelve DENTRO del builder (tiene cuatro llamadores:
/// admin y cliente, vista previa y descarga). Estas pruebas cuidan justo esa
/// costura: que el documento imprima el texto que manda y no uno fijo.

const cotizacion: CotizacionDocData = {
  id: '11111111-2222-3333-4444-555566667777',
  cliente: 'Sr. Ramírez',
  nombre_proyecto: 'Casa Ramírez',
  ubicacion: 'Xalapa',
  fecha: Date.UTC(2026, 7, 11, 6),
  descuento: 0,
  iva_enabled: true,
  notas: null,
  secciones: [],
};

const totales = { subtotal: 156400, descuentoMonto: 0, ivaPct: 16, ivaMonto: 25024, total: 181424 };

function construir(over: Partial<CotizacionDocData>, textos = {}) {
  return construirCotizacionDocumentoHtml({
    cotizacion: { ...cotizacion, ...over },
    totales,
    nombreEmpresa: 'ConstructorPro',
    pdf: { ...PDF_CONFIG_POR_DEFECTO, textos },
  });
}

describe('párrafo final del documento', () => {
  test('sin nada configurado imprime el texto de siempre', () => {
    const html = construir({});
    expect(html).toContain(
      'Esta cotización tiene una vigencia de 30 días naturales a partir de la fecha de emisión.',
    );
    expect(html).toContain('Los precios incluyen IVA (16%).');
  });

  test('el texto general de la empresa reemplaza al de siempre', () => {
    const html = construir({}, { cotizacion: 'Vigencia de 15 días. Precios sujetos a cambio.' });
    expect(html).toContain('Vigencia de 15 días. Precios sujetos a cambio.');
    expect(html).not.toContain('vigencia de 30 días naturales');
  });

  test('el texto de la cotización le gana al general', () => {
    const html = construir(
      { texto_final: 'Precios firmes hasta el 30 de septiembre de 2026.' },
      { cotizacion: 'Vigencia de 15 días.' },
    );
    expect(html).toContain('Precios firmes hasta el 30 de septiembre de 2026.');
    expect(html).not.toContain('Vigencia de 15 días.');
  });

  test('sigue la tasa de IVA de la cotización, no una fija', () => {
    const html = construirCotizacionDocumentoHtml({
      cotizacion,
      totales: { ...totales, ivaPct: 8 },
      nombreEmpresa: 'ConstructorPro',
      pdf: PDF_CONFIG_POR_DEFECTO,
    });
    expect(html).toContain('Los precios incluyen IVA (8%).');
  });

  test('un texto propio se escapa: no puede inyectar HTML en el documento', () => {
    const html = construir({ texto_final: 'Pago <b>al contado</b> & sin excepción' });
    expect(html).toContain('Pago &lt;b&gt;al contado&lt;/b&gt; &amp; sin excepción');
    expect(html).not.toContain('<b>al contado</b>');
  });

  test('lo que imprime es exactamente lo que resuelve el módulo puro', () => {
    const esperado = textoIntegrado('cotizacion', {
      nombreEmpresa: 'ConstructorPro',
      ivaEnabled: false,
      ivaPct: 16,
    });
    expect(construir({ iva_enabled: false })).toContain(esperado);
  });
});
