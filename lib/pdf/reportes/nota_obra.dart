import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../core/pdf/textos_finales.dart';
import '../../data/repositories_nota_obra.dart';
import '../../domain/logic/notas_obra_calculo.dart';
import '../kit/bloques.dart';
import '../kit/formato.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Nota de obra (trato con un socio) ----------------

/// La cuenta de un trato de palabra, para mandarla por WhatsApp a alguien que
/// no tiene acceso al sistema.
///
/// Imita a propósito la tabla de dos columnas que el dueño hacía en Word —que
/// es lo que sus socios ya saben leer— pero con el encabezado y los totales
/// del resto de los documentos. Gemelo de `documento-nota-html.ts`.
Future<Uint8List> generarNotaObra({
  required NotaConRenglones nota,
  required String obraNombre,
  PdfConfig config = const PdfConfig(),
  Map<TipoDocumento, String> textosEmpresa = const {},
}) async {
  final color = hex(config.colorHex);
  final t = nota.totales;
  final n = nota.nota;
  final liquidada = estadoNotaDeCadena(n.estado) == EstadoNota.liquidada;
  final doc = pw.Document();

  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) {
      final widgets = <pw.Widget>[
        header(
          'Nota de trabajos',
          [
            'Para: ${n.destinatario.isEmpty ? '—' : n.destinatario}',
            'Obra: $obraNombre',
            if (n.titulo.isNotEmpty) 'Referencia: ${n.titulo}',
            'Fecha: ${Fmt.date(n.fecha)}',
          ].join('\n'),
          config,
          color,
        ),
        pw.SizedBox(height: 12),
      ];

      if (nota.renglones.isEmpty) {
        widgets.add(pw.Text('Esta nota todavía no tiene renglones.',
            style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey600)));
      } else {
        widgets.add(pw.TableHelper.fromTextArray(
          headers: const ['Concepto', 'Detalle', 'Importe'],
          headerStyle: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold),
          cellStyle: const pw.TextStyle(fontSize: 9),
          headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
          cellAlignments: {2: pw.Alignment.centerRight},
          columnWidths: {
            0: const pw.FlexColumnWidth(3),
            1: const pw.FlexColumnWidth(4),
            2: const pw.FlexColumnWidth(2),
          },
          data: nota.renglones.map((r) {
            final tipo = tipoRenglonDeCadena(r.tipo);
            final calc = RenglonCalc(
              tipo: tipo,
              monto: r.monto,
              montoBase: r.montoBase,
              porcentaje: r.porcentaje,
            );
            final detalle = <String>[
              if (r.fecha != null) Fmt.date(r.fecha!),
              if (r.texto.isNotEmpty) r.texto,
              if (r.montoBase != null)
                '${Fmt.money(r.montoBase!)}'
                    '${r.porcentaje != null ? ' - ${r.porcentaje!.toStringAsFixed(0)}%' : ''}'
                    ' = ${Fmt.money(montoEfectivo(calc))}',
            ];
            final negativo =
                tipo == TipoRenglon.deduccion || tipo == TipoRenglon.pago;
            return [
              u(r.etiqueta, config),
              detalle.join(' · '),
              // Un apunte no lleva importe: es texto de la nota, no dinero.
              tipo == TipoRenglon.texto
                  ? ''
                  : '${negativo ? '-' : ''}${Fmt.money(montoEfectivo(calc))}',
            ];
          }).toList(),
        ));
      }

      widgets.add(pw.SizedBox(height: 10));
      widgets.add(totalLinea('Suma de conceptos', t.subtotal));
      if (t.deducciones > 0) {
        widgets.add(totalLinea('Deducciones', -t.deducciones));
      }
      // Si el total se fijó a mano se imprime también el calculado: el socio
      // tiene derecho a ver de dónde sale el número, y en una cuenta de
      // palabra esa diferencia es justo lo que hay que explicar de frente.
      if (t.totalFijado) {
        widgets.add(totalLinea('Suma de los renglones', t.totalCalculado));
      }
      widgets.add(totalLinea('Total acordado', t.total, bold: true));
      widgets.add(totalLinea('Pagado', -t.pagado));
      if (t.saldoFijado) {
        widgets.add(totalLinea('Diferencia aritmética', t.saldoCalculado));
      }
      widgets.add(totalLinea('SALDO', t.saldo, bold: true, color: color));

      if (liquidada) {
        widgets.add(pw.Padding(
          padding: const pw.EdgeInsets.only(top: 14),
          child: pw.Container(
            padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.green700, width: 1.5),
              borderRadius: pw.BorderRadius.circular(4),
            ),
            child: pw.Text('LIQUIDADO',
                style: pw.TextStyle(
                    fontSize: 11,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColors.green700)),
          ),
        ));
      }

      if (n.notas.isNotEmpty) {
        widgets.add(pw.SizedBox(height: 14));
        widgets.add(
            pw.Text(u(n.notas, config), style: const pw.TextStyle(fontSize: 9)));
      }

      widgets.add(textoFinal(resolverTextoFinal(
        tipo: TipoDocumento.nota,
        documento: n.textoFinal,
        textosEmpresa: textosEmpresa,
        ctx: ContextoTextoFinal(
          nombreEmpresa: config.empresaNombre,
          destinatario: n.destinatario,
        ),
      )));

      return widgets;
    },
  ));

  return doc.save();
}
