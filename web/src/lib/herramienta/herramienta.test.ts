import { describe, expect, test } from 'vitest';
import { medianocheMx } from '@/lib/data/tz';
import {
  DIAS_SIN_FECHA_AVISO,
  destinoPrestamo,
  estadoPrestamo,
  mensajeErrorHerramienta,
  pesoSemaforo,
  resumenPrestamos,
} from './herramienta';

const HORA = 3_600_000;
const dia = (y: number, m: number, d: number, h = 12) => medianocheMx(y, m - 1, d) + h * HORA;
const hoy = dia(2026, 9, 27, 9);

describe('semáforo de herramienta no devuelta', () => {
  test('devuelta: sin alarma, cuenta los días que anduvo fuera', () => {
    const e = estadoPrestamo({ desde: dia(2026, 9, 1), hasta: dia(2026, 9, 11), devolver_antes: dia(2026, 9, 5) }, hoy);
    expect(e).toMatchObject({ semaforo: 'DEVUELTA', diasFuera: 10, diasVencida: 0 });
  });

  test('con fecha de regreso ya pasada: rojo con días de retraso', () => {
    const e = estadoPrestamo({ desde: dia(2026, 9, 1), hasta: null, devolver_antes: dia(2026, 9, 24) }, hoy);
    expect(e).toMatchObject({ semaforo: 'ROJO', diasVencida: 3 });
    expect(e.texto).toBe('Debió regresar hace 3 días');
  });

  test('regresa hoy o mañana: amarillo; más adelante: verde', () => {
    expect(estadoPrestamo({ desde: dia(2026, 9, 20), hasta: null, devolver_antes: dia(2026, 9, 27, 18) }, hoy).semaforo).toBe(
      'AMARILLO',
    );
    expect(estadoPrestamo({ desde: dia(2026, 9, 20), hasta: null, devolver_antes: dia(2026, 9, 28) }, hoy).texto).toBe(
      'Regresa mañana',
    );
    expect(estadoPrestamo({ desde: dia(2026, 9, 20), hasta: null, devolver_antes: dia(2026, 10, 5) }, hoy)).toMatchObject({
      semaforo: 'VERDE',
      texto: 'Regresa en 8 días',
    });
  });

  test('sin fecha: verde hasta 30 días, luego amarillo (confirma dónde está)', () => {
    const limite = dia(2026, 9, 27 - DIAS_SIN_FECHA_AVISO);
    expect(estadoPrestamo({ desde: limite, hasta: null, devolver_antes: null }, hoy).semaforo).toBe('VERDE');
    const pasado = estadoPrestamo({ desde: dia(2026, 8, 20), hasta: null, devolver_antes: null }, hoy);
    expect(pasado.semaforo).toBe('AMARILLO');
    expect(pasado.texto).toContain('confirma dónde está');
    expect(estadoPrestamo({ desde: hoy, hasta: null, devolver_antes: null }, hoy).texto).toBe('Salió hoy');
  });

  test('ordena lo vencido primero', () => {
    const orden = (['VERDE', 'DEVUELTA', 'ASIGNADA', 'ROJO', 'AMARILLO'] as const)
      .slice()
      .sort((a, b) => pesoSemaforo(a) - pesoSemaforo(b));
    expect(orden).toEqual(['ROJO', 'AMARILLO', 'VERDE', 'ASIGNADA', 'DEVUELTA']);
  });

  test('traduce los errores de la base', () => {
    expect(mensajeErrorHerramienta('duplicate key value violates unique constraint "uq_herramienta_asignacion_abierta"')).toContain(
      'ya está prestada',
    );
    expect(mensajeErrorHerramienta('HERRAMIENTA_BAJA: …')).toContain('de baja');
    expect(mensajeErrorHerramienta('otro')).toBe('otro');
  });
});

describe('asignación permanente (de planta, 0047)', () => {
  test('la camioneta del cabo con 182 días fuera: "Asignada", sin alerta', () => {
    const e = estadoPrestamo(
      { desde: dia(2026, 3, 29), hasta: null, devolver_antes: null, permanente: true },
      hoy,
      'Martín Treviño',
    );
    expect(e).toEqual({ semaforo: 'ASIGNADA', diasFuera: 182, diasVencida: 0, texto: 'Asignada de planta a Martín Treviño' });
    expect(e.texto).not.toMatch(/días fuera|confirma/);
  });

  test('sin importar los días (ni una fecha vieja que se haya colado): nunca roja ni amarilla', () => {
    for (const desde of [hoy, dia(2026, 9, 1), dia(2025, 1, 1)]) {
      expect(estadoPrestamo({ desde, hasta: null, devolver_antes: null, permanente: true }, hoy).semaforo).toBe('ASIGNADA');
    }
    // La base no deja fecha de regreso en una permanente; si llegara, no alarma.
    expect(
      estadoPrestamo({ desde: dia(2026, 9, 1), hasta: null, devolver_antes: dia(2026, 9, 2), permanente: true }, hoy).semaforo,
    ).toBe('ASIGNADA');
  });

  test('sin destino: texto corto; con destino vacío, igual', () => {
    expect(estadoPrestamo({ desde: hoy, hasta: null, devolver_antes: null, permanente: true }, hoy).texto).toBe('Asignada de planta');
    expect(estadoPrestamo({ desde: hoy, hasta: null, devolver_antes: null, permanente: true }, hoy, '  ').texto).toBe(
      'Asignada de planta',
    );
  });

  test('una permanente que ya regresó es DEVUELTA, como un préstamo', () => {
    const e = estadoPrestamo({ desde: dia(2026, 9, 1), hasta: dia(2026, 9, 11), devolver_antes: null, permanente: true }, hoy);
    expect(e).toMatchObject({ semaforo: 'DEVUELTA', diasFuera: 10 });
  });

  test('sin el dato (base sin 0047) todo sigue siendo préstamo', () => {
    expect(estadoPrestamo({ desde: dia(2026, 3, 29), hasta: null, devolver_antes: null }, hoy).semaforo).toBe('AMARILLO');
    expect(estadoPrestamo({ desde: dia(2026, 3, 29), hasta: null, devolver_antes: null, permanente: false }, hoy).semaforo).toBe(
      'AMARILLO',
    );
  });

  test('el resumen no cuenta las permanentes como prestadas ni como vencidas', () => {
    const e = (x: Parameters<typeof estadoPrestamo>[0]) => estadoPrestamo(x, hoy);
    const r = resumenPrestamos([
      e({ desde: dia(2026, 3, 29), hasta: null, devolver_antes: null, permanente: true }),
      e({ desde: dia(2026, 4, 20), hasta: null, devolver_antes: null, permanente: true }),
      e({ desde: dia(2026, 9, 1), hasta: null, devolver_antes: dia(2026, 9, 24) }),
      e({ desde: dia(2026, 9, 20), hasta: null, devolver_antes: null }),
      e({ desde: dia(2026, 9, 1), hasta: dia(2026, 9, 11), devolver_antes: null }),
      null,
    ]);
    expect(r).toEqual({ prestadas: 2, asignadas: 2, vencidas: 1 });
  });

  test('destino: obra y persona, lo que haya', () => {
    expect(destinoPrestamo({ obra_nombre: 'Casas Bienestar', colaborador_nombre: 'Martín' })).toBe('Casas Bienestar · Martín');
    expect(destinoPrestamo({ obra_nombre: null, colaborador_nombre: 'Martín' })).toBe('Martín');
    expect(destinoPrestamo({ obra_nombre: null, colaborador_nombre: null })).toBe('');
  });

  test('traduce los errores de 0047', () => {
    expect(mensajeErrorHerramienta('new row violates check constraint "herramienta_permanente_sin_regreso"')).toBe(
      'Una asignación permanente no lleva fecha de regreso.',
    );
    expect(
      mensajeErrorHerramienta("Could not find the 'permanente' column of 'herramienta_asignacion' in the schema cache"),
    ).toContain('falta actualizar la base');
    expect(mensajeErrorHerramienta('column herramienta_asignacion.permanente does not exist')).toContain('falta actualizar');
  });
});
