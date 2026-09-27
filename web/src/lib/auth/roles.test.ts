import { describe, expect, it } from 'vitest';
import {
  capturaEnObra,
  esRolInvitable,
  manejaComprobantes,
  nombreRol,
  rutaBloqueadaPara,
  rutaNavPermitida,
  vePreciosDeCompras,
} from './roles';
import { seccionesDe } from './secciones';
import { puedeVerUtilidad } from './utilidad';
import { puedeVerSueldos } from './sueldos';
import { navDeModulos, PAQUETE_POR_DEFECTO, type ClaveModulo } from '@/lib/modulos';

const TODO: ClaveModulo[] = [...PAQUETE_POR_DEFECTO];

describe('roles de F6 (presentación)', () => {
  it('el residente captura en obra como el supervisor; compras y almacén no', () => {
    expect(capturaEnObra('residente')).toBe(true);
    expect(capturaEnObra('supervisor')).toBe(true);
    expect(capturaEnObra('compras')).toBe(false);
    expect(capturaEnObra('almacen')).toBe(false);
    expect(capturaEnObra('colaborador')).toBe(false);
    expect(capturaEnObra('rol_nuevo')).toBe(false);
    expect(manejaComprobantes('residente')).toBe(true);
    expect(manejaComprobantes('almacen')).toBe(false);
  });

  it('D1: ninguno de los roles nuevos ve utilidad; el residente sí la raya de su obra', () => {
    for (const r of ['residente', 'compras', 'almacen']) expect(puedeVerUtilidad(r)).toBe(false);
    expect(puedeVerSueldos('compras')).toBe(false);
    expect(puedeVerSueldos('almacen')).toBe(false);
  });

  it('Ajustes: nadie nuevo llega a módulos, empresa, fiscal ni usuarios', () => {
    for (const r of ['residente', 'compras', 'almacen']) {
      const s = seccionesDe(r);
      for (const prohibida of ['operacion', 'modulos', 'empresa', 'usuarios', 'fiscal'] as const) {
        expect(s).not.toContain(prohibida);
      }
      expect(s).toContain('cuenta');
    }
    expect(seccionesDe('residente')).toContain('campo');
  });

  it('la barra de compras y almacén solo trae su departamento', () => {
    const hrefs = (rol: string) => navDeModulos(TODO, rol).map((n) => n.href);
    expect(hrefs('compras').every((h) => ['/admin', '/admin/compras'].includes(h))).toBe(true);
    expect(hrefs('almacen')).not.toContain('/admin/obras');
    expect(hrefs('residente')).toContain('/admin/obras');
    expect(hrefs('residente')).not.toContain('/admin/cotizaciones');
    expect(hrefs('residente')).not.toContain('/admin/rentabilidad');
    // Los roles de siempre no cambian.
    expect(hrefs('supervisor')).toContain('/admin/cotizaciones');
    expect(rutaNavPermitida('admin', '/admin/facturacion')).toBe(true);
  });

  it('las guardias de ruta solo aplican a los roles nuevos', () => {
    expect(rutaBloqueadaPara('residente', '/admin/cotizaciones/123')).toBe(true);
    expect(rutaBloqueadaPara('residente', '/admin/obras/123')).toBe(false);
    expect(rutaBloqueadaPara('compras', '/admin/obras')).toBe(true);
    expect(rutaBloqueadaPara('compras', '/admin/compras/proveedores')).toBe(false);
    expect(rutaBloqueadaPara('supervisor', '/admin/cotizaciones')).toBe(false);
    expect(rutaBloqueadaPara('admin', '/admin/actividad')).toBe(false);
  });

  it('invitables y nombres', () => {
    expect(esRolInvitable('residente')).toBe(true);
    expect(esRolInvitable('admin')).toBe(false);
    expect(esRolInvitable('cliente')).toBe(false);
    expect(nombreRol('almacen')).toBe('Almacén');
    expect(nombreRol('otro')).toBe('otro');
    expect(vePreciosDeCompras('almacen')).toBe(false);
    expect(vePreciosDeCompras('compras')).toBe(true);
  });
});
