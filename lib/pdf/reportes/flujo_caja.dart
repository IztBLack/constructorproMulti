import 'dart:typed_data';

import 'package:pdf/widgets.dart' as pw;

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../domain/logic/flujo_calculator.dart';
import '../kit/bloques.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Flujo de caja ----------------
Future<Uint8List> generarFlujoCaja({
  required String obraNombre,
  required List<Movimiento> movimientos,
  required ResumenCaja resumen,
  PdfConfig config = const PdfConfig(),
}) async {
  final color = hex(config.colorHex);
  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) => [
      header('Reporte de flujo de caja', 'Obra: $obraNombre', config, color),
      pw.TableHelper.fromTextArray(
        border: null,
        headerDecoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: gris200))),
        headerStyle: pw.TextStyle(
            fontWeight: pw.FontWeight.bold, fontSize: 8, color: gris500),
        cellStyle: pw.TextStyle(fontSize: 9, color: gris700),
        oddRowDecoration: const pw.BoxDecoration(color: grisFondo),
        cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        cellAlignments: {5: pw.Alignment.centerRight},
        headers: ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Método', 'Monto'],
        data: movimientos
            .map((m) => [
                  Fmt.date(m.fecha), m.tipo, m.categoria.replaceAll('_', ' '),
                  m.concepto, m.metodoPago,
                  '${m.tipo == 'ENTRADA' ? '+' : '-'}${Fmt.money(m.monto)}',
                ])
            .toList(),
      ),
      pw.SizedBox(height: 10),
      totalLinea('Total entradas', resumen.totalEntradas, color: verde),
      totalLinea('Total salidas', resumen.totalSalidas, color: rojo),
      totalLinea('SALDO DISPONIBLE', resumen.saldo,
          bold: true, color: resumen.saldo >= 0 ? verde : rojo),
    ],
  ));
  return doc.save();
}
