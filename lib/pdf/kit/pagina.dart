import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/pdf/pdf_config.dart';
import 'formato.dart';
import 'paleta.dart';

/// Lo que envuelve a CUALQUIER hoja: márgenes, marca de agua, encabezado y pie.
///
/// Van juntas porque las cuatro se pasan al mismo `pw.MultiPage` y porque las
/// cuatro se repiten idénticas en cada página; el contenido del reporte, en
/// cambio, fluye una sola vez. Si un día hay que cambiar el margen o el fondo,
/// se cambia aquí y ningún reporte se entera.
///
/// Es un detalle interno de `lib/pdf/`: nada fuera de esa carpeta debe importar
/// el kit.

// ---------------- Encabezado / tema / pie ----------------
/// Encabezado estilo web (`.doc-header`): a la izquierda el "kicker" (tipo de
/// documento, en el color de acento), el nombre de la empresa grande y su
/// contacto; a la derecha el subtítulo (obra/cliente/rango). Cierra con una
/// línea gruesa pizarra, no una banda de color — es el look de la web.
pw.Widget header(
    String titulo, String subtitulo, PdfConfig cfg, PdfColor color) {
  final logo = cfg.logoBytes;
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Container(
        padding: const pw.EdgeInsets.only(bottom: 12),
        decoration: const pw.BoxDecoration(
          border: pw.Border(bottom: pw.BorderSide(color: slate, width: 2)),
        ),
        child: pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            // Bloque emisor: kicker (acento) + empresa + contacto (o logo).
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(u(titulo, cfg).toUpperCase(),
                      style: pw.TextStyle(
                          color: color,
                          fontSize: 9,
                          fontWeight: pw.FontWeight.bold,
                          letterSpacing: 1.2)),
                  pw.SizedBox(height: 3),
                  if (logo != null)
                    pw.Container(
                        height: 38, child: pw.Image(pw.MemoryImage(logo)))
                  else
                    pw.Text(u(cfg.empresaNombre, cfg),
                        style: pw.TextStyle(
                            color: slate,
                            fontSize: 18,
                            fontWeight: pw.FontWeight.bold)),
                  if (cfg.empresaContacto.isNotEmpty)
                    pw.Padding(
                      padding: const pw.EdgeInsets.only(top: 2),
                      child: pw.Text(cfg.empresaContacto,
                          style:
                              const pw.TextStyle(fontSize: 9, color: gris500)),
                    ),
                ],
              ),
            ),
            // Subtítulo a la derecha (obra / cliente / semana).
            if (subtitulo.isNotEmpty)
              pw.Padding(
                padding: const pw.EdgeInsets.only(left: 16),
                child: pw.Text(subtitulo,
                    textAlign: pw.TextAlign.right,
                    style: const pw.TextStyle(fontSize: 10, color: gris700)),
              ),
          ],
        ),
      ),
      pw.SizedBox(height: 16),
    ],
  );
}

pw.PageTheme pageTheme(PdfConfig cfg) => pw.PageTheme(
      pageFormat: PdfPageFormat.letter,
      // Márgenes ~16mm/18mm como el `@page` de la web (en puntos: 1mm≈2.835pt).
      margin: cfg.modoCompacto
          ? const pw.EdgeInsets.all(28)
          : const pw.EdgeInsets.symmetric(horizontal: 51, vertical: 45),
      buildBackground: cfg.watermark.isEmpty
          ? null
          : (ctx) => pw.FullPage(
                ignoreMargins: true,
                child: pw.Center(
                  child: pw.Transform.rotate(
                    angle: 0.7,
                    child: pw.Opacity(
                      opacity: 0.10,
                      child: pw.Text(cfg.watermark,
                          style: pw.TextStyle(
                              fontSize: 90, fontWeight: pw.FontWeight.bold)),
                    ),
                  ),
                ),
              ),
    );

/// Tema de página para la PROYECCIÓN de nómina.
///
/// La marca de agua se impone aquí y NO sale de [PdfConfig.watermark]: este
/// documento no es la raya, y si alguien vacía la marca de agua en ajustes, un
/// escenario acabaría circulando como si fuera la nómina buena. Es el único
/// documento del proyecto que no respeta esa preferencia, y es a propósito.
///
/// El difuminado se consigue apilando la MISMA palabra varias veces con
/// desplazamientos de pocos puntos y opacidad muy baja: el paquete `pdf` no
/// tiene desenfoque gaussiano —no existe tal filtro en el modelo de dibujo de
/// PDF sin incrustar un grupo de transparencia—, y superponer copias corridas
/// produce el mismo halo suave con un costo de render trivial.
pw.PageTheme pageThemeProyeccion(PdfConfig cfg) {
  // Nueve capas: ocho alrededor formando el halo y una al centro, más opaca,
  // que sostiene la lectura de la palabra.
  const desplazamientos = <(double, double, double)>[
    (-6, -6, 0.020), (0, -7, 0.022), (6, -6, 0.020),
    (-7, 0, 0.022), (7, 0, 0.022),
    (-6, 6, 0.020), (0, 7, 0.022), (6, 6, 0.020),
    (0, 0, 0.055),
  ];

  return pw.PageTheme(
    pageFormat: PdfPageFormat.letter,
    margin: cfg.modoCompacto
        ? const pw.EdgeInsets.all(28)
        : const pw.EdgeInsets.symmetric(horizontal: 51, vertical: 45),
    buildBackground: (ctx) => pw.FullPage(
      ignoreMargins: true,
      child: pw.Center(
        child: pw.Transform.rotate(
          // ~35° hacia arriba: la diagonal clásica de un sello de borrador.
          angle: 0.61,
          child: pw.Stack(
            alignment: pw.Alignment.center,
            children: [
              for (final (dx, dy, opacidad) in desplazamientos)
                pw.Transform.translate(
                  offset: PdfPoint(dx, dy),
                  child: pw.Opacity(
                    opacity: opacidad,
                    child: pw.Text(
                      'PROYECCIÓN',
                      style: pw.TextStyle(
                        fontSize: 78,
                        fontWeight: pw.FontWeight.bold,
                        color: slate,
                        letterSpacing: 3,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

pw.Widget Function(pw.Context) footer(PdfConfig cfg) =>
    (ctx) => cfg.pieDePagina.isEmpty
        ? pw.SizedBox()
        : pw.Container(
            alignment: pw.Alignment.center,
            margin: const pw.EdgeInsets.only(top: 10),
            padding: const pw.EdgeInsets.only(top: 8),
            decoration: const pw.BoxDecoration(
              border: pw.Border(top: pw.BorderSide(color: gris200)),
            ),
            child: pw.Text(cfg.pieDePagina,
                style: const pw.TextStyle(fontSize: 9, color: gris400)),
          );
