import { describe, expect, test } from 'vitest';
import { medianocheMx } from '@/lib/data/tz';
import { medidasReducidas } from '@/lib/imagen/comprimir';
import {
  agruparPorDia,
  entradaAbierta,
  limpiarNombres,
  mensajeErrorBitacora,
  nombresPresentes,
  puedeEditarEntrada,
  textoCierre,
  VENTANA_EDICION_MS,
} from './bitacora';

const HORA = 3_600_000;

describe('cierre a las 24 h', () => {
  const ahora = medianocheMx(2026, 8, 25) + 12 * HORA;

  test('abierta hasta 24 h exactas, cerrada un ms después', () => {
    expect(entradaAbierta(ahora - VENTANA_EDICION_MS, ahora)).toBe(true);
    expect(entradaAbierta(ahora - VENTANA_EDICION_MS - 1, ahora)).toBe(false);
  });

  test('texto de cuánto le queda', () => {
    expect(textoCierre(ahora - 19 * HORA, ahora)).toBe('Se cierra en 5 h');
    expect(textoCierre(ahora - 24 * HORA + 20 * 60_000, ahora)).toBe('Se cierra en 20 min');
    expect(textoCierre(ahora - 25 * HORA, ahora)).toBeNull();
  });

  test('quién edita: admin cualquiera, supervisor las suyas, nadie cerrada', () => {
    const e = { autor_id: 'sup-1', registrada_en: ahora - HORA };
    expect(puedeEditarEntrada(e, { id: 'adm', rol: 'admin' }, ahora)).toBe(true);
    expect(puedeEditarEntrada(e, { id: 'sup-1', rol: 'supervisor' }, ahora)).toBe(true);
    expect(puedeEditarEntrada(e, { id: 'sup-2', rol: 'supervisor' }, ahora)).toBe(false);
    expect(puedeEditarEntrada(e, { id: 'sup-1', rol: 'contador' }, ahora)).toBe(false);
    const cerrada = { ...e, registrada_en: ahora - 25 * HORA };
    expect(puedeEditarEntrada(cerrada, { id: 'adm', rol: 'admin' }, ahora)).toBe(false);
  });
});

describe('timeline por día', () => {
  test('días del más reciente al más viejo; dentro del día, por hora de registro', () => {
    const d24 = medianocheMx(2026, 8, 24);
    const d25 = medianocheMx(2026, 8, 25);
    const dias = agruparPorDia([
      { id: 'a', fecha: d24, registrada_en: 5 },
      { id: 'b', fecha: d25, registrada_en: 9 },
      { id: 'c', fecha: d25, registrada_en: 3 },
      // Mismo día de México aunque el ms no sea la medianoche exacta.
      { id: 'd', fecha: d24 + 10 * HORA, registrada_en: 1 },
    ]);
    expect(dias.map((d) => d.clave)).toEqual(['2026-09-25', '2026-09-24']);
    expect(dias[0].entradas.map((e) => e.id)).toEqual(['c', 'b']);
    expect(dias[1].entradas.map((e) => e.id)).toEqual(['d', 'a']);
  });
});

describe('personal presente', () => {
  test('sale del pase de lista: solo con asistencia, sin repetir, en orden', () => {
    const nombres = new Map([
      ['1', 'Martín'],
      ['2', 'Beto'],
      ['3', 'Enrique'],
    ]);
    expect(
      nombresPresentes(
        [
          { colaborador_id: '1', fraccion: 1 },
          { colaborador_id: '2', fraccion: 0.5 },
          { colaborador_id: '3', fraccion: 0 },
          { colaborador_id: '1', fraccion: 1 },
          { colaborador_id: 'x', fraccion: 1 },
        ],
        nombres,
      ),
    ).toEqual(['Beto', 'Martín']);
  });

  test('limpiar lo capturado', () => {
    expect(limpiarNombres([' Beto ', '', 'beto', 'Martín'])).toEqual(['Beto', 'Martín']);
  });
});

describe('errores de la base', () => {
  test('se traducen a lenguaje de obra', () => {
    expect(mensajeErrorBitacora('BITACORA_CERRADA: la entrada…')).toMatch(/aclaración/);
    expect(mensajeErrorBitacora('BITACORA_MAX_FOTOS: …')).toMatch(/10 fotos/);
    expect(mensajeErrorBitacora('new row violates row-level security policy')).toMatch(/permiso/);
  });
});

describe('compresión de fotos', () => {
  test('reduce el lado mayor y conserva la proporción', () => {
    expect(medidasReducidas(4000, 3000, 1600)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasReducidas(3000, 4000, 1600)).toEqual({ ancho: 1200, alto: 1600 });
    expect(medidasReducidas(800, 600, 1600)).toEqual({ ancho: 800, alto: 600 });
  });
});
