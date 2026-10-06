import type { PeriodoPago } from '@/lib/data/types';
import { salarioDiarioDesdePeriodo } from '@/lib/data/salario';
import {
  leerDeLista,
  leerNumeroOpcional,
  type FuenteFormData,
} from '@/lib/validacion/campos';
import { invalido, valido, type Resultado } from '@/lib/validacion/resultado';

/// Lectura y validación del sueldo capturado en el formulario de un colaborador.
///
/// Vive FUERA de `actions.ts` porque aquel archivo lleva `'use server'` y un
/// módulo de servidor sólo puede exportar funciones `async`.

export interface SueldoCapturado {
  periodoPago: PeriodoPago;
  salarioPeriodo: number | null;
  diasSemana: number;
  salarioDiario: number | null;
}

const PERIODOS: readonly PeriodoPago[] = ['SEMANAL', 'QUINCENAL', 'MENSUAL'] as const;
const DIAS_SEMANA_VALIDOS: readonly string[] = ['5', '6', '7'] as const;

/// Lee el sueldo del formulario y deriva el salario diario que consume la
/// nómina. Exportada y pura para poder probarla sin sesión ni base.
///
/// EL AGUJERO QUE ESTO CIERRA. La versión anterior no rechazaba nada: caía a un
/// valor por omisión ante cualquier basura. Un periodo desconocido se guardaba
/// como MENSUAL, unos días/semana raros como 6, y —lo grave— **un monto mal
/// escrito se convertía en `null`, que es la forma de BORRAR el sueldo**. O
/// sea: teclear "1,500" en el sueldo de alguien no daba ningún error; le
/// quitaba el sueldo. Y como el diario se deriva de ahí, su siguiente raya
/// salía en ceros.
///
/// Ahora un valor ausente sigue significando "sin sueldo propio" —que es una
/// intención legítima y hay que poder expresarla— pero un valor PRESENTE y mal
/// escrito es un error que se le enseña a quien lo capturó.
export function derivarSueldo(formData: FuenteFormData): Resultado<SueldoCapturado> {
  const periodo = leerDeLista(formData, 'periodo_pago', PERIODOS, {
    etiqueta: 'El periodo de pago',
    porDefecto: 'MENSUAL',
  });
  if (!periodo.ok) return invalido(periodo.error);

  const dias = leerDeLista(formData, 'dias_semana', DIAS_SEMANA_VALIDOS, {
    mensaje: 'Los días por semana deben ser 5, 6 o 7.',
    porDefecto: '6',
  });
  if (!dias.ok) return invalido(dias.error);
  const diasSemana = Number(dias.valor);

  // Vacío = null a propósito: es como se borra un sueldo, y la fila se guarda
  // igual para que ese borrado se propague al móvil por el sync.
  const monto = leerNumeroOpcional(formData, 'salario_periodo', {
    min: 0,
    minEstricto: true,
    mensaje: 'El sueldo debe ser un número mayor a cero.',
  });
  if (!monto.ok) return invalido(monto.error);

  return valido({
    periodoPago: periodo.valor,
    salarioPeriodo: monto.valor,
    diasSemana,
    salarioDiario: salarioDiarioDesdePeriodo(monto.valor, periodo.valor, diasSemana),
  });
}
