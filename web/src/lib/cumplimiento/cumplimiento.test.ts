import { describe, expect, test } from 'vitest';
import ExcelJS from 'exceljs';
import {
  diasHabilesRestantes,
  esDiaHabil,
  festivosMx,
  msDeFecha,
  recorrerAHabil,
  sumarDiasHabiles,
} from './dias-habiles';
import {
  avisoRepse,
  avisoSiroc,
  estadoObligacion,
  inicioVentanaRenovacion,
  leerClavePeriodo,
  limiteRegistroSiroc,
  periodoCuatrimestral,
  periodosRelevantes,
  peorSemaforo,
  semaforoVencimiento,
  vigenciaRepseSugerida,
} from './avisos';
import { armarRaya, construirExcelRaya } from './raya-excel';
import { ENLACES } from './enlaces';
import type { Asistencia, Colaborador, Destajo, Puesto } from '@/lib/data/types';

/** Medianoche de México de una fecha 'YYYY-MM-DD'. */
function f(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return msDeFecha({ y, m0: m - 1, d });
}
const cal = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m0: m - 1, d };
};

describe('días hábiles de México', () => {
  test('festivos de 2026 (LFT art. 74)', () => {
    expect([...festivosMx(2026)].sort()).toEqual([
      '2026-01-01',
      '2026-02-02', // primer lunes de febrero
      '2026-03-16', // tercer lunes de marzo
      '2026-05-01',
      '2026-09-16',
      '2026-11-16', // tercer lunes de noviembre
      '2026-12-25',
    ]);
  });

  test('1 de octubre solo en año de transmisión del Ejecutivo (2024, 2030)', () => {
    expect(festivosMx(2030).has('2030-10-01')).toBe(true);
    expect(festivosMx(2026).has('2026-10-01')).toBe(false);
    expect(festivosMx(2024).has('2024-10-01')).toBe(true);
    expect(festivosMx(2024).has('2024-12-01')).toBe(false);
    expect(festivosMx(2018).has('2018-12-01')).toBe(true);
  });

  test('sábado, domingo y festivo son inhábiles; el 5 de mayo NO se descuenta (lado seguro)', () => {
    expect(esDiaHabil(cal('2026-09-26'))).toBe(false); // sábado
    expect(esDiaHabil(cal('2026-09-27'))).toBe(false); // domingo
    expect(esDiaHabil(cal('2026-09-16'))).toBe(false); // festivo
    expect(esDiaHabil(cal('2026-05-05'))).toBe(true);
    expect(esDiaHabil(cal('2026-09-28'))).toBe(true);
  });

  test('5 días hábiles después de un viernes brincan el fin de semana y el 16 de septiembre', () => {
    // vie 11 → lun 14, mar 15, (mié 16 festivo), jue 17, vie 18, lun 21
    expect(sumarDiasHabiles(cal('2026-09-11'), 5)).toEqual(cal('2026-09-21'));
  });

  test('recorrer al siguiente hábil', () => {
    expect(recorrerAHabil(cal('2026-05-17'))).toEqual(cal('2026-05-18')); // domingo → lunes
    expect(recorrerAHabil(cal('2026-09-17'))).toEqual(cal('2026-09-17')); // jueves hábil
    expect(recorrerAHabil(cal('2026-12-25'))).toEqual(cal('2026-12-28')); // vie festivo → lunes
  });

  test('días hábiles restantes: incluye hoy y el límite; negativo si ya pasó', () => {
    expect(diasHabilesRestantes(cal('2026-09-11'), cal('2026-09-21'))).toBe(6);
    expect(diasHabilesRestantes(cal('2026-09-21'), cal('2026-09-21'))).toBe(1);
    expect(diasHabilesRestantes(cal('2026-09-19'), cal('2026-09-21'))).toBe(1); // sábado
    expect(diasHabilesRestantes(cal('2026-09-22'), cal('2026-09-21'))).toBe(-1);
    expect(diasHabilesRestantes(cal('2026-09-28'), cal('2026-09-21'))).toBe(-5);
  });
});

describe('semáforo 30 / 15 / 0', () => {
  const hoy = f('2026-09-27');
  test.each([
    ['2026-12-31', 'VIGENTE'],
    ['2026-10-27', 'PRONTO'], // 30 días
    ['2026-10-12', 'URGENTE'], // 15 días
    ['2026-09-27', 'URGENTE'], // hoy
    ['2026-09-26', 'VENCIDO'],
  ])('vence %s → %s', (fecha, nivel) => {
    expect(semaforoVencimiento(f(fecha), hoy).nivel).toBe(nivel);
  });

  test('sin fecha', () => {
    expect(semaforoVencimiento(null, hoy)).toMatchObject({ nivel: 'SIN_FECHA', dias: null });
  });

  test('textos', () => {
    expect(semaforoVencimiento(f('2026-09-28'), hoy).texto).toBe('Vence en 1 día');
    expect(semaforoVencimiento(f('2026-09-25'), hoy).texto).toBe('Venció hace 2 días');
    expect(semaforoVencimiento(f('2026-09-27'), hoy).texto).toBe('Vence hoy');
  });

  test('el peor manda', () => {
    expect(peorSemaforo(['VIGENTE', 'PRONTO', 'VENCIDO'])).toBe('VENCIDO');
    expect(peorSemaforo(['VIGENTE', 'PRONTO'])).toBe('PRONTO');
    expect(peorSemaforo([])).toBe('SIN_FECHA');
  });
});

describe('SIROC', () => {
  const siroc = (extra: Record<string, unknown> = {}) => ({
    estado: 'PENDIENTE' as const,
    fecha_inicio_obra: f('2026-09-11'),
    numero_registro: '',
    fecha_terminacion: null,
    aviso_terminacion_at: null,
    ...extra,
  });

  test('límite = 5.º día hábil después del inicio', () => {
    expect(limiteRegistroSiroc(f('2026-09-11'))).toBe(f('2026-09-21'));
  });

  test('obra sin anotar usa la fecha de inicio de la obra: "te quedan N días hábiles"', () => {
    const a = avisoSiroc(null, f('2026-09-11'), f('2026-09-18'));
    expect(a.diasHabiles).toBe(2);
    expect(a.nivel).toBe('URGENTE');
    expect(a.detalle).toContain('Te quedan 2 días hábiles');
    expect(a.fechaLimite).toBe(f('2026-09-21'));
  });

  test('el último día y ya vencido', () => {
    expect(avisoSiroc(siroc(), null, f('2026-09-21')).detalle).toContain('Hoy es el último día hábil');
    const v = avisoSiroc(siroc(), null, f('2026-09-23'));
    expect(v.nivel).toBe('VENCIDO');
    expect(v.titulo).toBe('Registro SIROC vencido');
  });

  test('con tiempo de sobra es PRONTO (sigue siendo un pendiente)', () => {
    expect(avisoSiroc(siroc(), null, f('2026-09-11')).nivel).toBe('PRONTO');
  });

  test('sin fecha de inicio', () => {
    expect(avisoSiroc(null, null, f('2026-09-18')).nivel).toBe('SIN_FECHA');
  });

  test('registrada: verde; con fin de obra y sin aviso de terminación, cuenta 5 hábiles', () => {
    expect(avisoSiroc(siroc({ estado: 'REGISTRADA', numero_registro: 'R-1' }), null, f('2026-09-30')).nivel).toBe(
      'VIGENTE',
    );
    const t = avisoSiroc(
      siroc({ estado: 'REGISTRADA', fecha_terminacion: f('2026-09-11') }),
      null,
      f('2026-09-18'),
    );
    expect(t.titulo).toBe('Presenta el aviso de terminación');
    expect(t.diasHabiles).toBe(2);
    expect(
      avisoSiroc(
        siroc({ estado: 'REGISTRADA', fecha_terminacion: f('2026-09-11'), aviso_terminacion_at: f('2026-09-14') }),
        null,
        f('2026-09-30'),
      ).nivel,
    ).toBe('VIGENTE');
  });

  test('no aplica', () => {
    expect(avisoSiroc(siroc({ estado: 'NO_APLICA' }), null, f('2026-09-30')).nivel).toBe('VIGENTE');
  });
});

describe('REPSE', () => {
  test('vigencia sugerida de 3 años y ventana de renovación de 3 meses', () => {
    expect(vigenciaRepseSugerida(f('2023-11-30'))).toBe(f('2026-11-30'));
    expect(inicioVentanaRenovacion(f('2026-11-30'))).toBe(f('2026-08-30'));
    // 31 de mayo − 3 meses = 28 de febrero (no se desborda a marzo).
    expect(inicioVentanaRenovacion(f('2027-05-31'))).toBe(f('2027-02-28'));
  });

  test('dentro de la ventana avisa aunque falten más de 30 días', () => {
    const a = avisoRepse(f('2026-12-15'), f('2026-09-27'));
    expect(a.renovarYa).toBe(true);
    expect(a.nivel).toBe('PRONTO');
    const lejos = avisoRepse(f('2027-12-15'), f('2026-09-27'));
    expect(lejos).toMatchObject({ renovarYa: false, nivel: 'VIGENTE' });
    expect(avisoRepse(f('2026-09-01'), f('2026-09-27')).nivel).toBe('VENCIDO');
  });
});

describe('ICSOE / SISUB', () => {
  test('17 de mayo, septiembre y enero, recorrido al siguiente hábil', () => {
    expect(periodoCuatrimestral(2026, 1).fechaLimite).toBe(f('2026-05-18')); // 17 cae en domingo
    expect(periodoCuatrimestral(2026, 2).fechaLimite).toBe(f('2026-09-17')); // jueves
    expect(periodoCuatrimestral(2026, 3).fechaLimite).toBe(f('2027-01-18')); // 17 cae en domingo
    expect(periodoCuatrimestral(2025, 3).fechaLimite).toBe(f('2026-01-19')); // 17 cae en sábado
    expect(periodoCuatrimestral(2026, 2)).toMatchObject({ clave: '2026-C2', etiqueta: 'mayo–agosto 2026' });
  });

  test('periodos relevantes: el que sigue y el anterior', () => {
    expect(periodosRelevantes(f('2026-09-27'))).toMatchObject({
      proximo: { clave: '2026-C3' },
      anterior: { clave: '2026-C2' },
    });
    expect(periodosRelevantes(f('2026-09-17')).proximo.clave).toBe('2026-C2');
    expect(periodosRelevantes(f('2026-01-10'))).toMatchObject({
      proximo: { clave: '2025-C3' },
      anterior: { clave: '2025-C2' },
    });
  });

  test('leer la clave guardada', () => {
    expect(leerClavePeriodo('2025-C3')?.fechaLimite).toBe(f('2026-01-19'));
    expect(leerClavePeriodo('2025-C4')).toBeNull();
  });

  test('estado: entregada, por presentar o vencida', () => {
    const lim = f('2026-09-17');
    expect(estadoObligacion(lim, f('2026-09-10'), f('2026-09-27'))).toEqual({ nivel: 'VIGENTE', texto: 'Entregada' });
    expect(estadoObligacion(lim, null, f('2026-09-27')).nivel).toBe('VENCIDO');
    expect(estadoObligacion(lim, null, f('2026-09-10')).texto).toBe('Se presenta en 7 días');
  });
});

describe('enlaces oficiales', () => {
  test('todos son https de dominios de gobierno', () => {
    for (const e of Object.values(ENLACES)) {
      const u = new URL(e.href);
      expect(u.protocol).toBe('https:');
      expect(u.hostname).toMatch(/\.gob\.mx$|infonavit\.org\.mx$/);
    }
  });
});

describe('raya para el contador', () => {
  const base = { created_at: 0, updated_at: 0, server_updated_at: 0, deleted_at: null };
  const puestos: Puesto[] = [{ id: 'p1', empresa_id: 'e', nombre: 'Albañil', salario_dia_default: 500, ...base }];
  const colab = (id: string, nombre: string, tipo: 'DIA' | 'DESTAJO', salario: number | null = null): Colaborador => ({
    id,
    empresa_id: 'e',
    nombre,
    puesto_id: 'p1',
    tipo_pago: tipo,
    telefono: null,
    contacto_nombre: null,
    contacto_telefono: null,
    contacto_parentesco: null,
    activo: true,
    salario_personalizado: salario,
    periodo_pago: 'SEMANAL',
    salario_periodo: null,
    dias_semana: 6,
    ...base,
  });
  const asis = (colaborador_id: string, obra_id: string, fraccion: number): Asistencia => ({
    id: `${colaborador_id}-${obra_id}-${fraccion}-${Math.random()}`,
    empresa_id: 'e',
    colaborador_id,
    obra_id,
    fecha: 0,
    fraccion,
    ...base,
  });
  const dest = (colaborador_id: string, obra_id: string, monto: number): Destajo => ({
    id: `${colaborador_id}-${monto}`,
    empresa_id: 'e',
    colaborador_id,
    obra_id,
    fecha: 0,
    concepto: 'Aplanado',
    monto,
    ...base,
  });

  const raya = armarRaya({
    obras: [
      { id: 'o2', nombre: 'Casa Norte' },
      { id: 'o1', nombre: 'Bodega' },
      { id: 'o3', nombre: 'Sin gente' },
    ],
    colaboradores: [colab('c1', 'Juan', 'DIA'), colab('c2', 'Ana', 'DIA', 600), colab('c3', 'Beto', 'DESTAJO')],
    puestos,
    asistencias: [asis('c1', 'o1', 1), asis('c1', 'o1', 0.5), asis('c2', 'o1', 1), asis('c1', 'o2', 1)],
    destajos: [dest('c3', 'o2', 1800)],
    datosImss: new Map([['c1', { nss: '01234567890', curp: null, rfc: null }]]),
  });

  test('por obra, solo quien tuvo actividad ahí, con la fórmula de la raya', () => {
    expect(raya.porObra.map((o) => [o.obra, o.personas, o.total])).toEqual([
      ['Bodega', 2, 1.5 * 500 + 600],
      ['Casa Norte', 2, 500 + 1800],
    ]);
    expect(raya.total).toBe(1350 + 2300);
    const juanBodega = raya.filas.find((x) => x.obraId === 'o1' && x.colaboradorId === 'c1');
    expect(juanBodega).toMatchObject({ dias: 1.5, salarioDia: 500, total: 750, nss: '01234567890' });
    expect(raya.filas.find((x) => x.colaboradorId === 'c3')).toMatchObject({ tipoPago: 'DESTAJO', total: 1800 });
  });

  test('el Excel se arma y el NSS conserva el cero a la izquierda', async () => {
    const buf = await construirExcelRaya(raya, { empresa: 'Mi empresa', periodo: 'sep 2026', conDatosImss: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Raya')!;
    const valores: unknown[] = [];
    ws.eachRow((r) => valores.push(r.getCell(9).value));
    expect(valores).toContain('01234567890');
    expect(wb.getWorksheet('Resumen por obra')).toBeTruthy();
  });

  test('sin permiso de datos IMSS, el Excel no lleva esas columnas', async () => {
    const buf = await construirExcelRaya(raya, { empresa: 'Mi empresa', periodo: 'sep 2026', conDatosImss: false });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const encabezados: unknown[] = [];
    wb.getWorksheet('Raya')!.getRow(4).eachCell((c) => encabezados.push(c.value));
    expect(encabezados).not.toContain('NSS');
    expect(encabezados).toContain('Total');
  });
});
