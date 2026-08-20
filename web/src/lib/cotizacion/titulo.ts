/**
 * Rótulo de una cotización para LISTAS Y ENCABEZADOS de la app.
 *
 * El nombre del proyecto y el cliente son opcionales: hay presupuestos que se
 * hacen sin más dato que el lugar. En el DOCUMENTO impreso un campo vacío se
 * deja vacío —así lo pidió el usuario y así lo hace `documento-html.ts`—, pero
 * un título vacío en pantalla se ve como pantalla rota y deja enlaces sin texto
 * en los que no se puede hacer clic. Por eso aquí sí hay respaldo, en cascada de
 * lo más específico a lo más genérico.
 *
 * Port 1:1 del móvil (`lib/domain/cotizacion_titulo.dart`).
 */
export function tituloCotizacion(c: {
  nombre_proyecto?: string | null;
  ubicacion?: string | null;
  cliente?: string | null;
}): string {
  return (
    c.nombre_proyecto?.trim() ||
    c.ubicacion?.trim() ||
    c.cliente?.trim() ||
    'Cotización sin nombre'
  );
}
