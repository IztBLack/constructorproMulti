import { describe, expect, test } from 'vitest';

import {
  alternarCampo,
  aplicar,
  fueRedondeado,
  redondearMonto,
  resumenCorto,
  vistaRedondeada,
} from './redondeo';
import {
  REDONDEO_APAGADO,
  calcularProyeccion,
  escenarioVacio,
  type RedondeoConfig,
} from './proyeccion-nomina';
import { colaborador, puesto } from './_fixtures';
import { medianocheMx } from './tz';

/// Prueba de PARIDAD con `test/logic/redondeo_test.dart`: mismos casos y mismos
/// números. El redondeo mueve cifras de dinero, y que la oficina y la obra
/// redondeen distinto significa dos papeles de raya que no cuadran entre sí.
///
/// El caso guía es el sueldo semanal de $3,500 a 6 días, que da $583.33/día: el
/// número que más aparece en esta empresa y el que destapa el problema, porque
/// 6 × 583.33 = 3,499.98 y no 3,500.

describe('redondearMonto', () => {
  test('al más cercano parte el paso hacia arriba', () => {
    expect(redondearMonto(3499.88, 1, 'CERCANO')).toBe(3500);
    expect(redondearMonto(3499.12, 1, 'CERCANO')).toBe(3499);
    expect(redondearMonto(3450, 100, 'CERCANO')).toBe(3500);
    expect(redondearMonto(3449.99, 100, 'CERCANO')).toBe(3400);
  });

  test('hacia arriba y hacia abajo respetan el paso', () => {
    expect(redondearMonto(3420, 100, 'ARRIBA')).toBe(3500);
    expect(redondearMonto(3499.01, 100, 'ABAJO')).toBe(3400);
    // Lo que ya cae en el paso no se mueve.
    expect(redondearMonto(3400, 100, 'ARRIBA')).toBe(3400);
  });

  test('redondea la magnitud: el signo no cambia el sentido', () => {
    expect(redondearMonto(-799.6, 100, 'ARRIBA')).toBe(-800);
    expect(redondearMonto(-799.6, 100, 'ABAJO')).toBe(-700);
  });

  test('un paso inválido devuelve el valor intacto', () => {
    // Un paso de cero no tiene múltiplos, y devolver 0 borraría la raya de
    // alguien.
    expect(redondearMonto(3499.88, 0, 'CERCANO')).toBe(3499.88);
    expect(redondearMonto(3499.88, -5, 'CERCANO')).toBe(3499.88);
  });

  test('la aritmética es en centavos, sin basura de coma flotante', () => {
    // 0.1 + 0.2 en coma flotante da 0.30000000000000004.
    expect(redondearMonto(0.1 + 0.2, 0.05, 'CERCANO')).toBe(0.3);
    // 2916.666666 es lo que sale de repartir un ajuste entre una cuadrilla.
    expect(redondearMonto(2916.666666, 10, 'CERCANO')).toBe(2920);
  });
});

describe('RedondeoConfig', () => {
  const activo = (p: Partial<RedondeoConfig> = {}): RedondeoConfig => ({
    ...REDONDEO_APAGADO,
    activo: true,
    paso: 100,
    campos: ['RAYA', 'TOTAL'],
    ...p,
  });

  test('apagado no toca ninguna cifra', () => {
    expect(aplicar(REDONDEO_APAGADO, 3499.98, 'RAYA')).toBe(3499.98);
    expect(aplicar(REDONDEO_APAGADO, 3499.98, 'TOTAL')).toBe(3499.98);
  });

  test('solo redondea los ámbitos elegidos', () => {
    const cfg = activo({ campos: ['RAYA'] });
    expect(aplicar(cfg, 3499.98, 'RAYA')).toBe(3500);
    expect(aplicar(cfg, 3499.98, 'TOTAL')).toBe(3499.98);
    expect(aplicar(cfg, 583.33, 'SALARIO_DIA')).toBe(583.33);
  });

  test('quitar el último ámbito apaga el interruptor maestro', () => {
    // «Redondeo activo, cero cifras redondeadas» se ve como un bug en la
    // pantalla y el usuario no tendría cómo saber que no está roto.
    const uno = activo({ campos: ['RAYA'] });
    const sin = alternarCampo(uno, 'RAYA');
    expect(sin.campos).toEqual([]);
    expect(sin.activo).toBe(false);

    // Quitar uno de dos no apaga nada.
    expect(alternarCampo(activo(), 'RAYA').activo).toBe(true);
  });

  test('el resumen corto dice paso y sentido', () => {
    expect(resumenCorto(REDONDEO_APAGADO)).toBe('Sin redondeo');
    expect(resumenCorto(activo({ modo: 'ARRIBA' }))).toBe('Redondeo $100 ↑');
    expect(resumenCorto(activo({ modo: 'CERCANO' }))).toBe('Redondeo $100');
  });
});

describe('la proyección vista a través del redondeo', () => {
  const puestos = [puesto('pM', 'Maestro', 583.33), puesto('pA', 'Ayudante', 350)];
  const colaboradores = [
    colaborador('c1', 'Juan', { puestoId: 'pM' }),
    colaborador('c2', 'Rigo', { puestoId: 'pA' }),
  ];
  const lunes = medianocheMx(2026, 7, 24);

  const calcular = () =>
    calcularProyeccion({
      estado: {
        ...escenarioVacio(lunes),
        participantes: ['c1', 'c2'],
        diasProyectados: { c1: [0, 1, 2, 3, 4, 5], c2: [0, 1, 2, 3, 4, 5] },
      },
      colaboradores,
      puestos,
    });

  const cfg = (p: Partial<RedondeoConfig>): RedondeoConfig => ({
    ...REDONDEO_APAGADO,
    activo: true,
    ...p,
  });

  test('sin redondeo enseña exactamente lo calculado', () => {
    const r = calcular();
    const vista = vistaRedondeada(r);
    expect(vista.total.mostrado).toBeCloseTo(r.total, 3);
    expect(fueRedondeado(vista.total)).toBe(false);
    expect(vista.leyenda).toBe('');
  });

  test('la raya redondeada manda sobre el total', () => {
    // 6 × 583.33 = 3,499.98 → 3,500 ; 6 × 350 = 2,100 (ya cae en el paso).
    const r = calcular();
    const vista = vistaRedondeada(r, cfg({ paso: 100, campos: ['RAYA'] }));
    const juan = r.renglones.find((x) => x.colaborador.id === 'c1')!;

    expect(vista.raya(juan).exacto).toBeCloseTo(3499.98, 3);
    expect(vista.raya(juan).mostrado).toBe(3500);
    expect(fueRedondeado(vista.raya(juan))).toBe(true);

    // El total es la suma de lo que se va a ENTREGAR, no el exacto.
    expect(vista.total.mostrado).toBe(5600);
    expect(vista.total.exacto).toBeCloseTo(5599.98, 3);
    expect(vista.totalCuadra).toBe(true);
  });

  test('redondear el salario por día arrastra a la raya y al día', () => {
    const r = calcular();
    const vista = vistaRedondeada(
      r,
      cfg({ paso: 10, modo: 'ARRIBA', campos: ['SALARIO_DIA'] }),
    );
    const juan = r.renglones.find((x) => x.colaborador.id === 'c1')!;

    expect(vista.salarioDia(juan).mostrado).toBe(590);
    // 6 días × la tarifa que se está enseñando; si no arrastrara, el renglón
    // diría «6 × 590 = 3,499.98» y parecería roto.
    expect(vista.raya(juan).mostrado).toBeCloseTo(3540, 3);
    expect(vista.costoDia(0).mostrado).toBeCloseTo(590 + 350, 3);
  });

  test('el total sobre rayas ya redondeadas sigue cuadrando cuando cae en el paso', () => {
    const r = calcular();
    // Rayas: 3,000 + 2,000 = 5,000, exacto sobre el paso de mil.
    const mil = vistaRedondeada(r, cfg({ paso: 1000, campos: ['RAYA', 'TOTAL'] }));
    expect(mil.total.mostrado).toBe(5000);
    expect(mil.totalCuadra).toBe(true);

    // Rayas 3,500 + 2,100 = 5,600, que ya cae en 100: sigue cuadrando.
    const cien = vistaRedondeada(r, cfg({ paso: 100, campos: ['RAYA', 'TOTAL'] }));
    expect(cien.totalCuadra).toBe(true);
  });

  test('la leyenda nombra paso, modo y ámbitos', () => {
    const vista = vistaRedondeada(
      calcular(),
      cfg({ paso: 50, modo: 'ARRIBA', campos: ['RAYA'] }),
    );
    expect(vista.leyenda).toContain('$50');
    expect(vista.leyenda).toContain('hacia arriba');
    expect(vista.leyenda).toContain('raya');
  });
});

test('el redondeo no toca el resultado del cálculo', () => {
  // Guarda contra la regresión más cara: que alguien mueva el redondeo dentro
  // del calculador. El resultado crudo tiene que seguir siendo exacto.
  const lunes = medianocheMx(2026, 7, 24);
  const r = calcularProyeccion({
    estado: {
      ...escenarioVacio(lunes),
      participantes: ['c1'],
      diasProyectados: { c1: [0, 1, 2, 3, 4, 5] },
    },
    colaboradores: [colaborador('c1', 'Juan', { puestoId: 'p' })],
    puestos: [puesto('p', 'X', 583.33)],
  });

  vistaRedondeada(r, { activo: true, paso: 100, modo: 'ARRIBA', campos: ['RAYA'] });

  expect(r.total).toBeCloseTo(3499.98, 3);
});
