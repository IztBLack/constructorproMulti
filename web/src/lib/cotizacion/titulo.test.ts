import { describe, expect, it } from 'vitest';
import { tituloCotizacion } from './titulo';

describe('tituloCotizacion', () => {
  it('usa el nombre del proyecto cuando lo hay', () => {
    expect(
      tituloCotizacion({ nombre_proyecto: 'Casa 2 recámaras', ubicacion: 'Santa Rita' }),
    ).toBe('Casa 2 recámaras');
  });

  it('cae a la ubicación cuando el proyecto va sin nombre', () => {
    expect(tituloCotizacion({ nombre_proyecto: '', ubicacion: 'Santa Rita' })).toBe('Santa Rita');
  });

  it('cae al cliente cuando no hay proyecto ni ubicación', () => {
    expect(tituloCotizacion({ nombre_proyecto: '', ubicacion: '', cliente: 'Sra. Pérez' })).toBe(
      'Sra. Pérez',
    );
  });

  it('trata los espacios en blanco como vacío', () => {
    expect(tituloCotizacion({ nombre_proyecto: '   ', ubicacion: 'Santa Rita' })).toBe(
      'Santa Rita',
    );
  });

  it('acepta null y undefined, que es como llegan de la BD', () => {
    expect(tituloCotizacion({ nombre_proyecto: null, ubicacion: null, cliente: null })).toBe(
      'Cotización sin nombre',
    );
    expect(tituloCotizacion({})).toBe('Cotización sin nombre');
  });
});
