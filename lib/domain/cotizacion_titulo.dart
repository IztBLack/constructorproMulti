/// Rótulo de una cotización para LISTAS Y ENCABEZADOS de la app.
///
/// El nombre del proyecto y el cliente son opcionales: hay presupuestos que se
/// hacen sin más dato que el lugar. En el DOCUMENTO impreso un campo vacío se
/// deja vacío, pero un título vacío en pantalla se ve como pantalla rota. Por
/// eso aquí sí hay respaldo, en cascada de lo más específico a lo más genérico.
///
/// Port 1:1 de la web (`web/src/lib/cotizacion/titulo.ts`).
String tituloCotizacion({
  String nombreProyecto = '',
  String ubicacion = '',
  String cliente = '',
}) {
  for (final v in [nombreProyecto, ubicacion, cliente]) {
    final t = v.trim();
    if (t.isNotEmpty) return t;
  }
  return 'Cotización sin nombre';
}
