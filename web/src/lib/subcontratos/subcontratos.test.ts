import { describe, expect, test } from 'vitest';
import type { NotaConRenglones, RenglonNota } from '@/lib/data/notas-obra-calculo';
import { calcularPago, contratoDesdeNota, importeRenglon, resumenSubcontrato } from './calculo';
import { LEYENDA_LEGAL, clausulasBase, resolverClausulas } from './clausulas';

let orden = 0;
function renglon(p: Partial<RenglonNota> & Pick<RenglonNota, 'tipo' | 'etiqueta'>): RenglonNota {
  orden += 100;
  return {
    id: `r${orden}`,
    nota_id: 'n1',
    monto: null,
    monto_base: null,
    porcentaje: null,
    mostrar_porcentaje: false,
    texto: '',
    fecha: null,
    orden,
    ...p,
  };
}

/** La nota real del encabezado de 0031 (Orlando Ramoz, Casas Bienestar). */
function notaOrlando(extra: Partial<NotaConRenglones> = {}): NotaConRenglones {
  return {
    id: 'n1',
    obra_id: 'o1',
    destinatario: 'Orlando Ramoz',
    colaborador_id: null,
    titulo: 'MZ 2 LT 1',
    fecha: 0,
    estado: 'ABIERTA',
    mostrar_para: true,
    total_override: null,
    saldo_override: null,
    notas: '',
    orden: 0,
    texto_final: null,
    renglones: [
      renglon({ tipo: 'CONCEPTO', etiqueta: 'Base de tinacos', monto: 123000 }),
      renglon({ tipo: 'CONCEPTO', etiqueta: 'Pretil', monto: 25000 }),
      renglon({ tipo: 'CONCEPTO', etiqueta: 'Recorte de puertas', texto: '26 pzas', monto: 8400 }),
      renglon({ tipo: 'DEDUCCION', etiqueta: 'Retención', monto_base: 156400, porcentaje: 4 }),
      // "62,000 − 4% = 60,000": el dueño fijó el neto a mano.
      renglon({ tipo: 'PAGO', etiqueta: 'Proyección 11/ago', monto_base: 62000, porcentaje: 4, monto: 60000, fecha: 5 }),
      renglon({ tipo: 'TEXTO', etiqueta: 'Liquidado', texto: 'bases de tinacos, pretil y recorte de puertas' }),
    ],
    ...extra,
  };
}

describe('convertir nota en contrato', () => {
  test('CONCEPTO → alcance; DEDUCCION con % → retención; PAGO → pago previo con su retención', () => {
    const c = contratoDesdeNota(notaOrlando(), 'Casas Bienestar');
    expect(c.subcontratistaNombre).toBe('Orlando Ramoz');
    expect(c.renglones.map((r) => [r.concepto, r.importe])).toEqual([
      ['Base de tinacos', 123000],
      ['Pretil', 25000],
      ['Recorte de puertas — 26 pzas', 8400],
    ]);
    expect(c.monto).toBe(156400);
    expect(c.retencionPct).toBe(4);
    expect(c.pagosPrevios).toEqual([{ fecha: 5, monto: 62000, retencion: 2000, referencia: 'Proyección 11/ago' }]);
    expect(c.alcance).toBe('MZ 2 LT 1\nLiquidado — bases de tinacos, pretil y recorte de puertas');
    expect(c.avisos).toEqual([]);
  });

  test('una deducción sin porcentaje no es retención: se avisa', () => {
    const nota = notaOrlando();
    nota.renglones = [
      renglon({ tipo: 'CONCEPTO', etiqueta: 'Firme', monto: 10000 }),
      renglon({ tipo: 'DEDUCCION', etiqueta: 'Material', monto: 1500 }),
    ];
    const c = contratoDesdeNota(nota, 'Obra X');
    expect(c.retencionPct).toBe(0);
    expect(c.avisos[0]).toContain('«Material»');
  });

  test('dos retenciones distintas: manda la primera y se avisa', () => {
    const nota = notaOrlando();
    nota.renglones = [
      renglon({ tipo: 'CONCEPTO', etiqueta: 'Firme', monto: 10000 }),
      renglon({ tipo: 'DEDUCCION', etiqueta: 'Fondo', monto_base: 10000, porcentaje: 5 }),
      renglon({ tipo: 'DEDUCCION', etiqueta: 'Otra', monto_base: 10000, porcentaje: 2 }),
    ];
    const c = contratoDesdeNota(nota, 'Obra X');
    expect(c.retencionPct).toBe(5);
    expect(c.avisos).toHaveLength(1);
  });

  test('nota vacía y sin título; total fijado a mano', () => {
    const c = contratoDesdeNota(notaOrlando({ titulo: '', renglones: [], total_override: 100 }), 'Obra X');
    expect(c.alcance).toBe('Trabajos en Obra X');
    expect(c.monto).toBe(0);
    expect(c.avisos).toHaveLength(2);
  });

  test('pago sin cuenta: bruto = neto, sin retención', () => {
    const nota = notaOrlando();
    nota.renglones = [renglon({ tipo: 'PAGO', etiqueta: 'Anticipo', monto: 5000 })];
    expect(contratoDesdeNota(nota, 'X').pagosPrevios).toEqual([
      { fecha: null, monto: 5000, retencion: 0, referencia: 'Anticipo' },
    ]);
  });
});

describe('pagos con retención', () => {
  test('sugerida: % del bruto a centavos', () => {
    expect(calcularPago(62000, 4)).toEqual({ monto: 62000, retencion: 2480, neto: 59520 });
    expect(calcularPago(1000.555, 5)).toEqual({ monto: 1000.56, retencion: 50.03, neto: 950.53 });
  });

  test('fijada a mano, nunca mayor que el pago ni negativa', () => {
    expect(calcularPago(62000, 4, 2000)).toEqual({ monto: 62000, retencion: 2000, neto: 60000 });
    expect(calcularPago(100, 4, 500).retencion).toBe(100);
    expect(calcularPago(100, 4, -3).retencion).toBe(0);
    expect(calcularPago(100, 150).retencion).toBe(100);
  });
});

describe('resumen del contrato', () => {
  test('sin monto fijado usa la suma de renglones', () => {
    const r = resumenSubcontrato(
      { monto: null },
      [{ importe: 100000 }, { importe: 56400 }],
      [
        { monto: 62000, retencion: 2480 },
        { monto: 30000, retencion: 1200 },
      ],
    );
    expect(r).toEqual({
      sumaRenglones: 156400,
      montoContratado: 156400,
      montoFijado: false,
      pagadoBruto: 92000,
      retenido: 3680,
      pagadoNeto: 88320,
      porPagar: 64400,
      avancePct: 58.8,
    });
  });

  test('monto fijado a mano manda', () => {
    const r = resumenSubcontrato({ monto: 150000 }, [{ importe: 156400 }], []);
    expect(r).toMatchObject({ montoContratado: 150000, montoFijado: true, porPagar: 150000, avancePct: 0 });
  });

  test('importe de renglón: cantidad × P.U. si vienen los dos', () => {
    expect(importeRenglon(26, 323.08, 0)).toBe(8400.08);
    expect(importeRenglon(null, 100, 555.555)).toBe(555.56);
  });
});

describe('cláusulas', () => {
  const ctx = {
    contratante: 'Constructora Uno',
    subcontratista: 'Orlando Ramoz',
    obra: 'Casas Bienestar',
    ubicacion: 'MZ 2 LT 1',
    montoContratado: 156400,
    retencionPct: 4,
    formaPago: '',
  };

  test('las base traen los datos del contrato y hablan del IMSS/REPSE sin prometer nada', () => {
    const t = clausulasBase(ctx);
    expect(t).toContain('Orlando Ramoz');
    expect(t).toContain('Constructora Uno');
    expect(t).toContain('4%');
    expect(t).toContain('REPSE');
    expect(t.split('\n\n')).toHaveLength(10);
  });

  test('sin retención lo dice', () => {
    expect(clausulasBase({ ...ctx, retencionPct: 0 })).toContain('no aplicar retención');
  });

  test('las propias mandan tal cual; vacías caen a las base', () => {
    expect(resolverClausulas('  Mis cláusulas  ', ctx)).toBe('Mis cláusulas');
    expect(resolverClausulas('   ', ctx)).toBe(clausulasBase(ctx));
    expect(resolverClausulas(null, ctx)).toBe(clausulasBase(ctx));
  });

  test('la leyenda deja claro que no es asesoría legal', () => {
    expect(LEYENDA_LEGAL).toMatch(/no sustituye/i);
  });
});
