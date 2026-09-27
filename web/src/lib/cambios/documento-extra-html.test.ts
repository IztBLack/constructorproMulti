import { describe, expect, test } from 'vitest';
import { PDF_CONFIG_POR_DEFECTO } from '@/lib/data/empresa-config';
import { construirExtraHtml } from './documento-extra-html';
import type { OrdenCambioConRenglones } from './extras';

const obra = { nombre: 'Casa Bienestar MZ 2', cliente: 'Juan Pérez', ubicacion: null };

function extra(o: Partial<OrdenCambioConRenglones> = {}): OrdenCambioConRenglones {
  return {
    id: 'e1',
    empresa_id: 'emp',
    obra_id: 'o1',
    folio: 3,
    titulo: 'Barda',
    motivo: 'Lo pidió el cliente',
    fecha: 1_700_000_000_000,
    estado: 'BORRADOR',
    foto_uri: null,
    texto_final: null,
    snapshot_json: null,
    total_enviado: null,
    enviado_at: null,
    respondido_at: null,
    respondido_nombre: null,
    motivo_rechazo: null,
    cancelado_at: null,
    created_at: 0,
    deleted_at: null,
    renglones: [
      { id: 'r1', orden_cambio_id: 'e1', concepto: 'Barda de block', unidad: 'm2', cantidad: 10, precio_unitario: 850, orden: 100 },
    ],
    ...o,
  };
}

describe('PDF del extra', () => {
  test('borrador: suma los renglones vivos y lleva la marca de borrador', () => {
    const html = construirExtraHtml({ obra, extra: extra(), nombreEmpresa: 'Mi Empresa', pdf: PDF_CONFIG_POR_DEFECTO });
    expect(html).toContain('borrador sin enviar');
    expect(html).toContain('Borrador');
    expect(html).toContain('$8,500.00');
    expect(html).toContain('#3');
  });

  test('enviado: imprime la FOTO aunque los renglones vivos digan otra cosa', () => {
    const html = construirExtraHtml({
      obra,
      extra: extra({
        estado: 'APROBADA',
        total_enviado: 1_234,
        respondido_at: 1_700_000_000_000,
        respondido_nombre: 'Juan Pérez',
        snapshot_json: {
          folio: 3,
          titulo: 'Barda (como se envió)',
          motivo: '',
          fecha: 1,
          foto_uri: null,
          renglones: [{ concepto: 'Lo enviado', unidad: 'lote', cantidad: 1, precio_unitario: 1_234, importe: 1_234 }],
          total: 1_234,
        },
      }),
      nombreEmpresa: 'Mi Empresa',
      pdf: PDF_CONFIG_POR_DEFECTO,
    });
    expect(html).toContain('Lo enviado');
    expect(html).not.toContain('Barda de block');
    expect(html).toContain('$1,234.00');
    expect(html).toContain('APROBADO por Juan Pérez');
    expect(html).not.toContain('borrador sin enviar');
  });

  test('escapa lo que escribe el usuario', () => {
    const html = construirExtraHtml({
      obra,
      extra: extra({ titulo: '<script>alert(1)</script>' }),
      nombreEmpresa: 'Mi Empresa',
      pdf: PDF_CONFIG_POR_DEFECTO,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('rechazado: muestra el motivo', () => {
    const html = construirExtraHtml({
      obra,
      extra: extra({
        estado: 'RECHAZADA',
        total_enviado: 10,
        respondido_at: 1,
        motivo_rechazo: 'Muy caro',
        snapshot_json: { folio: 3, titulo: 'x', motivo: '', renglones: [], total: 10 },
      }),
      nombreEmpresa: 'Mi Empresa',
      pdf: PDF_CONFIG_POR_DEFECTO,
    });
    expect(html).toContain('RECHAZADO');
    expect(html).toContain('Muy caro');
  });
});
