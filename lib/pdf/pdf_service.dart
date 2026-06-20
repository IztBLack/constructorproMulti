import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/db/app_database.dart';
import '../core/format/format.dart';
import '../domain/logic/flujo_calculator.dart';
import '../domain/logic/nomina_calculator.dart';
import '../domain/logic/presupuesto_calculator.dart';
import '../domain/models/models.dart' as dom;

/// Genera los reportes PDF de la app (equivalente a PdfGenerator.kt, con el
/// paquete `pdf`). Devuelve bytes listos para compartir/imprimir con `printing`.
class PdfService {
  static const _azul = PdfColor.fromInt(0xFF1A3A5C);
  static const _verde = PdfColor.fromInt(0xFF2E7D32);
  static const _rojo = PdfColor.fromInt(0xFFC62828);

  // ---------------- Encabezado común ----------------
  static pw.Widget _header(String titulo, String subtitulo) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.all(12),
            color: _azul,
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text('ConstructorPro',
                    style: pw.TextStyle(
                        color: PdfColors.white,
                        fontSize: 18,
                        fontWeight: pw.FontWeight.bold)),
                pw.Text(titulo,
                    style: const pw.TextStyle(color: PdfColors.white, fontSize: 12)),
              ],
            ),
          ),
          pw.SizedBox(height: 6),
          pw.Text(subtitulo, style: const pw.TextStyle(fontSize: 11)),
          pw.Divider(),
        ],
      );

  static pw.Widget _firmas() => pw.Padding(
        padding: const pw.EdgeInsets.only(top: 40),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceAround,
          children: [
            _firma('Autorizado por Obra'),
            _firma('Aceptado por Cliente'),
          ],
        ),
      );

  static pw.Widget _firma(String texto) => pw.Column(children: [
        pw.Container(width: 180, height: 1, color: PdfColors.black),
        pw.SizedBox(height: 4),
        pw.Text(texto, style: const pw.TextStyle(fontSize: 10)),
      ]);

  // ---------------- Nómina ----------------
  static Future<Uint8List> nomina({
    required String obraNombre,
    required String rango,
    required NominaSummary summary,
  }) async {
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.letter,
      build: (context) => [
        _header('Reporte de nómina semanal', 'Obra: $obraNombre\nSemana: $rango'),
        pw.TableHelper.fromTextArray(
          headerDecoration: const pw.BoxDecoration(color: _azul),
          headerStyle: pw.TextStyle(
              color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 9),
          cellStyle: const pw.TextStyle(fontSize: 9),
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
        _totalLinea('Subtotal por día', summary.totalDia),
        _totalLinea('Subtotal destajo', summary.totalDestajo),
        _totalLinea('TOTAL NÓMINA', summary.totalNomina, bold: true, color: _verde),
        _firmas(),
      ],
    ));
    return doc.save();
  }

  // ---------------- Presupuesto ----------------
  static Future<Uint8List> presupuesto({
    required Cotizacion cot,
    required List<Seccion> secciones,
    required List<Partida> partidas,
    required PresupuestoTotales totales,
    required bool iva,
    Map<String, double> aportadoPorPartida = const {},
  }) async {
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.letter,
      build: (context) {
        final widgets = <pw.Widget>[
          _header('Presupuesto', 'Proyecto: ${cot.nombreProyecto}\nCliente: ${cot.cliente}'),
        ];
        for (final s in secciones) {
          final pts = partidas.where((p) => p.seccionId == s.id).toList();
          if (pts.isEmpty) continue;
          widgets.add(pw.Padding(
            padding: const pw.EdgeInsets.only(top: 8, bottom: 4),
            child: pw.Text(s.nombre,
                style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11)),
          ));
          final tieneAvance = aportadoPorPartida.isNotEmpty;
          widgets.add(pw.TableHelper.fromTextArray(
            headerDecoration: const pw.BoxDecoration(color: PdfColors.grey300),
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 8),
            cellStyle: const pw.TextStyle(fontSize: 8),
            cellAlignments: {
              3: pw.Alignment.centerRight,
              4: pw.Alignment.centerRight,
              5: pw.Alignment.centerRight,
              6: pw.Alignment.centerRight,
              7: pw.Alignment.centerRight,
            },
            headers: [
              'Clave', 'Descripción', 'Unidad', 'Cant.', 'P.U.', 'Importe',
              if (tieneAvance) 'Aportado',
              if (tieneAvance) '%',
            ],
            data: pts.map((p) {
              final importe = p.cantidad * p.precioUnitario;
              final aportado = aportadoPorPartida[p.id] ?? 0;
              final pct = importe > 0 ? aportado / importe * 100 : 0;
              return [
                p.clave,
                p.descripcion,
                p.unidad,
                p.cantidad.toString(),
                Fmt.money(p.precioUnitario),
                Fmt.money(importe),
                if (tieneAvance) Fmt.money(aportado),
                if (tieneAvance) '${pct.toStringAsFixed(0)}%',
              ];
            }).toList(),
          ));
        }
        widgets.add(pw.SizedBox(height: 10));
        widgets.add(_totalLinea('Subtotal', totales.subtotal));
        if (iva) widgets.add(_totalLinea('IVA 16%', totales.iva));
        widgets.add(_totalLinea('TOTAL', totales.total, bold: true, color: _azul));
        widgets.add(_firmas());
        return widgets;
      },
    ));
    return doc.save();
  }

  // ---------------- Flujo de caja ----------------
  static Future<Uint8List> flujoCaja({
    required String obraNombre,
    required List<Movimiento> movimientos,
    required ResumenCaja resumen,
  }) async {
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.letter,
      build: (context) => [
        _header('Reporte de flujo de caja', 'Obra: $obraNombre'),
        pw.TableHelper.fromTextArray(
          headerDecoration: const pw.BoxDecoration(color: _azul),
          headerStyle: pw.TextStyle(
              color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 9),
          cellStyle: const pw.TextStyle(fontSize: 9),
          cellAlignments: {5: pw.Alignment.centerRight},
          headers: ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Método', 'Monto'],
          data: movimientos
              .map((m) => [
                    Fmt.date(m.fecha),
                    m.tipo,
                    m.categoria.replaceAll('_', ' '),
                    m.concepto,
                    m.metodoPago,
                    '${m.tipo == 'ENTRADA' ? '+' : '-'}${Fmt.money(m.monto)}',
                  ])
              .toList(),
        ),
        pw.SizedBox(height: 10),
        _totalLinea('Total entradas', resumen.totalEntradas, color: _verde),
        _totalLinea('Total salidas', resumen.totalSalidas, color: _rojo),
        _totalLinea('SALDO DISPONIBLE', resumen.saldo,
            bold: true, color: resumen.saldo >= 0 ? _verde : _rojo),
      ],
    ));
    return doc.save();
  }

  static pw.Widget _totalLinea(String label, double value,
          {bool bold = false, PdfColor? color}) =>
      pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 2),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.end,
          children: [
            pw.Text('$label:  ',
                style: pw.TextStyle(
                    fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
                    fontSize: bold ? 12 : 10)),
            pw.SizedBox(
              width: 110,
              child: pw.Text(Fmt.money(value),
                  textAlign: pw.TextAlign.right,
                  style: pw.TextStyle(
                      fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
                      fontSize: bold ? 12 : 10,
                      color: color)),
            ),
          ],
        ),
      );
}
