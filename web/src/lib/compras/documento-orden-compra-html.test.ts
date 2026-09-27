import { describe, expect, it } from 'vitest';
import { PDF_CONFIG_POR_DEFECTO } from '@/lib/data/empresa-config';
import { construirOrdenCompraHtml } from './documento-orden-compra-html';
import type { OrdenConRenglones } from './tipos';

function orden(extra: Partial<OrdenConRenglones> = {}): OrdenConRenglones {
  return {
    id: 'oc1',
    empresa_id: 'e',
    obra_id: 'o',
    proveedor_id: 'p',
    folio: 12,
    fecha: Date.UTC(2026, 8, 20),
    estado: 'EMITIDA',
    iva_pct: 16,
    condiciones: 'Entrega en obra',
    dias_credito: 15,
    fecha_entrega: null,
    notas: '',
    texto_final: null,
    subtotal: 1000,
    iva: 160,
    total: 1160,
    emitida_at: Date.UTC(2026, 8, 20),
    cancelada_at: null,
    factura_uuid: null,
    factura_rfc: null,
    factura_total: null,
    factura_iva: null,
    factura_fecha: null,
    factura_xml_path: null,
    factura_pdf_path: null,
    factura_resumen: null,
    created_at: 0,
    deleted_at: null,
    renglones: [
      {
        id: 'r1',
        orden_compra_id: 'oc1',
        requisicion_renglon_id: null,
        material_id: null,
        descripcion: 'Cemento <gris>',
        unidad: 'bulto',
        cantidad: 4,
        precio_unitario: 250,
        orden: 100,
      },
    ],
    ...extra,
  };
}

const base = {
  proveedor: { nombre: 'Materiales & Co', rfc: 'MAN010101AB1', contacto: '', telefono: '555', correo: '' },
  obra: { nombre: 'Casa Juárez', ubicacion: 'Calle 1' },
  nombreEmpresa: 'Constructora Prueba',
  pdf: PDF_CONFIG_POR_DEFECTO,
};

describe('PDF de la orden de compra', () => {
  it('folio, proveedor escapado, IVA desglosado y totales congelados', () => {
    const html = construirOrdenCompraHtml({ ...base, orden: orden() });
    expect(html).toContain('OC-12');
    expect(html).toContain('Materiales &amp; Co');
    expect(html).toContain('Cemento &lt;gris&gt;');
    expect(html).not.toContain('<gris>');
    expect(html).toMatch(/IVA \(16%\)/);
    expect(html).toContain('1,160.00');
    expect(html).toContain('15 días de crédito');
    // Texto final integrado del tipo nuevo.
    expect(html).toContain('Anote el folio de esta orden');
  });

  it('un borrador sale marcado y con los totales vivos', () => {
    const html = construirOrdenCompraHtml({
      ...base,
      orden: orden({ estado: 'BORRADOR', subtotal: null, iva: null, total: null, emitida_at: null }),
    });
    expect(html).toContain('borrador sin emitir');
    expect(html).toContain('Borrador');
    expect(html).toContain('1,160.00');
  });

  it('el texto final del documento manda sobre el integrado', () => {
    const html = construirOrdenCompraHtml({ ...base, orden: orden({ texto_final: 'Pago contra entrega.' }) });
    expect(html).toContain('Pago contra entrega.');
    expect(html).not.toContain('Anote el folio de esta orden');
  });
});
