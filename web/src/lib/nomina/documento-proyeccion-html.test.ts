import { describe, expect, test } from 'vitest';

import { construirProyeccionDocumentoHtml } from './documento-proyeccion-html';
import {
  REDONDEO_APAGADO,
  calcularProyeccion,
  conPlazas,
  escenarioVacio,
  plazasComoColaboradores,
  type ProyeccionEstado,
  type RedondeoConfig,
} from '@/lib/data/proyeccion-nomina';
import { vistaRedondeada } from '@/lib/data/redondeo';
import { colaborador, puesto } from '@/lib/data/_fixtures';
import { medianocheMx } from '@/lib/data/tz';

/// Lo que el PAPEL tiene que decir.
///
/// Estas dos cosas ya salieron mal una vez: el lector del escenario que vivía en
/// la ruta del PDF se escribió a mano y se quedó sin `plazas` ni `redondeo`
/// cuando aparecieron, y un `as ProyeccionEstado` lo dejó compilar en silencio.
/// El resultado era un documento que imprimía cifras sin redondear y sin las
/// plazas — es decir, un número distinto al de la pantalla, y el que se lleva la
/// gente es el del papel.

const lunes = medianocheMx(2026, 7, 24);
const puestos = [puesto('pM', 'Maestro', 583.33)];
const pdf = { colorHex: '#111111' };
const moneda = (v: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(v);

function documento(config: RedondeoConfig, conPlaza: boolean) {
  let estado: ProyeccionEstado = {
    ...escenarioVacio(lunes),
    participantes: ['c1'],
    diasProyectados: { c1: [0, 1, 2, 3, 4, 5] },
    redondeo: config,
  };
  if (conPlaza) {
    estado = conPlazas(estado, {
      puestoId: 'pM',
      puestoNombre: 'Maestro',
      cuantas: 1,
      sueldo: { periodo: 'SEMANAL', monto: 3600, diasSemana: 6 },
      obraId: null,
      dias: [0, 1, 2, 3, 4, 5],
    }).estado;
  }

  const resultado = calcularProyeccion({
    estado,
    colaboradores: [
      colaborador('c1', 'Juan', { puestoId: 'pM' }),
      ...plazasComoColaboradores(estado),
    ],
    puestos,
  });

  return {
    html: construirProyeccionDocumentoHtml({
      empresa: 'Constructora',
      rangoSemana: '24/8/2026 al 30/8/2026',
      obraNombre: null,
      resultado,
      vista: vistaRedondeada(resultado, config),
      nombreObra: {},
      pdf,
      moneda,
    }),
    resultado,
  };
}

describe('las plazas llegan al papel', () => {
  test('una plaza se imprime como un renglón más', () => {
    // Si el documento no las conoce, su costo desaparece del total impreso y el
    // papel dice menos de lo que la semana va a costar.
    const { html, resultado } = documento(REDONDEO_APAGADO, true);

    expect(html).toContain('Maestro 1');
    expect(resultado.renglones).toHaveLength(2);
    // Juan 6 × 583.33 = 3,499.98 más la plaza 6 × 600 = 3,600.
    expect(resultado.total).toBeCloseTo(7099.98, 2);
  });
});

describe('el papel imprime lo mismo que la pantalla', () => {
  const cfg: RedondeoConfig = {
    activo: true,
    paso: 100,
    modo: 'CERCANO',
    campos: ['RAYA', 'TOTAL'],
  };

  test('con redondeo, la cifra impresa es la redondeada', () => {
    // Con paso 100 la diferencia NO se vería: el formateador del papel imprime
    // sin decimales, así que 3,499.98 y 3,500 salen idénticos. Se usa un paso
    // de 1,000 para que la aserción distinga de verdad.
    const { html } = documento({ ...cfg, paso: 1000 }, false);

    // 6 × 583.33 = 3,499.98 → al más cercano de mil, baja a 3,000.
    expect(html).toContain(moneda(3000));
    expect(html).not.toContain(moneda(3499.98));
  });

  test('y dice con qué regla', () => {
    // Un documento que enseña cifras ajustadas sin declararlo invita a que
    // alguien las sume por su cuenta y no le cuadren.
    const { html } = documento(cfg, false);
    expect(html).toContain('redondeadas a múltiplos de $100');
    expect(html).toContain('al más cercano');
  });

  test('sin redondeo no aparece ninguna leyenda', () => {
    const { html } = documento(REDONDEO_APAGADO, false);
    expect(html).not.toContain('redondeadas a múltiplos');
  });
});
