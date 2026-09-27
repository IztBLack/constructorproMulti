import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  CLAVES_MODULO,
  MODULOS,
  PAQUETE_POR_DEFECTO,
  apagarModulo,
  dependientesDe,
  leerPerfil,
  modulosPorPerfil,
  navDeModulos,
  necesidadProximamente,
  normalizarModulos,
  perfilDeRespuestas,
  prenderModulo,
  resolverDependencias,
  rutaPerteneceAModulo,
  rutaVisible,
  siguientePaso,
  type ClaveModulo,
} from './modulos';
import { COMANDOS_FIJOS, comandosDeObra, soloModulosActivos } from '@/components/paleta/comandos';

describe('perfilDeRespuestas (lo que manda el navegador no se cree)', () => {
  test('descarta lo desconocido y recalcula "próximamente"', () => {
    const p = perfilDeRespuestas({
      tipo: 'empresa',
      factura: 'algunos',
      necesidades: ['material', 'material', 'hackear'],
      saltado: false,
    });
    expect(p.tipo).toBe('empresa');
    expect(p.necesidades).toEqual(['material']);
    expect(p.proximamente).toEqual(
      expect.arrayContaining(['compras', 'estimaciones']),
    );
    // La utilidad (F1) y cumplimiento (F5) ya existen: se prenden, no quedan en
    // "próximamente".
    expect(p.proximamente).not.toContain('rentabilidad');
    expect(p.proximamente).not.toContain('cumplimiento');
    expect(p.siguientePasoDescartado).toBe(false);
  });

  test('saltar sin contestar nada', () => {
    expect(
      perfilDeRespuestas({ tipo: undefined, factura: 7, necesidades: 'x', saltado: true }),
    ).toEqual({
      tipo: null,
      factura: null,
      necesidades: [],
      proximamente: [],
      saltado: true,
      siguientePasoDescartado: false,
    });
  });
});

describe('necesidadProximamente', () => {
  test('se decide por el módulo que la resuelve', () => {
    expect(necesidadProximamente('cotizar', null)).toBe(false);
    expect(necesidadProximamente('cuadrillas', null)).toBe(false);
    expect(necesidadProximamente('ganancia', null)).toBe(false); // la utilidad salió en F1
    expect(necesidadProximamente('extras', null)).toBe(false);
    expect(necesidadProximamente('facturar', null)).toBe(false); // F1b ya salió
    expect(necesidadProximamente('material', 'empresa')).toBe(true);
    expect(necesidadProximamente('tratos', 'constructora')).toBe(false);
  });
});

describe('paleta de comandos', () => {
  test('con todo prendido no se pierde ningún comando', () => {
    const todo = MODULOS.filter((m) => m.disponible).map((m) => m.clave);
    expect(soloModulosActivos(COMANDOS_FIJOS, todo)).toEqual(COMANDOS_FIJOS);
  });

  test('Facturación solo aparece con el módulo fiscal (no viene en el paquete de siempre)', () => {
    const titulos = (m: readonly ClaveModulo[]) => soloModulosActivos(COMANDOS_FIJOS, m).map((c) => c.titulo);
    expect(titulos(PAQUETE_POR_DEFECTO)).not.toContain('Facturación');
    expect(titulos([...PAQUETE_POR_DEFECTO, 'fiscal'])).toContain('Facturación');
    expect(navDeModulos([...PAQUETE_POR_DEFECTO, 'fiscal']).map((n) => n.href)).toContain('/admin/facturacion');
  });

  test('seguridad, herramienta y garantías solo con su módulo prendido', () => {
    const titulos = (activos: ClaveModulo[]) =>
      soloModulosActivos([...COMANDOS_FIJOS, ...comandosDeObra('o1')], activos).map((c) => c.titulo);
    expect(titulos([...PAQUETE_POR_DEFECTO])).not.toContain('Seguridad');
    expect(titulos([...PAQUETE_POR_DEFECTO])).not.toContain('Herramienta y maquinaria');
    expect(titulos([...PAQUETE_POR_DEFECTO])).not.toContain('Garantías');
    expect(titulos([...PAQUETE_POR_DEFECTO, 'seguridad', 'herramienta', 'postventa'])).toEqual(
      expect.arrayContaining(['Seguridad', 'Herramienta y maquinaria', 'Garantías']),
    );
  });

  test('extras y utilidad solo con su módulo prendido', () => {
    const titulos = (activos: ClaveModulo[]) =>
      soloModulosActivos([...COMANDOS_FIJOS, ...comandosDeObra('o1')], activos).map((c) => c.titulo);
    expect(titulos([...PAQUETE_POR_DEFECTO])).not.toContain('Extras');
    expect(titulos([...PAQUETE_POR_DEFECTO])).not.toContain('Utilidad por obra');
    expect(titulos([...PAQUETE_POR_DEFECTO, 'cambios', 'rentabilidad'])).toEqual(
      expect.arrayContaining(['Extras', 'Utilidad', 'Utilidad por obra']),
    );
  });

  test('con solo el núcleo desaparecen cotizaciones, equipo, caja y demás', () => {
    const titulos = soloModulosActivos(
      [...COMANDOS_FIJOS, ...comandosDeObra('o1')],
      ['obras'],
    ).map((c) => c.titulo);
    expect(titulos).toContain('Obras');
    expect(titulos).toContain('Ajustes');
    expect(titulos).not.toContain('Cotizaciones');
    expect(titulos).not.toContain('Pase de lista de hoy');
    expect(titulos).not.toContain('Nómina');
    expect(titulos).not.toContain('Importar movimientos');
    expect(titulos).not.toContain('Notas de trato');
  });
});

describe('resolverDependencias', () => {
  test('siempre incluye obras, aunque no se pida', () => {
    expect(resolverDependencias([])).toEqual(['obras']);
    expect(resolverDependencias(['caja'])).toEqual(['obras', 'caja']);
  });

  test('prende lo que cada módulo necesita (cuadrillas y proyección → equipo)', () => {
    expect(resolverDependencias(['cuadrillas'])).toEqual(['obras', 'equipo', 'cuadrillas']);
    expect(resolverDependencias(['proyeccion'])).toEqual(['obras', 'equipo', 'proyeccion']);
  });

  test('las dependencias de los módulos futuros también se resuelven', () => {
    for (const c of ['estimaciones', 'rentabilidad', 'cambios', 'fiscal'] as const) {
      expect(resolverDependencias([c])).toContain('cotizaciones');
    }
    expect(resolverDependencias(['subcontratos'])).toContain('notas');
  });

  test('sin repetidos y en el orden del catálogo', () => {
    const r = resolverDependencias(['portal', 'cuadrillas', 'obras', 'equipo', 'cuadrillas']);
    expect(r).toEqual(['obras', 'equipo', 'cuadrillas', 'portal']);
  });

  test('el paquete por defecto ya está cerrado bajo dependencias', () => {
    expect(resolverDependencias(PAQUETE_POR_DEFECTO)).toEqual([...PAQUETE_POR_DEFECTO]);
  });
});

describe('prender y apagar', () => {
  test('apagar equipo apaga también lo que depende de él', () => {
    expect(dependientesDe('equipo', PAQUETE_POR_DEFECTO)).toEqual(['cuadrillas', 'proyeccion']);
    const r = apagarModulo(PAQUETE_POR_DEFECTO, 'equipo');
    expect(r).not.toContain('equipo');
    expect(r).not.toContain('cuadrillas');
    expect(r).not.toContain('proyeccion');
    expect(r).toContain('caja');
  });

  test('el núcleo no se apaga', () => {
    expect(apagarModulo(PAQUETE_POR_DEFECTO, 'obras')).toContain('obras');
  });

  test('prender cuadrillas prende equipo', () => {
    expect(prenderModulo(['obras'], 'cuadrillas')).toEqual(['obras', 'equipo', 'cuadrillas']);
  });

  test('apagar algo de lo que nadie depende solo lo quita a él', () => {
    expect(apagarModulo(PAQUETE_POR_DEFECTO, 'portal')).toEqual(
      PAQUETE_POR_DEFECTO.filter((c) => c !== 'portal'),
    );
  });
});

describe('normalizarModulos', () => {
  test('sin dato (migración sin aplicar, fila ausente) = paquete de siempre', () => {
    expect(normalizarModulos(null)).toEqual([...PAQUETE_POR_DEFECTO]);
    expect(normalizarModulos(undefined)).toEqual([...PAQUETE_POR_DEFECTO]);
    expect(normalizarModulos('obras')).toEqual([...PAQUETE_POR_DEFECTO]);
  });

  test('descarta claves que esta web no conoce y completa dependencias', () => {
    expect(normalizarModulos(['cuadrillas', 'modulo_del_futuro', 42])).toEqual([
      'obras',
      'equipo',
      'cuadrillas',
    ]);
  });
});

describe('rutaPerteneceAModulo', () => {
  const casos: [string, ClaveModulo | null][] = [
    ['/admin', null],
    ['/admin/ajustes', null],
    ['/admin/usuarios', null],
    ['/admin/obras', 'obras'],
    ['/admin/obras?nueva=1', 'obras'],
    ['/admin/obras/importar', 'obras'],
    ['/admin/obras/abc', 'obras'],
    ['/admin/clientes/abc', 'obras'],
    ['/admin/cotizaciones', 'cotizaciones'],
    ['/admin/cotizaciones/abc/pdf', 'cotizaciones'],
    ['/admin/catalogo', 'cotizaciones'],
    ['/admin/equipo/abc', 'equipo'],
    ['/admin/puestos', 'equipo'],
    ['/campo', 'equipo'],
    ['/admin/obras/abc/asistencia', 'equipo'],
    ['/admin/obras/abc/nomina/pdf/descargar', 'equipo'],
    ['/admin/cuadrillas/abc', 'cuadrillas'],
    ['/admin/proyeccion/pdf', 'proyeccion'],
    ['/admin/obras/abc/notas/n1', 'notas'],
    ['/admin/obras/abc/importar', 'caja'],
    ['/admin/obras/abc/pdf', 'caja'],
    ['/admin/obras/abc/exportar', 'caja'],
    ['/admin/obras/abc/estado-cuenta-cliente/descargar', 'caja'],
    ['/admin/ajustes#pdf', null],
    ['/admin/obras/abc/extras', 'cambios'],
    ['/admin/obras/abc/extras/e1/pdf/descargar', 'cambios'],
    ['/admin/obras/abc/utilidad', 'rentabilidad'],
    ['/admin/rentabilidad', 'rentabilidad'],
    ['/admin/obras/abc/seguridad', 'seguridad'],
    ['/admin/herramienta', 'herramienta'],
    ['/admin/herramienta/h1', 'herramienta'],
    ['/admin/postventa', 'postventa'],
    ['/admin/postventa/r1', 'postventa'],
  ];
  test.each(casos)('%s → %s', (ruta, esperado) => {
    expect(rutaPerteneceAModulo(ruta)).toBe(esperado);
  });

  test('no confunde prefijos de texto con prefijos de ruta', () => {
    expect(rutaPerteneceAModulo('/admin/equipos-raros')).toBeNull();
  });

  test('rutaVisible: lo que no es de un módulo siempre se ve', () => {
    expect(rutaVisible('/admin/ajustes', ['obras'])).toBe(true);
    expect(rutaVisible('/admin/cotizaciones', ['obras'])).toBe(false);
    expect(rutaVisible('/admin/cotizaciones', ['obras', 'cotizaciones'])).toBe(true);
  });
});

describe('navDeModulos', () => {
  test('con el paquete por defecto queda la barra de siempre, en su orden', () => {
    expect(navDeModulos(PAQUETE_POR_DEFECTO).map((n) => n.label)).toEqual([
      'Inicio',
      'Pase de lista',
      'Obras',
      'Cotizaciones',
      'Clientes',
      'Equipo',
      'Cuadrillas',
      'Proyección',
    ]);
  });

  test('Utilidad solo para admin y contador (D1), y solo con el módulo prendido', () => {
    const conUtilidad = [...PAQUETE_POR_DEFECTO, 'rentabilidad'] as ClaveModulo[];
    expect(navDeModulos(conUtilidad, 'admin').map((n) => n.label)).toContain('Utilidad');
    expect(navDeModulos(conUtilidad, 'contador').map((n) => n.label)).toContain('Utilidad');
    expect(navDeModulos(conUtilidad, 'supervisor').map((n) => n.label)).not.toContain('Utilidad');
    expect(navDeModulos(conUtilidad).map((n) => n.label)).not.toContain('Utilidad');
    expect(navDeModulos(PAQUETE_POR_DEFECTO, 'admin').map((n) => n.label)).not.toContain('Utilidad');
  });

  test('F7: Herramienta y Garantías para la oficina, nunca para el colaborador', () => {
    const f7 = [...PAQUETE_POR_DEFECTO, 'seguridad', 'herramienta', 'postventa'] as ClaveModulo[];
    for (const rol of ['admin', 'supervisor', 'contador']) {
      expect(navDeModulos(f7, rol).map((n) => n.label)).toEqual(expect.arrayContaining(['Herramienta', 'Garantías']));
    }
    expect(navDeModulos(f7, 'colaborador').map((n) => n.label)).not.toContain('Herramienta');
    expect(navDeModulos(f7, 'colaborador').map((n) => n.label)).not.toContain('Garantías');
    // Seguridad vive en la obra: no pone enlace en la barra.
    expect(navDeModulos(f7, 'admin').map((n) => n.label)).not.toContain('Seguridad');
    expect(navDeModulos(PAQUETE_POR_DEFECTO, 'admin').map((n) => n.label)).not.toContain('Herramienta');
  });

  test('lo apagado desaparece de la barra', () => {
    const labels = navDeModulos(['obras', 'caja']).map((n) => n.label);
    expect(labels).toEqual(['Inicio', 'Obras', 'Clientes']);
  });
});

describe('modulosPorPerfil (plan §4.2)', () => {
  test('independiente: obras, cotizaciones, equipo, caja', () => {
    const r = modulosPorPerfil('independiente', [], 'no');
    expect(r.activos).toEqual(['obras', 'cotizaciones', 'equipo', 'caja']);
    expect(r.proximamente).toEqual([]);
  });

  test('contratista = el paquete de siempre', () => {
    expect(modulosPorPerfil('contratista', [], null).activos.sort()).toEqual(
      [...PAQUETE_POR_DEFECTO].sort(),
    );
  });

  test('saltar el cuestionario (sin tipo) usa el paquete de contratista', () => {
    expect(modulosPorPerfil(null, [], null)).toEqual(modulosPorPerfil('contratista', [], null));
  });

  test('empresa: lo que aún no existe queda en "próximamente", no se prende', () => {
    const r = modulosPorPerfil('empresa', [], 'no');
    expect(r.activos).toContain('rentabilidad');
    expect(r.proximamente).toEqual(['compras', 'estimaciones']);
    for (const c of r.activos) expect(MODULOS.find((m) => m.clave === c)?.disponible).toBe(true);
  });

  test('constructora acumula los paquetes anteriores', () => {
    const r = modulosPorPerfil('constructora', [], 'no');
    // F1, F4 y F5 ya existen: utilidad, bitácora, programa, cumplimiento y
    // subcontratos se prenden de verdad.
    expect(r.activos.sort()).toEqual(
      [...PAQUETE_POR_DEFECTO, 'rentabilidad', 'bitacora', 'programa', 'cumplimiento', 'subcontratos'].sort(),
    );
    expect(r.proximamente).toEqual(expect.arrayContaining(['compras']));
    for (const c of ['bitacora', 'programa', 'cumplimiento', 'subcontratos'] as const) {
      expect(r.proximamente).not.toContain(c);
    }
  });

  test('facturar o tener gente en el IMSS sugiere cumplimiento; "no" no', () => {
    expect(modulosPorPerfil('independiente', [], 'si').activos).toContain('cumplimiento');
    expect(modulosPorPerfil('independiente', [], 'algunos').activos).toContain('cumplimiento');
    expect(modulosPorPerfil('independiente', [], 'no').activos).not.toContain('cumplimiento');
  });

  test('las necesidades suman a la base, con dependencias', () => {
    const r = modulosPorPerfil('independiente', ['cuadrillas', 'cliente', 'tratos'], 'no');
    expect(r.activos).toEqual(
      expect.arrayContaining(['cuadrillas', 'equipo', 'portal', 'notas']),
    );
  });

  test('"ganancia" prende la utilidad y su dependencia (F1)', () => {
    const r = modulosPorPerfil('independiente', ['ganancia'], 'no');
    expect(r.activos).toEqual(expect.arrayContaining(['rentabilidad', 'cotizaciones']));
    expect(r.proximamente).not.toContain('rentabilidad');
  });

  test('"extras" prende cambios con cotizaciones (F1)', () => {
    const r = modulosPorPerfil('independiente', ['extras'], 'no');
    expect(r.activos).toEqual(expect.arrayContaining(['cambios', 'cotizaciones']));
    expect(r.proximamente).toEqual([]);
  });

  test('tratos: subcontratos solo para perfiles con oficina', () => {
    expect(modulosPorPerfil('contratista', ['tratos'], 'no').activos).not.toContain(
      'subcontratos',
    );
    expect(modulosPorPerfil('empresa', ['tratos'], 'no').activos).toContain('subcontratos');
  });
});

describe('leerPerfil', () => {
  test('null o basura → null', () => {
    expect(leerPerfil(null)).toBeNull();
    expect(leerPerfil('x')).toBeNull();
    expect(leerPerfil([1, 2])).toBeNull();
  });

  test('descarta valores desconocidos', () => {
    const p = leerPerfil({
      tipo: 'marciano',
      factura: 'si',
      necesidades: ['cotizar', 'volar', 'cotizar'],
      proximamente: ['compras', 'nada'],
      siguiente_paso_descartado: true,
    });
    expect(p).toEqual({
      tipo: null,
      factura: 'si',
      necesidades: ['cotizar'],
      proximamente: ['compras'],
      saltado: false,
      siguientePasoDescartado: true,
    });
  });
});

describe('siguientePaso (plan §4.3)', () => {
  test('independiente → primera cotización; contratista → cuadrilla', () => {
    expect(siguientePaso('independiente', PAQUETE_POR_DEFECTO).titulo).toBe(
      'Haz tu primera cotización',
    );
    expect(siguientePaso('contratista', PAQUETE_POR_DEFECTO).titulo).toBe(
      'Da de alta tu cuadrilla',
    );
  });

  test('si el módulo del paso está apagado, cae a la primera obra', () => {
    expect(siguientePaso('independiente', ['obras']).href).toBe('/admin/obras?nueva=1');
  });
});

/**
 * PARIDAD CON LA BASE. El catálogo vive dos veces: aquí (para la interfaz) y en
 * la migración 0035 (para el CHECK y las RPC). Si alguien agrega un módulo o una
 * dependencia en un solo lado, este test lo detecta antes de que la base rechace
 * lo que la web ofrece (o al revés).
 */
describe('paridad con supabase/migrations/0035_modulos_empresa.sql', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('../../../supabase/migrations/0035_modulos_empresa.sql', import.meta.url)),
    'utf8',
  );

  function cuerpo(funcion: string): string {
    const inicio = sql.indexOf(`function public.${funcion}()`);
    expect(inicio).toBeGreaterThan(-1);
    const desde = sql.indexOf('$$', inicio);
    const hasta = sql.indexOf('$$', desde + 2);
    return sql.slice(desde + 2, hasta);
  }

  test('mismo catálogo, mismo orden', () => {
    const claves = [...cuerpo('modulos_catalogo').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(claves).toEqual([...CLAVES_MODULO]);
  });

  test('mismas dependencias', () => {
    const json = cuerpo('modulos_dependencias').match(/'(\{[\s\S]*\})'::jsonb/)?.[1];
    const deps = JSON.parse(json ?? '{}') as Record<string, string[]>;
    const esperado = Object.fromEntries(
      MODULOS.filter((m) => m.dependeDe.length > 0).map((m) => [m.clave, m.dependeDe]),
    );
    expect(deps).toEqual(esperado);
  });

  test('el default de la columna es el paquete por defecto', () => {
    const bloque = sql.match(/add column if not exists modulos text\[\][\s\S]*?\]::text\[\]/)?.[0];
    const claves = [...(bloque ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(claves).toEqual([...PAQUETE_POR_DEFECTO]);
  });
});
