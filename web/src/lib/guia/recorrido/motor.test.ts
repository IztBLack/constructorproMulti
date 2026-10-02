import { describe, expect, it } from 'vitest';
import {
  anterior,
  avanceDe,
  leerCorrida,
  leerProgreso,
  marcarTema,
  minutosDe,
  primerPendiente,
  PROGRESO_VACIO,
  recomendarAlcance,
  rutaCoincide,
  siguiente,
  temasPara,
} from './motor';
import type { PasoRecorrido, Tema } from './tipos';

const p = (id: string, extra: Partial<PasoRecorrido> = {}): PasoRecorrido => ({
  id,
  ruta: '/admin',
  titulo: id,
  texto: 't',
  accion: 'leer',
  ...extra,
});

const TEMAS: Tema[] = [
  { id: 'panel', titulo: 'Panel', descripcion: '', desde: 'esencial', modulo: null, inicio: '/admin', pasos: [p('a'), p('b', { soloEn: ['esencial'] })] },
  { id: 'gente', titulo: 'Gente', descripcion: '', desde: 'diaria', modulo: 'equipo', inicio: '/admin/equipo', pasos: [p('c'), p('d')] },
  { id: 'utilidad', titulo: 'Utilidad', descripcion: '', desde: 'completo', modulo: 'rentabilidad', roles: ['admin'], inicio: '/admin/rentabilidad', pasos: [p('e')] },
];

describe('temasPara', () => {
  it('cada alcance incluye al anterior', () => {
    const todos = ['obras', 'equipo', 'rentabilidad'] as const;
    expect(temasPara(TEMAS, 'esencial', todos, 'admin').map((t) => t.id)).toEqual(['panel']);
    expect(temasPara(TEMAS, 'diaria', todos, 'admin').map((t) => t.id)).toEqual(['panel', 'gente']);
    expect(temasPara(TEMAS, 'completo', todos, 'admin').map((t) => t.id)).toEqual(['panel', 'gente', 'utilidad']);
  });

  it('los pasos con soloEn se quitan en los otros alcances', () => {
    expect(temasPara(TEMAS, 'esencial', ['obras'], 'admin')[0].pasos.map((x) => x.id)).toEqual(['a', 'b']);
    expect(temasPara(TEMAS, 'completo', ['obras'], 'admin')[0].pasos.map((x) => x.id)).toEqual(['a']);
  });

  it('módulo apagado o rol sin permiso: el tema no sale', () => {
    expect(temasPara(TEMAS, 'completo', ['obras'], 'admin').map((t) => t.id)).toEqual(['panel']);
    const r = temasPara(TEMAS, 'completo', ['obras', 'equipo', 'rentabilidad'], 'supervisor');
    expect(r.map((t) => t.id)).toEqual(['panel', 'gente']);
  });
});

describe('minutosDe', () => {
  it('redondea hacia arriba, mínimo 1, cero si no hay pasos', () => {
    expect(minutosDe(0)).toBe(0);
    expect(minutosDe(1)).toBe(1);
    expect(minutosDe(24)).toBe(10); // 24 × 25 s = 600 s
    expect(minutosDe(25)).toBe(11);
  });
});

describe('rutaCoincide', () => {
  it('compara por segmentos y * vale por uno', () => {
    expect(rutaCoincide('/admin/obras', '/admin/obras')).toBe(true);
    expect(rutaCoincide('/admin/obras/123', '/admin/obras/*')).toBe(true);
    expect(rutaCoincide('/admin/obras/123/caja', '/admin/obras/*/caja')).toBe(true);
    expect(rutaCoincide('/admin/obras', '/admin/obras/*')).toBe(false);
    expect(rutaCoincide('/admin/obras/123/caja', '/admin/obras/*')).toBe(false);
    expect(rutaCoincide('/admin/obras?nueva=1', '/admin/obras')).toBe(true);
  });
});

describe('recomendarAlcance', () => {
  it('poca experiencia y necesidad básica → esencial; todo → completo', () => {
    expect(recomendarAlcance({ experiencia: 0, necesidad: 0 })).toBe('esencial');
    expect(recomendarAlcance({ experiencia: 1, necesidad: 0 })).toBe('esencial');
    expect(recomendarAlcance({ experiencia: 1, necesidad: 1 })).toBe('diaria');
    expect(recomendarAlcance({ experiencia: 2, necesidad: 1 })).toBe('diaria');
    expect(recomendarAlcance({ experiencia: 2, necesidad: 2 })).toBe('completo');
  });
});

describe('progreso', () => {
  it('lee sin confiar y nunca lanza', () => {
    expect(leerProgreso(null)).toEqual(PROGRESO_VACIO);
    expect(leerProgreso('{roto')).toEqual(PROGRESO_VACIO);
    expect(leerProgreso('7')).toEqual(PROGRESO_VACIO);
    const crudo = JSON.stringify({ temasHechos: ['panel', 'panel', 3, 'viejo'], invitacionCerrada: true });
    expect(leerProgreso(crudo, new Set(['panel', 'gente']))).toEqual({ temasHechos: ['panel'], invitacionCerrada: true });
  });

  it('marcar es idempotente y el avance cuenta minutos pendientes', () => {
    const p1 = marcarTema(PROGRESO_VACIO, 'panel');
    expect(marcarTema(p1, 'panel')).toBe(p1);
    const visibles = temasPara(TEMAS, 'diaria', ['obras', 'equipo'], 'admin'); // panel(1) + gente(2)
    expect(avanceDe(visibles, p1)).toEqual({ temas: 2, hechos: 1, minutosRestantes: 1 });
    expect(primerPendiente(visibles, p1)).toBe(1);
    expect(primerPendiente(visibles, marcarTema(p1, 'gente'))).toBe(0);
  });
});

describe('corrida', () => {
  const visibles = temasPara(TEMAS, 'diaria', ['obras', 'equipo'], 'admin');

  it('avanza paso, luego tema, luego fin', () => {
    expect(siguiente(visibles, { alcance: 'diaria', tema: 1, paso: 0 })).toEqual({
      tipo: 'paso',
      corrida: { alcance: 'diaria', tema: 1, paso: 1 },
    });
    expect(siguiente(visibles, { alcance: 'diaria', tema: 0, paso: 0 })).toEqual({
      tipo: 'tema',
      terminado: 'panel',
      corrida: { alcance: 'diaria', tema: 1, paso: 0 },
    });
    expect(siguiente(visibles, { alcance: 'diaria', tema: 1, paso: 1 })).toEqual({ tipo: 'fin', terminado: 'gente' });
  });

  it('anterior no cruza temas', () => {
    expect(anterior({ alcance: 'diaria', tema: 1, paso: 1 })).toEqual({ alcance: 'diaria', tema: 1, paso: 0 });
    expect(anterior({ alcance: 'diaria', tema: 1, paso: 0 })).toBeNull();
  });

  it('lee la corrida guardada sin confiar', () => {
    expect(leerCorrida(null)).toBeNull();
    expect(leerCorrida('{"alcance":"x","tema":0,"paso":0}')).toBeNull();
    expect(leerCorrida('{"alcance":"diaria","tema":1.5,"paso":0}')).toBeNull();
    expect(leerCorrida('{"alcance":"completo","tema":2,"paso":-3}')).toEqual({ alcance: 'completo', tema: 2, paso: 0 });
  });
});
