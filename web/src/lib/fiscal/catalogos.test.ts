import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  CLAVES_CONSTRUCCION,
  REGIMENES,
  UNIDADES_SAT,
  USOS_CFDI,
  formaPagoDeMetodo,
  regimenesPara,
} from './catalogos';
import { validarCp, validarRfc } from './rfc';

/**
 * PARIDAD CON LA BASE: los CHECK de 0037 usan `fiscal_regimenes()` y
 * `fiscal_usos_cfdi()`. Si se agrega una clave en un solo lado, la base
 * rechazaría lo que la web ofrece (o al revés).
 */
describe('paridad con supabase/migrations/0037_datos_fiscales.sql', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('../../../../supabase/migrations/0037_datos_fiscales.sql', import.meta.url)),
    'utf8',
  );
  const claves = (funcion: string) => {
    const inicio = sql.indexOf(`function public.${funcion}()`);
    expect(inicio).toBeGreaterThan(-1);
    const cuerpo = sql.slice(sql.indexOf('$$', inicio), sql.indexOf('$$', sql.indexOf('$$', inicio) + 2));
    return [...cuerpo.matchAll(/'([A-Z0-9]+)'/g)].map((m) => m[1]).sort();
  };

  test('regímenes', () => {
    expect(claves('fiscal_regimenes')).toEqual(REGIMENES.map((r) => r.clave).sort());
  });
  test('usos del CFDI', () => {
    expect(claves('fiscal_usos_cfdi')).toEqual(USOS_CFDI.map((u) => u.clave).sort());
  });
});

describe('catálogos', () => {
  test('claves de producto de 8 dígitos, sin repetir, del segmento de construcción o servicios', () => {
    const vistas = new Set<string>();
    for (const c of CLAVES_CONSTRUCCION) {
      expect(c.clave).toMatch(/^(72|80)\d{6}$/);
      expect(vistas.has(c.clave)).toBe(false);
      vistas.add(c.clave);
      expect(UNIDADES_SAT.some((u) => u.clave === c.unidad)).toBe(true);
    }
  });

  test('RESICO aplica a las dos; 601 solo a morales; 612 solo a físicas', () => {
    expect(regimenesPara('moral').map((r) => r.clave)).toEqual(expect.arrayContaining(['601', '626']));
    expect(regimenesPara('moral').map((r) => r.clave)).not.toContain('612');
    expect(regimenesPara('fisica').map((r) => r.clave)).toEqual(expect.arrayContaining(['612', '626', '616']));
    expect(regimenesPara(null)).toHaveLength(REGIMENES.length);
  });

  test('forma de pago a partir del método de la app', () => {
    expect(formaPagoDeMetodo('EFECTIVO')).toBe('01');
    expect(formaPagoDeMetodo('CHEQUE')).toBe('02');
    expect(formaPagoDeMetodo('transferencia')).toBe('03');
    expect(formaPagoDeMetodo('TARJETA')).toBe('04');
    expect(formaPagoDeMetodo('OTRO')).toBe('99');
    expect(formaPagoDeMetodo(null)).toBe('99');
  });
});

describe('validarRfc', () => {
  test('moral (12) y física (13)', () => {
    expect(validarRfc('cpr200101ab1')).toEqual({ ok: true, rfc: 'CPR200101AB1', tipo: 'moral', generico: false });
    expect(validarRfc('GODE 561231 GR8')).toMatchObject({ ok: true, tipo: 'fisica' });
    expect(validarRfc('ÑAÑ010101AB1')).toMatchObject({ ok: true, tipo: 'moral' });
  });

  test('largo, formato y fecha', () => {
    expect(validarRfc('')).toMatchObject({ ok: false });
    expect(validarRfc('ABC12')).toMatchObject({ ok: false, error: expect.stringMatching(/5 caracteres/) });
    expect(validarRfc('AB1200101AB1')).toMatchObject({ ok: false, error: expect.stringMatching(/formato/) });
    expect(validarRfc('CPR201301AB1')).toMatchObject({ ok: false, error: expect.stringMatching(/fecha/) });
    expect(validarRfc('CPR210229AB1')).toMatchObject({ ok: false }); // 2021 no es bisiesto
    expect(validarRfc('CPR200229AB1')).toMatchObject({ ok: true });
  });

  test('genéricos: sí para el cliente, no para quien factura', () => {
    expect(validarRfc('XAXX010101000')).toMatchObject({ ok: true, generico: true });
    expect(validarRfc('XEXX010101000', { permitirGenerico: false })).toMatchObject({ ok: false });
  });
});

describe('validarCp', () => {
  test('5 números', () => {
    expect(validarCp(' 06300 ')).toEqual({ ok: true, cp: '06300' });
    expect(validarCp('6300')).toMatchObject({ ok: false });
    expect(validarCp('0630A')).toMatchObject({ ok: false });
  });
});
