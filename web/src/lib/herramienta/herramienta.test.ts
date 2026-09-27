import { describe, expect, test } from 'vitest';
import { medianocheMx } from '@/lib/data/tz';
import { DIAS_SIN_FECHA_AVISO, estadoPrestamo, mensajeErrorHerramienta, pesoSemaforo } from './herramienta';

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
    const orden = (['VERDE', 'DEVUELTA', 'ROJO', 'AMARILLO'] as const)
      .slice()
      .sort((a, b) => pesoSemaforo(a) - pesoSemaforo(b));
    expect(orden).toEqual(['ROJO', 'AMARILLO', 'VERDE', 'DEVUELTA']);
  });

  test('traduce los errores de la base', () => {
    expect(mensajeErrorHerramienta('duplicate key value violates unique constraint "uq_herramienta_asignacion_abierta"')).toContain(
      'ya está prestada',
    );
    expect(mensajeErrorHerramienta('HERRAMIENTA_BAJA: …')).toContain('de baja');
    expect(mensajeErrorHerramienta('otro')).toBe('otro');
  });
});
