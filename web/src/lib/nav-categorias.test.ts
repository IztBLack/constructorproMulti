import { describe, expect, test } from 'vitest';
import {
  CATEGORIAS_NAV,
  MODULOS,
  PAQUETE_POR_DEFECTO,
  modulosPorPerfil,
  navDeModulos,
  type ClaveModulo,
  type EnlaceNav,
} from './modulos';
import {
  UMBRAL_BARRA_PLANA,
  agruparPorCategoria,
  armarBarra,
  enlaceActivo,
  enlaceActual,
  type ItemBarra,
} from './nav-categorias';

const TODO: ClaveModulo[] = MODULOS.filter((m) => m.disponible).map((m) => m.clave);

/** La fila de la barra en texto: `Obras▾[Pase de lista,Obras]` o `Inicio`. */
function fila(items: ItemBarra[]): string[] {
  return items.map((i) =>
    i.tipo === 'enlace' ? i.enlace.label : `${i.titulo}▾[${i.enlaces.map((e) => e.label).join(',')}]`,
  );
}

describe('catálogo: cada enlace de la barra trae su categoría', () => {
  test('todo `nav` de módulo declara una categoría que existe', () => {
    const validas = new Set(CATEGORIAS_NAV.map((c) => c.clave));
    for (const m of MODULOS) {
      for (const n of m.nav ?? []) expect(validas.has(n.categoria), `${m.clave} → ${n.href}`).toBe(true);
    }
  });

  test('Inicio es el único suelto', () => {
    const sueltos = navDeModulos(TODO, 'admin').filter((e) => e.categoria === null);
    expect(sueltos).toEqual([{ href: '/admin', label: 'Inicio', categoria: null }]);
  });

  test('ningún enlace se repite', () => {
    const hrefs = navDeModulos(TODO, 'admin').map((e) => e.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('armarBarra: con todo prendido (admin)', () => {
  const barra = armarBarra(navDeModulos(TODO, 'admin'));

  test('agrupa: Inicio suelto y cuatro menús, en el orden de las categorías', () => {
    expect(barra.plana).toBe(false);
    expect(fila(barra.items)).toEqual([
      'Inicio',
      'Obras▾[Pase de lista,Obras,Cotizaciones,Clientes]',
      'Gente▾[Equipo,Cuadrillas,Proyección]',
      'Dinero▾[Facturación,Compras,Utilidad,Subcontratos]',
      'Operación▾[Garantías,Herramienta,IMSS y papeles]',
    ]);
  });

  test('no se pierde ni se duplica ningún enlace al agrupar', () => {
    const planos = barra.items.flatMap((i) => (i.tipo === 'enlace' ? [i.enlace] : i.enlaces));
    expect(planos.map((e) => e.href).sort()).toEqual(navDeModulos(TODO, 'admin').map((e) => e.href).sort());
  });
});

describe('armarBarra: umbral de barra plana', () => {
  test(`con ${UMBRAL_BARRA_PLANA} enlaces o menos queda plana, en el orden de siempre`, () => {
    // Paquete del independiente: 6 enlaces.
    const indep = navDeModulos(modulosPorPerfil('independiente', [], 'no').activos, 'admin');
    expect(indep.length).toBeLessThanOrEqual(UMBRAL_BARRA_PLANA);
    const barra = armarBarra(indep);
    expect(barra.plana).toBe(true);
    expect(fila(barra.items)).toEqual(indep.map((e) => e.label));
  });

  test('justo en el umbral, plana; uno más, agrupada', () => {
    const enlaces = navDeModulos(TODO, 'admin');
    expect(armarBarra(enlaces.slice(0, UMBRAL_BARRA_PLANA)).plana).toBe(true);
    expect(armarBarra(enlaces.slice(0, UMBRAL_BARRA_PLANA + 1)).plana).toBe(false);
  });

  test('el paquete de siempre (8 enlaces) conserva la barra plana que ya conocen', () => {
    const barra = armarBarra(navDeModulos(PAQUETE_POR_DEFECTO, 'admin'));
    expect(barra.plana).toBe(true);
  });

  test('con un módulo más que el paquete de siempre ya se agrupa', () => {
    const barra = armarBarra(navDeModulos([...PAQUETE_POR_DEFECTO, 'fiscal'], 'admin'));
    expect(barra.plana).toBe(false);
    expect(fila(barra.items)).toEqual([
      'Inicio',
      'Obras▾[Pase de lista,Obras,Cotizaciones,Clientes]',
      'Gente▾[Equipo,Cuadrillas,Proyección]',
      'Facturación',
    ]);
  });

  test('el umbral se puede pasar a mano (para probar la regla sin depender del catálogo)', () => {
    const tres: EnlaceNav[] = [
      { href: '/admin', label: 'Inicio', categoria: null },
      { href: '/a', label: 'A', categoria: 'obras' },
      { href: '/b', label: 'B', categoria: 'obras' },
    ];
    expect(armarBarra(tres, 3).plana).toBe(true);
    expect(fila(armarBarra(tres, 2).items)).toEqual(['Inicio', 'Obras▾[A,B]']);
  });
});

describe('armarBarra: una categoría con un solo enlace va suelta', () => {
  test('por módulos: solo IMSS y papeles en Operación', () => {
    const activos: ClaveModulo[] = [...PAQUETE_POR_DEFECTO, 'cumplimiento'];
    expect(fila(armarBarra(navDeModulos(activos, 'admin')).items)).toEqual([
      'Inicio',
      'Obras▾[Pase de lista,Obras,Cotizaciones,Clientes]',
      'Gente▾[Equipo,Cuadrillas,Proyección]',
      'IMSS y papeles',
    ]);
  });

  test('por rol: al supervisor se le quita Utilidad, y el resto de Dinero sigue en menú', () => {
    const items = fila(armarBarra(navDeModulos(TODO, 'supervisor')).items);
    expect(items).toContain('Dinero▾[Facturación,Compras,Subcontratos]');
    expect(items.join()).not.toContain('Utilidad');
  });

  test('por rol: el colaborador pierde Herramienta y Garantías, e IMSS queda suelto', () => {
    const items = fila(armarBarra(navDeModulos(TODO, 'colaborador')).items);
    expect(items).toContain('IMSS y papeles');
    expect(items.some((i) => i.startsWith('Operación▾'))).toBe(false);
  });

  test('en el panel del celular el grupo de uno sí lleva su encabezado', () => {
    const activos: ClaveModulo[] = [...PAQUETE_POR_DEFECTO, 'cumplimiento'];
    const { grupos } = armarBarra(navDeModulos(activos, 'admin'));
    expect(grupos.map((g) => [g.titulo, g.enlaces.length])).toEqual([
      ['Obras', 4],
      ['Gente', 3],
      ['Operación', 1],
    ]);
  });
});

describe('armarBarra: roles de F6 con todo prendido', () => {
  test('residente: sin cotizaciones, clientes, dinero de la empresa ni papeles', () => {
    expect(fila(armarBarra(navDeModulos(TODO, 'residente')).items)).toEqual([
      'Inicio',
      'Obras▾[Pase de lista,Obras]',
      'Gente▾[Equipo,Cuadrillas]',
      'Dinero▾[Compras,Subcontratos]',
      'Operación▾[Garantías,Herramienta]',
    ]);
  });

  test('compras y almacén: dos enlaces, barra plana', () => {
    for (const rol of ['compras', 'almacen']) {
      const barra = armarBarra(navDeModulos(TODO, rol));
      expect(barra.plana).toBe(true);
      expect(fila(barra.items)).toEqual(['Inicio', 'Compras']);
    }
  });
});

describe('agruparPorCategoria', () => {
  test('una categoría sin enlaces no aparece', () => {
    const { grupos } = agruparPorCategoria(navDeModulos(['obras'], 'admin'));
    expect(grupos.map((g) => g.clave)).toEqual(['obras']);
  });

  test('orden estable aunque lleguen revueltos: categorías por catálogo, enlaces como llegaron', () => {
    const { sueltos, grupos } = agruparPorCategoria([
      { href: '/d', label: 'D', categoria: 'dinero' },
      { href: '/o2', label: 'O2', categoria: 'obras' },
      { href: '/admin', label: 'Inicio', categoria: null },
      { href: '/o1', label: 'O1', categoria: 'obras' },
    ]);
    expect(sueltos.map((e) => e.label)).toEqual(['Inicio']);
    expect(grupos.map((g) => `${g.clave}:${g.enlaces.map((e) => e.label).join(',')}`)).toEqual([
      'obras:O2,O1',
      'dinero:D',
    ]);
  });
});

describe('enlaceActivo / enlaceActual', () => {
  test('Inicio solo en /admin exacto', () => {
    expect(enlaceActivo('/admin', '/admin')).toBe(true);
    expect(enlaceActivo('/admin/obras', '/admin')).toBe(false);
  });

  test('las subpáginas marcan su sección, por segmento completo', () => {
    expect(enlaceActivo('/admin/obras/123/nomina', '/admin/obras')).toBe(true);
    expect(enlaceActivo('/admin/obrasx', '/admin/obras')).toBe(false);
  });

  test('la categoría activa es la del enlace actual', () => {
    const enlaces = navDeModulos(TODO, 'admin');
    expect(enlaceActual('/admin/compras/ordenes/9', enlaces)?.categoria).toBe('dinero');
    expect(enlaceActual('/admin/ajustes', enlaces)).toBeNull();
  });
});
