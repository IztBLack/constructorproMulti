import { describe, expect, test } from 'vitest';
import { puedeVerSueldos } from './sueldos';
import { puedeVer, seccionesDe } from './secciones';

/// Prueba de PARIDAD con `test/logic/rol_permiso_test.dart`. Las dos listas de
/// roles tienen que decir lo mismo: si se separan, la oficina y la obra dejan de
/// coincidir en quién ve la raya, que es exactamente lo que pasó entre nómina y
/// proyección hasta agosto de 2026.

describe('puedeVerSueldos', () => {
  test('socio, supervisor y contador sí', () => {
    expect(puedeVerSueldos('admin')).toBe(true);
    expect(puedeVerSueldos('supervisor')).toBe(true);
    // El contador entró el 2026-08-17: la migración 0022 lo define como el
    // tesorero que ve los montos a pagar, y sin la raya no puede trabajar.
    expect(puedeVerSueldos('contador')).toBe(true);
  });

  test('colaborador y cliente no', () => {
    // El colaborador es staff de campo: captura asistencia y gasto. El cliente
    // ve su obra desde el portal y jamás la nómina.
    expect(puedeVerSueldos('colaborador')).toBe(false);
    expect(puedeVerSueldos('cliente')).toBe(false);
  });

  test('un rol que no existe todavía queda FUERA por omisión', () => {
    // Es lo que hace que esto sea una lista BLANCA: un rol que se agregue
    // mañana tiene que pedir el permiso, no heredarlo.
    expect(puedeVerSueldos('rol_que_no_existe')).toBe(false);
    expect(puedeVerSueldos('auditor')).toBe(false);
    expect(puedeVerSueldos('')).toBe(false);
  });
});

/// `seccionesDe` va al revés —círculos concéntricos, cada rol hereda lo del
/// anterior— y está bien que así sea: protege qué se DIBUJA, no qué se puede
/// leer. La diferencia de forma entre las dos es deliberada.
describe('seccionesDe / puedeVer (Ajustes)', () => {
  test('el modelo es concéntrico: cliente ⊂ colaborador ⊂ supervisor ⊂ admin', () => {
    const cliente = seccionesDe('cliente');
    const colaborador = seccionesDe('colaborador');
    const supervisor = seccionesDe('supervisor');
    const admin = seccionesDe('admin');

    for (const s of cliente) expect(colaborador).toContain(s);
    for (const s of colaborador) expect(supervisor).toContain(s);
    for (const s of supervisor) expect(admin).toContain(s);
  });

  test('todos ven su propia cuenta y sus preferencias', () => {
    for (const rol of ['cliente', 'colaborador', 'supervisor', 'admin']) {
      expect(puedeVer(rol, 'cuenta')).toBe(true);
      expect(puedeVer(rol, 'preferencias')).toBe(true);
    }
  });

  test('«campo» empieza en el colaborador: el cliente no pisa la obra', () => {
    expect(puedeVer('cliente', 'campo')).toBe(false);
    expect(puedeVer('colaborador', 'campo')).toBe(true);
    expect(puedeVer('admin', 'campo')).toBe(true);
  });

  test('usuarios, empresa y operación son solo del admin', () => {
    // `operacion` bajó del supervisor al admin cuando 0018 restringió
    // `empresa_config`: el IVA toca el dinero de toda cotización nueva.
    for (const seccion of ['operacion', 'empresa', 'usuarios'] as const) {
      expect(puedeVer('admin', seccion)).toBe(true);
      expect(puedeVer('supervisor', seccion)).toBe(false);
      expect(puedeVer('colaborador', seccion)).toBe(false);
    }
  });

  test('un rol desconocido cae al mínimo, no al máximo', () => {
    // Ante la duda, menos privilegio: la BD permite texto libre en la práctica.
    expect(seccionesDe('rol_que_no_existe')).toEqual(seccionesDe('cliente'));
    expect(puedeVer('rol_que_no_existe', 'usuarios')).toBe(false);
  });
});
