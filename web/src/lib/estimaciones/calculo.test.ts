import { describe, expect, test } from 'vitest';
import {
  aCentavos,
  cantidad4,
  escalar,
  importeCentavos,
  porcentajeCentavos,
  restarCantidades,
  sumarCantidades,
} from './dinero';
import {
  acumulados,
  calcularImportes,
  estimadoPorConcepto,
  proponerCantidades,
  validarRenglones,
  type EstimacionResumen,
} from './calculo';
import {
  avanceDeGrupo,
  avanceFinanciero,
  avanceFisico,
  cantidadDesdePct,
  ejecutadoPorConcepto,
  incrementoDesdeTotal,
} from './avance';
import { CONTRATO_VACIO, type ConceptoContrato, type ContratoObra } from './tipos';
import { leerFoto } from './snapshot';

const concepto = (clave: string, cantidad: number, precio: number, extra: Partial<ConceptoContrato> = {}): ConceptoContrato => ({
  clave,
  origen: clave.startsWith('x:') ? 'extra' : 'presupuesto',
  id: clave.slice(2),
  concepto: `Partida ${clave}`,
  unidad: 'm2',
  seccion: null,
  cantidad,
  precioUnitario: precio,
  orden: 0,
  ...extra,
});

const contrato = (c: Partial<ContratoObra>): ContratoObra => ({ ...CONTRATO_VACIO, ...c });

/** Las identidades que la base exige (CHECK de 0039), al centavo. */
function cuadra(i: ReturnType<typeof calcularImportes>) {
  const c = (n: number) => Math.round(n * 100);
  expect(c(i.subtotal)).toBe(c(i.importeBruto) - c(i.amortizacion));
  expect(c(i.total)).toBe(c(i.subtotal) + c(i.iva));
  expect(c(i.neto)).toBe(c(i.total) - c(i.fondoGarantia) - c(i.retencionesTotal));
  expect(c(i.retencionesTotal)).toBe(i.retenciones.reduce((s, r) => s + c(r.importe), 0));
  expect(i.amortizacion).toBeGreaterThanOrEqual(0);
  expect(i.amortizacion).toBeLessThanOrEqual(i.importeBruto);
  expect(i.neto).toBeGreaterThanOrEqual(0);
}

describe('dinero en centavos (igual que numeric de Postgres)', () => {
  test('la mitad se redondea hacia arriba aunque el flotante diga otra cosa', () => {
    // 3 × 33.335 = 100.005 exacto; en flotante 100.00499999…
    expect(importeCentavos(3, 33.335)).toBe(10001);
    expect(importeCentavos(1.005, 1)).toBe(101);
    expect(importeCentavos(0.1, 0.2)).toBe(2);
    expect(importeCentavos(344, 14_500)).toBe(498_800_000);
  });

  test('cantidades y precios se toman a 4 decimales como la base', () => {
    expect(escalar(2.00005, 4)).toBe(BigInt(20001));
    expect(escalar(-2.00005, 4)).toBe(-BigInt(20001));
    expect(cantidad4(1.23456)).toBe(1.2346);
    expect(escalar(1e-7, 4)).toBe(BigInt(0));
    expect(aCentavos(10.005)).toBe(1001);
  });

  test('porcentajes al centavo', () => {
    expect(porcentajeCentavos(100_000, 5)).toBe(5000);
    expect(porcentajeCentavos(333, 50)).toBe(167); // 1.665 → 1.67
    expect(porcentajeCentavos(12_345_67, 0.5)).toBe(6173); // 5 al millar de 12,345.67 = 61.728 → 61.73
    expect(porcentajeCentavos(100, 0)).toBe(0);
  });

  test('sumas y restas de cantidades sin error flotante', () => {
    expect(sumarCantidades([0.1, 0.2])).toBe(0.3);
    expect(restarCantidades(0.3, 0.1)).toBe(0.2);
  });
});

describe('importes de una estimación', () => {
  const renglones = [
    { cantidad: 10, precioUnitario: 1_000 },
    { cantidad: 2.5, precioUnitario: 400 },
  ]; // bruto = 11,000

  test('sin contrato: el neto es el bruto', () => {
    const i = calcularImportes({ renglones, contrato: CONTRATO_VACIO, retenciones: [], amortizadoPrevio: 0, esFiniquito: false });
    expect(i.importeBruto).toBe(11_000);
    expect(i.neto).toBe(11_000);
    cuadra(i);
  });

  test('amortización, IVA, fondo de garantía y 5 al millar', () => {
    const i = calcularImportes({
      renglones,
      contrato: contrato({ anticipo: 30_000, amortizacionPct: 30, fondoGarantiaPct: 5, ivaPct: 16 }),
      retenciones: [{ concepto: '5 al millar', tipo: 'PORCENTAJE', valor: 0.5 }],
      amortizadoPrevio: 0,
      esFiniquito: false,
    });
    expect(i.amortizacion).toBe(3_300);
    expect(i.subtotal).toBe(7_700);
    expect(i.iva).toBe(1_232);
    expect(i.total).toBe(8_932);
    expect(i.fondoGarantia).toBe(550);
    expect(i.retenciones[0].importe).toBe(55);
    expect(i.neto).toBe(8_327);
    cuadra(i);
  });

  test('la amortización nunca pasa de lo que queda del anticipo', () => {
    const i = calcularImportes({
      renglones,
      contrato: contrato({ anticipo: 10_000, amortizacionPct: 30 }),
      retenciones: [],
      amortizadoPrevio: 9_000,
      esFiniquito: false,
    });
    expect(i.amortizacion).toBe(1_000);
    cuadra(i);
  });

  test('con el anticipo ya amortizado, no se descuenta nada', () => {
    const i = calcularImportes({
      renglones,
      contrato: contrato({ anticipo: 10_000, amortizacionPct: 30 }),
      retenciones: [],
      amortizadoPrevio: 12_000, // de más (p. ej. bajaron el anticipo después)
      esFiniquito: false,
    });
    expect(i.amortizacion).toBe(0);
    cuadra(i);
  });

  test('el finiquito liquida TODO el remanente del anticipo', () => {
    const i = calcularImportes({
      renglones,
      contrato: contrato({ anticipo: 10_000, amortizacionPct: 30 }),
      retenciones: [],
      amortizadoPrevio: 5_432.1,
      esFiniquito: true,
    });
    expect(i.amortizacion).toBe(4_567.9);
    cuadra(i);
  });

  test('si el remanente no cabe en el finiquito, se amortiza hasta donde alcanza', () => {
    const i = calcularImportes({
      renglones: [{ cantidad: 1, precioUnitario: 1_000 }],
      contrato: contrato({ anticipo: 50_000, amortizacionPct: 30 }),
      retenciones: [],
      amortizadoPrevio: 0,
      esFiniquito: true,
    });
    expect(i.amortizacion).toBe(1_000);
    expect(i.neto).toBe(0);
    cuadra(i);
  });

  test('la amortización se recorta para que el neto nunca sea negativo', () => {
    const i = calcularImportes({
      renglones: [{ cantidad: 1, precioUnitario: 100 }],
      contrato: contrato({ anticipo: 1_000, amortizacionPct: 95, fondoGarantiaPct: 5, ivaPct: 16 }),
      retenciones: [{ concepto: '5 al millar', tipo: 'PORCENTAJE', valor: 0.5 }],
      amortizadoPrevio: 0,
      esFiniquito: false,
    });
    expect(i.amortizacion).toBe(94.5); // 100 − 5 − 0.5
    cuadra(i);
  });

  test('retenciones de monto fijo que pasan del importe se recortan', () => {
    const i = calcularImportes({
      renglones: [{ cantidad: 1, precioUnitario: 100 }],
      contrato: contrato({ fondoGarantiaPct: 10 }),
      retenciones: [
        { concepto: 'Limpieza', tipo: 'MONTO', valor: 50 },
        { concepto: 'Seguro', tipo: 'MONTO', valor: 80 },
      ],
      amortizadoPrevio: 0,
      esFiniquito: false,
    });
    expect(i.retencionesTotal).toBe(90);
    expect(i.retenciones.map((r) => r.importe)).toEqual([50, 40]);
    cuadra(i);
  });

  test('miles de combinaciones cuadran al centavo', () => {
    let semilla = 7;
    const azar = () => {
      semilla = (semilla * 1103515245 + 12345) % 2 ** 31;
      return semilla / 2 ** 31;
    };
    for (let k = 0; k < 2_000; k++) {
      const rs = Array.from({ length: 1 + Math.floor(azar() * 6) }, () => ({
        cantidad: Math.round(azar() * 100_000) / 1_000,
        precioUnitario: Math.round(azar() * 5_000_000) / 1_000,
      }));
      const i = calcularImportes({
        renglones: rs,
        contrato: contrato({
          anticipo: Math.round(azar() * 1e7) / 100,
          amortizacionPct: Math.round(azar() * 5_000) / 100,
          fondoGarantiaPct: Math.round(azar() * 1_000) / 100,
          ivaPct: azar() < 0.5 ? 0 : 16,
        }),
        retenciones: [
          { concepto: 'a', tipo: 'PORCENTAJE', valor: 0.5 },
          { concepto: 'b', tipo: 'MONTO', valor: Math.round(azar() * 100_000) / 100 },
        ],
        amortizadoPrevio: Math.round(azar() * 1e6) / 100,
        esFiniquito: azar() < 0.2,
      });
      cuadra(i);
    }
  });
});

describe('acumulados de la obra', () => {
  const est = (id: string, estado: EstimacionResumen['estado'], bruto: number, amort: number, neto: number): EstimacionResumen => ({
    id,
    estado,
    importe_bruto: bruto,
    amortizacion: amort,
    fondo_garantia: bruto * 0.05,
    neto,
    renglones: [{ clave: 'p:1', cantidad: bruto / 100 }],
  });
  const lista = [
    est('a', 'COBRADA', 1_000, 300, 650),
    est('b', 'AUTORIZADA', 2_000, 600, 1_300),
    est('c', 'ENVIADA', 500, 150, 325),
    est('d', 'RECHAZADA', 9_999, 999, 9_000),
    est('e', 'BORRADOR', 700, 210, 455),
  ];

  test('solo cuentan enviadas, autorizadas y cobradas', () => {
    const r = acumulados(lista, 3_000);
    expect(r.estimado).toBe(3_500);
    expect(r.amortizado).toBe(1_050);
    expect(r.anticipoPendiente).toBe(1_950);
    expect(r.fondoRetenido).toBe(175);
    expect(r.porCobrar).toBe(1_300);
    expect(r.cobrado).toBe(650);
  });

  test('sin contar la estimación que se está editando', () => {
    expect(acumulados(lista, 3_000, 'b').amortizado).toBe(450);
    expect(estimadoPorConcepto(lista, 'b').get('p:1')).toBe(15);
    expect(estimadoPorConcepto(lista).get('p:1')).toBe(35);
  });
});

describe('propuesta desde el avance', () => {
  const conceptos = [concepto('p:a', 100, 10), concepto('p:b', 20, 50), concepto('x:c', 5, 200), concepto('p:0', 0, 10)];

  test('propone lo hecho que no se ha estimado, sin pasar de lo contratado', () => {
    const ejecutado = new Map([
      ['p:a', 60],
      ['p:b', 25], // 5 de más
      ['x:c', 2],
    ]);
    const estimado = new Map([
      ['p:a', 40],
      ['p:b', 10],
    ]);
    const p = proponerCantidades(conceptos, ejecutado, estimado);
    expect(p.map((x) => [x.clave, x.cantidad, x.excedente])).toEqual([
      ['p:a', 20, 0],
      ['p:b', 10, 5],
      ['x:c', 2, 0],
    ]);
  });

  test('nada que proponer si todo lo hecho ya se estimó', () => {
    expect(proponerCantidades(conceptos, new Map([['p:a', 10]]), new Map([['p:a', 10]]))).toEqual([]);
  });

  test('si alguien borró avance ya estimado, no propone negativos', () => {
    expect(proponerCantidades(conceptos, new Map([['p:a', 5]]), new Map([['p:a', 10]]))).toEqual([]);
  });
});

describe('validación de renglones', () => {
  const conceptos = [concepto('p:a', 10, 100), concepto('x:b', 5, 200)];

  test('no deja estimar más de lo contratado (sin extra)', () => {
    const r = validarRenglones([{ clave: 'p:a', concepto: 'Firme', cantidad: 3 }], conceptos, new Map([['p:a', 8]]));
    expect(r).toHaveLength(1);
    expect(r[0].mensaje).toMatch(/extra aprobado/);
  });

  test('lo exacto sí pasa; el extra aprobado es una partida más', () => {
    expect(
      validarRenglones(
        [
          { clave: 'p:a', concepto: 'Firme', cantidad: 2 },
          { clave: 'x:b', concepto: 'Barda', cantidad: 5 },
        ],
        conceptos,
        new Map([['p:a', 8]]),
      ),
    ).toEqual([]);
  });

  test('partida que ya no está, repetida o en cero', () => {
    const r = validarRenglones(
      [
        { clave: 'p:zz', concepto: 'Borrada', cantidad: 1 },
        { clave: 'p:a', concepto: 'Firme', cantidad: 1 },
        { clave: 'p:a', concepto: 'Firme', cantidad: 1 },
        { clave: 'x:b', concepto: 'Barda', cantidad: 0 },
      ],
      conceptos,
      new Map(),
    );
    expect(r.map((x) => x.mensaje)).toEqual([
      expect.stringMatching(/ya no está/),
      expect.stringMatching(/dos veces/),
      expect.stringMatching(/mayor que cero/),
    ]);
  });
});

describe('avance físico y financiero', () => {
  const conceptos = [concepto('p:a', 100, 10), concepto('p:b', 10, 900, { seccion: 'Losa' })]; // 1,000 + 9,000

  test('se pondera por dinero, no por número de partidas', () => {
    const a = avanceFisico(conceptos, new Map([['p:a', 100]]));
    expect(a.pct).toBe(10);
    const b = avanceFisico(conceptos, new Map([['p:b', 10]]));
    expect(b.pct).toBe(90);
  });

  test('lo hecho de más no sube el % y se reporta como excedente', () => {
    const a = avanceFisico(conceptos, new Map([['p:a', 130]]));
    expect(a.pct).toBe(10);
    expect(a.porConcepto.get('p:a')).toMatchObject({ pct: 100, excedente: 30 });
  });

  test('sin nada contratado no hay %', () => {
    expect(avanceFisico([], new Map()).pct).toBeNull();
    expect(avanceFisico(conceptos, new Map()).hayCapturas).toBe(false);
  });

  test('capturas incrementales, con correcciones y hasta una fecha', () => {
    const m = ejecutadoPorConcepto([
      { clave: 'p:a', fecha: 1, cantidad: 10.1 },
      { clave: 'p:a', fecha: 2, cantidad: 0.2 },
      { clave: 'p:a', fecha: 3, cantidad: -0.3 },
      { clave: 'p:b', fecha: 9, cantidad: 1 },
    ]);
    expect(m.get('p:a')).toBe(10);
    expect(ejecutadoPorConcepto([{ clave: 'p:b', fecha: 9, cantidad: 1 }], 5).has('p:b')).toBe(false);
  });

  test('avance de una sección (para el programa)', () => {
    expect(avanceDeGrupo(conceptos, new Map([['p:b', 5]]), (c) => c.seccion === 'Losa')).toBe(50);
    expect(avanceDeGrupo(conceptos, new Map(), (c) => c.seccion === 'Nada')).toBeNull();
  });

  test('financiero = cobrado / contratado, con tope', () => {
    expect(avanceFinanciero(2_500, 10_000)).toBe(25);
    expect(avanceFinanciero(20_000, 10_000)).toBe(100);
    expect(avanceFinanciero(1, 0)).toBeNull();
  });

  test('"llevamos en total" y "vamos al %" se convierten a captura', () => {
    expect(incrementoDesdeTotal(12.5, 20)).toBe(7.5);
    expect(incrementoDesdeTotal(20, 18)).toBe(-2);
    expect(cantidadDesdePct(37, 40)).toBe(14.8);
  });
});

describe('foto de la estimación', () => {
  test('lee lo que arma la base y tolera basura', () => {
    expect(leerFoto(null)).toBeNull();
    const f = leerFoto({
      folio: 2,
      renglones: [{ concepto: 'Firme', cantidad: '3', generadores: [{ fecha: 1, cantidad: 3, nota: 'eje A' }] }],
      importes: { neto: 100, retenciones: [{ concepto: '5 al millar', tipo: 'PORCENTAJE', valor: 0.5, importe: 0.5 }] },
    })!;
    expect(f.folio).toBe(2);
    expect(f.renglones[0].cantidad).toBe(3);
    expect(f.renglones[0].generadores[0].nota).toBe('eje A');
    expect(f.importes.retenciones[0].importe).toBe(0.5);
    expect(f.contrato.anticipo).toBe(0);
  });
});
