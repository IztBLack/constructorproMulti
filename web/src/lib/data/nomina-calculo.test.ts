import { describe, expect, test } from 'vitest';
import { calcularNomina, navegarSemana, semanaDe } from './nomina-calculo';
import { asistencia, colaborador, destajo, puesto } from './_fixtures';
import { partesTz } from './tz';
import { cargarContrato } from '../contracts/golden';
import type { TipoPago } from './types';

/// Prueba de PARIDAD contra los vectores dorados de `contracts/nomina/`.
///
/// Los casos y los NÚMEROS no viven aquí: viven en los `.golden.json`, que lee
/// también `test/logic/nomina_calculator_test.dart`. Esta fórmula está
/// duplicada en Dart y en TypeScript porque el móvil trabaja sin señal, y el
/// riesgo real no es que una de las dos esté mal por su cuenta, sino que dejen
/// de coincidir. Un caso nuevo se agrega en el JSON y las dos suites lo corren
/// solas (ver `contracts/README.md`).

interface EntradaNomina {
  puestos: { id: string; nombre: string; salarioDiaDefault: number }[];
  colaboradores: {
    id: string;
    nombre: string;
    puestoId: string;
    tipoPago: TipoPago;
    salarioPersonalizado: number | null;
  }[];
  asistencias: { colaboradorId: string; fraccion: number }[];
  destajos: { colaboradorId: string; monto: number }[];
}

interface EsperadoNomina {
  totalDia: number;
  totalDestajo: number;
  totalNomina: number;
  items: {
    colaboradorId: string;
    puestoNombre: string;
    totalDias: number;
    totalDestajos: number;
    salarioBaseCalculado: number;
    totalPagar: number;
  }[];
}

describe('contrato nomina/calculo-nomina', () => {
  const contrato = cargarContrato<EntradaNomina, EsperadoNomina>('nomina/calculo-nomina');

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      const r = calcularNomina({
        colaboradores: caso.entrada.colaboradores.map((c) =>
          colaborador(c.id, c.nombre, {
            puestoId: c.puestoId,
            tipoPago: c.tipoPago,
            salarioPersonalizado: c.salarioPersonalizado,
          }),
        ),
        // La obra y la fecha no entran en el cálculo (el rango ya viene
        // filtrado por el llamador), así que el contrato no los pide.
        asistencias: caso.entrada.asistencias.map((a) => asistencia(a.colaboradorId, a.fraccion)),
        destajos: caso.entrada.destajos.map((d) => destajo(d.colaboradorId, d.monto)),
        puestos: caso.entrada.puestos.map((p) => puesto(p.id, p.nombre, p.salarioDiaDefault)),
      });

      expect(r.totalDia, caso.descripcion).toBe(caso.esperado.totalDia);
      expect(r.totalDestajo, caso.descripcion).toBe(caso.esperado.totalDestajo);
      expect(r.totalNomina, caso.descripcion).toBe(caso.esperado.totalNomina);

      // El orden de los items sigue al de los colaboradores de la entrada.
      expect(
        r.items.map((i) => ({
          colaboradorId: i.colaborador.id,
          puestoNombre: i.puestoNombre,
          totalDias: i.totalDias,
          totalDestajos: i.totalDestajos,
          salarioBaseCalculado: i.salarioBaseCalculado,
          totalPagar: i.totalPagar,
        })),
        caso.descripcion,
      ).toEqual(caso.esperado.items);
    });
  }
});

/// La semana se calcula en calendario de MÉXICO, no en la zona del proceso.
/// `vitest.config.ts` fija `TZ=Europe/Madrid` justo para que estas pruebas
/// fallen si alguien vuelve a apoyarse en el reloj del servidor.
describe('contrato nomina/semana', () => {
  interface Fecha {
    año: number;
    mes: number;
    dia: number;
  }
  interface EntradaSemana extends Fecha {
    hora: number;
    minuto: number;
  }
  interface EsperadoSemana {
    lunes: Fecha;
    domingo: Fecha;
  }

  const contrato = cargarContrato<EntradaSemana, EsperadoSemana>('nomina/semana');

  /// El contrato da una fecha del calendario de México y el helper toma un
  /// `Date`, así que hay que fabricarlo desde UTC. México es UTC−6 todo el año.
  const enMexico = (e: EntradaSemana): Date =>
    new Date(Date.UTC(e.año, e.mes - 1, e.dia, e.hora + 6, e.minuto));

  for (const caso of contrato.casos) {
    test(caso.titulo, () => {
      const { inicioMs, finMs } = semanaDe(enMexico(caso.entrada));

      const inicio = partesTz(inicioMs);
      expect([inicio.year, inicio.month + 1, inicio.day], caso.descripcion).toEqual([
        caso.esperado.lunes.año,
        caso.esperado.lunes.mes,
        caso.esperado.lunes.dia,
      ]);
      expect(inicio.weekday).toBe(1);
      expect([inicio.hour, inicio.minute, inicio.second]).toEqual([0, 0, 0]);

      const fin = partesTz(finMs);
      expect([fin.year, fin.month + 1, fin.day], caso.descripcion).toEqual([
        caso.esperado.domingo.año,
        caso.esperado.domingo.mes,
        caso.esperado.domingo.dia,
      ]);
      expect(fin.weekday).toBe(7);
      expect([fin.hour, fin.minute, fin.second]).toEqual([23, 59, 59]);
      // Exactamente 7 días menos 1 ms: sin huecos ni solapes entre semanas.
      expect(finMs - inicioMs).toBe(7 * 86_400_000 - 1);
    });
  }
});

/// Fuera del contrato: navegar entre semanas es de la web (el móvil mueve la
/// fecha con su propio selector), así que no hay paridad que fijar.
describe('navegarSemana', () => {
  test('−1 y +1 vuelven al punto de partida', () => {
    const { inicioMs } = semanaDe(new Date(Date.UTC(2026, 5, 17, 20)));
    const anterior = navegarSemana(inicioMs, -1);
    const vuelta = navegarSemana(anterior.inicioMs, 1);

    expect(vuelta.inicioMs).toBe(inicioMs);
  });

  test('+1 avanza exactamente 7 días', () => {
    const { inicioMs } = semanaDe(new Date(Date.UTC(2026, 5, 17, 20)));
    const siguiente = navegarSemana(inicioMs, 1);

    expect(siguiente.inicioMs - inicioMs).toBe(7 * 86_400_000);
    expect(partesTz(siguiente.inicioMs).weekday).toBe(1);
  });

  test('cruzar el cambio de año no rompe el lunes', () => {
    // 2026-12-28 es lunes; +1 semana debe dar 2027-01-04, también lunes.
    const { inicioMs } = semanaDe(new Date(Date.UTC(2026, 11, 30, 18)));
    const siguiente = navegarSemana(inicioMs, 1);
    const p = partesTz(siguiente.inicioMs);

    expect([p.year, p.month + 1, p.day]).toEqual([2027, 1, 4]);
    expect(p.weekday).toBe(1);
  });
});
