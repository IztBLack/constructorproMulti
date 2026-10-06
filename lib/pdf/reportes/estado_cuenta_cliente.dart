import 'dart:typed_data';

import 'package:pdf/widgets.dart' as pw;

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../core/pdf/textos_finales.dart';
import '../kit/bloques.dart';
import '../kit/pagina.dart';
import '../kit/paleta.dart';

// ---------------- Estado de cuenta del CLIENTE ----------------
//
// Documento que la oficina manda AL CLIENTE. A diferencia de `flujoCaja`,
// NUNCA muestra salidas/gastos/nómina: solo el total del contrato, los pagos
// recibidos (ENTRADAS) y el saldo por cobrar. Espeja el estado de cuenta del
// cliente de la web (`documento-estado-cuenta-html.ts`).
//
// POR QUÉ ES UN MÉTODO DEDICADO (no un flag "ocultar salidas" sobre
// `flujoCaja`): este método NUNCA recibe la lista completa de movimientos. Su
// firma solo admite totales escalares (ya calculados) y una lista de renglones
// de pago que ni siquiera tiene campo `tipo`. Así, por construcción, es
// imposible que un cambio futuro filtre un gasto al cliente: no hay ningún dato
// de salida que este método pueda pintar aunque quisiera. El caller es quien
// filtra `tipo == 'ENTRADA'` antes de armar la lista.
Future<Uint8List> generarEstadoCuentaCliente({
  required String obraNombre,
  required String cliente,
  required double costoTotal,
  required double recibido,
  required double pendiente,
  // Solo ENTRADAS, ya filtradas por el caller. El record no tiene `tipo`
  // adrede: todo lo que llegue aquí SE PINTA como pago recibido.
  required List<({int fecha, String concepto, double monto})> pagos,
  PdfConfig config = const PdfConfig(),

  /// El párrafo propio de ESTA obra (`obras.texto_final`). Cuelga de la obra
  /// y no de un documento porque el estado de cuenta se emite por obra.
  String? textoFinalObra,

  /// Texto general de la empresa por tipo (`empresa_config.pdf_textos`).
  Map<TipoDocumento, String> textosEmpresa = const {},
}) async {
  final color = hex(config.colorHex);
  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageTheme: pageTheme(config),
    footer: footer(config),
    build: (context) => [
      header('Estado de cuenta del cliente',
          'Obra: $obraNombre\nCliente: $cliente', config, color),
      pw.SizedBox(height: 4),
      pw.Text('Total del contrato: ${Fmt.money(costoTotal)}',
          style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11)),
      pw.SizedBox(height: 10),
      pw.Text('Pagos recibidos',
          style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11)),
      pw.SizedBox(height: 4),
      pw.TableHelper.fromTextArray(
        border: null,
        headerDecoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: gris200))),
        headerStyle: pw.TextStyle(
            fontWeight: pw.FontWeight.bold, fontSize: 8, color: gris500),
        cellStyle: pw.TextStyle(fontSize: 9, color: gris700),
        oddRowDecoration: const pw.BoxDecoration(color: grisFondo),
        cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        cellAlignments: {2: pw.Alignment.centerRight},
        headers: ['Fecha', 'Concepto', 'Monto'],
        data: pagos.isEmpty
            ? [
                ['—', 'Aún no hay pagos registrados.', '']
              ]
            : pagos
                .map((p) => [
                      Fmt.date(p.fecha),
                      p.concepto,
                      // Siempre positivo: son entradas. Sin signo «−» porque
                      // aquí no existen salidas.
                      Fmt.money(p.monto),
                    ])
                .toList(),
      ),
      pw.SizedBox(height: 10),
      totalLinea('Total del contrato', costoTotal),
      totalLinea('Pagos recibidos', recibido, color: verde),
      totalLinea('SALDO POR COBRAR', pendiente,
          bold: true, color: pendiente > 0 ? rojo : verde),
      // Debajo de los totales, igual que la web pone `.vigencia` después de
      // `.totales`: es el MISMO documento para el MISMO cliente, y hasta
      // dónde cae el párrafo en la hoja forma parte de que lo sea.
      textoFinal(resolverTextoFinal(
        tipo: TipoDocumento.estadoCuenta,
        documento: textoFinalObra,
        textosEmpresa: textosEmpresa,
        ctx: ContextoTextoFinal(nombreEmpresa: config.empresaNombre),
      )),
    ],
  ));
  return doc.save();
}
