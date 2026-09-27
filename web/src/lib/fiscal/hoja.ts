/**
 * "Hoja para facturar" (RF1b.4): arma, a partir de un cobro, los datos en el
 * MISMO ORDEN en que los pide el facturador del SAT — Emisor → Receptor →
 * Conceptos → Pago — para capturarlos de corrido copiando campo por campo.
 *
 * Lógica PURA: la usan la página web (con botones de copiar), el PDF y el
 * paquete para el contador. No lee Supabase.
 */

import {
  ANTICIPO_SAT,
  LEYENDA_SUGERENCIA,
  formaPagoDeMetodo,
  textoForma,
  textoRegimen,
  textoUnidad,
  textoUso,
} from './catalogos';
import {
  calcularParcialidad,
  centavos,
  desglosar,
  limiteComplemento,
  pareceAnticipo,
  sugerirMetodo,
  sugerirRetenciones,
  type Desglose,
  type Parcialidad,
} from './calculo';
import { RFC_EXTRANJERO, RFC_PUBLICO_GENERAL, tipoPersonaDeRfc } from './rfc';
import type { ClienteFiscal, Cobro, EmpresaFiscal, IvaModo } from './tipos';

export interface ConceptoOrigen {
  id: string;
  tabla: 'partidas' | 'obra_presupuesto';
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  claveSat: string | null;
  unidadSat: string | null;
}

export interface DocumentoOrigen {
  /** Nombre del proyecto (cotización) o de la obra. */
  titulo: string;
  /** Valor del contrato CON IVA si lo lleva (total de la cotización o del presupuesto). */
  total: number;
  /** ¿La cotización se hizo con IVA? null = no se sabe (presupuesto de obra). */
  conIva: boolean | null;
  ivaPct: number;
  conceptos: ConceptoOrigen[];
}

export interface EntradaHoja {
  cobro: Cobro;
  documento: DocumentoOrigen;
  emisor: EmpresaFiscal | null;
  receptor: ClienteFiscal | null;
  /** Los demás cobros del mismo documento (para anticipo y parcialidades). */
  otrosCobros: Cobro[];
  /** IVA por defecto de la empresa, si el documento no trae el suyo. */
  ivaPorDefecto: number;
}

export interface CampoHoja {
  etiqueta: string;
  valor: string;
  /** Texto de apoyo (qué significa la clave). */
  ayuda?: string;
  /** Falta el dato: se pinta en rojo y se lista en "Te falta". */
  falta?: boolean;
  /** true si el dato lo sugiere la app (no lo capturó nadie). */
  sugerido?: boolean;
}

export interface ConceptoHoja {
  /** Para poder guardar la clave en el concepto original. */
  origen: { tabla: ConceptoOrigen['tabla']; id: string } | null;
  claveProdServ: string;
  claveSugerida: boolean;
  claveUnidad: string;
  unidadSugerida: boolean;
  cantidad: number;
  unidad: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  objetoImpuesto: string;
}

export type TipoAviso = 'ok' | 'atencion' | 'info';

export interface AvisoHoja {
  tipo: TipoAviso;
  texto: string;
}

export interface HojaFacturar {
  /** `complemento`: el cobro es un abono a una factura PPD ya emitida. */
  tipo: 'factura' | 'complemento';
  titulo: string;
  emisor: CampoHoja[];
  receptor: CampoHoja[];
  conceptos: ConceptoHoja[];
  pago: CampoHoja[];
  desglose: Desglose;
  avisos: AvisoHoja[];
  notas: string[];
  faltantes: string[];
  /** Solo si es complemento. */
  parcialidad: Parcialidad | null;
  facturaRelacionada: string | null;
  ivaModo: IvaModo;
}

const campo = (
  etiqueta: string,
  valor: string | null | undefined,
  extra: Omit<CampoHoja, 'etiqueta' | 'valor'> = {},
): CampoHoja => ({ etiqueta, valor: (valor ?? '').trim(), falta: !(valor ?? '').trim(), ...extra });

const pesos = (n: number) => n.toFixed(2);

/** IVA con que se factura: lo guardado en el cobro manda; si no, lo del documento. */
export function ivaModoDe(cobro: Cobro, documento: DocumentoOrigen): IvaModo {
  if (cobro.fiscal?.iva_modo) return cobro.fiscal.iva_modo;
  if (documento.conIva === false) return 'aparte';
  return 'incluido';
}

const mismoFolio = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toUpperCase() === b.toUpperCase();

const ordenFecha = (a: Cobro, b: Cobro) => a.fecha - b.fecha || a.id.localeCompare(b.id);

/**
 * Los cobros que abonan a la factura PPD que emitió `ppd`, en orden: los que ya
 * llevan su folio y, después de ella, los que no tienen factura propia (se
 * suponen abonos) hasta cubrir el total. Sirve igual para saber si un cobro es
 * complemento que para numerar sus parcialidades.
 */
export function abonosDePpd(ppd: Cobro, todos: Cobro[]): Cobro[] {
  const total = ppd.fiscal?.total_factura ?? 0;
  const folio = ppd.fiscal?.uuid;
  let saldo = total;
  const abonos: Cobro[] = [];
  for (const c of [...new Map(todos.map((x) => [x.id, x])).values()].sort(ordenFecha)) {
    const explicito = mismoFolio(c.fiscal?.uuid, folio);
    const implicito =
      !c.fiscal?.uuid && c.fiscal?.estado !== 'no_requiere' && ordenFecha(c, ppd) > 0;
    if (!explicito && !(implicito && saldo > 0.01)) continue;
    abonos.push(c);
    saldo -= c.monto;
  }
  return abonos;
}

/** La factura PPD a la que abona este cobro (la emitió otro cobro del mismo documento). */
function facturaPpdPrevia(cobro: Cobro, otros: Cobro[]): Cobro | null {
  const todos = [cobro, ...otros];
  const emisoras = todos
    .filter((c) => c.fiscal?.estado === 'facturado' && c.fiscal.metodo_pago === 'PPD' && c.fiscal.uuid)
    .sort(ordenFecha)
    // La que emitió cada folio es su primer cobro.
    .filter((c, i, arr) => arr.findIndex((x) => mismoFolio(x.fiscal?.uuid, c.fiscal?.uuid)) === i);
  for (const f of emisoras) {
    if (f.id === cobro.id) return null;
    if (abonosDePpd(f, todos).some((a) => a.id === cobro.id)) return f;
  }
  return null;
}

/** Clave principal del documento: la del concepto con más importe que ya tenga clave. */
function claveDominante(conceptos: ConceptoOrigen[]): { clave: string | null; unidad: string | null } {
  const conClave = conceptos
    .filter((c) => c.claveSat)
    .sort((a, b) => b.cantidad * b.precioUnitario - a.cantidad * a.precioUnitario);
  return { clave: conClave[0]?.claveSat ?? null, unidad: conClave[0]?.unidadSat ?? null };
}

export function armarHoja(e: EntradaHoja): HojaFacturar {
  const { cobro, documento, emisor, receptor } = e;
  const f = cobro.fiscal;
  const avisos: AvisoHoja[] = [];
  const notas: string[] = [];

  const ivaModo = ivaModoDe(cobro, documento);
  const ivaPct = documento.conIva === null ? e.ivaPorDefecto : documento.ivaPct;
  const tipoEmisor = tipoPersonaDeRfc(emisor?.rfc);
  const rfcReceptor = (receptor?.rfc ?? '').toUpperCase();
  const generico = rfcReceptor === RFC_PUBLICO_GENERAL || rfcReceptor === RFC_EXTRANJERO;
  const sugRet = sugerirRetenciones(
    { regimen: emisor?.regimen ?? null, tipo: tipoEmisor },
    { tipo: tipoPersonaDeRfc(rfcReceptor), generico },
  );
  const retIsrPct = f?.ret_isr_pct ?? sugRet.isrPct;
  const retIvaPct = f?.ret_iva_pct ?? sugRet.ivaPct;
  const desglose = desglosar(cobro.monto, { ivaModo, ivaPct, retIsrPct, retIvaPct });

  // ── ¿Factura nueva o complemento de una PPD? ─────────────────────────────
  const ppd = facturaPpdPrevia(cobro, e.otrosCobros);
  const tipo: HojaFacturar['tipo'] = ppd ? 'complemento' : 'factura';

  // ── 1. Emisor ────────────────────────────────────────────────────────────
  const emisorCampos: CampoHoja[] = [
    campo('RFC', emisor?.rfc),
    campo('Nombre o razón social', emisor?.razon_social, {
      ayuda: 'Tal cual viene en tu constancia de situación fiscal.',
    }),
    campo('Régimen fiscal', emisor?.regimen, { ayuda: textoRegimen(emisor?.regimen) }),
    campo('Código postal (lugar de expedición)', emisor?.cp_fiscal),
  ];

  // ── 2. Receptor ──────────────────────────────────────────────────────────
  const usoGuardado = f?.uso_cfdi ?? receptor?.uso_cfdi ?? null;
  const receptorCampos: CampoHoja[] = generico
    ? [
        campo('RFC', rfcReceptor),
        campo('Nombre', rfcReceptor === RFC_PUBLICO_GENERAL ? 'PUBLICO EN GENERAL' : receptor?.razon_social),
        campo('Código postal', emisor?.cp_fiscal, {
          ayuda: 'A público en general se le pone TU código postal.',
        }),
        campo('Régimen fiscal', '616', { ayuda: textoRegimen('616') }),
        campo('Uso del CFDI', 'S01', { ayuda: textoUso('S01') }),
      ]
    : [
        campo('RFC', receptor?.rfc),
        campo('Nombre o razón social', receptor?.razon_social, {
          ayuda: 'Exacto como en la constancia del cliente; si no coincide, el SAT la rechaza.',
        }),
        campo('Código postal', receptor?.cp_fiscal),
        campo('Régimen fiscal', receptor?.regimen, { ayuda: textoRegimen(receptor?.regimen) }),
        tipo === 'complemento'
          ? campo('Uso del CFDI', 'CP01', { ayuda: 'Pagos (así va siempre en un complemento).' })
          : campo('Uso del CFDI', usoGuardado ?? 'G03', {
              ayuda: textoUso(usoGuardado ?? 'G03'),
              sugerido: !usoGuardado,
            }),
      ];

  // ── 3. Conceptos ─────────────────────────────────────────────────────────
  const objeto = '02';
  let conceptos: ConceptoHoja[] = [];
  const anteriores = e.otrosCobros.filter((c) => c.fecha < cobro.fecha || (c.fecha === cobro.fecha && c.id < cobro.id));
  const esPrimerCobro = anteriores.length === 0;
  const esAnticipo = tipo === 'factura' && pareceAnticipo(cobro.concepto) && esPrimerCobro;
  const cubreTodo = Math.abs(cobro.monto - documento.total) <= 1 && documento.conceptos.length > 0;

  if (tipo === 'complemento') {
    conceptos = [
      {
        origen: null,
        claveProdServ: '84111506',
        claveSugerida: false,
        claveUnidad: 'ACT',
        unidadSugerida: false,
        cantidad: 1,
        unidad: 'Actividad',
        descripcion: 'Pago',
        valorUnitario: 0,
        importe: 0,
        objetoImpuesto: '01',
      },
    ];
  } else if (esAnticipo) {
    conceptos = [
      {
        origen: null,
        claveProdServ: ANTICIPO_SAT.clave,
        claveSugerida: false,
        claveUnidad: ANTICIPO_SAT.unidad,
        unidadSugerida: false,
        cantidad: 1,
        unidad: textoUnidad(ANTICIPO_SAT.unidad),
        descripcion: ANTICIPO_SAT.descripcion,
        valorUnitario: desglose.subtotal,
        importe: desglose.subtotal,
        objetoImpuesto: objeto,
      },
    ];
    notas.push(
      'Es el anticipo: el SAT pide facturarlo con la clave 84111506, unidad ACT y la descripción "Anticipo del bien o servicio". Cuando factures el trabajo, relaciona este folio con el tipo de relación 07 (aplicación de anticipo).',
    );
  } else if (cubreTodo) {
    // El cobro paga todo el documento: van sus conceptos, escalados a la base sin IVA.
    const bruto = documento.conceptos.reduce((s, c) => s + c.cantidad * c.precioUnitario, 0);
    const escala = bruto > 0 ? desglose.subtotal / bruto : 0;
    conceptos = documento.conceptos.map((c) => {
      const sug = !c.claveSat;
      const unidadSat = c.unidadSat ?? 'E48';
      const valorUnitario = centavos(c.precioUnitario * escala);
      return {
        origen: { tabla: c.tabla, id: c.id },
        claveProdServ: c.claveSat ?? '72111000',
        claveSugerida: sug,
        claveUnidad: unidadSat,
        unidadSugerida: !c.unidadSat,
        cantidad: c.cantidad,
        unidad: textoUnidad(unidadSat) || c.unidad,
        descripcion: c.descripcion,
        valorUnitario,
        importe: centavos(c.cantidad * valorUnitario),
        objetoImpuesto: objeto,
      };
    });
    // Los redondeos por renglón pueden mover centavos: se ajustan en el último.
    const suma = centavos(conceptos.reduce((s, c) => s + c.importe, 0));
    const ajuste = centavos(desglose.subtotal - suma);
    if (ajuste !== 0 && conceptos.length > 0) {
      const u = conceptos[conceptos.length - 1];
      u.importe = centavos(u.importe + ajuste);
      u.valorUnitario = u.cantidad !== 0 ? centavos(u.importe / u.cantidad) : u.importe;
    }
  } else {
    // Pago por avance: un solo concepto con la clave principal del trabajo.
    const dom = claveDominante(documento.conceptos);
    const numero = anteriores.length + 1;
    conceptos = [
      {
        origen: null,
        claveProdServ: dom.clave ?? '72111000',
        claveSugerida: !dom.clave,
        claveUnidad: dom.unidad ?? 'E48',
        unidadSugerida: !dom.unidad,
        cantidad: 1,
        unidad: textoUnidad(dom.unidad ?? 'E48'),
        descripcion: `${cobro.concepto || `Pago ${numero}`} — ${documento.titulo}`.trim(),
        valorUnitario: desglose.subtotal,
        importe: desglose.subtotal,
        objetoImpuesto: objeto,
      },
    ];
  }

  // ── 4. Pago ──────────────────────────────────────────────────────────────
  const formaCobro = formaPagoDeMetodo(cobro.metodo);
  let parcialidad: Parcialidad | null = null;
  let pagoCampos: CampoHoja[];
  if (ppd) {
    const uuid = ppd.fiscal!.uuid!;
    parcialidad = calcularParcialidad(
      cobro.id,
      abonosDePpd(ppd, [cobro, ...e.otrosCobros]),
      ppd.fiscal!.total_factura ?? 0,
    );
    const forma = f?.forma_pago ?? formaCobro;
    pagoCampos = [
      campo('Tipo de comprobante', 'P - Pago'),
      campo('Fecha de pago', new Date(cobro.fecha - 6 * 3600_000).toISOString().slice(0, 10)),
      campo('Forma de pago', forma, { ayuda: textoForma(forma), sugerido: !f?.forma_pago }),
      campo('Moneda', 'MXN'),
      campo('Monto', pesos(cobro.monto)),
      campo('Folio fiscal de la factura (UUID)', uuid),
      campo('Número de parcialidad', parcialidad ? String(parcialidad.numero) : ''),
      campo('Saldo anterior', parcialidad ? pesos(parcialidad.saldoAnterior) : ''),
      campo('Importe pagado', parcialidad ? pesos(parcialidad.pagado) : pesos(cobro.monto)),
      campo('Saldo insoluto', parcialidad ? pesos(parcialidad.saldoInsoluto) : ''),
    ];
    notas.push(
      `Este cobro es un abono a una factura en parcialidades (PPD). No se hace otra factura: se hace un complemento de pago, a más tardar el ${limiteComplemento(cobro.fecha)}.`,
    );
  } else {
    const sugMet = sugerirMetodo({
      totalFactura: desglose.total,
      pagadoAlFacturar: ivaModo === 'aparte' ? cobro.monto : desglose.total,
      formaDelCobro: formaCobro,
    });
    const metodo = f?.metodo_pago ?? sugMet.metodo;
    const forma = f?.forma_pago ?? (metodo === 'PPD' ? '99' : sugMet.forma);
    pagoCampos = [
      campo('Tipo de comprobante', 'I - Ingreso'),
      campo('Forma de pago', forma, { ayuda: textoForma(forma), sugerido: !f?.forma_pago }),
      campo('Método de pago', metodo, {
        ayuda: metodo === 'PUE' ? 'Pago en una sola exhibición' : 'Pago en parcialidades o diferido',
        sugerido: !f?.metodo_pago,
      }),
      campo('Moneda', 'MXN'),
      campo('Subtotal', pesos(desglose.subtotal)),
      campo(`IVA trasladado (${desglose.ivaPct}%)`, pesos(desglose.iva)),
      ...(desglose.retIsr > 0 ? [campo(`ISR retenido (${desglose.retIsrPct}%)`, pesos(desglose.retIsr))] : []),
      ...(desglose.retIva > 0 ? [campo(`IVA retenido (${desglose.retIvaPct}%)`, pesos(desglose.retIva))] : []),
      campo('Total', pesos(desglose.total)),
    ];
    if (!f?.metodo_pago) notas.push(sugMet.motivo);
    if (metodo === 'PPD') {
      notas.push(
        'Con PPD, cada vez que te paguen tienes que hacer un complemento de pago, a más tardar el día 5 del mes siguiente al pago.',
      );
    }
    if (formaCobro === '04' && !f?.forma_pago) {
      avisos.push({
        tipo: 'atencion',
        texto: 'Te pagaron con tarjeta: revisa si fue de crédito (04) o de débito (28).',
      });
    }
    // Anticipo facturado antes: hay que relacionarlo.
    if (!esAnticipo) {
      const anticipo = anteriores.find(
        (c) => pareceAnticipo(c.concepto) && c.fiscal?.estado === 'facturado' && c.fiscal.uuid,
      );
      if (anticipo) {
        notas.push(
          `Tu cliente ya te dio un anticipo facturado (folio ${anticipo.fiscal!.uuid}). Relaciónalo en esta factura con el tipo de relación 07 "CFDI por aplicación de anticipo".`,
        );
      }
    }
  }

  // ── Notas del caso y avisos ──────────────────────────────────────────────
  notas.push(
    'Si tu cliente te retiene un fondo de garantía, no lo restes en la factura: se factura el total y el fondo es un pago que llega después.',
  );
  if (ivaModo === 'aparte') {
    avisos.push({
      tipo: 'atencion',
      texto: `Este cobro se cotizó sin IVA. Si lo facturas, el IVA (${pesos(desglose.iva)}) va encima: tu cliente tendría que pagar ${pesos(desglose.total)}.`,
    });
  }
  if (ivaModo === 'sin_iva') {
    notas.push(
      'Marcaste que no lleva IVA. Si es construcción o ampliación de casa habitación y tú pones mano de obra y material, suele ir EXENTO de IVA (en el SAT: objeto de impuesto 02 y tipo de factor "Exento"). Confírmalo con tu contador.',
    );
  }
  if (Math.abs(desglose.diferencia) > 0) {
    avisos.push({
      tipo: 'info',
      texto: `Por redondeo, el total de la factura queda ${pesos(Math.abs(desglose.diferencia))} ${desglose.diferencia > 0 ? 'arriba' : 'abajo'} de lo que cobraste.`,
    });
  }
  if (sugRet.isrPct > 0 && f?.ret_isr_pct == null) avisos.push({ tipo: 'info', texto: sugRet.motivo });

  if (receptor?.fiscales_confirmados_at) {
    avisos.push({ tipo: 'ok', texto: 'Tu cliente confirmó sus datos fiscales en el portal.' });
  } else if (receptor?.rfc) {
    avisos.push({
      tipo: 'info',
      texto: 'Tu cliente todavía no confirma sus datos en el portal. Pídele su constancia para no equivocarte.',
    });
  }
  if (conceptos.some((c) => c.claveSugerida || c.unidadSugerida) && tipo === 'factura') {
    avisos.push({
      tipo: 'atencion',
      texto: `Hay claves SAT sugeridas por la app (marcadas). ${LEYENDA_SUGERENCIA}`,
    });
  }

  const faltantes = [
    ...emisorCampos.filter((c) => c.falta).map((c) => `Tu ${c.etiqueta.toLowerCase()}`),
    ...receptorCampos.filter((c) => c.falta).map((c) => `${c.etiqueta} de tu cliente`),
  ];

  return {
    tipo,
    titulo: tipo === 'complemento' ? 'Complemento de pago' : 'Hoja para facturar',
    emisor: emisorCampos,
    receptor: receptorCampos,
    conceptos,
    pago: pagoCampos,
    desglose,
    avisos,
    notas,
    faltantes,
    parcialidad,
    facturaRelacionada: ppd?.fiscal?.uuid ?? null,
    ivaModo,
  };
}

/** Texto plano de toda la hoja (para "Copiar todo" y para pegar en WhatsApp al contador). */
export function hojaComoTexto(h: HojaFacturar): string {
  const lineas: string[] = [h.titulo.toUpperCase(), ''];
  const bloque = (t: string, campos: CampoHoja[]) => {
    lineas.push(t);
    for (const c of campos) lineas.push(`  ${c.etiqueta}: ${c.valor || '(falta)'}`);
    lineas.push('');
  };
  bloque('1. EMISOR', h.emisor);
  bloque('2. RECEPTOR', h.receptor);
  lineas.push('3. CONCEPTOS');
  for (const c of h.conceptos) {
    lineas.push(
      `  ${c.claveProdServ} · ${c.claveUnidad} · ${c.cantidad} × ${c.valorUnitario.toFixed(2)} = ${c.importe.toFixed(2)} · ${c.descripcion}`,
    );
  }
  lineas.push('');
  bloque('4. PAGO', h.pago);
  for (const n of h.notas) lineas.push(`• ${n}`);
  return lineas.join('\n').trim();
}
