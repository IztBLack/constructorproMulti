import 'package:pdf/pdf.dart';

/// Los COLORES de los PDF y nada más.
///
/// Viven aparte porque son el único punto donde se decide "de qué color se ve
/// un documento": si mañana la web cambia un hex, se toca este archivo y todos
/// los reportes cambian con él. Mezclarlos con widgets obligaría a abrir un
/// archivo de layout para corregir un color.
///
/// Es un detalle interno de `lib/pdf/`: nada fuera de esa carpeta debe importar
/// el kit.

// Paleta portada 1:1 del PDF de la web (`web/src/lib/pdf/documento-base.ts`):
// pizarra casi-negra para texto fuerte, grises para etiquetas/bordes, y verde/
// rojo con los MISMOS hex que la web para que ambos documentos se vean iguales.
const slate = PdfColor.fromInt(0xFF0F172A); // texto fuerte
const gris700 = PdfColor.fromInt(0xFF404040); // texto normal
const gris500 = PdfColor.fromInt(0xFF737373); // etiquetas
const gris400 = PdfColor.fromInt(0xFFA3A3A3); // apagado
const gris200 = PdfColor.fromInt(0xFFE5E5E5); // bordes
const gris100 = PdfColor.fromInt(0xFFF1F1F1); // borde de fila
const grisFondo = PdfColor.fromInt(0xFFFAFAFA); // relleno tenue
const verde = PdfColor.fromInt(0xFF16A34A);
const rojo = PdfColor.fromInt(0xFFDC2626);

PdfColor hex(String hex) {
  var h = hex.replaceAll('#', '').trim();
  if (h.length == 6) h = 'FF$h';
  return PdfColor.fromInt(int.tryParse(h, radix: 16) ?? 0xFF1A3A5C);
}
