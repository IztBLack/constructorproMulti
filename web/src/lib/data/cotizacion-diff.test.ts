import { describe, expect, test } from 'vitest';
import {
  buildSnapshot,
  compararSnapshot,
  hayCambiosSinAprobar,
  parseSnapshot,
  type DetalleParaSnapshot,
} from './cotizacion-diff';

/// El diff que ve el CLIENTE cuando el contratista tocó una cotización que él ya
/// había aprobado. Se muestra junto al botón de volver a aprobar, así que aquí
/// un número mal no es un detalle de interfaz: es lo que la persona está
/// aceptando.
///
/// Emparejado con `test/logic/iva_congelado_test.dart` del móvil en lo que toca
/// a la tasa congelada (migración 0017).

function detalle(
  p: Partial<DetalleParaSnapshot> & {
    partidas?: { id: string; cantidad: number; precio: number; desc?: string }[];
  } = {},
): DetalleParaSnapshot {
  const partidas = p.partidas ?? [{ id: 'p1', cantidad: 2, precio: 100 }];
  return {
    descuento: p.descuento ?? 0,
    iva_enabled: p.iva_enabled ?? false,
    iva_porcentaje: p.iva_porcentaje,
    secciones: p.secciones ?? [
      {
        id: 's1',
        nombre: 'Obra negra',
        orden: 0,
        partidas: partidas.map((x, i) => ({
          id: x.id,
          descripcion: x.desc ?? `Partida ${x.id}`,
          unidad: 'm2',
          cantidad: x.cantidad,
          precio_unitario: x.precio,
          orden: i,
        })),
      },
    ],
  };
}

describe('buildSnapshot', () => {
  test('normaliza el orden de secciones y partidas', () => {
    // La foto tiene que ser estable: si dependiera del orden en que llegan las
    // filas, dos lecturas de la MISMA cotización darían fotos distintas y el
    // diff avisaría de cambios que no existen.
    const snap = buildSnapshot({
      descuento: 0,
      iva_enabled: false,
      secciones: [
        {
          id: 's2',
          nombre: 'Acabados',
          orden: 1,
          partidas: [
            { id: 'b', descripcion: 'B', unidad: null, cantidad: 1, precio_unitario: 1, orden: 1 },
            { id: 'a', descripcion: 'A', unidad: null, cantidad: 1, precio_unitario: 1, orden: 0 },
          ],
        },
        { id: 's1', nombre: 'Obra negra', orden: 0, partidas: [] },
      ],
    });

    expect(snap.secciones.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(snap.secciones[1].partidas.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('parseSnapshot', () => {
  test('devuelve null ante JSON vacío, roto o con la forma equivocada', () => {
    // Es lo que decide si se enseña el panel de «te cambiaron la cotización».
    // Un throw aquí tumbaría la página del cliente.
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot(undefined)).toBeNull();
    expect(parseSnapshot('')).toBeNull();
    expect(parseSnapshot('{no es json')).toBeNull();
    expect(parseSnapshot('{"otraCosa":1}')).toBeNull();
  });

  test('un snapshot bien formado sobrevive la ida y vuelta', () => {
    const snap = buildSnapshot(detalle({ descuento: 10, iva_enabled: true }));
    expect(parseSnapshot(JSON.stringify(snap))).toEqual(snap);
  });
});

describe('compararSnapshot — qué cambió', () => {
  test('sin cambios no hay nada que aprobar', () => {
    const base = detalle();
    const d = compararSnapshot(buildSnapshot(base), base);

    expect(d.hayCambios).toBe(false);
    expect(d.nuevas).toHaveLength(0);
    expect(d.eliminadas).toHaveLength(0);
    expect(d.modificadas).toHaveLength(0);
    expect(d.cambioGlobal).toBe(false);
  });

  test('una partida agregada sale como nueva', () => {
    const aprobado = buildSnapshot(detalle());
    const ahora = detalle({
      partidas: [
        { id: 'p1', cantidad: 2, precio: 100 },
        { id: 'p2', cantidad: 1, precio: 500, desc: 'Extra' },
      ],
    });
    const d = compararSnapshot(aprobado, ahora);

    expect(d.hayCambios).toBe(true);
    expect(d.nuevas).toHaveLength(1);
    expect(d.nuevas[0].descripcion).toBe('Extra');
    expect(d.totalAhora - d.totalAntes).toBe(500);
  });

  test('una partida quitada sale como eliminada', () => {
    const aprobado = buildSnapshot(
      detalle({
        partidas: [
          { id: 'p1', cantidad: 2, precio: 100 },
          { id: 'p2', cantidad: 1, precio: 500 },
        ],
      }),
    );
    const d = compararSnapshot(aprobado, detalle());

    expect(d.eliminadas).toHaveLength(1);
    expect(d.eliminadas[0].precioUnitario).toBe(500);
  });

  test('cambiar cantidad o precio se desglosa con el antes y el ahora', () => {
    const aprobado = buildSnapshot(detalle());
    const d = compararSnapshot(
      aprobado,
      detalle({ partidas: [{ id: 'p1', cantidad: 5, precio: 120 }] }),
    );

    expect(d.modificadas).toHaveLength(1);
    expect(d.modificadas[0].cantidad).toEqual({ antes: 2, ahora: 5 });
    expect(d.modificadas[0].precioUnitario).toEqual({ antes: 100, ahora: 120 });
  });

  test('cambiar solo la descripción también cuenta como modificación', () => {
    const aprobado = buildSnapshot(detalle());
    const d = compararSnapshot(
      aprobado,
      detalle({ partidas: [{ id: 'p1', cantidad: 2, precio: 100, desc: 'Otra cosa' }] }),
    );

    expect(d.modificadas).toHaveLength(1);
    expect(d.modificadas[0].descripcionAntes).toBe('Partida p1');
    // El total no se movió, pero el cliente aprobó otra descripción.
    expect(d.hayCambios).toBe(true);
    expect(d.totalAntes).toBe(d.totalAhora);
  });

  test('mover el descuento o el IVA es cambio aunque no se toque una partida', () => {
    const aprobado = buildSnapshot(detalle());
    const d = compararSnapshot(aprobado, detalle({ descuento: 15 }));

    expect(d.cambioGlobal).toBe(true);
    expect(d.hayCambios).toBe(true);
    expect(d.totalAhora).toBe(170); // 200 − 15%
  });
});

/// La tasa se CONGELA al crear la cotización (migración 0017). Este bloque es el
/// que cazó el bug: `totalDeSnapshot` multiplicaba por un `1.16` quemado, así
/// que a una empresa con IVA al 8% —o sin IVA— el panel del cliente le enseñaba
/// «Total antes / Total ahora» inflados, justo encima del botón de aprobar.
describe('compararSnapshot — la tasa de IVA congelada', () => {
  test('usa la tasa de la cotización, no un 16% quemado', () => {
    const base = detalle({ iva_enabled: true, iva_porcentaje: 8 });
    const d = compararSnapshot(buildSnapshot(base), base);

    expect(d.totalAhora).toBeCloseTo(216, 6); // 200 × 1.08
    expect(d.totalAntes).toBeCloseTo(216, 6);
  });

  test('con la tasa en 0 el total es la base, sin impuesto', () => {
    const base = detalle({ iva_enabled: true, iva_porcentaje: 0 });
    const d = compararSnapshot(buildSnapshot(base), base);

    expect(d.totalAhora).toBe(200);
  });

  test('sin tasa (fila anterior a 0017) cae al 16% de siempre', () => {
    // Es el respaldo que hace que esas cotizaciones den exactamente lo mismo
    // que daban antes de que la tasa fuera configurable.
    const base = detalle({ iva_enabled: true });
    const d = compararSnapshot(buildSnapshot(base), base);

    expect(d.totalAhora).toBeCloseTo(232, 6); // 200 × 1.16
  });

  test('con el IVA apagado la tasa no entra, valga lo que valga', () => {
    const base = detalle({ iva_enabled: false, iva_porcentaje: 16 });
    const d = compararSnapshot(buildSnapshot(base), base);

    expect(d.totalAhora).toBe(200);
  });

  test('descuento y luego IVA, en ese orden', () => {
    // Al revés daría otro número: el IVA va sobre la base ya descontada.
    const base = detalle({ descuento: 10, iva_enabled: true, iva_porcentaje: 16 });
    const d = compararSnapshot(buildSnapshot(base), base);

    expect(d.totalAhora).toBeCloseTo(208.8, 6); // (200 − 10%) × 1.16
  });
});

describe('hayCambiosSinAprobar', () => {
  test('sin foto aprobada no hay nada que comparar', () => {
    expect(hayCambiosSinAprobar(null, detalle())).toBe(false);
    expect(hayCambiosSinAprobar('{roto', detalle())).toBe(false);
  });

  test('detecta el cambio a partir del JSON guardado', () => {
    const json = JSON.stringify(buildSnapshot(detalle()));

    expect(hayCambiosSinAprobar(json, detalle())).toBe(false);
    expect(
      hayCambiosSinAprobar(json, detalle({ partidas: [{ id: 'p1', cantidad: 3, precio: 100 }] })),
    ).toBe(true);
  });
});
