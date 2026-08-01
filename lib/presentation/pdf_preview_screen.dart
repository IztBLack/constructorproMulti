import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:printing/printing.dart';

/// Vista previa del PDF antes de compartirlo/imprimirlo, como en la web.
///
/// Antes el móvil abría directo la hoja de "compartir" del sistema con los bytes
/// ya generados: no había forma de VER el documento antes de mandarlo. Esta
/// pantalla lo muestra renderizado (`PdfPreview` del paquete `printing`, que ya
/// trae los botones de compartir e imprimir), así el usuario revisa que el
/// documento salió bien —y qué le va a llegar al cliente— antes de enviarlo.
class PdfPreviewScreen extends StatelessWidget {
  const PdfPreviewScreen({
    super.key,
    required this.bytes,
    required this.titulo,
    required this.filename,
  });

  final Uint8List bytes;
  final String titulo;

  /// Nombre con el que se comparte/descarga el archivo.
  final String filename;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(titulo)),
      body: PdfPreview(
        // Los bytes ya están generados; `build` solo los entrega al visor.
        build: (_) => bytes,
        pdfFileName: filename,
        // Es un documento ya armado: no tiene sentido cambiar tamaño/orientación
        // ni el menú de depuración. Se dejan compartir e imprimir.
        canChangePageFormat: false,
        canChangeOrientation: false,
        canDebug: false,
        // El botón de compartir del visor abre la hoja del sistema (WhatsApp,
        // correo, etc.) — la misma vía de antes, ahora tras la previsualización.
        useActions: true,
      ),
    );
  }
}
