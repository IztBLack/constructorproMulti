import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/db/app_database.dart';
import '../core/format/format.dart';
import '../core/pdf/pdf_config.dart';
import '../domain/logic/flujo_calculator.dart';
import '../domain/logic/nomina_calculator.dart';
import '../domain/logic/presupuesto_calculator.dart';
import '../domain/models/models.dart' as dom;

/// Genera los reportes PDF (equivalente a PdfGenerator.kt, con el paquete `pdf`),
/// con personalización (empresa, color, logo, marca de agua, pie).
class PdfService {
  static const _verde = PdfColor.fromInt(0xFF2E7D32);
  static const _rojo = PdfColor.fromInt(0xFFC62828);

  static PdfColor _hex(String hex) {
    var h = hex.replaceAll('#', '').trim();
    if (h.length == 6) h = 'FF$h';
    return PdfColor.fromInt(int.tryParse(h, radix: 16) ?? 0xFF1A3A5C);
  }

  static String _u(String s, PdfConfig c) => c.mayusculas ? s.toUpperCase() : s;

  // ---------------- Encabezado / tema / pie ----------------
  static pw.Widget _header(String titulo, String subtitulo, PdfConfig cfg, PdfColor color) {
    final logo = cfg.logoBytes;
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Container(
          width: double.infinity,
          padding: const pw.EdgeInsets.all(12),
          color: color,
          child: pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.center,
            children: [
              if (logo != null)
                pw.Container(
                    height: 42, margin: const pw.EdgeInsets.only(right: 12),
                    child: pw.Image(pw.MemoryImage(logo)))
              else
                pw.Text(_u(cfg.empresaNombre, cfg),
                    style: pw.TextStyle(
                        color: PdfColors.white, fontSize: 18, fontWeight: pw.FontWeight.bold)),
              pw.Spacer(),
              pw.Text(_u(titulo, cfg),
                  style: const pw.TextStyle(color: PdfColors.white, fontSize: 12)),
            ],
          ),
        ),
        if (cfg.empresaContacto.isNotEmpty)
          pw.Padding(
            padding: const pw.EdgeInsets.only(top: 4),
            child: pw.Text(cfg.empresaContacto, style: const pw.TextStyle(fontSize: 9)),
          ),
        pw.SizedBox(height: 6),
        pw.Text(subtitulo, style: const pw.TextStyle(fontSize: 11)),
        pw.Divider(),
      ],
    );
  }

  static pw.PageTheme _pageTheme(PdfConfig cfg) => pw.PageTheme(
        pageFormat: PdfPageFormat.letter,
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

  static pw.Widget Function(pw.Context) _footer(PdfConfig cfg) => (ctx) => cfg.pieDePagina.isEmpty
      ? pw.SizedBox()
      : pw.Container(
          alignment: pw.Alignment.center,
          margin: const pw.EdgeInsets.only(top: 8),
          child: pw.Text(cfg.pieDePagina,
              style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey)),
        );

  static pw.Widget _firmas(PdfConfig cfg) {
    final firma = cfg.firmaBytes;
    return pw.Padding(
      padding: const pw.EdgeInsets.only(top: 40),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceAround,
        children: [
          pw.Column(children: [
            if (firma != null) pw.Container(height: 40, child: pw.Image(pw.MemoryImage(firma))),
            pw.Container(width: 180, height: 1, color: PdfColors.black),
            pw.SizedBox(height: 4),
            pw.Text(_u('Autorizado por Obra', cfg), style: const pw.TextStyle(fontSize: 10)),
          ]),
          pw.Column(children: [
            pw.SizedBox(height: firma != null ? 40 : 0),
            pw.Container(width: 180, height: 1, color: PdfColors.black),
            pw.SizedBox(height: 4),
            pw.Text(_u('Aceptado por Cliente', cfg), style: const pw.TextStyle(fontSize: 10)),
          ]),
        ],
      ),
    );
  }

  static pw.Widget _totalLinea(String label, double value,
          {bool bold = false, PdfColor? color}) =>
      pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 2),
        child: pw.Row(mainAxisAlignment: pw.MainAxisAlignment.end, children: [
          pw.Text('$label:  ',
              style: pw.TextStyle(
                  fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
                  fontSize: bold ? 12 : 10)),
          pw.SizedBox(
            width: 120,
            child: pw.Text(Fmt.money(value),
                textAlign: pw.TextAlign.right,
                style: pw.TextStyle(
                    fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
                    fontSize: bold ? 12 : 10,
                    color: color)),
          ),
        ]),
      );

  // ---------------- Nómina ----------------
  static Future<Uint8List> nomina({
    required String obraNombre,
    required String rango,
    required NominaSummary summary,
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) => [
        _header('Reporte de nómina semanal', 'Obra: $obraNombre\nSemana: $rango', config, color),
        pw.TableHelper.fromTextArray(
          headerDecoration: pw.BoxDecoration(color: color),
          headerStyle: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 9),
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
        _firmas(config),
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
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) {
        final widgets = <pw.Widget>[
          _header('Presupuesto', 'Proyecto: ${cot.nombreProyecto}\nCliente: ${cot.cliente}', config, color),
        ];
        final tieneAvance = aportadoPorPartida.isNotEmpty;
        for (final s in secciones) {
          final pts = partidas.where((p) => p.seccionId == s.id).toList();
          if (pts.isEmpty) continue;
          widgets.add(pw.Padding(
            padding: const pw.EdgeInsets.only(top: 8, bottom: 4),
            child: pw.Text(s.nombre, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11)),
          ));
          widgets.add(pw.TableHelper.fromTextArray(
            headerDecoration: const pw.BoxDecoration(color: PdfColors.grey300),
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 8),
            cellStyle: const pw.TextStyle(fontSize: 8),
            cellAlignments: {
              3: pw.Alignment.centerRight, 4: pw.Alignment.centerRight,
              5: pw.Alignment.centerRight, 6: pw.Alignment.centerRight, 7: pw.Alignment.centerRight,
            },
            headers: [
              'Clave', 'Descripción', 'Unidad', 'Cant.', 'P.U.', 'Importe',
              if (tieneAvance) 'Aportado', if (tieneAvance) '%',
            ],
            data: pts.map((p) {
              final importe = p.cantidad * p.precioUnitario;
              final aportado = aportadoPorPartida[p.id] ?? 0;
              final pct = importe > 0 ? aportado / importe * 100 : 0;
              return [
                p.clave, p.descripcion, p.unidad, p.cantidad.toString(),
                Fmt.money(p.precioUnitario), Fmt.money(importe),
                if (tieneAvance) Fmt.money(aportado),
                if (tieneAvance) '${pct.toStringAsFixed(0)}%',
              ];
            }).toList(),
          ));
        }
        widgets.add(pw.SizedBox(height: 10));
        widgets.add(_totalLinea('Subtotal', totales.subtotal));
        if (iva) widgets.add(_totalLinea('IVA 16%', totales.iva));
        widgets.add(_totalLinea('TOTAL', totales.total, bold: true, color: color));
        widgets.add(_firmas(config));
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
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) => [
        _header('Reporte de flujo de caja', 'Obra: $obraNombre', config, color),
        pw.TableHelper.fromTextArray(
          headerDecoration: pw.BoxDecoration(color: color),
          headerStyle: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 9),
          cellStyle: const pw.TextStyle(fontSize: 9),
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
        _totalLinea('Total entradas', resumen.totalEntradas, color: _verde),
        _totalLinea('Total salidas', resumen.totalSalidas, color: _rojo),
        _totalLinea('SALDO DISPONIBLE', resumen.saldo,
            bold: true, color: resumen.saldo >= 0 ? _verde : _rojo),
      ],
    ));
    return doc.save();
  }

  // ---------------- Reporte GLOBAL de nómina ----------------
  static Future<Uint8List> nominaGlobal({
    required List<({String obra, NominaSummary summary})> datos,
    required String rango,
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final doc = pw.Document();
    var granTotal = 0.0;
    for (final d in datos) {
      granTotal += d.summary.totalNomina;
    }
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) {
        final w = <pw.Widget>[
          _header('Concentrado global de nómina', 'Semana: $rango', config, color),
        ];
        for (final d in datos) {
          if (d.summary.items.isEmpty) continue;
          w.add(pw.Container(
            width: double.infinity,
            color: color,
            padding: const pw.EdgeInsets.all(6),
            margin: const pw.EdgeInsets.only(top: 8),
            child: pw.Text('OBRA: ${d.obra.toUpperCase()}',
                style: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 10)),
          ));
          w.add(pw.TableHelper.fromTextArray(
            headerDecoration: const pw.BoxDecoration(color: PdfColors.grey300),
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 8),
            cellStyle: const pw.TextStyle(fontSize: 8),
            cellAlignments: {3: pw.Alignment.centerRight},
            headers: ['Trabajador', 'Puesto', 'Tipo', 'Total'],
            data: d.summary.items
                .map((it) => [
                      it.colaborador.nombre,
                      it.puestoNombre,
                      it.colaborador.tipoPago == dom.TipoPago.dia ? 'Día' : 'Destajo',
                      Fmt.money(it.totalPagar),
                    ])
                .toList(),
          ));
          w.add(_totalLinea('Subtotal ${d.obra}', d.summary.totalNomina));
        }
        w.add(pw.SizedBox(height: 10));
        w.add(_totalLinea('GRAN TOTAL NÓMINA', granTotal, bold: true, color: _verde));
        return w;
      },
    ));
    return doc.save();
  }

  // ---------------- Reporte GLOBAL de presupuestos ----------------
  static Future<Uint8List> presupuestosGlobal({
    required List<({String proyecto, String cliente, PresupuestoTotales totales})> datos,
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final granTotal = datos.fold<double>(0, (a, d) => a + d.totales.total);
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) => [
        _header('Concentrado global de presupuestos', 'Todas las cotizaciones', config, color),
        pw.TableHelper.fromTextArray(
          headerDecoration: pw.BoxDecoration(color: color),
          headerStyle: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 9),
          cellStyle: const pw.TextStyle(fontSize: 8),
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
        _totalLinea('GRAN TOTAL', granTotal, bold: true, color: color),
      ],
    ));
    return doc.save();
  }

  // ---------------- Reporte GLOBAL de asistencias ----------------
  static Future<Uint8List> asistenciasGlobal({
    required List<({String obra, List<({String trabajador, double dias})> filas})> datos,
    required String rango,
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) {
        final w = <pw.Widget>[
          _header('Concentrado global de asistencias', 'Semana: $rango', config, color),
        ];
        for (final d in datos) {
          if (d.filas.isEmpty) continue;
          w.add(pw.Container(
            width: double.infinity,
            color: color,
            padding: const pw.EdgeInsets.all(6),
            margin: const pw.EdgeInsets.only(top: 8),
            child: pw.Text('OBRA: ${d.obra.toUpperCase()}',
                style: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 10)),
          ));
          w.add(pw.TableHelper.fromTextArray(
            headerDecoration: const pw.BoxDecoration(color: PdfColors.grey300),
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 8),
            cellStyle: const pw.TextStyle(fontSize: 8),
            cellAlignments: {1: pw.Alignment.centerRight},
            headers: ['Trabajador', 'Días trabajados'],
            data: d.filas.map((f) => [f.trabajador, f.dias.toStringAsFixed(2)]).toList(),
          ));
        }
        return w;
      },
    ));
    return doc.save();
  }

  // ---------------- Reporte GLOBAL de flujo de caja ----------------
  static Future<Uint8List> flujoCajaGlobal({
    required List<({String obra, ResumenCaja resumen})> porObra,
    required ResumenCaja global,
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) => [
        _header('Concentrado global de flujo de caja', 'Todas las obras', config, color),
        pw.TableHelper.fromTextArray(
          headerDecoration: pw.BoxDecoration(color: color),
          headerStyle: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 9),
          cellStyle: const pw.TextStyle(fontSize: 9),
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
        _totalLinea('Total ingresos', global.totalEntradas, color: _verde),
        _totalLinea('Total egresos', global.totalSalidas, color: _rojo),
        _totalLinea('SALDO GLOBAL', global.saldo,
            bold: true, color: global.saldo >= 0 ? _verde : _rojo),
      ],
    ));
    return doc.save();
  }
}
