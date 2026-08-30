/// Redondeo de PRESENTACIÓN de la proyección.
///
/// Gemelo de `lib/domain/logic/redondeo.dart` y `redondeo_proyeccion.dart` del
/// móvil. Su prueba (`redondeo.test.ts`) espeja los casos y los números de
/// `test/logic/redondeo_test.dart`.
///
/// La regla que gobierna el archivo: **no se recalcula la nómina**. Esto
/// envuelve un `ProyeccionResultado` ya calculado y decide qué número se enseña
/// en cada lugar. El exacto sigue estando ahí, siempre.
///
/// Dos decisiones que no son obvias:
///
///   · **Redondear el salario por día arrastra.** Si se redondea la tarifa, la
///     raya se recalcula con la tarifa redondeada. Si no, el renglón diría
///     «6 días × $600 = $3,599.28» y parecería roto.
///   · **Redondear la raya cambia el total.** Cuando la raya de cada quien se
///     redondea, el total que se enseña es la SUMA DE LAS RAYAS REDONDEADAS, no
///     el total exacto: es lo que de verdad va a salir de la caja al llenar los
///     sobres. Un papel de raya que no cuadra no sirve.

import type {
  CampoRedondeo,
  ModoRedondeo,
  ProyeccionRenglon,
  ProyeccionResultado,
  RedondeoConfig,
} from './proyeccion-nomina';
import { REDONDEO_APAGADO } from './proyeccion-nomina';

export const CAMPOS_REDONDEO: readonly CampoRedondeo[] = [
  'SALARIO_DIA',
  'RAYA',
  'SUBTOTALES',
  'TOTAL',
];

export const ETIQUETA_CAMPO: Record<CampoRedondeo, string> = {
  SALARIO_DIA: 'Salario por día',
  RAYA: 'La raya de cada persona',
  SUBTOTALES: 'Subtotales por cuadrilla y por día',
  TOTAL: 'Total de la semana',
};

export const AYUDA_CAMPO: Record<CampoRedondeo, string> = {
  SALARIO_DIA:
    'Cuidado: es una tarifa que multiplica, así que mueve todos los demás números.',
  RAYA: 'Lo que de verdad se entrega en el sobre. Es el que casi siempre se quiere.',
  SUBTOTALES: 'Solo de presentación; no mueve el total.',
  TOTAL: 'Solo la cifra de portada.',
};

export const ETIQUETA_MODO: Record<ModoRedondeo, string> = {
  CERCANO: 'Al más cercano',
  ARRIBA: 'Siempre hacia arriba',
  ABAJO: 'Siempre hacia abajo',
};

/// Redondea `valor` al múltiplo de `paso` según `modo`, conservando el signo.
///
/// Con `paso` ≤ 0 devuelve el valor sin tocar: un paso de cero no tiene
/// múltiplos y devolver 0 borraría la raya de alguien.
///
/// La aritmética va en CENTAVOS ENTEROS, no en pesos con decimales. No es
/// manía: los repartos de un ajuste entre cuadrilla dejan valores como
/// 2916.666666, y sumar y comparar eso en coma flotante mete errores que se ven
/// en el papel. Espeja `redondearMonto` del móvil, centavo por centavo.
export function redondearMonto(
  valor: number,
  paso: number,
  modo: ModoRedondeo,
): number {
  if (!Number.isFinite(paso) || paso <= 0 || !Number.isFinite(valor)) return valor;
  const pasoCent = Math.round(paso * 100);
  if (pasoCent <= 0) return valor;

  const negativo = valor < 0;
  const cent = Math.round(Math.abs(valor) * 100);
  const resto = cent % pasoCent;
  // Ya cae en el paso: se devuelve normalizado a centavos, que de paso limpia
  // la basura de coma flotante que arrastran las divisiones del reparto.
  if (resto === 0) return (negativo ? -cent : cent) / 100;

  const abajo = cent - resto;
  const arriba = abajo + pasoCent;
  const destino =
    modo === 'ARRIBA'
      ? arriba
      : modo === 'ABAJO'
        ? abajo
        : // El empate SUBE: es lo que la gente espera de «al más cercano».
          resto * 2 >= pasoCent
          ? arriba
          : abajo;
  return (negativo ? -destino : destino) / 100;
}

export function aplicaA(config: RedondeoConfig, campo: CampoRedondeo): boolean {
  return config.activo && config.campos.includes(campo);
}

/// Redondea `valor` si `campo` está seleccionado; si no, lo devuelve igual.
export function aplicar(
  config: RedondeoConfig,
  valor: number,
  campo: CampoRedondeo,
): number {
  return aplicaA(config, campo)
    ? redondearMonto(valor, config.paso, config.modo)
    : valor;
}

/// Prende o apaga un ámbito. Quitar el último APAGA el interruptor maestro:
/// «redondeo activo, cero cifras redondeadas» se ve como un bug en la pantalla y
/// el usuario no tendría cómo saber que no está roto.
export function alternarCampo(
  config: RedondeoConfig,
  campo: CampoRedondeo,
): RedondeoConfig {
  const campos = config.campos.includes(campo)
    ? config.campos.filter((c) => c !== campo)
    : [...config.campos, campo];
  return {
    ...config,
    campos,
    activo: campos.length === 0 ? false : config.activo,
  };
}

/// Frase corta para el chip de la barra: «Redondeo $100 ↑».
export function resumenCorto(config: RedondeoConfig): string {
  if (!config.activo) return 'Sin redondeo';
  const flecha = config.modo === 'ARRIBA' ? ' ↑' : config.modo === 'ABAJO' ? ' ↓' : '';
  return `Redondeo $${Math.round(config.paso)}${flecha}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// La proyección vista a través del redondeo
// ═══════════════════════════════════════════════════════════════════════════

/// Una cifra con sus dos caras: la exacta que salió del cálculo y la que se va a
/// enseñar. Viajan juntas a propósito: la pantalla necesita las dos para poner
/// la redondeada en grande y la original chiquita debajo, y tenerlas separadas
/// evita el error clásico de guardar la redondeada y perder la buena.
export interface MontoMostrado {
  exacto: number;
  mostrado: number;
}

/// ¿Hay diferencia que valga la pena enseñar? Medio centavo es el umbral: por
/// debajo, las dos cifras se imprimirían idénticas y el renglón chiquito sería
/// ruido.
export function fueRedondeado(m: MontoMostrado): boolean {
  return Math.abs(m.exacto - m.mostrado) >= 0.005;
}

export function diferencia(m: MontoMostrado): number {
  return m.mostrado - m.exacto;
}

export interface VistaRedondeada {
  activo: boolean;
  salarioDia: (r: ProyeccionRenglon) => MontoMostrado;
  raya: (r: ProyeccionRenglon) => MontoMostrado;
  subtotalDe: (renglones: ProyeccionRenglon[]) => MontoMostrado;
  costoDia: (indice: number) => MontoMostrado;
  total: MontoMostrado;
  /// ¿El total que se enseña es exactamente la suma de los renglones que se
  /// enseñan? Deja de serlo cuando se redondea el total POR ENCIMA de rayas ya
  /// redondeadas, y entonces la pantalla tiene que decirlo.
  totalCuadra: boolean;
  /// Frase para el pie del papel y el aviso de la pantalla. Vacía si no hay
  /// redondeo, para que quien llama no tenga que preguntar dos veces.
  leyenda: string;
}

export function vistaRedondeada(
  resultado: ProyeccionResultado,
  config: RedondeoConfig = REDONDEO_APAGADO,
): VistaRedondeada {
  const salarioDia = (r: ProyeccionRenglon): MontoMostrado => ({
    exacto: r.salarioDia,
    mostrado: aplicar(config, r.salarioDia, 'SALARIO_DIA'),
  });

  /// Lo que vale el renglón usando el salario que se está ENSEÑANDO. Sin
  /// redondeo de tarifa es idéntico a `r.total`.
  const rayaConSalarioMostrado = (r: ProyeccionRenglon): number => {
    if (!aplicaA(config, 'SALARIO_DIA') || r.esDestajista) return r.total;
    return r.diasTotales * salarioDia(r).mostrado + r.destajo + r.ajustes;
  };

  const raya = (r: ProyeccionRenglon): MontoMostrado => ({
    exacto: r.total,
    mostrado: aplicar(config, rayaConSalarioMostrado(r), 'RAYA'),
  });

  const subtotalDe = (renglones: ProyeccionRenglon[]): MontoMostrado => {
    let exacto = 0;
    let mostrado = 0;
    for (const r of renglones) {
      exacto += r.total;
      // Se suman los MOSTRADOS para que el subtotal cuadre con los renglones
      // que tiene encima.
      mostrado += raya(r).mostrado;
    }
    return { exacto, mostrado: aplicar(config, mostrado, 'SUBTOTALES') };
  };

  /// Lo que cuesta el día `indice`. Se recalcula en vez de leer
  /// `resultado.totalPorDia` porque con la tarifa redondeada el costo del martes
  /// también cambia; espeja el cálculo del calculador, celda por celda,
  /// saltando los días prestados.
  const costoDia = (indice: number): MontoMostrado => {
    const exacto =
      indice >= 0 && indice < resultado.totalPorDia.length
        ? resultado.totalPorDia[indice]
        : 0;
    if (!aplicaA(config, 'SALARIO_DIA') && !aplicaA(config, 'SUBTOTALES')) {
      return { exacto, mostrado: exacto };
    }
    let mostrado = 0;
    for (const r of resultado.renglones) {
      if (r.esDestajista) continue;
      for (const celda of r.celdas) {
        if (celda.indice !== indice || celda.fraccion <= 0 || celda.prestado) continue;
        mostrado += celda.fraccion * salarioDia(r).mostrado;
      }
    }
    return { exacto, mostrado: aplicar(config, mostrado, 'SUBTOTALES') };
  };

  /// Suma de las rayas tal como se enseñan, más los renglones de cuadrilla que
  /// no se repartieron entre nadie.
  let sumaDeLoMostrado = 0;
  for (const r of resultado.renglones) sumaDeLoMostrado += raya(r).mostrado;
  for (const l of resultado.lineasCuadrilla) sumaDeLoMostrado += l.montoConSigno;

  const base =
    aplicaA(config, 'RAYA') || aplicaA(config, 'SALARIO_DIA')
      ? sumaDeLoMostrado
      : resultado.total;
  const total: MontoMostrado = {
    exacto: resultado.total,
    mostrado: aplicar(config, base, 'TOTAL'),
  };

  const leyenda = !config.activo
    ? ''
    : `Cifras redondeadas a múltiplos de $${Math.round(config.paso)}, ${
        config.modo === 'ARRIBA'
          ? 'siempre hacia arriba'
          : config.modo === 'ABAJO'
            ? 'siempre hacia abajo'
            : 'al más cercano'
      }: ${CAMPOS_REDONDEO.filter((c) => config.campos.includes(c))
        .map((c) => ETIQUETA_CAMPO[c].toLowerCase())
        .join(', ')}.`;

  return {
    activo: config.activo,
    salarioDia,
    raya,
    subtotalDe,
    costoDia,
    total,
    totalCuadra:
      !config.activo || Math.abs(total.mostrado - sumaDeLoMostrado) < 0.005,
    leyenda,
  };
}
