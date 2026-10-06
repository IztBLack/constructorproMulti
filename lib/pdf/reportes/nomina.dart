import 'dart:typed_data';

import 'package:pdf/widgets.dart' as pw;

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../domain/logic/nomina_calculator.dart';
import '../../domain/models/models.dart' as dom;
import '../kit/bloques.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Nómina ----------------
Future<Uint8List> generarNomina({
  required String obraNombre,
  required String rango,
  required NominaSummary summary,
  PdfConfig config = const PdfConfig(),
}) async {
  final color = hex(config.colorHex);
  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) => [
      header('Reporte de nómina semanal', 'Obra: $obraNombre\nSemana: $rango',
          config, color),
      pw.TableHelper.fromTextArray(
        border: null,
        headerDecoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: gris200))),
        headerStyle: pw.TextStyle(
            fontWeight: pw.FontWeight.bold, fontSize: 8, color: gris500),
        cellStyle: pw.TextStyle(fontSize: 9, color: gris700),
        oddRowDecoration: const pw.BoxDecoration(color: grisFondo),
        cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        cellAlignments: {4: pw.Alignment.centerRight},
        headers: ['Trabajador', 'Puesto', 'Tipo', 'Detalle', 'Total'],
        data: summary.items.map((it) {
          final esDia = it.colaborador.tipoPago == dom.TipoPago.dia;
          return [
            it.colaborador.nombre,
            it.puestoNombre,
            esDia ? 'Por día' : 'Destajo',
            esDia
                ? '${it.totalDias.toStringAsFixed(2)} días × ${Fmt.money(it.salarioBaseCalculado)}'
                : Fmt.money(it.totalDestajos),
            Fmt.money(it.totalPagar),
          ];
        }).toList(),
      ),
      pw.SizedBox(height: 10),
      totalLinea('Subtotal por día', summary.totalDia),
      totalLinea('Subtotal destajo', summary.totalDestajo),
      totalLinea('TOTAL NÓMINA', summary.totalNomina, bold: true, color: verde),
      firmas(config),
    ],
  ));
  return doc.save();
}
