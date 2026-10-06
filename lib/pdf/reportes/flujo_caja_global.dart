import 'dart:typed_data';

import 'package:pdf/widgets.dart' as pw;

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../domain/logic/flujo_calculator.dart';
import '../kit/bloques.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Reporte GLOBAL de flujo de caja ----------------
Future<Uint8List> generarFlujoCajaGlobal({
  required List<({String obra, ResumenCaja resumen})> porObra,
  required ResumenCaja global,
  PdfConfig config = const PdfConfig(),
}) async {
  final color = hex(config.colorHex);
  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) => [
      header('Concentrado global de flujo de caja', 'Todas las obras', config,
          color),
      pw.TableHelper.fromTextArray(
        border: null,
        headerDecoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: gris200))),
        headerStyle: pw.TextStyle(
            fontWeight: pw.FontWeight.bold, fontSize: 8, color: gris500),
        cellStyle: pw.TextStyle(fontSize: 9, color: gris700),
        oddRowDecoration: const pw.BoxDecoration(color: grisFondo),
        cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        cellAlignments: {1: pw.Alignment.centerRight, 2: pw.Alignment.centerRight, 3: pw.Alignment.centerRight},
        headers: ['Obra', 'Ingresos', 'Egresos', 'Saldo'],
        data: porObra
            .map((r) => [
                  r.obra,
                  Fmt.money(r.resumen.totalEntradas),
                  Fmt.money(r.resumen.totalSalidas),
                  Fmt.money(r.resumen.saldo),
                ])
            .toList(),
      ),
      pw.SizedBox(height: 10),
      totalLinea('Total ingresos', global.totalEntradas, color: verde),
      totalLinea('Total egresos', global.totalSalidas, color: rojo),
      totalLinea('SALDO GLOBAL', global.saldo,
          bold: true, color: global.saldo >= 0 ? verde : rojo),
    ],
  ));
  return doc.save();
}
