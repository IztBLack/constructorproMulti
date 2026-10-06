import { describe, expect, it } from 'vitest';
import { resolverEmpresaActiva } from './sesion';
import type { Rol } from '@/lib/data/types';

/// Con qué empresa está trabajando el usuario.
///
/// Hasta la auditoría, la respuesta estaba clavada: un `limit(1)` escondido en
/// la capa de datos devolvía SIEMPRE una sola empresa. Eso significaba que un
/// contador externo no podía llevar dos constructoras y un dueño con dos
/// razones sociales no podía separarlas — el techo no era de rendimiento, era
/// del modelo de negocio.
///
/// La regla nueva cabe en una línea, y es la que se fija aquí: **la cookie sólo
/// cuenta si el usuario pertenece de verdad a esa empresa**; si no, la primera a
/// la que se unió.

const A = { empresaId: 'emp-a', rol: 'admin' as Rol };
const B = { empresaId: 'emp-b', rol: 'contador' as Rol };

describe('resolverEmpresaActiva', () => {
  it('sin empresas no hay empresa activa', () => {
    expect(resolverEmpresaActiva([], 'emp-a')).toBeNull();
    expect(resolverEmpresaActiva([], null)).toBeNull();
  });

  it('sin cookie, la primera de la lista (la más antigua)', () => {
    expect(resolverEmpresaActiva([A, B], null)).toEqual(A);
  });

  it('con cookie válida, esa — y con SU rol, no el de la primera', () => {
    // El rol es lo que decide qué botones se pintan y qué puede escribir. Que
    // viaje junto a la empresa es lo que evita que alguien vea la empresa B con
    // los permisos que tiene en la A.
    expect(resolverEmpresaActiva([A, B], 'emp-b')).toEqual(B);
  });

  it('LA REGLA DE SEGURIDAD: una cookie ajena se ignora, no se obedece', () => {
    // La cookie es una PREFERENCIA, no una autorización. Aunque alguien la
    // falsifique con el id de una empresa a la que no pertenece, aquí se cae a
    // la suya. Y aunque esta comprobación no existiera, RLS devolvería cero
    // filas: son dos puertas, no una.
    expect(resolverEmpresaActiva([A], 'emp-de-otro')).toEqual(A);
  });

  it('una cookie vacía se trata como si no hubiera', () => {
    expect(resolverEmpresaActiva([A, B], '')).toEqual(A);
  });

  it('nunca devuelve una empresa que no esté en la lista', () => {
    // La lista viene de `usuarios_empresa`, la misma tabla que gobierna RLS.
    // Esta propiedad es la que garantiza que la interfaz no prometa datos que
    // la base no va a entregar.
    for (const cookie of [null, '', 'emp-a', 'emp-b', 'inventada']) {
      const r = resolverEmpresaActiva([A, B], cookie);
      expect([A.empresaId, B.empresaId], String(cookie)).toContain(r!.empresaId);
    }
  });
});
