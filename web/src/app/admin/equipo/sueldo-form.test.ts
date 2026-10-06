import { describe, expect, it } from 'vitest';
import { derivarSueldo } from './sueldo-form';
import type { FuenteFormData } from '@/lib/validacion/campos';

/// El sueldo capturado en el formulario de un colaborador.
///
/// Es el dato más delicado de la web: de él se deriva el salario diario que
/// consume la nómina, así que un error aquí no se ve el día que se comete —se
/// ve el viernes, en la raya de una persona.
///
/// LO QUE ESTA PRUEBA VIGILA. La versión anterior de `derivarSueldo` no
/// rechazaba nada: ante cualquier valor raro caía a un valor por omisión. Lo
/// más grave era el monto — un texto que no fuera un número limpio se
/// convertía en `null`, que es exactamente la forma de BORRAR un sueldo. Es
/// decir, teclear "1,500" no daba error: le quitaba el sueldo a alguien.

function form(campos: Record<string, string>): FuenteFormData {
  return { get: (c) => (c in campos ? campos[c] : null) };
}

describe('derivarSueldo — el camino feliz no cambia', () => {
  it('mensual, 6 días: el diario sale de dividir entre 26', () => {
    // 52 semanas / 12 meses × 6 días = 26 días por mes.
    const r = derivarSueldo(
      form({ periodo_pago: 'MENSUAL', dias_semana: '6', salario_periodo: '26000' }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.periodoPago).toBe('MENSUAL');
    expect(r.valor.diasSemana).toBe(6);
    expect(r.valor.salarioPeriodo).toBe(26000);
    expect(r.valor.salarioDiario).toBe(1000);
  });

  it('semanal, 5 días: el diario es el semanal entre 5', () => {
    const r = derivarSueldo(
      form({ periodo_pago: 'SEMANAL', dias_semana: '5', salario_periodo: '3500' }),
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.salarioDiario).toBe(700);
  });

  it('sin campos, los valores por omisión de siempre: MENSUAL y 6 días', () => {
    const r = derivarSueldo(form({}));
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.periodoPago).toBe('MENSUAL');
    expect(r.valor.diasSemana).toBe(6);
  });

  it('BORRAR un sueldo sigue siendo posible: monto vacío es null', () => {
    // No es un caso raro: es como se le quita el sueldo propio a alguien, y la
    // fila se guarda igual para que ese borrado se propague al móvil.
    const r = derivarSueldo(form({ periodo_pago: 'MENSUAL', salario_periodo: '' }));
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.salarioPeriodo).toBeNull();
    expect(r.valor.salarioDiario).toBeNull();
  });
});

describe('derivarSueldo — lo que ANTES se guardaba mal', () => {
  it('EL CASO GRAVE: un monto mal escrito ya no borra el sueldo', () => {
    // Antes: `Number('1,500')` → NaN → `montoValido` false → salarioPeriodo
    // null → la persona se quedaba sin sueldo, sin un solo aviso.
    const r = derivarSueldo(
      form({ periodo_pago: 'MENSUAL', dias_semana: '6', salario_periodo: '1,500' }),
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe('El sueldo debe ser un número mayor a cero.');
  });

  it('un sueldo cero o negativo se rechaza en vez de convertirse en null', () => {
    for (const m of ['0', '-100']) {
      const r = derivarSueldo(form({ salario_periodo: m }));
      expect(r.ok, m).toBe(false);
    }
  });

  it('un periodo desconocido ya no se guarda como MENSUAL', () => {
    // Antes, cualquier cadena que no fuera SEMANAL/QUINCENAL/MENSUAL caía a
    // MENSUAL: el sueldo quedaba dividido entre 26 en vez de entre lo que
    // correspondía, y nadie podía explicar el número.
    const r = derivarSueldo(form({ periodo_pago: 'DECENAL', salario_periodo: '1000' }));
    expect(r.ok).toBe(false);
  });

  it('unos días/semana fuera de 5-6-7 ya no se redondean a 6', () => {
    for (const d of ['4', '8', '6.5', 'seis']) {
      const r = derivarSueldo(form({ dias_semana: d, salario_periodo: '1000' }));
      expect(r.ok, d).toBe(false);
      expect(r.ok === false && r.error).toBe('Los días por semana deben ser 5, 6 o 7.');
    }
  });

  it('"Infinity" como sueldo no llega a la nómina', () => {
    expect(derivarSueldo(form({ salario_periodo: 'Infinity' })).ok).toBe(false);
    expect(derivarSueldo(form({ salario_periodo: '1e999' })).ok).toBe(false);
  });
});
