import 'dart:typed_data';

import 'package:pdf/widgets.dart' as pw;

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../domain/logic/presupuesto_calculator.dart';
import '../kit/bloques.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Reporte GLOBAL de presupuestos ----------------
Future<Uint8List> generarPresupuestosGlobal({
  required List<({String proyecto, String cliente, PresupuestoTotales totales})>
      datos,
  PdfConfig config = const PdfConfig(),
}) async {
  final color = hex(config.colorHex);
  final granTotal = datos.fold<double>(0, (a, d) => a + d.totales.total);
  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) => [
      header('Concentrado global de presupuestos', 'Todas las cotizaciones',
          config, color),
      pw.TableHelper.fromTextArray(
        border: null,
        headerDecoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: gris200))),
        headerStyle: pw.TextStyle(
            fontWeight: pw.FontWeight.bold, fontSize: 8, color: gris500),
        cellStyle: pw.TextStyle(fontSize: 8, color: gris700),
        oddRowDecoration: const pw.BoxDecoration(color: grisFondo),
        cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        cellAlignments: {2: pw.Alignment.centerRight, 3: pw.Alignment.centerRight, 4: pw.Alignment.centerRight},
        headers: ['Proyecto', 'Cliente', 'Subtotal', 'IVA', 'Total'],
        data: datos
            .map((d) => [
                  d.proyecto, d.cliente,
                  Fmt.money(d.totales.subtotal),
                  Fmt.money(d.totales.iva),
                  Fmt.money(d.totales.total),
                ])
            .toList(),
      ),
      pw.SizedBox(height: 10),
      totalLinea('GRAN TOTAL', granTotal, bold: true, color: color),
    ],
  ));
  return doc.save();
}
