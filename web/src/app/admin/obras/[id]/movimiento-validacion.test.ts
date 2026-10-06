import { describe, expect, it } from 'vitest';
import { parseMovimientoFormData } from './movimiento-validacion';
import type { FuenteFormData } from '@/lib/validacion/campos';
import { partesTz } from '@/lib/data/tz';

/// El formulario de un movimiento de caja: lo que llega a la base y lo que no.
///
/// Es el primer test de `src/app/` del repo. Hasta ahora esa carpeta tenía
/// **cero**, y en ella viven ~3 400 líneas de Server Actions que escriben
/// nómina, sueldos y dinero. RLS impide que una empresa vea a otra, pero no
/// impide guardar un monto absurdo o una fecha imposible: eso entra tal cual.
///
/// Se prueba la función PURA (`parseMovimientoFormData`), sin sesión ni base,
/// que es lo que permite que este archivo exista sin montar medio Supabase.

function form(campos: Record<string, string>): FuenteFormData {
  return { get: (c) => (c in campos ? campos[c] : null) };
}

const VALIDO = {
  tipo: 'SALIDA',
  fecha: '2026-03-15',
  categoria: 'MATERIAL',
  concepto: 'Cemento',
  monto: '1500.50',
  metodo_pago: 'Efectivo',
  referencia: 'F-100',
  nombre: 'Ferretería del Centro',
};

describe('parseMovimientoFormData — el camino feliz no cambia', () => {
  it('un formulario completo produce el mismo input de siempre', () => {
    const r = parseMovimientoFormData(form(VALIDO), 'obra-1');
    expect('error' in r).toBe(false);
    if ('error' in r) return;

    expect(r.input.obraId).toBe('obra-1');
    expect(r.input.tipo).toBe('SALIDA');
    expect(r.input.concepto).toBe('Cemento');
    expect(r.input.monto).toBe(1500.5);
    expect(r.input.categoria).toBe('MATERIAL');
    expect(r.input.metodoPago).toBe('Efectivo');
    expect(r.input.referencia).toBe('F-100');
    expect(r.input.nombre).toBe('Ferretería del Centro');

    // La fecha es la medianoche del día pedido en México, no del día siguiente.
    const p = partesTz(r.input.fecha);
    expect([p.year, p.month, p.day]).toEqual([2026, 2, 15]);
  });

  it('los campos opcionales vacíos siguen llegando como cadena vacía', () => {
    const r = parseMovimientoFormData(
      form({ tipo: 'ENTRADA', concepto: 'Anticipo', monto: '100', fecha: '2026-01-02' }),
      'obra-1',
    );
    if ('error' in r) throw new Error(r.error);
    expect(r.input.categoria).toBe('');
    expect(r.input.metodoPago).toBe('');
    expect(r.input.referencia).toBe('');
    expect(r.input.nombre).toBe('');
  });

  it('sin fecha se usa hoy, como hacía el formulario', () => {
    const antes = Date.now();
    const r = parseMovimientoFormData(
      form({ tipo: 'ENTRADA', concepto: 'Anticipo', monto: '100' }),
      'obra-1',
    );
    if ('error' in r) throw new Error(r.error);
    expect(r.input.fecha).toBeGreaterThanOrEqual(antes);
  });
});

describe('parseMovimientoFormData — lo que ANTES se guardaba y ahora se rechaza', () => {
  it('una fecha imposible ya no se normaliza en silencio', () => {
    // ÉSTE es el agujero. `fechaInputAMs` dejaba que `Date.UTC` normalizara, y
    // un '2025-13-45' se guardaba como una fecha de 2026: el gasto aparecía en
    // el mes equivocado y no había forma de explicar por qué.
    for (const imposible of ['2025-13-45', '2026-02-30', '2026-04-31']) {
      const r = parseMovimientoFormData(form({ ...VALIDO, fecha: imposible }), 'o1');
      expect('error' in r, imposible).toBe(true);
    }
  });

  it('un monto con coma decimal ya no se interpreta a la ligera', () => {
    // `Number('1,500')` da NaN y lo paraba el `isFinite`; pero '1.500' —que en
    // México se teclea queriendo decir mil quinientos— pasaba como 1.5. Eso
    // sigue pasando y no puede arreglarse adivinando; lo que sí se corta es la
    // coma, que ahora da un mensaje claro en vez de un NaN genérico.
    const r = parseMovimientoFormData(form({ ...VALIDO, monto: '1,500' }), 'o1');
    expect('error' in r && r.error).toContain('mayor a cero');
  });

  it('un tipo fuera de la lista no se cuela', () => {
    const r = parseMovimientoFormData(form({ ...VALIDO, tipo: 'TRANSFERENCIA' }), 'o1');
    expect('error' in r && r.error).toBe('El tipo de movimiento no es válido.');
  });

  it('monto cero o negativo se sigue rechazando, con el mismo mensaje', () => {
    for (const m of ['0', '-40']) {
      const r = parseMovimientoFormData(form({ ...VALIDO, monto: m }), 'o1');
      expect('error' in r && r.error, m).toBe('El monto debe ser un número mayor a cero.');
    }
  });

  it('concepto vacío o sólo espacios se rechaza', () => {
    for (const c of ['', '   ']) {
      const r = parseMovimientoFormData(form({ ...VALIDO, concepto: c }), 'o1');
      expect('error' in r, JSON.stringify(c)).toBe(true);
    }
  });

  it('"Infinity" como monto ya no llega a la base', () => {
    // `Number('Infinity')` da Infinity, que NO es finito y lo paraba el guardia
    // viejo — pero '1e999' sí pasaba `Number.isFinite`… no: desborda. El regex
    // nuevo corta las dos formas antes de convertir.
    for (const m of ['Infinity', '1e999']) {
      const r = parseMovimientoFormData(form({ ...VALIDO, monto: m }), 'o1');
      expect('error' in r, m).toBe(true);
    }
  });
});
