import { describe, expect, it } from 'vitest';
import {
  leerBooleano,
  leerDeLista,
  leerEntero,
  leerFecha,
  leerFechaOpcional,
  leerNumero,
  leerNumeroOpcional,
  leerTexto,
  leerTextoOpcional,
  type FuenteFormData,
} from './campos';

/// Los bordes de la validación de formularios.
///
/// POR QUÉ EXISTE ESTE ARCHIVO. Las Server Actions leían `formData.get(...)` en
/// crudo —103 veces en el repo— y pasaban el texto por `Number(...)` sin más.
/// RLS protege el AISLAMIENTO entre empresas, pero no impide guardar un salario
/// `NaN`, un monto negativo o un 30 de febrero: eso llega a la base tal cual y
/// reaparece semanas después como una nómina que no cuadra.
///
/// Lo que se fija aquí son los casos que un usuario real produce sin querer
/// (campo vacío, espacios, coma decimal) y los que produce un formulario
/// manipulado (valores fuera de la lista, exponentes que desbordan).

/// `FormData` de mentira. Basta un objeto con `get`: por eso `FuenteFormData` es
/// una interfaz y no `FormData` a secas — permite probar sin DOM ni petición.
function form(campos: Record<string, string>): FuenteFormData {
  return { get: (c) => (c in campos ? campos[c] : null) };
}

describe('leerTexto', () => {
  it('recorta los espacios de alrededor', () => {
    expect(leerTexto(form({ nombre: '  Orlando  ' }), 'nombre')).toEqual({
      ok: true,
      valor: 'Orlando',
    });
  });

  it('sólo espacios es vacío, y vacío es error', () => {
    const r = leerTexto(form({ nombre: '   ' }), 'nombre', { etiqueta: 'El nombre' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe('El nombre es obligatorio.');
  });

  it('el campo ausente se trata igual que el vacío', () => {
    expect(leerTexto(form({}), 'nombre').ok).toBe(false);
  });

  it('opcional devuelve cadena vacía en vez de error', () => {
    expect(leerTextoOpcional(form({}), 'notas')).toEqual({ ok: true, valor: '' });
  });

  it('`max` rechaza; `recortarA` tija en silencio', () => {
    expect(leerTexto(form({ t: 'abcdef' }), 't', { max: 3 }).ok).toBe(false);
    expect(leerTexto(form({ t: 'abcdef' }), 't', { recortarA: 3 })).toEqual({
      ok: true,
      valor: 'abc',
    });
  });
});

describe('leerNumero', () => {
  it('acepta enteros y decimales, con signo', () => {
    expect(leerNumero(form({ m: '1500' }), 'm')).toEqual({ ok: true, valor: 1500 });
    expect(leerNumero(form({ m: '1500.75' }), 'm')).toEqual({ ok: true, valor: 1500.75 });
    expect(leerNumero(form({ m: '-40' }), 'm')).toEqual({ ok: true, valor: -40 });
  });

  it('"abc" no es un número', () => {
    expect(leerNumero(form({ m: 'abc' }), 'm').ok).toBe(false);
  });

  it('RECHAZA lo que `Number()` habría aceptado en silencio', () => {
    // Éstos son el motivo del regex propio. `Number('Infinity')` da Infinity,
    // `Number('0x1f')` da 31 y `Number(' ')` da 0: ninguno es algo que alguien
    // haya TECLEADO queriendo decir un monto, y los tres acababan en la base.
    for (const basura of ['Infinity', '-Infinity', 'NaN', '0x1f', '1_000']) {
      expect(leerNumero(form({ m: basura }), 'm').ok, basura).toBe(false);
    }
  });

  it('rechaza la coma decimal en vez de adivinar qué significa', () => {
    // '1,500' son mil quinientos en un país y uno con cinco en otro. Guardar la
    // interpretación equivocada de un sueldo es peor que pedir que se reescriba.
    expect(leerNumero(form({ m: '1,500' }), 'm').ok).toBe(false);
  });

  it('un exponente que desborda a Infinity también se rechaza', () => {
    // '1e999' SÍ pasa el regex —es notación válida— pero al convertirse
    // desborda. Por eso hay una segunda comprobación con `Number.isFinite`.
    expect(leerNumero(form({ m: '1e999' }), 'm').ok).toBe(false);
  });

  it('aplica mínimo y máximo', () => {
    expect(leerNumero(form({ m: '-1' }), 'm', { min: 0 }).ok).toBe(false);
    expect(leerNumero(form({ m: '0' }), 'm', { min: 0 }).ok).toBe(true);
    expect(leerNumero(form({ m: '0' }), 'm', { min: 0, minEstricto: true }).ok).toBe(false);
    expect(leerNumero(form({ m: '11' }), 'm', { max: 10 }).ok).toBe(false);
  });

  it('opcional: vacío es null, NO cero', () => {
    // La diferencia importa: en este dominio `null` significa "usa el cálculo"
    // o "sin sueldo propio". Confundirlo con cero deja notas cuadradas en cero
    // y rayas sin dinero.
    expect(leerNumeroOpcional(form({ m: '' }), 'm')).toEqual({ ok: true, valor: null });
    expect(leerNumeroOpcional(form({}), 'm')).toEqual({ ok: true, valor: null });
  });
});

describe('leerEntero', () => {
  it('un decimal donde se esperaba entero es error', () => {
    expect(leerEntero(form({ d: '5.5' }), 'd').ok).toBe(false);
    expect(leerEntero(form({ d: '5' }), 'd')).toEqual({ ok: true, valor: 5 });
  });
});

describe('leerFecha', () => {
  it('convierte YYYY-MM-DD a la medianoche de México', () => {
    const r = leerFecha(form({ f: '2026-03-15' }), 'f');
    expect(r.ok).toBe(true);
    expect(r.ok === true && Number.isFinite(r.valor)).toBe(true);
  });

  it('EL CASO QUE SE GUARDABA MAL: un día que no existe', () => {
    // `fechaInputAMs` dejaba que `Date.UTC` normalizara, así que un '2025-13-45'
    // se guardaba sin una queja como una fecha de 2026. Aquí se comprueba que el
    // día pedido sea el que sale del otro lado.
    for (const imposible of ['2025-13-45', '2026-02-30', '2026-00-10', '2026-04-31']) {
      expect(leerFecha(form({ f: imposible }), 'f').ok, imposible).toBe(false);
    }
  });

  it('rechaza formatos que no son ISO', () => {
    for (const mal of ['15/03/2026', '2026-3-5', 'ayer', '20260315']) {
      expect(leerFecha(form({ f: mal }), 'f').ok, mal).toBe(false);
    }
  });

  it('vacía es error salvo que haya valor por defecto', () => {
    expect(leerFecha(form({ f: '' }), 'f').ok).toBe(false);
    expect(leerFecha(form({ f: '' }), 'f', { porDefecto: () => 42 })).toEqual({
      ok: true,
      valor: 42,
    });
  });

  it('opcional: vacía es null, pero una fecha imposible sigue siendo error', () => {
    expect(leerFechaOpcional(form({}), 'f')).toEqual({ ok: true, valor: null });
    expect(leerFechaOpcional(form({ f: '2026-02-30' }), 'f').ok).toBe(false);
  });
});

describe('leerBooleano', () => {
  it('un checkbox sin marcar no se envía: ausente es false', () => {
    expect(leerBooleano(form({}), 'activo')).toEqual({ ok: true, valor: false });
  });

  it('acepta las formas que manda un navegador y un formulario a mano', () => {
    for (const si of ['on', 'true', '1', 'sí', 'SI']) {
      expect(leerBooleano(form({ a: si }), 'a'), si).toEqual({ ok: true, valor: true });
    }
    for (const no of ['off', 'false', '0', 'no']) {
      expect(leerBooleano(form({ a: no }), 'a'), no).toEqual({ ok: true, valor: false });
    }
  });

  it('cualquier otra cosa es error, no un false silencioso', () => {
    expect(leerBooleano(form({ a: 'quizá' }), 'a').ok).toBe(false);
  });
});

describe('leerDeLista', () => {
  const TIPOS = ['ENTRADA', 'SALIDA'] as const;

  it('acepta un valor de la lista', () => {
    expect(leerDeLista(form({ t: 'SALIDA' }), 't', TIPOS)).toEqual({
      ok: true,
      valor: 'SALIDA',
    });
  });

  it('un valor DESCONOCIDO es error aunque haya valor por defecto', () => {
    // Sustituirlo en silencio guarda un dato que nadie eligió y que después
    // nadie sabe explicar: es así como acababa un 'MIXTA' en una cuadrilla.
    const r = leerDeLista(form({ t: 'TRANSFERENCIA' }), 't', TIPOS, {
      porDefecto: 'ENTRADA',
    });
    expect(r.ok).toBe(false);
  });

  it('el valor por defecto sólo aplica cuando el campo viene vacío', () => {
    expect(leerDeLista(form({}), 't', TIPOS, { porDefecto: 'ENTRADA' })).toEqual({
      ok: true,
      valor: 'ENTRADA',
    });
    expect(leerDeLista(form({}), 't', TIPOS).ok).toBe(false);
  });
});

describe('mensajes', () => {
  it('`mensaje` sustituye a cualquier error del campo', () => {
    // Sirve para conservar palabra por palabra los avisos que la interfaz ya
    // enseñaba, sin que aplicar la validación cambie lo que lee el usuario.
    const r = leerNumero(form({ m: 'x' }), 'm', { mensaje: 'Captura un monto válido.' });
    expect(r.ok === false && r.error).toBe('Captura un monto válido.');
  });

  it('sin etiqueta se usa el nombre técnico del campo', () => {
    const r = leerTexto(form({}), 'concepto');
    expect(r.ok === false && r.error).toContain('concepto');
  });
});
