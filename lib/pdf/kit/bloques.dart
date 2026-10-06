import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import 'formato.dart';
import 'paleta.dart';

/// Los pedazos que un reporte apila DENTRO de la hoja.
///
/// Título de sección, subtotales, totales, párrafo final y firmas: todos son
/// widgets que el reporte mete en su lista de contenido, en el orden que
/// quiera. Están juntos porque comparten el mismo lenguaje visual de la web
/// (bordes, tamaños, alineación a la derecha) y porque cambiar uno sin mirar
/// los otros rompe la coherencia de la página.
///
/// Es un detalle interno de `lib/pdf/`: nada fuera de esa carpeta debe importar
/// el kit.

/// Título de sección estilo web (`.seccion-titulo`): barra de acento a la
/// izquierda + texto en mayúsculas. Disponible para los documentos que quieran
/// separar bloques con el mismo lenguaje visual de la web.
pw.Widget sectionTitle(String texto, PdfColor color) => pw.Container(
      margin: const pw.EdgeInsets.only(bottom: 6),
      padding: const pw.EdgeInsets.only(left: 8),
      decoration: pw.BoxDecoration(
        border: pw.Border(left: pw.BorderSide(color: color, width: 3)),
      ),
      child: pw.Text(texto.toUpperCase(),
          style: pw.TextStyle(
              fontSize: 10,
              fontWeight: pw.FontWeight.bold,
              color: slate,
              letterSpacing: 0.5)),
    );

/// Párrafo final de condiciones, arriba de las firmas y del pie de página.
///
/// Hasta ahora el móvil no lo imprimía y la web sí: el MISMO presupuesto
/// salía con condiciones o sin ellas según desde dónde se mandara. Se resuelve
/// con `textos_finales.dart`, que es el puerto del módulo de la web.
pw.Widget textoFinal(String texto) => pw.Padding(
      padding: const pw.EdgeInsets.only(top: 22),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Container(height: 1, color: PdfColors.grey300),
          pw.SizedBox(height: 8),
          pw.Text(
            texto,
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
          ),
        ],
      ),
    );

pw.Widget firmas(PdfConfig cfg) {
  final firma = cfg.firmaBytes;
  return pw.Padding(
    padding: const pw.EdgeInsets.only(top: 40),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceAround,
      children: [
        pw.Column(children: [
          if (firma != null)
            pw.Container(height: 40, child: pw.Image(pw.MemoryImage(firma))),
          pw.Container(width: 180, height: 1, color: PdfColors.black),
          pw.SizedBox(height: 4),
          pw.Text(u(cfg.firmaIzquierda, cfg),
              style: const pw.TextStyle(fontSize: 10)),
        ]),
        pw.Column(children: [
          pw.SizedBox(height: firma != null ? 40 : 0),
          pw.Container(width: 180, height: 1, color: PdfColors.black),
          pw.SizedBox(height: 4),
          pw.Text(u(cfg.firmaDerecha, cfg),
              style: const pw.TextStyle(fontSize: 10)),
        ]),
      ],
    ),
  );
}

/// Subtotal al pie de la tabla de una seccion. Alineado a la derecha y mas
/// discreto que `totalLinea`, que es para los totales del documento.
pw.Widget subtotalSeccion(double value) => pw.Container(
      alignment: pw.Alignment.centerRight,
      padding: const pw.EdgeInsets.only(top: 4, right: 6),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.end,
        children: [
          pw.Text('SUBTOTAL DE LA SECCION  ',
              style: pw.TextStyle(
                  fontSize: 7,
                  fontWeight: pw.FontWeight.bold,
                  color: gris500)),
          pw.Text(Fmt.money(value),
              style: pw.TextStyle(
                  fontSize: 9, fontWeight: pw.FontWeight.bold, color: slate)),
        ],
      ),
    );

/// Renglón de totales alineado a la derecha, estilo web (`.tot-fila` /
/// `.tot-total`). Las líneas normales van en gris con separador tenue; la línea
/// [bold] es el gran total, con borde superior pizarra y texto grande.
pw.Widget totalLinea(String label, double value,
    {bool bold = false, PdfColor? color}) {
  final fila = pw.Container(
    width: 300,
    padding: const pw.EdgeInsets.symmetric(vertical: 6),
    decoration: pw.BoxDecoration(
      border: bold
          ? const pw.Border(top: pw.BorderSide(color: slate, width: 2))
          : const pw.Border(bottom: pw.BorderSide(color: gris100)),
    ),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(label,
            style: pw.TextStyle(
                fontSize: bold ? 13 : 11,
                fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
                color: bold ? slate : gris500)),
        pw.Text(Fmt.money(value),
            style: pw.TextStyle(
                fontSize: bold ? 13 : 11,
                fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
                color: color ?? slate)),
      ],
    ),
  );
  // El bloque de totales se alinea a la derecha, como en la web.
  return pw.Align(alignment: pw.Alignment.centerRight, child: fila);
}
