import { describe, expect, test } from 'vitest';
import { fechaCfdiAMs, leerCfdi, normalizarUuid, parsearXml } from './cfdi';
import {
  CFDI_33,
  COMPLEMENTO_PAGO,
  CON_DOCTYPE,
  FACTURA_PPD_OTROS_PREFIJOS,
  FACTURA_PUE,
  MAL_CERRADO,
  SIN_TIMBRE,
  UUID_COMPLEMENTO,
  UUID_FACTURA,
  UUID_PPD,
} from './__fixtures__/cfdi';

function leer(xml: string) {
  const r = leerCfdi(xml);
  if (!r.ok) throw new Error(r.error);
  return r.cfdi;
}

describe('leerCfdi — factura PUE', () => {
  const c = leer(FACTURA_PUE);

  test('toma el folio fiscal del timbre, en mayúsculas', () => {
    expect(c.uuid).toBe(UUID_FACTURA);
    expect(c.fechaTimbrado).toBe('2026-09-15T10:31:12');
  });

  test('montos, método y forma de pago', () => {
    expect(c).toMatchObject({
      tipo: 'I',
      serie: 'A',
      folio: '102',
      metodoPago: 'PUE',
      formaPago: '03',
      subtotal: 10000,
      total: 11475,
      ivaTrasladado: 1600,
      isrRetenido: 125,
      ivaRetenido: 0,
    });
  });

  test('emisor y receptor, con entidades decodificadas', () => {
    expect(c.emisor).toEqual({ rfc: 'CPR200101AB1', nombre: 'CONSTRUCTORA DE PRUEBA', regimen: '601' });
    expect(c.receptor).toEqual({
      rfc: 'GODE561231GR8',
      nombre: 'EMILIO GOMEZ DIAZ & ASOCIADOS',
      regimen: '612',
      cp: '06300',
      uso: 'I01',
    });
  });

  test('los impuestos del concepto no se suman dos veces al total', () => {
    expect(c.conceptos).toEqual([
      {
        claveProdServ: '72151900',
        claveUnidad: 'MTK',
        cantidad: 20,
        descripcion: 'Muro de block 15 cm',
        valorUnitario: 500,
        importe: 10000,
      },
    ]);
  });
});

describe('leerCfdi — namespaces de verdad, no prefijos', () => {
  test('lee una PPD con namespace por defecto y otro prefijo para el timbre', () => {
    const c = leer(FACTURA_PPD_OTROS_PREFIJOS);
    expect(c.uuid).toBe(UUID_PPD);
    expect(c.metodoPago).toBe('PPD');
    expect(c.formaPago).toBe('99');
    expect(c.total).toBe(116000);
    expect(c.relacionados).toEqual([{ tipoRelacion: '07', uuids: [UUID_FACTURA] }]);
  });

  test('un complemento de pago trae sus pagos y la factura que liquida', () => {
    const c = leer(COMPLEMENTO_PAGO);
    expect(c.tipo).toBe('P');
    expect(c.uuid).toBe(UUID_COMPLEMENTO);
    expect(c.pagos).toEqual([
      {
        fechaPago: '2026-09-02T12:00:00',
        formaPago: '03',
        monto: 58000,
        documentos: [{ idDocumento: UUID_PPD, parcialidad: 2, impPagado: 58000 }],
      },
    ]);
  });

  test('un elemento con el nombre correcto pero en otro namespace NO cuenta', () => {
    const falso = FACTURA_PUE.replace(
      'xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"',
      'xmlns:tfd="http://ejemplo.test/otro"',
    );
    expect(leerCfdi(falso)).toMatchObject({ ok: false, error: expect.stringMatching(/timbrada/) });
  });
});

describe('leerCfdi — rechazos claros', () => {
  test('versión 3.3', () => {
    expect(leerCfdi(CFDI_33)).toMatchObject({ ok: false, error: expect.stringMatching(/3\.3/) });
  });
  test('sin timbrar', () => {
    expect(leerCfdi(SIN_TIMBRE)).toMatchObject({ ok: false, error: expect.stringMatching(/timbrada/) });
  });
  test('con DOCTYPE (entidades externas)', () => {
    expect(leerCfdi(CON_DOCTYPE)).toMatchObject({ ok: false, error: expect.stringMatching(/DOCTYPE/) });
  });
  test('etiquetas mal cerradas', () => {
    expect(leerCfdi(MAL_CERRADO)).toMatchObject({ ok: false, error: expect.stringMatching(/XML válido/) });
  });
  test('no es un CFDI', () => {
    expect(leerCfdi('<factura/>')).toMatchObject({ ok: false });
    expect(leerCfdi('')).toMatchObject({ ok: false });
    expect(leerCfdi('hola')).toMatchObject({ ok: false });
  });
  test('prefijo sin declarar', () => {
    expect(() => parsearXml('<a:b/>')).toThrow(/prefijo/);
  });
});

describe('utilidades', () => {
  test('fechaCfdiAMs toma la hora del centro de México', () => {
    expect(fechaCfdiAMs('2026-09-15T10:30:00')).toBe(Date.UTC(2026, 8, 15, 16, 30, 0));
    expect(fechaCfdiAMs('ayer')).toBeNull();
  });
  test('normalizarUuid', () => {
    expect(normalizarUuid(` ${UUID_FACTURA.toLowerCase()} `)).toBe(UUID_FACTURA);
    expect(normalizarUuid('123')).toBeNull();
  });
});
