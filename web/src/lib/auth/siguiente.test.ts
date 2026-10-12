import { describe, expect, it } from 'vitest';
import { destinoTrasLogin, siguienteSeguro } from './siguiente';

describe('siguienteSeguro', () => {
  it('acepta rutas internas del panel y del portal', () => {
    expect(siguienteSeguro('/admin/obras/abc/material')).toBe('/admin/obras/abc/material');
    expect(siguienteSeguro('/admin?tab=1')).toBe('/admin?tab=1');
    expect(siguienteSeguro('/cliente/obras/x')).toBe('/cliente/obras/x');
  });

  it('rechaza lo que sería una redirección abierta o fuera de zona', () => {
    for (const malo of [
      'https://evil.example/admin',
      '//evil.example/admin',
      '/' + String.fromCharCode(92) + 'evil.example',
      '/administrador',
      '/login',
      'admin/obras',
      '/admin' + String.fromCharCode(10),
      '',
      null,
      undefined,
    ]) {
      expect(siguienteSeguro(malo as string | null | undefined)).toBeNull();
    }
  });
});

describe('destinoTrasLogin', () => {
  it('regresa a la página pedida si es de la misma zona', () => {
    expect(destinoTrasLogin('/admin', '/admin/obras/o1/programa')).toBe('/admin/obras/o1/programa');
  });
  it('un cliente no regresa a /admin aunque lo pida', () => {
    expect(destinoTrasLogin('/cliente', '/admin/compras')).toBe('/cliente');
  });
  it('sin next, el destino del rol', () => {
    expect(destinoTrasLogin('/onboarding', null)).toBe('/onboarding');
  });
});
