import { describe, expect, it } from 'vitest';
import { parseCuadrillaFormData } from './cuadrilla-form';
import type { FuenteFormData } from '@/lib/validacion/campos';

/// El formulario de una cuadrilla.
///
/// La especialidad no es decorativa: agrupa a la gente por oficio y es lo que
/// se lee en el pase de lista y en el reparto de destajo. `normalizaEspecialidad`
/// devolvía 'MIXTA' ante cualquier valor que no reconociera, así que una
/// cuadrilla de acero podía acabar registrada como mixta sin que nadie hubiera
/// elegido eso, y sin ningún rastro de por qué.

function form(campos: Record<string, string>): FuenteFormData {
  return { get: (c) => (c in campos ? campos[c] : null) };
}

describe('parseCuadrillaFormData', () => {
  it('nombre y especialidad válidos pasan tal cual', () => {
    expect(parseCuadrillaFormData(form({ nombre: 'Cuadrilla de Enrique', especialidad: 'ACERO' })))
      .toEqual({ nombre: 'Cuadrilla de Enrique', especialidad: 'ACERO' });
  });

  it('sin especialidad, MIXTA: es el valor por omisión del formulario', () => {
    expect(parseCuadrillaFormData(form({ nombre: 'Nueva' }))).toEqual({
      nombre: 'Nueva',
      especialidad: 'MIXTA',
    });
  });

  it('LO QUE ANTES SE GUARDABA MAL: una especialidad desconocida ya no cae a MIXTA', () => {
    const r = parseCuadrillaFormData(form({ nombre: 'Nueva', especialidad: 'PLOMERIA' }));
    expect('error' in r).toBe(true);
  });

  it('el nombre sigue siendo obligatorio, con el mismo mensaje', () => {
    for (const n of ['', '   ']) {
      const r = parseCuadrillaFormData(form({ nombre: n, especialidad: 'ACERO' }));
      expect('error' in r && r.error, JSON.stringify(n)).toBe(
        'El nombre de la cuadrilla es obligatorio.',
      );
    }
  });

  it('el nombre se recorta, como siempre', () => {
    const r = parseCuadrillaFormData(form({ nombre: '  Martín  ' }));
    expect('error' in r ? null : r.nombre).toBe('Martín');
  });
});
