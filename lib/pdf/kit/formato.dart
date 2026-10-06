import '../../core/pdf/pdf_config.dart';

/// Cómo se ESCRIBE un dato antes de meterlo en un widget.
///
/// Son las dos funciones que convierten un valor en la cadena que se imprime,
/// sin saber nada de colores ni de layout. Van juntas y separadas del resto
/// porque un reporte puede necesitarlas sin dibujar nada del kit, y porque son
/// lo único aquí que se puede probar con un `expect` de una línea.
///
/// Es un detalle interno de `lib/pdf/`: nada fuera de esa carpeta debe importar
/// el kit.

/// Aplica la preferencia de MAYÚSCULAS del usuario a un texto de captura.
String u(String s, PdfConfig c) => c.mayusculas ? s.toUpperCase() : s;

String sinDecimalesInutiles(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);
