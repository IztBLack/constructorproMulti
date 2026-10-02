import { describe, expect, it } from 'vitest';
import { esEscritura } from './candado';

const SB = 'https://abc.supabase.co';

describe('candado del recorrido: qué cuenta como escritura', () => {
  it('lecturas pasan', () => {
    expect(esEscritura(`${SB}/rest/v1/obras?select=*`)).toBe(false);
    expect(esEscritura(`${SB}/rest/v1/obras`, { method: 'HEAD' })).toBe(false);
    expect(esEscritura('/admin/obras?_rsc=1')).toBe(false);
  });

  it('Server Actions se cortan', () => {
    expect(esEscritura('/admin/obras', { method: 'POST', headers: { 'Next-Action': 'abc123' } })).toBe(true);
  });

  it('escrituras a Supabase se cortan (tabla, archivos, funciones)', () => {
    expect(esEscritura(`${SB}/rest/v1/obras`, { method: 'POST' })).toBe(true);
    expect(esEscritura(`${SB}/rest/v1/obras?id=eq.1`, { method: 'PATCH' })).toBe(true);
    expect(esEscritura(`${SB}/rest/v1/obras?id=eq.1`, { method: 'DELETE' })).toBe(true);
    expect(esEscritura(`${SB}/storage/v1/object/fotos/a.jpg`, { method: 'POST' })).toBe(true);
    expect(esEscritura(`${SB}/functions/v1/algo`, { method: 'POST' })).toBe(true);
    expect(esEscritura(new Request(`${SB}/rest/v1/obras`, { method: 'POST' }))).toBe(true);
  });

  it('la sesión no se toca: refrescar el token y cerrar sesión siguen funcionando', () => {
    expect(esEscritura(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: 'POST' })).toBe(false);
    expect(esEscritura(`${SB}/auth/v1/logout`, { method: 'POST' })).toBe(false);
  });

  it('pero los datos de la cuenta y cualquier POST propio sí se cortan', () => {
    expect(esEscritura(`${SB}/auth/v1/user`, { method: 'PUT' })).toBe(true);
    expect(esEscritura(`${SB}/auth/v1/otp`, { method: 'POST' })).toBe(true);
    expect(esEscritura('/admin/proyeccion/pdf', { method: 'POST' })).toBe(true);
  });
});
