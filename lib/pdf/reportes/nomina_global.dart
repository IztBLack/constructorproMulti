import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../domain/logic/nomina_calculator.dart';
import '../../domain/models/models.dart' as dom;
import '../kit/bloques.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Reporte GLOBAL de nómina ----------------
Future<Uint8List> generarNominaGlobal({
  required List<({String obra, NominaSummary summary})> datos,
  required String rango,
  PdfConfig config = const PdfConfig(),
}) async {
  final color = hex(config.colorHex);
  final doc = pw.Document();
  var granTotal = 0.0;
  for (final d in datos) {
    granTotal += d.summary.totalNomina;
  }
  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) {
      final w = <pw.Widget>[
        header('Concentrado global de nómina', 'Semana: $rango', config, color),
      ];
      for (final d in datos) {
        if (d.summary.items.isEmpty) continue;
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
          cellAlignments: {3: pw.Alignment.centerRight},
          headers: ['Trabajador', 'Puesto', 'Tipo', 'Total'],
          data: d.summary.items
              .map((it) => [
                    it.colaborador.nombre,
                    it.puestoNombre,
                    it.colaborador.tipoPago == dom.TipoPago.dia
                        ? 'Día'
                        : 'Destajo',
                    Fmt.money(it.totalPagar),
                  ])
              .toList(),
        ));
        w.add(totalLinea('Subtotal ${d.obra}', d.summary.totalNomina));
      }
      w.add(pw.SizedBox(height: 10));
      w.add(totalLinea('GRAN TOTAL NÓMINA', granTotal,
          bold: true, color: verde));
      return w;
    },
  ));
  return doc.save();
}
