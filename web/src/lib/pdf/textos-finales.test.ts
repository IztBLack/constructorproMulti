import { describe, expect, test } from 'vitest';
import {
  leerTextosEmpresa,
  origenTextoFinal,
  recortar,
  resolverTextoFinal,
  textoIntegrado,
  LARGO_MAXIMO,
} from './textos-finales';

const ctx = { nombreEmpresa: 'ConstructorPro', ivaEnabled: true, ivaPct: 16 };

describe('textoIntegrado', () => {
  test('la cotización conserva palabra por palabra el texto que ya se imprimía', () => {
    expect(textoIntegrado('cotizacion', ctx)).toBe(
      'Esta cotización tiene una vigencia de 30 días naturales a partir de la fecha de emisión. ' +
        'Los precios están expresados en pesos mexicanos (MXN). Los precios incluyen IVA (16%). ' +
        'Para consultas o aclaraciones comuníquese con ConstructorPro.',
    );
  });

  test('sin IVA cambia la leyenda, no el resto', () => {
    const con = textoIntegrado('cotizacion', ctx);
    const sin = textoIntegrado('cotizacion', { ...ctx, ivaEnabled: false });
    expect(sin).toContain('Los precios no incluyen IVA.');
    expect(sin).not.toContain('incluyen IVA (16%)');
    expect(sin.replace('Los precios no incluyen IVA.', '')).toBe(
      con.replace('Los precios incluyen IVA (16%).', ''),
    );
  });

  test('respeta la tasa de la cotización, no un 16 fijo', () => {
    expect(textoIntegrado('cotizacion', { ...ctx, ivaPct: 8 })).toContain('IVA (8%)');
  });

  test('la nota nombra a las dos partes del trato', () => {
    expect(textoIntegrado('nota', { nombreEmpresa: 'ConstructorPro', destinatario: 'ORLANDO RAMOZ' }))
      .toContain('entre ConstructorPro y ORLANDO RAMOZ.');
  });

  test('una nota sin destinatario no imprime un hueco vacío', () => {
    expect(textoIntegrado('nota', { nombreEmpresa: 'ConstructorPro', destinatario: '   ' }))
      .toContain('entre ConstructorPro y la parte indicada.');
  });

  test('sin nombre de empresa cae a la marca, no a una cadena vacía', () => {
    expect(textoIntegrado('estado_cuenta', { nombreEmpresa: '' })).toContain('con ConstructorPro.');
  });
});

describe('resolverTextoFinal — quién gana', () => {
  test('sin nada escrito, el integrado', () => {
    expect(resolverTextoFinal({ tipo: 'cotizacion', ctx })).toBe(textoIntegrado('cotizacion', ctx));
  });

  test('el de la empresa le gana al integrado', () => {
    expect(
      resolverTextoFinal({ tipo: 'cotizacion', empresa: { cotizacion: 'Vigencia de 15 días.' }, ctx }),
    ).toBe('Vigencia de 15 días.');
  });

  test('el del documento le gana a todos', () => {
    expect(
      resolverTextoFinal({
        tipo: 'cotizacion',
        documento: 'Precios firmes hasta el 30 de septiembre.',
        empresa: { cotizacion: 'Vigencia de 15 días.' },
        ctx,
      }),
    ).toBe('Precios firmes hasta el 30 de septiembre.');
  });

  test('el texto general de OTRO tipo no se cuela', () => {
    expect(resolverTextoFinal({ tipo: 'nota', empresa: { cotizacion: 'Vigencia de 15 días.' }, ctx }))
      .toBe(textoIntegrado('nota', ctx));
  });

  test('un texto en blanco no cuenta como texto: cae al siguiente nivel', () => {
    expect(
      resolverTextoFinal({ tipo: 'cotizacion', documento: '   \n  ', empresa: { cotizacion: 'De empresa.' }, ctx }),
    ).toBe('De empresa.');
  });

  test('nunca devuelve cadena vacía, aunque todo venga vacío', () => {
    const r = resolverTextoFinal({ tipo: 'cotizacion', documento: '', empresa: {}, ctx });
    expect(r.length).toBeGreaterThan(0);
  });

  test('recorta los espacios de los extremos', () => {
    expect(resolverTextoFinal({ tipo: 'nota', documento: '  Pagos al corte.  ', ctx })).toBe('Pagos al corte.');
  });
});

describe('origenTextoFinal', () => {
  test('distingue los tres orígenes', () => {
    expect(origenTextoFinal({ tipo: 'cotizacion' })).toBe('integrado');
    expect(origenTextoFinal({ tipo: 'cotizacion', empresa: { cotizacion: 'x' } })).toBe('empresa');
    expect(origenTextoFinal({ tipo: 'cotizacion', documento: 'x', empresa: { cotizacion: 'y' } })).toBe(
      'documento',
    );
  });

  test('un documento en blanco no se marca como personalizado', () => {
    expect(origenTextoFinal({ tipo: 'cotizacion', documento: '  ' })).toBe('integrado');
  });
});

describe('leerTextosEmpresa', () => {
  test('deja pasar solo los tipos conocidos', () => {
    expect(leerTextosEmpresa({ cotizacion: 'A', nota: 'B', inventado: 'C' })).toEqual({
      cotizacion: 'A',
      nota: 'B',
    });
  });

  test('descarta valores que no son texto útil', () => {
    expect(leerTextosEmpresa({ cotizacion: 42, nota: '', estado_cuenta: '  ' })).toEqual({});
  });

  test('aguanta null y basura sin lanzar', () => {
    expect(leerTextosEmpresa(null)).toEqual({});
    expect(leerTextosEmpresa('texto suelto')).toEqual({});
  });
});

describe('recortar', () => {
  test('corta un pegado gigante en el tope', () => {
    expect(recortar('x'.repeat(LARGO_MAXIMO + 500))).toHaveLength(LARGO_MAXIMO);
  });

  test('no toca un texto normal más que para limpiar los extremos', () => {
    expect(recortar('  Vigencia de 15 días.  ')).toBe('Vigencia de 15 días.');
  });
});
