import 'dart:typed_data';

import 'package:pdf/widgets.dart' as pw;

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../core/pdf/textos_finales.dart';
import '../../domain/logic/presupuesto_calculator.dart';
import '../kit/bloques.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Presupuesto ----------------
Future<Uint8List> generarPresupuesto({
  required Cotizacion cot,
  required List<Seccion> secciones,
  required List<Partida> partidas,
  required PresupuestoTotales totales,
  required bool iva,
  Map<String, double> aportadoPorPartida = const {},
  PdfConfig config = const PdfConfig(),
  /// Texto general de la empresa por tipo (`empresa_config.pdf_textos`).
  /// Lo comparten web y móvil; vacío = se imprime el integrado.
  Map<TipoDocumento, String> textosEmpresa = const {},
}) async {
  final color = hex(config.colorHex);
  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) {
      final widgets = <pw.Widget>[
        // Proyecto y cliente son opcionales: el renglon vacio no se imprime.
        header(
            'Presupuesto',
            [
              if (cot.nombreProyecto.trim().isNotEmpty)
                'Proyecto: ${cot.nombreProyecto}',
              if (cot.cliente.trim().isNotEmpty) 'Cliente: ${cot.cliente}',
            ].join('\n'),
            config,
            color),
      ];
      final tieneAvance = aportadoPorPartida.isNotEmpty;
      for (final s in secciones) {
        final pts = partidas.where((p) => p.seccionId == s.id).toList();
        if (pts.isEmpty) continue;
        widgets.add(pw.Padding(
          padding: const pw.EdgeInsets.only(top: 8, bottom: 4),
          child: sectionTitle(s.nombre, color),
        ));
        widgets.add(pw.TableHelper.fromTextArray(
          border: null,
          headerDecoration: const pw.BoxDecoration(
              border: pw.Border(bottom: pw.BorderSide(color: gris200))),
          headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold, fontSize: 8, color: gris500),
          cellStyle: pw.TextStyle(fontSize: 8, color: gris700),
          oddRowDecoration: const pw.BoxDecoration(color: grisFondo),
          cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
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
            // Partida sin precio: celdas en blanco, igual que la web. Un
            // "$0.00" ahi se leeria como "va gratis", y estas partidas son
            // justo las que el cliente suministra.
            final sinPrecio = p.precioUnitario == 0;
            return [
              p.clave, p.descripcion, p.unidad, p.cantidad.toString(),
              sinPrecio ? '' : Fmt.money(p.precioUnitario),
              sinPrecio ? '' : Fmt.money(importe),
              if (tieneAvance) Fmt.money(aportado),
              if (tieneAvance) '${pct.toStringAsFixed(0)}%',
            ];
          }).toList(),
        ));
        // Subtotal de la seccion, igual que en la web. Si no suma nada -una
        // relacion de materiales sin precios- no se imprime: un "$0.00" ahi
        // se leeria como "sale gratis".
        final sumaSeccion = pts.fold<double>(
            0, (acc, p) => acc + p.cantidad * p.precioUnitario);
        if (sumaSeccion > 0) {
          widgets.add(subtotalSeccion(sumaSeccion));
        }
      }
      widgets.add(pw.SizedBox(height: 10));
      widgets.add(totalLinea('Subtotal', totales.subtotal));
      if (totales.descuento > 0) {
        widgets.add(totalLinea('Descuento', -totales.descuento));
      }
      if (iva) widgets.add(totalLinea('IVA', totales.iva));
      widgets.add(totalLinea('TOTAL', totales.total, bold: true, color: color));
      widgets.add(textoFinal(resolverTextoFinal(
        tipo: TipoDocumento.cotizacion,
        documento: cot.textoFinal,
        textosEmpresa: textosEmpresa,
        ctx: ContextoTextoFinal(
          nombreEmpresa: config.empresaNombre,
          ivaEnabled: iva,
          ivaPct: cot.ivaPorcentaje,
        ),
      )));
      widgets.add(firmas(config));
      return widgets;
    },
  ));
  return doc.save();
}
