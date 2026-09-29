import { describe, expect, it } from 'vitest';
import {
  agruparEnOrdenes,
  calcularExistencias,
  estadoOrdenRecibida,
  estadoRequisicion,
  faltantes,
  fechaBaseCredito,
  fechaVencimiento,
  ordenadoPorRenglon,
  pendientePorComprar,
  recibidoPorRenglon,
  saldoOrden,
  saldosPorProveedor,
  situacionPago,
  totalesDe,
  totalesOrden,
} from './calculo';

const DIA = 86_400_000;

describe('totalesOrden', () => {
  it('importe por renglón a centavos, IVA sobre el subtotal', () => {
    const t = totalesOrden(
      [
        { cantidad: 3, precio_unitario: 199.995 }, // 599.985 → 599.99
        { cantidad: 10, precio_unitario: 0.1 }, // 1.00
      ],
      16,
    );
    expect(t).toEqual({ subtotal: 600.99, iva: 96.16, total: 697.15 });
  });

  it('sin IVA y sin renglones', () => {
    expect(totalesOrden([], 16)).toEqual({ subtotal: 0, iva: 0, total: 0 });
    expect(totalesOrden([{ cantidad: 2, precio_unitario: 50 }], 0)).toEqual({ subtotal: 100, iva: 0, total: 100 });
  });

  it('un IVA fuera de rango se acota', () => {
    expect(totalesOrden([{ cantidad: 1, precio_unitario: 100 }], 150).iva).toBe(100);
    expect(totalesOrden([{ cantidad: 1, precio_unitario: 100 }], Number.NaN).iva).toBe(0);
  });

  it('emitida: valen los totales congelados, no los renglones', () => {
    const t = totalesDe({
      estado: 'EMITIDA',
      subtotal: 100,
      iva: 16,
      total: 116,
      iva_pct: 0,
      renglones: [{ cantidad: 99, precio_unitario: 99 }],
    });
    expect(t.total).toBe(116);
    expect(
      totalesDe({ estado: 'BORRADOR', subtotal: null, iva: null, total: null, iva_pct: 16, renglones: [{ cantidad: 1, precio_unitario: 10 }] })
        .total,
    ).toBe(11.6);
  });
});

describe('estado de la requisición', () => {
  const rs = [
    { id: 'a', cantidad: 10 },
    { id: 'b', cantidad: 2 },
  ];

  it('PENDIENTE y RECHAZADA las decide el admin', () => {
    expect(estadoRequisicion('PENDIENTE', rs, new Map([['a', 10]]))).toBe('PENDIENTE');
    expect(estadoRequisicion('RECHAZADA', rs, new Map())).toBe('RECHAZADA');
  });

  it('según lo que está en órdenes', () => {
    expect(estadoRequisicion('APROBADA', rs, new Map())).toBe('APROBADA');
    expect(estadoRequisicion('APROBADA', rs, new Map([['a', 4]]))).toBe('PARCIAL');
    expect(estadoRequisicion('PARCIAL', rs, new Map([['a', 10], ['b', 2]]))).toBe('COMPRADA');
    expect(estadoRequisicion('COMPRADA', rs, new Map([['a', 10]]))).toBe('PARCIAL');
    expect(estadoRequisicion('APROBADA', [], new Map())).toBe('APROBADA');
  });

  it('tolera el redondeo de double (10 × 0.1)', () => {
    let suma = 0;
    for (let i = 0; i < 10; i++) suma += 0.1;
    expect(estadoRequisicion('APROBADA', [{ id: 'x', cantidad: 1 }], new Map([['x', suma]]))).toBe('COMPRADA');
  });

  it('ordenado ignora renglones borrados y sin requisición; pendiente nunca negativo', () => {
    const m = ordenadoPorRenglon([
      { requisicion_renglon_id: 'a', cantidad: 3 },
      { requisicion_renglon_id: 'a', cantidad: 2 },
      { requisicion_renglon_id: 'a', cantidad: 9, deleted: true },
      { requisicion_renglon_id: null, cantidad: 5 },
    ]);
    expect(m.get('a')).toBe(5);
    expect(m.size).toBe(1);
    expect(pendientePorComprar(10, 5)).toBe(5);
    expect(pendientePorComprar(10, 12)).toBe(0);
  });
});

describe('faltantes y estado de la orden', () => {
  const rs = [
    { id: 'r1', descripcion: 'Cemento', unidad: 'bulto', cantidad: 10 },
    { id: 'r2', descripcion: 'Arena', unidad: 'm3', cantidad: 2 },
  ];

  it('faltante y sobrante por renglón', () => {
    const rec = recibidoPorRenglon([
      { orden_compra_renglon_id: 'r1', cantidad_recibida: 6 },
      { orden_compra_renglon_id: 'r2', cantidad_recibida: 2.5 },
    ]);
    const f = faltantes(rs, rec);
    expect(f[0]).toMatchObject({ pedido: 10, recibido: 6, faltante: 4, sobrante: 0 });
    expect(f[1]).toMatchObject({ recibido: 2.5, faltante: 0, sobrante: 0.5 });
    expect(estadoOrdenRecibida('EMITIDA', rs, rec)).toBe('PARCIAL');
  });

  it('EMITIDA → PARCIAL → RECIBIDA; borrador y cancelada no cambian', () => {
    expect(estadoOrdenRecibida('EMITIDA', rs, new Map())).toBe('EMITIDA');
    expect(estadoOrdenRecibida('PARCIAL', rs, new Map([['r1', 10], ['r2', 2]]))).toBe('RECIBIDA');
    expect(estadoOrdenRecibida('BORRADOR', rs, new Map([['r1', 10]]))).toBe('BORRADOR');
    expect(estadoOrdenRecibida('CANCELADA', rs, new Map())).toBe('CANCELADA');
  });
});

describe('saldo y vencimiento', () => {
  it('saldo sin pagos borrados, nunca negativo', () => {
    expect(saldoOrden(1160, [{ monto: 500 }, { monto: 300, deleted_at: 1 }])).toBe(660);
    expect(saldoOrden(100, [{ monto: 150 }])).toBe(0);
  });

  it('el crédito corre desde la factura, si no desde la primera entrega, si no desde la emisión', () => {
    const base = { factura_fecha: null, emitida_at: 1000, fecha: 500, primeraRecepcion: null };
    expect(fechaBaseCredito(base)).toBe(1000);
    expect(fechaBaseCredito({ ...base, primeraRecepcion: 2000 })).toBe(2000);
    expect(fechaBaseCredito({ ...base, primeraRecepcion: 2000, factura_fecha: 3000 })).toBe(3000);
    expect(fechaBaseCredito({ ...base, emitida_at: null })).toBe(500);
    expect(fechaVencimiento(0, 15)).toBe(15 * DIA);
    expect(fechaVencimiento(0, -3)).toBe(0);
  });

  it('situación por día', () => {
    const hoy = 100 * DIA;
    expect(situacionPago({ saldo: 0, vence: 0, hoy }).situacion).toBe('pagada');
    expect(situacionPago({ saldo: 10, vence: hoy - DIA, hoy })).toEqual({ situacion: 'vencida', dias: -1 });
    expect(situacionPago({ saldo: 10, vence: hoy, hoy }).situacion).toBe('por_vencer');
    expect(situacionPago({ saldo: 10, vence: hoy + 3 * DIA, hoy }).situacion).toBe('por_vencer');
    expect(situacionPago({ saldo: 10, vence: hoy + 4 * DIA, hoy }).situacion).toBe('al_corriente');
  });

  it('saldos por proveedor: solo emitidas con saldo, lo vencido primero', () => {
    const hoy = 100 * DIA;
    const base = { obra_id: 'o', dias_credito: 0, factura_fecha: null, fecha: 0 };
    const r = saldosPorProveedor(
      [
        { ...base, id: '1', folio: 1, proveedor_id: 'p1', estado: 'EMITIDA', total: 1000, emitida_at: hoy + 10 * DIA },
        { ...base, id: '2', folio: 2, proveedor_id: 'p2', estado: 'RECIBIDA', total: 500, emitida_at: hoy - 5 * DIA },
        { ...base, id: '3', folio: 3, proveedor_id: 'p2', estado: 'BORRADOR', total: null, emitida_at: null },
        { ...base, id: '4', folio: 4, proveedor_id: 'p3', estado: 'CANCELADA', total: 900, emitida_at: 0 },
        { ...base, id: '5', folio: 5, proveedor_id: 'p1', estado: 'PARCIAL', total: 200, emitida_at: 0 },
      ],
      [
        { orden_compra_id: '1', monto: 400 },
        { orden_compra_id: '5', monto: 200 },
      ],
      new Map(),
      hoy,
    );
    expect(r.map((g) => g.proveedorId)).toEqual(['p2', 'p1']);
    expect(r[0]).toMatchObject({ saldo: 500, vencido: 500 });
    expect(r[1]).toMatchObject({ saldo: 600, vencido: 0 });
    expect(r[1].ordenes.map((o) => o.folio)).toEqual([1]);
  });
});

describe('agruparEnOrdenes', () => {
  it('una orden por (obra, proveedor); descarta lo incompleto', () => {
    const it = (o: string, p: string, c: number) => ({
      requisicionRenglonId: `${o}${p}${c}`,
      obraId: o,
      proveedorId: p,
      materialId: null,
      descripcion: 'x',
      unidad: 'pza',
      cantidad: c,
      precioUnitario: 10,
    });
    const g = agruparEnOrdenes([it('o1', 'p1', 1), it('o1', 'p1', 2), it('o1', 'p2', 1), it('o2', 'p1', 1), it('o2', '', 1), it('o2', 'p1', 0)]);
    expect(g.map((x) => `${x.obraId}|${x.proveedorId}|${x.renglones.length}|${x.subtotal}`)).toEqual([
      'o1|p1|2|30',
      'o1|p2|1|10',
      'o2|p1|1|10',
    ]);
  });
});

describe('calcularExistencias', () => {
  it('recibido − consumo ± traspasos y ajustes; ignora texto libre y borrados', () => {
    const e = calcularExistencias(
      [
        { obraId: 'A', materialId: 'v', cantidad: 100 },
        { obraId: 'A', materialId: null, cantidad: 50 },
      ],
      [
        { obra_id: 'A', material_id: 'v', tipo: 'CONSUMO', cantidad: 30, obra_destino_id: null, deleted_at: null },
        { obra_id: 'A', material_id: 'v', tipo: 'TRASPASO', cantidad: 20, obra_destino_id: 'B', deleted_at: null },
        { obra_id: 'A', material_id: 'v', tipo: 'AJUSTE', cantidad: -2, obra_destino_id: null, deleted_at: null },
        { obra_id: 'A', material_id: 'v', tipo: 'CONSUMO', cantidad: 999, obra_destino_id: null, deleted_at: 5 },
      ],
    );
    const por = new Map(e.map((x) => [x.obraId, x]));
    expect(por.get('A')).toMatchObject({ recibido: 100, consumido: 30, traspasoSalida: 20, ajuste: -2, existencia: 48 });
    expect(por.get('B')).toMatchObject({ traspasoEntrada: 20, existencia: 20 });
  });
});
