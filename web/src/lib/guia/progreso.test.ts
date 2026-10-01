import { describe, expect, it } from 'vitest';
import {
  avanceGuia,
  buscarTarjeta,
  leerProgreso,
  marcarAprendida,
  mazosPara,
  progresoVacio,
  reiniciarProgreso,
  siguienteTarjeta,
} from './progreso';
import type { Mazo, Tarjeta } from './tipos';

const t = (id: string, extra: Partial<Tarjeta> = {}): Tarjeta => ({
  id,
  modulo: null,
  titulo: id,
  resumen: 'r',
  pasos: ['a', 'b'],
  ...extra,
});

const MAZOS: Mazo[] = [
  { clave: 'inicio', titulo: 'Inicio', descripcion: '', sello: 'Sello A', tarjetas: [t('menu'), t('buscar')] },
  {
    clave: 'gente',
    titulo: 'Gente',
    descripcion: '',
    sello: 'Sello B',
    tarjetas: [
      t('equipo-alta', { modulo: 'equipo', destino: { href: '/admin/equipo' } }),
      t('cuadrillas', { modulo: 'cuadrillas', destino: { href: '/admin/cuadrillas' } }),
    ],
  },
  {
    clave: 'dinero',
    titulo: 'Dinero',
    descripcion: '',
    sello: 'Sello C',
    tarjetas: [
      t('utilidad', { modulo: 'rentabilidad', roles: ['admin', 'contador'], destino: { href: '/admin/rentabilidad' } }),
    ],
  },
];

describe('leerProgreso', () => {
  it('vacío, corrupto o no-objeto da progreso vacío sin lanzar', () => {
    expect(leerProgreso(null, 1)).toEqual(progresoVacio(1));
    expect(leerProgreso('{no es json', 1)).toEqual(progresoVacio(1));
    expect(leerProgreso('42', 1)).toEqual(progresoVacio(1));
    expect(leerProgreso('null', 1)).toEqual(progresoVacio(1));
  });

  it('limpia basura, repetidos e ids que ya no existen', () => {
    const crudo = JSON.stringify({ aprendidas: ['menu', 'menu', 7, 'vieja'], bienvenidaVista: true });
    const p = leerProgreso(crudo, 2, new Set(['menu', 'buscar']));
    expect(p).toEqual({ version: 2, aprendidas: ['menu'], bienvenidaVista: true });
  });

  it('bienvenidaVista solo con true literal', () => {
    expect(leerProgreso(JSON.stringify({ bienvenidaVista: 'si' }), 1).bienvenidaVista).toBe(false);
  });
});

describe('marcar y reiniciar', () => {
  it('marcar es idempotente', () => {
    const p1 = marcarAprendida(progresoVacio(1), 'menu');
    expect(marcarAprendida(p1, 'menu')).toBe(p1);
    expect(p1.aprendidas).toEqual(['menu']);
  });

  it('reiniciar borra lo aprendido pero no vuelve a imponer la bienvenida', () => {
    const p = { version: 1, aprendidas: ['menu'], bienvenidaVista: true };
    expect(reiniciarProgreso(p)).toEqual({ version: 1, aprendidas: [], bienvenidaVista: true });
  });
});

describe('mazosPara', () => {
  it('oculta módulos apagados y quita mazos vacíos', () => {
    const r = mazosPara(MAZOS, ['obras', 'equipo'], 'admin');
    expect(r.map((m) => m.clave)).toEqual(['inicio', 'gente']);
    expect(r[1].tarjetas.map((x) => x.id)).toEqual(['equipo-alta']);
  });

  it('respeta los roles de la tarjeta', () => {
    const activos = ['obras', 'rentabilidad'] as const;
    expect(mazosPara(MAZOS, activos, 'admin').some((m) => m.clave === 'dinero')).toBe(true);
    expect(mazosPara(MAZOS, activos, 'supervisor').some((m) => m.clave === 'dinero')).toBe(false);
  });

  it('no enseña pantallas que la barra no le ofrece al rol', () => {
    // El almacén solo tiene Inicio y Compras en su barra (lib/auth/roles.ts).
    const r = mazosPara(MAZOS, ['obras', 'equipo'], 'almacen');
    expect(buscarTarjeta(r, 'equipo-alta')).toBeNull();
    expect(buscarTarjeta(r, 'menu')).not.toBeNull();
  });
});

describe('avanceGuia', () => {
  const visibles = mazosPara(MAZOS, ['obras', 'equipo', 'cuadrillas'], 'admin'); // 4 tarjetas

  it('sin nada: 0 %, Ayudante, sin sellos', () => {
    const a = avanceGuia(visibles, progresoVacio(1));
    expect(a).toMatchObject({ total: 4, hechas: 0, porcentaje: 0, rango: 'Ayudante', sellos: [] });
    expect(a.siguiente).toEqual({ nombre: 'Media cuchara', faltan: 1 });
  });

  it('un mazo completo da su sello y sube de rango', () => {
    const p = { ...progresoVacio(1), aprendidas: ['menu', 'buscar'] };
    const a = avanceGuia(visibles, p);
    expect(a.porcentaje).toBe(50);
    expect(a.rango).toBe('Oficial');
    expect(a.sellos).toEqual(['Sello A']);
    expect(a.porMazo[0]).toEqual({ clave: 'inicio', total: 2, hechas: 2, completo: true });
  });

  it('todo hecho: 100 %, rango tope, sin siguiente', () => {
    const p = { ...progresoVacio(1), aprendidas: ['menu', 'buscar', 'equipo-alta', 'cuadrillas'] };
    const a = avanceGuia(visibles, p);
    expect(a.porcentaje).toBe(100);
    expect(a.rango).toBe('Residente de obra');
    expect(a.siguiente).toBeNull();
    expect(a.sellos).toEqual(['Sello A', 'Sello B']);
  });

  it('las aprendidas de módulos apagados no cuentan', () => {
    const p = { ...progresoVacio(1), aprendidas: ['utilidad'] };
    expect(avanceGuia(visibles, p).hechas).toBe(0);
  });

  it('sin tarjetas no divide entre cero', () => {
    expect(avanceGuia([], progresoVacio(1)).porcentaje).toBe(0);
  });
});

describe('siguienteTarjeta', () => {
  const visibles = mazosPara(MAZOS, ['obras', 'equipo'], 'admin');

  it('la primera sin aprender, saltando mazos completos', () => {
    expect(siguienteTarjeta(visibles, progresoVacio(1))).toEqual({ mazo: 'inicio', indice: 0 });
    const p = { ...progresoVacio(1), aprendidas: ['menu', 'buscar'] };
    expect(siguienteTarjeta(visibles, p)).toEqual({ mazo: 'gente', indice: 0 });
  });

  it('null cuando ya terminó', () => {
    const p = { ...progresoVacio(1), aprendidas: ['menu', 'buscar', 'equipo-alta'] };
    expect(siguienteTarjeta(visibles, p)).toBeNull();
  });
});
