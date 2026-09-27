/**
 * "Paquete para el contador" (RF1b.5): arma los renglones de las 6 hojas del
 * Excel a partir de los cobros y gastos de un periodo. Lógica PURA con pruebas;
 * el Excel y el ZIP los hace `paquete-excel.ts`.
 *
 *   1. Por facturar           — cobros sin folio fiscal, con los datos de la hoja.
 *   2. Complementos de pago   — abonos a facturas PPD que no tienen complemento.
 *   3. Facturado              — folios, montos y estado de cobro.
 *   4. Gastos por obra        — salidas de caja (sin la raya).
 *   5. Raya                   — salidas de nómina del periodo.
 *   6. Resumen de IVA         — ESTIMADO, no es declaración.
 */

import { centavos, limiteComplemento } from './calculo';
import { abonosDePpd, armarHoja, type EntradaHoja, type HojaFacturar } from './hoja';
import { estadoDe } from './tipos';

export interface GastoPaquete {
  obra: string;
  fecha: number;
  categoria: string;
  concepto: string;
  nombre: string;
  monto: number;
  metodo: string;
  referencia: string;
}

export interface FilaPorFacturar {
  fecha: number;
  documento: string;
  cliente: string;
  rfc: string;
  razonSocial: string;
  regimen: string;
  cp: string;
  uso: string;
  concepto: string;
  cobrado: number;
  subtotal: number;
  iva: number;
  retIsr: number;
  retIva: number;
  total: number;
  forma: string;
  metodo: string;
  faltantes: string;
}

export interface FilaComplemento {
  fechaPago: number;
  limite: string;
  documento: string;
  cliente: string;
  rfc: string;
  folioFactura: string;
  parcialidad: number | null;
  saldoAnterior: number | null;
  pagado: number;
  saldoInsoluto: number | null;
  forma: string;
}

export interface FilaFacturado {
  fechaCobro: number;
  fechaFactura: number | null;
  documento: string;
  cliente: string;
  rfc: string;
  folio: string;
  metodo: string;
  totalFactura: number | null;
  cobrado: number;
  complemento: string;
  estadoCobro: string;
}

export interface ResumenIva {
  ivaFacturado: number;
  ivaPorFacturar: number;
  ivaGastos: number;
  diferencia: number;
  cobrosFacturados: number;
  cobrosPorFacturar: number;
  cobrosSinFactura: number;
}

export interface Paquete {
  porFacturar: FilaPorFacturar[];
  complementos: FilaComplemento[];
  facturado: FilaFacturado[];
  gastos: GastoPaquete[];
  raya: GastoPaquete[];
  resumen: ResumenIva;
}

/** Salidas que son raya (las que registra la nómina con categoría NOMINA). */
export function esRaya(categoria: string | null | undefined): boolean {
  return /^(nomina|nómina|raya|destajo)/i.test((categoria ?? '').trim());
}

/** IVA que traería un gasto si tuviera factura al 16% (IVA incluido en el monto). */
export function ivaSiTuvieraFactura(monto: number, ivaPct = 16): number {
  return centavos(monto - monto / (1 + ivaPct / 100));
}

const valor = (h: HojaFacturar, seccion: 'receptor' | 'pago', etiqueta: string): string =>
  h[seccion].find((c) => c.etiqueta.startsWith(etiqueta))?.valor ?? '';

export function armarPaquete(entradas: EntradaHoja[], gastosYRaya: GastoPaquete[]): Paquete {
  const porFacturar: FilaPorFacturar[] = [];
  const complementos: FilaComplemento[] = [];
  const facturado: FilaFacturado[] = [];
  let ivaFacturado = 0;
  let ivaPorFacturar = 0;
  let cobrosSinFactura = 0;

  for (const e of entradas) {
    const c = e.cobro;
    const f = c.fiscal;
    const estado = estadoDe(c);
    const h = armarHoja(e);
    const rfc = e.receptor?.rfc ?? '';

    if (estado === 'no_requiere') {
      cobrosSinFactura++;
      continue;
    }

    // Complemento pendiente: abono a una PPD (lo diga la hoja o lo diga la fila
    // guardada) que todavía no tiene su complemento.
    const esAbonoPpd = h.tipo === 'complemento' || (estado === 'facturado' && f?.metodo_pago === 'PPD');
    if (esAbonoPpd && !f?.complemento_uuid) {
      complementos.push({
        fechaPago: c.fecha,
        limite: limiteComplemento(c.fecha),
        documento: c.documentoNombre,
        cliente: c.clienteNombre,
        rfc,
        folioFactura: h.facturaRelacionada ?? f?.uuid ?? '',
        parcialidad: h.parcialidad?.numero ?? f?.parcialidad ?? null,
        saldoAnterior: h.parcialidad?.saldoAnterior ?? null,
        pagado: h.parcialidad?.pagado ?? c.monto,
        saldoInsoluto: h.parcialidad?.saldoInsoluto ?? null,
        forma: f?.forma_pago ?? valor(h, 'pago', 'Forma de pago'),
      });
    }

    if (estado === 'facturado') {
      // Un abono a PPD no es una factura nueva: su IVA ya se contó en la factura.
      if (!(h.tipo === 'complemento')) ivaFacturado += h.desglose.iva;
      const total = f?.total_factura ?? null;
      // En una PPD cuenta todo lo abonado a ese folio (con o sin fila guardada).
      const todos = [c, ...e.otrosCobros];
      const emisora =
        f?.metodo_pago === 'PPD' && f.uuid
          ? todos
              .filter((o) => o.fiscal?.uuid?.toUpperCase() === f.uuid!.toUpperCase())
              .sort((a, b) => a.fecha - b.fecha || a.id.localeCompare(b.id))[0]
          : null;
      const abonadoMismaFactura = emisora
        ? abonosDePpd(emisora, todos).reduce((s, o) => s + o.monto, 0)
        : c.monto;
      const saldo = total != null ? centavos(total - abonadoMismaFactura) : 0;
      facturado.push({
        fechaCobro: c.fecha,
        fechaFactura: f?.fecha_factura ?? null,
        documento: c.documentoNombre,
        cliente: c.clienteNombre,
        rfc,
        folio: f?.uuid ?? '',
        metodo: f?.metodo_pago ?? '',
        totalFactura: total,
        cobrado: c.monto,
        complemento: f?.complemento_uuid ?? '',
        estadoCobro: saldo > 0.01 ? `Falta cobrar ${saldo.toFixed(2)}` : 'Cobrada',
      });
      continue;
    }

    // Por facturar. Un abono a PPD ya quedó en complementos: no se factura otra vez.
    if (h.tipo === 'complemento') continue;
    ivaPorFacturar += h.desglose.iva;
    porFacturar.push({
      fecha: c.fecha,
      documento: c.documentoNombre,
      cliente: c.clienteNombre,
      rfc,
      razonSocial: valor(h, 'receptor', 'Nombre'),
      regimen: valor(h, 'receptor', 'Régimen'),
      cp: valor(h, 'receptor', 'Código postal'),
      uso: valor(h, 'receptor', 'Uso del CFDI'),
      concepto: c.concepto,
      cobrado: c.monto,
      subtotal: h.desglose.subtotal,
      iva: h.desglose.iva,
      retIsr: h.desglose.retIsr,
      retIva: h.desglose.retIva,
      total: h.desglose.total,
      forma: valor(h, 'pago', 'Forma de pago'),
      metodo: valor(h, 'pago', 'Método de pago'),
      faltantes: h.faltantes.join('; '),
    });
  }

  const gastos = gastosYRaya.filter((g) => !esRaya(g.categoria));
  const raya = gastosYRaya.filter((g) => esRaya(g.categoria));
  const ivaGastos = centavos(gastos.reduce((s, g) => s + ivaSiTuvieraFactura(g.monto), 0));

  const orden = <T extends { fecha?: number; fechaPago?: number; fechaCobro?: number }>(a: T, b: T) =>
    (a.fecha ?? a.fechaPago ?? a.fechaCobro ?? 0) - (b.fecha ?? b.fechaPago ?? b.fechaCobro ?? 0);

  return {
    porFacturar: porFacturar.sort(orden),
    complementos: complementos.sort(orden),
    facturado: facturado.sort(orden),
    gastos: gastos.sort((a, b) => a.obra.localeCompare(b.obra) || a.fecha - b.fecha),
    raya: raya.sort((a, b) => a.obra.localeCompare(b.obra) || a.fecha - b.fecha),
    resumen: {
      ivaFacturado: centavos(ivaFacturado),
      ivaPorFacturar: centavos(ivaPorFacturar),
      ivaGastos,
      diferencia: centavos(ivaFacturado - ivaGastos),
      cobrosFacturados: facturado.length,
      cobrosPorFacturar: porFacturar.length,
      cobrosSinFactura,
    },
  };
}
