import { leerDeLista, leerTexto, type FuenteFormData } from '@/lib/validacion/campos';

/// Lectura y validación del formulario de una cuadrilla.
///
/// Vive FUERA de `actions.ts` porque aquel archivo lleva `'use server'` y un
/// módulo de servidor sólo puede exportar funciones `async`.

const ESPECIALIDAD_VALS: readonly string[] = [
  'ALBANILERIA',
  'ACERO',
  'CIMBRA',
  'INSTALACIONES',
  'ACABADOS',
  'MIXTA',
];

/// Lee nombre y especialidad del formulario de una cuadrilla.
///
/// Exportada y pura para poder probarla sin sesión ni base.
///
/// LO QUE CIERRA. `normalizaEspecialidad` devolvía 'MIXTA' ante CUALQUIER valor
/// que no reconociera. Un `<select>` manipulado, o un valor que se quedó atrás
/// tras renombrar una especialidad, se guardaba como mixta sin un solo aviso, y
/// después nadie sabía explicar por qué esa cuadrilla de acero figuraba como
/// mixta. Ausente sigue siendo 'MIXTA' —es el valor por omisión legítimo del
/// formulario—; PRESENTE y desconocido ahora es un error.
export function parseCuadrillaFormData(
  formData: FuenteFormData,
): { nombre: string; especialidad: string } | { error: string } {
  const nombre = leerTexto(formData, 'nombre', {
    mensaje: 'El nombre de la cuadrilla es obligatorio.',
  });
  if (!nombre.ok) return { error: nombre.error };

  const especialidad = leerDeLista(formData, 'especialidad', ESPECIALIDAD_VALS, {
    etiqueta: 'La especialidad',
    porDefecto: 'MIXTA',
  });
  if (!especialidad.ok) return { error: especialidad.error };

  return { nombre: nombre.valor, especialidad: especialidad.valor };
}
