import 'dart:typed_data';

import 'package:pdf/widgets.dart' as pw;

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../domain/logic/proyeccion_nomina.dart';
import '../kit/bloques.dart';
import '../kit/formato.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Proyección de nómina ----------------
/// La raya ESPERADA de una semana. No es un comprobante de pago.
///
/// Va sin bloque de firmas a propósito: una hoja con líneas para firmar invita
/// a usarse como recibo, y esto todavía no ocurre.
Future<Uint8List> generarProyeccionNomina({
  required String alcance,
  required String rango,
  required ProyeccionResultado resultado,
  Map<String, String> nombreCuadrilla = const {},
  PdfConfig config = const PdfConfig(),
}) async {
  final color = hex(config.colorHex);
  final doc = pw.Document();

  const dias = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  doc.addPage(pw.MultiPage(
    pageTheme: pageThemeProyeccion(config),
    footer: footer(config),
    build: (context) => [
      header('Proyección de nómina', '$alcance\nSemana: $rango', config, color),

      // El aviso va en el cuerpo y no solo en la marca de agua: si alguien
      // imprime la hoja en blanco y negro y la marca se pierde, el renglón
      // sigue diciendo qué es esto.
      pw.Container(
        width: double.infinity,
        margin: const pw.EdgeInsets.only(bottom: 12),
        padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: pw.BoxDecoration(
          color: grisFondo,
          border: pw.Border.all(color: gris200),
        ),
        child: pw.Text(
          'Documento de planeación: cifras ESTIMADAS sobre la asistencia que '
          'se espera. No es la nómina pagada ni un comprobante.',
          style: pw.TextStyle(
              fontSize: 8.5, color: gris700, fontWeight: pw.FontWeight.bold),
        ),
      ),

      pw.TableHelper.fromTextArray(
        border: null,
        headerDecoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: gris200))),
        headerStyle: pw.TextStyle(
            fontWeight: pw.FontWeight.bold, fontSize: 7.5, color: gris500),
        cellStyle: pw.TextStyle(fontSize: 8, color: gris700),
        oddRowDecoration: const pw.BoxDecoration(color: grisFondo),
        cellPadding:
            const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 3.5),
        cellAlignments: {
          for (var i = 2; i < 9; i++) i: pw.Alignment.center,
          9: pw.Alignment.centerRight,
          10: pw.Alignment.centerRight,
          11: pw.Alignment.centerRight,
        },
        headers: [
          'Trabajador',
          '\$/día',
          ...dias,
          'Días',
          'Ajustes',
          'Total',
        ],
        data: resultado.renglones.map((r) {
          return [
            r.colaborador.nombre,
            // Los caracteres se limitan a Latin-1 a propósito: la Helvetica
            // base del PDF no tiene Unicode y una raya larga (U+2013/2014)
            // sale como un hueco en blanco, no como un guion.
            r.esDestajista ? '-' : Fmt.money(r.salarioDia),
            // Se distingue lo capturado de lo estimado también aquí: X es un
            // día que ya ocurrió, · es una expectativa.
            for (final celda in r.celdas)
              if (r.esDestajista)
                ''
              else if (celda.origen == OrigenCelda.real)
                (celda.fraccion > 0 ? 'X' : 'F')
              else if (celda.origen == OrigenCelda.proyectada)
                '·'
              else
                '',
            r.esDestajista
                ? 'destajo'
                : sinDecimalesInutiles(r.diasTotales),
            r.ajustes == 0 ? '' : Fmt.money(r.ajustes),
            Fmt.money(r.total),
          ];
        }).toList(),
      ),

      // Ajustes de cuadrilla que no se repartieron: son parte del total y sin
      // ellos la suma de los renglones no daría el gran total.
      if (resultado.lineasCuadrilla.any((l) => !l.repartido)) ...[
        pw.SizedBox(height: 10),
        sectionTitle('Ajustes por cuadrilla', color),
        for (final linea in resultado.lineasCuadrilla.where((l) => !l.repartido))
          pw.Padding(
            padding: const pw.EdgeInsets.symmetric(vertical: 2),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text(
                    '${linea.ajuste.tipo.label} · '
                    '${nombreCuadrilla[linea.cuadrillaId] ?? 'Cuadrilla'}'
                    '${linea.ajuste.nota.isEmpty ? '' : ': ${linea.ajuste.nota}'}',
                    style: const pw.TextStyle(fontSize: 9, color: gris700)),
                pw.Text(Fmt.money(linea.montoConSigno),
                    style: pw.TextStyle(
                        fontSize: 9,
                        fontWeight: pw.FontWeight.bold,
                        color: linea.montoConSigno < 0 ? rojo : verde)),
              ],
            ),
          ),
      ],

      pw.SizedBox(height: 6),
      pw.Padding(
        padding: const pw.EdgeInsets.only(top: 4),
        child: pw.Text(
            'X = capturado   ·   · = estimado   ·   F = falta capturada',
            style: const pw.TextStyle(fontSize: 7.5, color: gris400)),
      ),

      pw.SizedBox(height: 10),
      totalLinea('Pago por día', resultado.totalDia),
      if (resultado.totalDestajo != 0)
        totalLinea('Destajo', resultado.totalDestajo),
      if (resultado.totalAjustes != 0)
        totalLinea('Ajustes', resultado.totalAjustes,
            color: resultado.totalAjustes < 0 ? rojo : verde),
      totalLinea('Ya capturado (en firme)', resultado.totalCapturado),
      totalLinea('Estimado', resultado.totalProyectado),
      totalLinea('TOTAL PROYECTADO', resultado.total, bold: true, color: color),
    ],
  ));
  return doc.save();
}
