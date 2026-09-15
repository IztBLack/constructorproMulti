import { describe, expect, test } from 'vitest';
import { parsearNotaTexto } from './notas-obra-texto';
import { calcularTotales, montoEfectivo, type RenglonNota } from './notas-obra-calculo';
import { partesTz } from './tz';

/// Las dos notas que gobiernan este módulo son REALES, y son distintas a
/// propósito:
///
///   1. El mensaje de una línea, tal como llega por chat:
///      «Terminación de módulo 2 y 3 — 120 000(60 y 60) retención del 4%(3k) final 117»
///   2. La nota de papel que originó la funcionalidad (Orlando Ramoz, Casas
///      Bienestar MZ 2 LT 1), pegada renglón por renglón.
///
/// Si alguna de las dos deja de leerse bien, la funcionalidad no sirve: son las
/// dos formas en que de verdad entra el texto.

/** Los renglones parseados, en la forma que pide `calcularTotales`. */
function comoRenglones(rs: ReturnType<typeof parsearNotaTexto>['renglones']): RenglonNota[] {
  return rs.map((r, i) => ({
    ...r,
    id: `r${i}`,
    nota_id: 'n1',
    mostrar_porcentaje: false,
    orden: (i + 1) * 100,
  }));
}

describe('el mensaje de una línea', () => {
  const texto =
    'Terminación de módulo 2 y 3 — 120 000(60 y 60) retención del 4%(3k) final 117';
  const nota = parsearNotaTexto(texto);

  test('saca dos renglones: el trabajo y la retención', () => {
    expect(nota.renglones).toHaveLength(2);
  });

  test('el concepto conserva su nombre con los números que son del nombre', () => {
    const concepto = nota.renglones[0];
    expect(concepto.tipo).toBe('CONCEPTO');
    expect(concepto.etiqueta).toBe('Terminación de módulo 2 y 3');
    expect(concepto.monto).toBe(120_000);
  });

  test('el paréntesis que desglosa el importe queda como aclaración', () => {
    expect(nota.renglones[0].texto).toBe('60,000 + 60,000');
  });

  test('la retención es una deducción con su cuenta documentada', () => {
    const deduccion = nota.renglones[1];
    expect(deduccion.tipo).toBe('DEDUCCION');
    expect(deduccion.etiqueta).toBe('Retención');
    expect(deduccion.porcentaje).toBe(4);
    // El importe del mensaje manda sobre la fórmula: 4% de 120,000 son 4,800,
    // pero lo que se acordó fueron 3,000.
    expect(deduccion.monto).toBe(3_000);
    expect(deduccion.monto_base).toBe(120_000);
  });

  test('«117» se lee como 117,000 y se avisa', () => {
    expect(nota.advertencias.some((a) => a.includes('117,000'))).toBe(true);
  });

  test('el total sale solo, así que no se fija a mano', () => {
    // 120,000 − 3,000 = 117,000, que es justo lo que dice el mensaje: fijarlo
    // congelaría la nota sin agregar nada.
    expect(nota.total_override).toBeNull();
    const t = calcularTotales(
      { total_override: nota.total_override, saldo_override: nota.saldo_override },
      comoRenglones(nota.renglones),
    );
    expect(t.total).toBe(117_000);
  });
});

describe('la nota de papel, pegada renglón por renglón', () => {
  const nota = parsearNotaTexto(
    [
      'ORLANDO RAMOZ · CASAS BIENESTAR – MZ 2 LT 1',
      'BASE DE TINACOS 123 000',
      'PRETIL 25 000',
      'RECORTE DE PUERTAS (26) 8 400',
      'PROYECCIÓN 11/AGOST/26 62,000 - 4%(RETENCIÓN) = 60 000',
      'LIQUIDADO: BASES DE TINACOS, PRETIL Y RECORTE DE PUERTAS',
    ].join('\n'),
  );

  test('la primera línea es el encabezado, no un trabajo', () => {
    expect(nota.destinatario).toBe('ORLANDO RAMOZ');
    expect(nota.titulo).toBe('CASAS BIENESTAR – MZ 2 LT 1');
  });

  test('los tres trabajos entran como conceptos', () => {
    const conceptos = nota.renglones.filter((r) => r.tipo === 'CONCEPTO');
    expect(conceptos.map((c) => [c.etiqueta, c.monto])).toEqual([
      ['BASE DE TINACOS', 123_000],
      ['PRETIL', 25_000],
      ['RECORTE DE PUERTAS (26)', 8_400],
    ]);
  });

  test('la proyección es un pago con su bruto, su % y su fecha', () => {
    const pago = nota.renglones.find((r) => r.tipo === 'PAGO');
    // La palabra que va dentro del paréntesis aclara el 4%; no abre un renglón
    // nuevo. Cortar ahí partía el pago en dos y lo contaba doble.
    expect(pago?.etiqueta).toBe('PROYECCIÓN (RETENCIÓN)');
    expect(pago?.monto_base).toBe(62_000);
    expect(pago?.porcentaje).toBe(4);
    expect(pago?.monto).toBe(60_000);

    // La fecha sale del texto y se guarda como fecha, no como parte del nombre.
    const p = partesTz(pago!.fecha!);
    expect([p.year, p.month, p.day]).toEqual([2026, 7, 11]);
  });

  test('el apunte final no suma, y separa etiqueta de contenido', () => {
    const apunte = nota.renglones.at(-1);
    expect(apunte?.tipo).toBe('TEXTO');
    expect(apunte?.etiqueta).toBe('LIQUIDADO');
    expect(apunte?.texto).toBe('BASES DE TINACOS, PRETIL Y RECORTE DE PUERTAS');
  });

  test('los totales coinciden con los de la nota de papel', () => {
    const t = calcularTotales(
      { total_override: nota.total_override, saldo_override: nota.saldo_override },
      comoRenglones(nota.renglones),
    );
    expect(t.subtotal).toBe(156_400);
    expect(t.total).toBe(156_400);
    expect(t.pagado).toBe(60_000);
    expect(t.saldo).toBe(96_400);
  });
});

describe('importes', () => {
  test('lee los separadores de miles con espacio y con coma', () => {
    const nota = parsearNotaTexto('Cimentación 1 250 000\nAcabados 78,500');
    expect(nota.renglones.map((r) => r.monto)).toEqual([1_250_000, 78_500]);
  });

  test('lee el sufijo k y el signo de pesos', () => {
    const nota = parsearNotaTexto('Castillos 45k\nAplanado $12,300');
    expect(nota.renglones.map((r) => r.monto)).toEqual([45_000, 12_300]);
  });

  test('no confunde una unidad con el sufijo de miles', () => {
    const nota = parsearNotaTexto('Varilla 85 kg 4,200');
    expect(nota.renglones[0].monto).toBe(4_200);
  });

  test('un importe chico de verdad NO se multiplica por mil', () => {
    // 500,000 no cabe en una nota cuyo mayor importe son 156,400: se queda en
    // 500, que es lo que dice el mensaje.
    const nota = parsearNotaTexto('Trabajos 156 400\nLimpieza 500');
    expect(nota.renglones[1].monto).toBe(500);
    expect(nota.advertencias).toEqual([]);
  });
});

describe('cómo se parte el mensaje', () => {
  test('la coma separa ideas solo cuando lo que sigue es otra idea', () => {
    const nota = parsearNotaTexto('Quedamos en 85 mil por la losa, le di 20k de anticipo, falta 65');
    expect(nota.renglones.map((r) => [r.tipo, r.monto])).toEqual([
      ['CONCEPTO', 85_000],
      ['PAGO', 20_000],
    ]);
    // «falta 65» es el saldo, y la cuenta llega sola a ese número.
    expect(nota.saldo_override).toBeNull();
  });

  test('la coma de una enumeración NO parte el apunte', () => {
    const nota = parsearNotaTexto('Losa 50 000\nliquidado: bases, pretil y recorte');
    expect(nota.renglones).toHaveLength(2);
    expect(nota.renglones[1].texto).toBe('bases, pretil y recorte');
  });

  test('la palabra suelta se junta con el renglón que nombra', () => {
    // Dos palabras del vocabulario en la misma frase cortarían dos veces y
    // dejarían «descuento por» sin importe.
    const nota = parsearNotaTexto('Aplanado 31 800 descuento por herramienta 1 200');
    expect(nota.renglones.map((r) => [r.tipo, r.etiqueta, r.monto])).toEqual([
      ['CONCEPTO', 'Aplanado', 31_800],
      ['DEDUCCION', 'Descuento por herramienta', 1_200],
    ]);
  });

  test('la palabra que va después del importe le presta su papel al renglón', () => {
    const nota = parsearNotaTexto('Losa 90 000\nle di 20k de anticipo');
    expect(nota.renglones[1].tipo).toBe('PAGO');
    expect(nota.renglones[1].monto).toBe(20_000);
  });
});

describe('lo que declara el mensaje', () => {
  test('un total que NO cuadra se fija a mano y se avisa', () => {
    const nota = parsearNotaTexto('Losa 100 000 descuento 5 000 total 90 000');
    expect(nota.total_override).toBe(90_000);
    expect(nota.advertencias.some((a) => a.includes('se fija el total'))).toBe(true);
  });

  test('un saldo declarado se guarda como saldo, no como renglón', () => {
    const nota = parsearNotaTexto('Losa 100 000 anticipo 30 000 saldo 65 000');
    expect(nota.saldo_override).toBe(65_000);
    expect(nota.renglones.map((r) => r.tipo)).toEqual(['CONCEPTO', 'PAGO']);
  });

  test('una retención sin bruto se mide contra lo acordado hasta ahí', () => {
    const nota = parsearNotaTexto('Muros 200 000 retención 4%');
    const deduccion = nota.renglones[1];
    expect(deduccion.monto).toBeNull();
    expect(deduccion.monto_base).toBe(200_000);
    expect(deduccion.porcentaje).toBe(4);

    const t = calcularTotales(
      { total_override: null, saldo_override: null },
      comoRenglones(nota.renglones),
    );
    expect(t.total).toBe(192_000);
  });
});

describe('el porcentaje', () => {
  test('«4% DE 120 000» mide: el número es el bruto', () => {
    const nota = parsearNotaTexto('Losa 200 000 retención del 4% de 120 000');
    expect(nota.renglones[1].monto_base).toBe(120_000);
    expect(nota.renglones[1].monto).toBeNull();
  });

  test('«30% 220,500» describe: el número es el importe', () => {
    // El 30% solo dice de dónde salió el anticipo. Tomarlo como bruto cobraría
    // el 30% de 220,500 y dejaría el pago en 154,350.
    const nota = parsearNotaTexto('Obra negra 735 000\nANTICIPO 30% 220,500');
    const pago = nota.renglones[1];
    expect(pago.tipo).toBe('PAGO');
    expect(montoEfectivo(pago)).toBe(220_500);
  });

  test('«RETENCIÓN 4% = 71,520» dice en cuánto queda la nota', () => {
    const nota = parsearNotaTexto(
      ['ZAPATAS 32,000', 'CADENAS 18,500', 'FIRME 24,000', 'MENOS RETENCION 4% = 71,520'].join('\n'),
    );
    const deduccion = nota.renglones.at(-1)!;
    // 4% de los 74,500 acordados, no de los 71,520 que es el resultado.
    expect(deduccion.monto_base).toBe(74_500);
    expect(montoEfectivo(deduccion)).toBe(2_980);

    const t = calcularTotales(
      { total_override: nota.total_override, saldo_override: nota.saldo_override },
      comoRenglones(nota.renglones),
    );
    expect(t.total).toBe(71_520);
    expect(t.totalFijado).toBe(false);
  });
});

describe('los números que el mensaje ya sumó', () => {
  test('«subtotal» y «neto» no se cuentan como un trabajo más', () => {
    const nota = parsearNotaTexto(
      ['raya 24,800', 'prestamo a Mudo 1,500', 'neto 23,300'].join('\n'),
    );
    expect(nota.renglones.map((r) => r.tipo)).toEqual(['CONCEPTO', 'DEDUCCION']);

    const t = calcularTotales(
      { total_override: nota.total_override, saldo_override: nota.saldo_override },
      comoRenglones(nota.renglones),
    );
    expect(t.total).toBe(23_300);
  });

  test('un total seguido de otro descuento era un subtotal', () => {
    // El 74,500 de en medio es la suma de los trabajos; la nota no termina ahí.
    const nota = parsearNotaTexto(
      ['ZAPATAS 32,000', 'FIRME 24,000', 'TOTAL 56,000', 'descuento 6,000'].join('\n'),
    );
    expect(nota.total_override).toBeNull();

    const t = calcularTotales({ total_override: null, saldo_override: null }, comoRenglones(nota.renglones));
    expect(t.total).toBe(50_000);
  });

  test('un total seguido de un pago sí es el total', () => {
    // Un pago no cambia el total, solo el saldo.
    const nota = parsearNotaTexto('Pintura 8,500 cada una\n17,000 en total\npagado 8,500');
    expect(nota.total_override).toBe(17_000);
  });
});

describe('el encabezado', () => {
  test('se lleva todas las líneas de arriba que no traen importes', () => {
    const nota = parsearNotaTexto(
      ['Cuadrilla de Beto', 'semana del 1 al 7', 'raya 24,800'].join('\n'),
    );
    expect(nota.destinatario).toBe('Cuadrilla de Beto');
    expect(nota.titulo).toBe('semana del 1 al 7');
    // El «1 al 7» de la semana no es dinero y no puede acabar de renglón.
    expect(nota.renglones).toHaveLength(1);
  });

  test('un mensaje de una sola línea es el trato, no su título', () => {
    const nota = parsearNotaTexto('Aplanado de fachada 31 800');
    expect(nota.destinatario).toBe('');
    expect(nota.renglones).toHaveLength(1);
  });
});

describe('el texto que no se entiende', () => {
  test('una frase con una palabra del vocabulario NO se pierde', () => {
    // «pendiente» es de saldo, pero aquí no hay ningún importe que fijar: si el
    // pedazo se descartara, el mensaje entero desaparecería sin decir nada.
    const nota = parsearNotaTexto('Quedó pendiente el azulejo del baño, lo vemos la otra semana');
    expect(nota.renglones).toHaveLength(1);
    expect(nota.renglones[0].tipo).toBe('TEXTO');
    expect(nota.renglones[0].etiqueta).toContain('azulejo');
  });

  test('un mensaje vacío no revienta ni inventa renglones', () => {
    const nota = parsearNotaTexto('   \n  \n');
    expect(nota.renglones).toEqual([]);
    expect(nota.advertencias).toHaveLength(1);
  });

  test('una frase sin importes se conserva como apunte', () => {
    const nota = parsearNotaTexto('Losa 50 000\nQuedamos de vernos el lunes');
    expect(nota.renglones[1].tipo).toBe('TEXTO');
    expect(nota.renglones[1].etiqueta).toBe('Quedamos de vernos el lunes');
  });
});
