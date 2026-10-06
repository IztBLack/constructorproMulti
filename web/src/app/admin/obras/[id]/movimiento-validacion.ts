import type { MovimientoInput } from '@/lib/data/obras';
import type { TipoMovimiento } from '@/lib/data/types';
import {
  leerDeLista,
  leerFecha,
  leerNumero,
  leerTexto,
  leerTextoOpcional,
  type FuenteFormData,
} from '@/lib/validacion/campos';

/// Lectura y validación del formulario de un movimiento de caja.
///
/// Vive FUERA de `actions.ts` porque aquel archivo lleva `'use server'`, y un
/// módulo de servidor sólo puede exportar funciones `async`: son puntos de
/// entrada remotos, no un sitio donde guardar utilidades. Sacarlo aquí es
/// además lo que permite probarlo sin sesión ni base.

const TIPOS_VALIDOS: readonly TipoMovimiento[] = ['ENTRADA', 'SALIDA'] as const;

/// Lee y valida el formulario de un movimiento de caja.
///
/// Exportada —y pura, sin sesión ni base— para poder probarla: es dinero, y
/// hasta ahora lo único que la separaba de la base era un `Number()`.
///
/// LO QUE ESTO CIERRA. La fecha se leía con `fechaInputAMs`, que ante una
/// cadena imposible NO falla: deja que `Date.UTC` normalice. Un '2025-13-45'
/// —que se teclea sin querer más de lo que parece— se guardaba en silencio como
/// una fecha de 2026, y el movimiento aparecía en el mes equivocado sin que
/// nadie pudiera explicar por qué. `leerFecha` comprueba que el día que sale
/// sea el que se pidió.
///
/// El resto de las reglas son las que ya había, dichas con los mismos mensajes:
/// tipo de una lista cerrada, concepto obligatorio y monto mayor que cero.
export function parseMovimientoFormData(
  formData: FuenteFormData,
  obraId: string,
): { input: MovimientoInput } | { error: string } {
  const tipo = leerDeLista(formData, 'tipo', TIPOS_VALIDOS, {
    mensaje: 'El tipo de movimiento no es válido.',
  });
  if (!tipo.ok) return { error: tipo.error };

  const concepto = leerTexto(formData, 'concepto', { etiqueta: 'El concepto' });
  if (!concepto.ok) return { error: concepto.error };

  const monto = leerNumero(formData, 'monto', {
    min: 0,
    minEstricto: true,
    mensaje: 'El monto debe ser un número mayor a cero.',
  });
  if (!monto.ok) return { error: monto.error };

  // Sin fecha, hoy: es el comportamiento que ya tenía el formulario, y el que
  // espera quien captura un gasto en el momento.
  const fecha = leerFecha(formData, 'fecha', {
    porDefecto: Date.now,
    mensaje: 'La fecha no es válida.',
  });
  if (!fecha.ok) return { error: fecha.error };

  const categoria = leerTextoOpcional(formData, 'categoria');
  const metodoPago = leerTextoOpcional(formData, 'metodo_pago');
  const referencia = leerTextoOpcional(formData, 'referencia');
  const nombre = leerTextoOpcional(formData, 'nombre');
  // Los cuatro son texto libre opcional: no pueden fallar, pero el tipo obliga
  // a mirarlo igual, así que se resuelven de una vez.
  for (const campo of [categoria, metodoPago, referencia, nombre]) {
    if (!campo.ok) return { error: campo.error };
  }

  return {
    input: {
      obraId,
      fecha: fecha.valor,
      tipo: tipo.valor,
      categoria: categoria.ok ? categoria.valor : '',
      concepto: concepto.valor,
      monto: monto.valor,
      metodoPago: metodoPago.ok ? metodoPago.valor : '',
      referencia: referencia.ok ? referencia.valor : '',
      nombre: nombre.ok ? nombre.valor : '',
    },
  };
}
