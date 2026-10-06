import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/pdf/pdf_config.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Reporte GLOBAL de asistencias ----------------
Future<Uint8List> generarAsistenciasGlobal({
  required List<({String obra, List<({String trabajador, double dias})> filas})>
      datos,
  required String rango,
  PdfConfig config = const PdfConfig(),
}) async {
  final color = hex(config.colorHex);
  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) {
      final w = <pw.Widget>[
        header('Concentrado global de asistencias', 'Semana: $rango', config,
            color),
      ];
      for (final d in datos) {
        if (d.filas.isEmpty) continue;
        w.add(pw.Container(
          width: double.infinity,
          color: color,
          padding: const pw.EdgeInsets.all(6),
          margin: const pw.EdgeInsets.only(top: 8),
          child: pw.Text('OBRA: ${d.obra.toUpperCase()}',
              style: pw.TextStyle(
                  color: PdfColors.white,
                  fontWeight: pw.FontWeight.bold,
                  fontSize: 10)),
        ));
        w.add(pw.TableHelper.fromTextArray(
          border: null,
          headerDecoration: const pw.BoxDecoration(
              border: pw.Border(bottom: pw.BorderSide(color: gris200))),
          headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold, fontSize: 8, color: gris500),
          cellStyle: pw.TextStyle(fontSize: 8, color: gris700),
          oddRowDecoration: const pw.BoxDecoration(color: grisFondo),
          cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          cellAlignments: {1: pw.Alignment.centerRight},
          headers: ['Trabajador', 'Días trabajados'],
          data: d.filas
              .map((f) => [f.trabajador, f.dias.toStringAsFixed(2)])
              .toList(),
        ));
      }
      return w;
    },
  ));
  return doc.save();
}
