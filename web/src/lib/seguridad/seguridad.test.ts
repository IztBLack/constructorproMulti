import { describe, expect, test } from 'vitest';
import { medianocheMx } from '@/lib/data/tz';
import {
  cumplimiento,
  nivelCumplimiento,
  normalizarPuntos,
  puntosNuevos,
  type PuntoChecklist,
} from './checklist';
import { PLANTILLA_NOM_031, citaDe, puntosPlantilla } from './plantilla';
import { avisoPendiente, diasSinAccidente } from './incidentes';
import { limpiarArticulo, ultimaEntregaPorArticulo } from './epp';
import { diasEntreMx, sumarMesesMx } from '@/lib/fechas/dias-mx';

const HORA = 3_600_000;
const dia = (y: number, m: number, d: number, h = 12) => medianocheMx(y, m - 1, d) + h * HORA;

describe('plantilla NOM-031', () => {
  test('claves únicas, textos cortos y cada punto cita la norma', () => {
    const puntos = puntosPlantilla();
    expect(new Set(puntos.map((p) => p.clave)).size).toBe(puntos.length);
    for (const p of puntos) {
      expect(p.texto.length).toBeGreaterThan(0);
      expect(p.texto.length).toBeLessThanOrEqual(300);
      expect(p.clave.length).toBeLessThanOrEqual(60);
      expect(p.cita).not.toBe('');
    }
    expect(PLANTILLA_NOM_031.length).toBeGreaterThanOrEqual(4);
    expect(citaDe('extintor')).toBe('5.12');
    expect(citaDe('ya-no-existe')).toBe('');
  });

  test('una revisión nueva sale sin contestar', () => {
    const n = puntosNuevos();
    expect(n.length).toBe(puntosPlantilla().length);
    expect(n.every((p) => p.resultado === null)).toBe(true);
  });
});

describe('porcentaje de cumplimiento', () => {
  const p = (resultado: PuntoChecklist['resultado'], i: number): PuntoChecklist => ({
    clave: `k${i}`,
    texto: `Punto ${i}`,
    resultado,
  });

  test('"no aplica" y lo sin contestar no cuentan', () => {
    const c = cumplimiento([p('CUMPLE', 1), p('CUMPLE', 2), p('CUMPLE', 3), p('NO_CUMPLE', 4), p('NO_APLICA', 5), p(null, 6)]);
    expect(c).toEqual({ cumple: 3, noCumple: 1, noAplica: 1, sinResponder: 1, porcentaje: 75 });
  });

  test('sin nada medible no hay porcentaje', () => {
    expect(cumplimiento([]).porcentaje).toBeNull();
    expect(cumplimiento([p('NO_APLICA', 1), p(null, 2)]).porcentaje).toBeNull();
  });

  test('redondea a entero', () => {
    expect(cumplimiento([p('CUMPLE', 1), p('CUMPLE', 2), p('NO_CUMPLE', 3)]).porcentaje).toBe(67);
  });

  test('semáforo: verde solo al 100, amarillo desde 80', () => {
    expect(nivelCumplimiento(100)).toBe('BIEN');
    expect(nivelCumplimiento(99)).toBe('REVISAR');
    expect(nivelCumplimiento(80)).toBe('REVISAR');
    expect(nivelCumplimiento(79)).toBe('MAL');
    expect(nivelCumplimiento(null)).toBe('SIN_DATOS');
  });

  test('normalizar descarta lo raro y repetido, y recorta la nota', () => {
    const n = normalizarPuntos([
      { clave: 'a', texto: 'A', resultado: 'CUMPLE', nota: '  ok  ' },
      { clave: 'a', texto: 'A otra vez', resultado: 'NO_CUMPLE' },
      { clave: '', texto: 'sin clave' },
      { clave: 'b', texto: 'B', resultado: 'MAS_O_MENOS' },
      'basura',
      null,
    ]);
    expect(n).toEqual([
      { clave: 'a', texto: 'A', resultado: 'CUMPLE', nota: 'ok' },
      { clave: 'b', texto: 'B', resultado: null },
    ]);
    expect(normalizarPuntos('no es arreglo')).toEqual([]);
  });
});

describe('días sin accidente', () => {
  const hoy = dia(2026, 9, 27, 8);
  const inicio = dia(2026, 9, 1);

  test('sin accidentes cuenta desde el inicio de la obra', () => {
    expect(diasSinAccidente([], inicio, hoy)).toEqual({ dias: 26, desde: 'INICIO_OBRA', ultimo: null });
  });

  test('casi accidentes y condiciones inseguras no reinician la cuenta', () => {
    const r = diasSinAccidente(
      [
        { tipo: 'CASI_ACCIDENTE', fecha: dia(2026, 9, 25) },
        { tipo: 'CONDICION_INSEGURA', fecha: dia(2026, 9, 26) },
      ],
      inicio,
      hoy,
    );
    expect(r.desde).toBe('INICIO_OBRA');
    expect(r.dias).toBe(26);
  });

  test('cuenta desde el accidente más reciente, por día de calendario de México', () => {
    const r = diasSinAccidente(
      [
        { tipo: 'ACCIDENTE', fecha: dia(2026, 9, 10) },
        { tipo: 'ACCIDENTE', fecha: dia(2026, 9, 20, 23) }, // 20-sep 23:00 en México
      ],
      inicio,
      hoy,
    );
    expect(r).toEqual({ dias: 7, desde: 'ULTIMO_ACCIDENTE', ultimo: dia(2026, 9, 20, 23) });
  });

  test('un accidente de hoy da cero; uno con fecha futura se ignora', () => {
    expect(diasSinAccidente([{ tipo: 'ACCIDENTE', fecha: dia(2026, 9, 27, 1) }], inicio, hoy).dias).toBe(0);
    const r = diasSinAccidente([{ tipo: 'ACCIDENTE', fecha: dia(2026, 10, 3) }], inicio, hoy);
    expect(r.desde).toBe('INICIO_OBRA');
  });

  test('obra que aún no empieza: cero, no negativo', () => {
    expect(diasSinAccidente([], dia(2026, 10, 1), hoy).dias).toBe(0);
  });

  test('aviso al IMSS pendiente solo en accidentes sin aviso', () => {
    expect(avisoPendiente({ tipo: 'ACCIDENTE', aviso_imss_hecho: false })).toBe(true);
    expect(avisoPendiente({ tipo: 'ACCIDENTE', aviso_imss_hecho: true })).toBe(false);
    expect(avisoPendiente({ tipo: 'CASI_ACCIDENTE', aviso_imss_hecho: false })).toBe(false);
  });
});

describe('EPP', () => {
  test('limpia el artículo', () => {
    expect(limpiarArticulo('  Casco   blanco ')).toBe('Casco blanco');
    expect(limpiarArticulo('')).toBeNull();
    expect(limpiarArticulo('x'.repeat(121))).toBeNull();
    expect(limpiarArticulo(5)).toBeNull();
  });

  test('última entrega por artículo, sin distinguir mayúsculas', () => {
    const r = ultimaEntregaPorArticulo([
      { articulo: 'Casco', cantidad: 1, fecha: 10 },
      { articulo: 'casco ', cantidad: 1, fecha: 30 },
      { articulo: 'Botas de seguridad', cantidad: 1, fecha: 20 },
    ]);
    expect(r).toEqual([
      { articulo: 'Botas de seguridad', fecha: 20, cantidad: 1 },
      { articulo: 'casco', fecha: 30, cantidad: 1 },
    ]);
  });
});

describe('fechas de calendario en México', () => {
  test('días entre fechas no dependen de la hora', () => {
    expect(diasEntreMx(dia(2026, 9, 26, 23), dia(2026, 9, 27, 0))).toBe(1);
    expect(diasEntreMx(dia(2026, 9, 27, 0), dia(2026, 9, 27, 23))).toBe(0);
    expect(diasEntreMx(dia(2026, 9, 27), dia(2026, 9, 20))).toBe(-7);
  });

  test('sumar meses respeta el fin de mes', () => {
    expect(sumarMesesMx(dia(2026, 1, 31), 1)).toBe(medianocheMx(2026, 1, 28));
    expect(sumarMesesMx(dia(2028, 1, 31), 1)).toBe(medianocheMx(2028, 1, 29));
    expect(sumarMesesMx(dia(2026, 3, 15), 12)).toBe(medianocheMx(2027, 2, 15));
    expect(sumarMesesMx(dia(2026, 11, 30), 3)).toBe(medianocheMx(2027, 1, 28));
  });
});
