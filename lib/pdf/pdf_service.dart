import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/db/app_database.dart';
import '../core/format/format.dart';
import '../core/pdf/pdf_config.dart';
import '../core/pdf/textos_finales.dart';
import '../domain/logic/flujo_calculator.dart';
import '../domain/logic/nomina_calculator.dart';
import '../domain/logic/presupuesto_calculator.dart';
import '../domain/logic/proyeccion_nomina.dart';
import '../domain/models/models.dart' as dom;

/// Genera los reportes PDF (equivalente a PdfGenerator.kt, con el paquete `pdf`),
/// con personalización (empresa, color, logo, marca de agua, pie).
class PdfService {
  // Paleta portada 1:1 del PDF de la web (`web/src/lib/pdf/documento-base.ts`):
  // pizarra casi-negra para texto fuerte, grises para etiquetas/bordes, y verde/
  // rojo con los MISMOS hex que la web para que ambos documentos se vean iguales.
  static const _slate = PdfColor.fromInt(0xFF0F172A); // texto fuerte
  static const _gris700 = PdfColor.fromInt(0xFF404040); // texto normal
  static const _gris500 = PdfColor.fromInt(0xFF737373); // etiquetas
  static const _gris400 = PdfColor.fromInt(0xFFA3A3A3); // apagado
  static const _gris200 = PdfColor.fromInt(0xFFE5E5E5); // bordes
  static const _gris100 = PdfColor.fromInt(0xFFF1F1F1); // borde de fila
  static const _grisFondo = PdfColor.fromInt(0xFFFAFAFA); // relleno tenue
  static const _verde = PdfColor.fromInt(0xFF16A34A);
  static const _rojo = PdfColor.fromInt(0xFFDC2626);

  static PdfColor _hex(String hex) {
    var h = hex.replaceAll('#', '').trim();
    if (h.length == 6) h = 'FF$h';
    return PdfColor.fromInt(int.tryParse(h, radix: 16) ?? 0xFF1A3A5C);
  }

  static String _u(String s, PdfConfig c) => c.mayusculas ? s.toUpperCase() : s;

  // ---------------- Encabezado / tema / pie ----------------
  /// Encabezado estilo web (`.doc-header`): a la izquierda el "kicker" (tipo de
  /// documento, en el color de acento), el nombre de la empresa grande y su
  /// contacto; a la derecha el subtítulo (obra/cliente/rango). Cierra con una
  /// línea gruesa pizarra, no una banda de color — es el look de la web.
  static pw.Widget _header(
      String titulo, String subtitulo, PdfConfig cfg, PdfColor color) {
    final logo = cfg.logoBytes;
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Container(
          padding: const pw.EdgeInsets.only(bottom: 12),
          decoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: _slate, width: 2)),
          ),
          child: pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              // Bloque emisor: kicker (acento) + empresa + contacto (o logo).
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(_u(titulo, cfg).toUpperCase(),
                        style: pw.TextStyle(
                            color: color,
                            fontSize: 9,
                            fontWeight: pw.FontWeight.bold,
                            letterSpacing: 1.2)),
                    pw.SizedBox(height: 3),
                    if (logo != null)
                      pw.Container(
                          height: 38, child: pw.Image(pw.MemoryImage(logo)))
                    else
                      pw.Text(_u(cfg.empresaNombre, cfg),
                          style: pw.TextStyle(
                              color: _slate,
                              fontSize: 18,
                              fontWeight: pw.FontWeight.bold)),
                    if (cfg.empresaContacto.isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(top: 2),
                        child: pw.Text(cfg.empresaContacto,
                            style: const pw.TextStyle(
                                fontSize: 9, color: _gris500)),
                      ),
                  ],
                ),
              ),
              // Subtítulo a la derecha (obra / cliente / semana).
              if (subtitulo.isNotEmpty)
                pw.Padding(
                  padding: const pw.EdgeInsets.only(left: 16),
                  child: pw.Text(subtitulo,
                      textAlign: pw.TextAlign.right,
                      style: const pw.TextStyle(fontSize: 10, color: _gris700)),
                ),
            ],
          ),
        ),
        pw.SizedBox(height: 16),
      ],
    );
  }

  /// Título de sección estilo web (`.seccion-titulo`): barra de acento a la
  /// izquierda + texto en mayúsculas. Disponible para los documentos que quieran
  /// separar bloques con el mismo lenguaje visual de la web.
  static pw.Widget _sectionTitle(String texto, PdfColor color) => pw.Container(
        margin: const pw.EdgeInsets.only(bottom: 6),
        padding: const pw.EdgeInsets.only(left: 8),
        decoration: pw.BoxDecoration(
          border: pw.Border(left: pw.BorderSide(color: color, width: 3)),
        ),
        child: pw.Text(texto.toUpperCase(),
            style: pw.TextStyle(
                fontSize: 10,
                fontWeight: pw.FontWeight.bold,
                color: _slate,
                letterSpacing: 0.5)),
      );

  static pw.PageTheme _pageTheme(PdfConfig cfg) => pw.PageTheme(
        pageFormat: PdfPageFormat.letter,
        // Márgenes ~16mm/18mm como el `@page` de la web (en puntos: 1mm≈2.835pt).
        margin: cfg.modoCompacto
            ? const pw.EdgeInsets.all(28)
            : const pw.EdgeInsets.symmetric(horizontal: 51, vertical: 45),
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

  /// Tema de página para la PROYECCIÓN de nómina.
  ///
  /// La marca de agua se impone aquí y NO sale de [PdfConfig.watermark]: este
  /// documento no es la raya, y si alguien vacía la marca de agua en ajustes, un
  /// escenario acabaría circulando como si fuera la nómina buena. Es el único
  /// documento del proyecto que no respeta esa preferencia, y es a propósito.
  ///
  /// El difuminado se consigue apilando la MISMA palabra varias veces con
  /// desplazamientos de pocos puntos y opacidad muy baja: el paquete `pdf` no
  /// tiene desenfoque gaussiano —no existe tal filtro en el modelo de dibujo de
  /// PDF sin incrustar un grupo de transparencia—, y superponer copias corridas
  /// produce el mismo halo suave con un costo de render trivial.
  static pw.PageTheme _pageThemeProyeccion(PdfConfig cfg) {
    // Nueve capas: ocho alrededor formando el halo y una al centro, más opaca,
    // que sostiene la lectura de la palabra.
    const desplazamientos = <(double, double, double)>[
      (-6, -6, 0.020), (0, -7, 0.022), (6, -6, 0.020),
      (-7, 0, 0.022), (7, 0, 0.022),
      (-6, 6, 0.020), (0, 7, 0.022), (6, 6, 0.020),
      (0, 0, 0.055),
    ];

    return pw.PageTheme(
      pageFormat: PdfPageFormat.letter,
      margin: cfg.modoCompacto
          ? const pw.EdgeInsets.all(28)
          : const pw.EdgeInsets.symmetric(horizontal: 51, vertical: 45),
      buildBackground: (ctx) => pw.FullPage(
        ignoreMargins: true,
        child: pw.Center(
          child: pw.Transform.rotate(
            // ~35° hacia arriba: la diagonal clásica de un sello de borrador.
            angle: 0.61,
            child: pw.Stack(
              alignment: pw.Alignment.center,
              children: [
                for (final (dx, dy, opacidad) in desplazamientos)
                  pw.Transform.translate(
                    offset: PdfPoint(dx, dy),
                    child: pw.Opacity(
                      opacity: opacidad,
                      child: pw.Text(
                        'PROYECCIÓN',
                        style: pw.TextStyle(
                          fontSize: 78,
                          fontWeight: pw.FontWeight.bold,
                          color: _slate,
                          letterSpacing: 3,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static pw.Widget Function(pw.Context) _footer(PdfConfig cfg) =>
      (ctx) => cfg.pieDePagina.isEmpty
          ? pw.SizedBox()
          : pw.Container(
              alignment: pw.Alignment.center,
              margin: const pw.EdgeInsets.only(top: 10),
              padding: const pw.EdgeInsets.only(top: 8),
              decoration: const pw.BoxDecoration(
                border: pw.Border(top: pw.BorderSide(color: _gris200)),
              ),
              child: pw.Text(cfg.pieDePagina,
                  style: const pw.TextStyle(fontSize: 9, color: _gris400)),
            );

  /// Párrafo final de condiciones, arriba de las firmas y del pie de página.
  ///
  /// Hasta ahora el móvil no lo imprimía y la web sí: el MISMO presupuesto
  /// salía con condiciones o sin ellas según desde dónde se mandara. Se resuelve
  /// con `textos_finales.dart`, que es el puerto del módulo de la web.
  static pw.Widget _textoFinal(String texto) => pw.Padding(
        padding: const pw.EdgeInsets.only(top: 22),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Container(height: 1, color: PdfColors.grey300),
            pw.SizedBox(height: 8),
            pw.Text(
              texto,
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
            ),
          ],
        ),
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
            pw.Text(_u(cfg.firmaIzquierda, cfg), style: const pw.TextStyle(fontSize: 10)),
          ]),
          pw.Column(children: [
            pw.SizedBox(height: firma != null ? 40 : 0),
            pw.Container(width: 180, height: 1, color: PdfColors.black),
            pw.SizedBox(height: 4),
            pw.Text(_u(cfg.firmaDerecha, cfg), style: const pw.TextStyle(fontSize: 10)),
          ]),
        ],
      ),
    );
  }

  /// Subtotal al pie de la tabla de una seccion. Alineado a la derecha y mas
  /// discreto que `_totalLinea`, que es para los totales del documento.
  static pw.Widget _subtotalSeccion(double value) => pw.Container(
        alignment: pw.Alignment.centerRight,
        padding: const pw.EdgeInsets.only(top: 4, right: 6),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.end,
          children: [
            pw.Text('SUBTOTAL DE LA SECCION  ',
                style: pw.TextStyle(
                    fontSize: 7,
                    fontWeight: pw.FontWeight.bold,
                    color: _gris500)),
            pw.Text(Fmt.money(value),
                style: pw.TextStyle(
                    fontSize: 9, fontWeight: pw.FontWeight.bold, color: _slate)),
          ],
        ),
      );

  /// Renglón de totales alineado a la derecha, estilo web (`.tot-fila` /
  /// `.tot-total`). Las líneas normales van en gris con separador tenue; la línea
  /// [bold] es el gran total, con borde superior pizarra y texto grande.
  static pw.Widget _totalLinea(String label, double value,
      {bool bold = false, PdfColor? color}) {
    final fila = pw.Container(
      width: 300,
      padding: const pw.EdgeInsets.symmetric(vertical: 6),
      decoration: pw.BoxDecoration(
        border: bold
            ? const pw.Border(top: pw.BorderSide(color: _slate, width: 2))
            : const pw.Border(bottom: pw.BorderSide(color: _gris100)),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(label,
              style: pw.TextStyle(
                  fontSize: bold ? 13 : 11,
                  fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
                  color: bold ? _slate : _gris500)),
          pw.Text(Fmt.money(value),
              style: pw.TextStyle(
                  fontSize: bold ? 13 : 11,
                  fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
                  color: color ?? _slate)),
        ],
      ),
    );
    // El bloque de totales se alinea a la derecha, como en la web.
    return pw.Align(alignment: pw.Alignment.centerRight, child: fila);
  }

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
          border: null,
          headerDecoration: const pw.BoxDecoration(
              border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
          headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold, fontSize: 8, color: _gris500),
          cellStyle: pw.TextStyle(fontSize: 9, color: _gris700),
          oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
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
        _totalLinea('Subtotal por día', summary.totalDia),
        _totalLinea('Subtotal destajo', summary.totalDestajo),
        _totalLinea('TOTAL NÓMINA', summary.totalNomina, bold: true, color: _verde),
        _firmas(config),
      ],
    ));
    return doc.save();
  }

  // ---------------- Proyección de nómina ----------------
  /// La raya ESPERADA de una semana. No es un comprobante de pago.
  ///
  /// Va sin bloque de firmas a propósito: una hoja con líneas para firmar invita
  /// a usarse como recibo, y esto todavía no ocurre.
  static Future<Uint8List> proyeccionNomina({
    required String alcance,
    required String rango,
    required ProyeccionResultado resultado,
    Map<String, String> nombreCuadrilla = const {},
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final doc = pw.Document();

    const dias = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

    doc.addPage(pw.MultiPage(
      pageTheme: _pageThemeProyeccion(config),
      footer: _footer(config),
      build: (context) => [
        _header('Proyección de nómina', '$alcance\nSemana: $rango', config, color),

        // El aviso va en el cuerpo y no solo en la marca de agua: si alguien
        // imprime la hoja en blanco y negro y la marca se pierde, el renglón
        // sigue diciendo qué es esto.
        pw.Container(
          width: double.infinity,
          margin: const pw.EdgeInsets.only(bottom: 12),
          padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: pw.BoxDecoration(
            color: _grisFondo,
            border: pw.Border.all(color: _gris200),
          ),
          child: pw.Text(
            'Documento de planeación: cifras ESTIMADAS sobre la asistencia que '
            'se espera. No es la nómina pagada ni un comprobante.',
            style: pw.TextStyle(
                fontSize: 8.5, color: _gris700, fontWeight: pw.FontWeight.bold),
          ),
        ),

        pw.TableHelper.fromTextArray(
          border: null,
          headerDecoration: const pw.BoxDecoration(
              border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
          headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold, fontSize: 7.5, color: _gris500),
          cellStyle: pw.TextStyle(fontSize: 8, color: _gris700),
          oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
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
                  : _sinDecimalesInutiles(r.diasTotales),
              r.ajustes == 0 ? '' : Fmt.money(r.ajustes),
              Fmt.money(r.total),
            ];
          }).toList(),
        ),

        // Ajustes de cuadrilla que no se repartieron: son parte del total y sin
        // ellos la suma de los renglones no daría el gran total.
        if (resultado.lineasCuadrilla.any((l) => !l.repartido)) ...[
          pw.SizedBox(height: 10),
          _sectionTitle('Ajustes por cuadrilla', color),
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
                      style: const pw.TextStyle(fontSize: 9, color: _gris700)),
                  pw.Text(Fmt.money(linea.montoConSigno),
                      style: pw.TextStyle(
                          fontSize: 9,
                          fontWeight: pw.FontWeight.bold,
                          color: linea.montoConSigno < 0 ? _rojo : _verde)),
                ],
              ),
            ),
        ],

        pw.SizedBox(height: 6),
        pw.Padding(
          padding: const pw.EdgeInsets.only(top: 4),
          child: pw.Text(
              'X = capturado   ·   · = estimado   ·   F = falta capturada',
              style: const pw.TextStyle(fontSize: 7.5, color: _gris400)),
        ),

        pw.SizedBox(height: 10),
        _totalLinea('Pago por día', resultado.totalDia),
        if (resultado.totalDestajo != 0)
          _totalLinea('Destajo', resultado.totalDestajo),
        if (resultado.totalAjustes != 0)
          _totalLinea('Ajustes', resultado.totalAjustes,
              color: resultado.totalAjustes < 0 ? _rojo : _verde),
        _totalLinea('Ya capturado (en firme)', resultado.totalCapturado),
        _totalLinea('Estimado', resultado.totalProyectado),
        _totalLinea('TOTAL PROYECTADO', resultado.total,
            bold: true, color: color),
      ],
    ));
    return doc.save();
  }

  static String _sinDecimalesInutiles(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

  // ---------------- Presupuesto ----------------
  static Future<Uint8List> presupuesto({
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
    final color = _hex(config.colorHex);
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) {
        final widgets = <pw.Widget>[
          // Proyecto y cliente son opcionales: el renglon vacio no se imprime.
          _header(
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
            child: _sectionTitle(s.nombre, color),
          ));
          widgets.add(pw.TableHelper.fromTextArray(
            border: null,
            headerDecoration: const pw.BoxDecoration(
                border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
            headerStyle: pw.TextStyle(
                fontWeight: pw.FontWeight.bold, fontSize: 8, color: _gris500),
            cellStyle: pw.TextStyle(fontSize: 8, color: _gris700),
            oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
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
          final subtotalSeccion = pts.fold<double>(
              0, (acc, p) => acc + p.cantidad * p.precioUnitario);
          if (subtotalSeccion > 0) {
            widgets.add(_subtotalSeccion(subtotalSeccion));
          }
        }
        widgets.add(pw.SizedBox(height: 10));
        widgets.add(_totalLinea('Subtotal', totales.subtotal));
        if (totales.descuento > 0) widgets.add(_totalLinea('Descuento', -totales.descuento));
        if (iva) widgets.add(_totalLinea('IVA', totales.iva));
        widgets.add(_totalLinea('TOTAL', totales.total, bold: true, color: color));
        widgets.add(_textoFinal(resolverTextoFinal(
          tipo: TipoDocumento.cotizacion,
          documento: cot.textoFinal,
          textosEmpresa: textosEmpresa,
          ctx: ContextoTextoFinal(
            nombreEmpresa: config.empresaNombre,
            ivaEnabled: iva,
            ivaPct: cot.ivaPorcentaje,
          ),
        )));
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
          border: null,
          headerDecoration: const pw.BoxDecoration(
              border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
          headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold, fontSize: 8, color: _gris500),
          cellStyle: pw.TextStyle(fontSize: 9, color: _gris700),
          oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
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
        _totalLinea('Total entradas', resumen.totalEntradas, color: _verde),
        _totalLinea('Total salidas', resumen.totalSalidas, color: _rojo),
        _totalLinea('SALDO DISPONIBLE', resumen.saldo,
            bold: true, color: resumen.saldo >= 0 ? _verde : _rojo),
      ],
    ));
    return doc.save();
  }

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
  static Future<Uint8List> estadoCuentaCliente({
    required String obraNombre,
    required String cliente,
    required double costoTotal,
    required double recibido,
    required double pendiente,
    // Solo ENTRADAS, ya filtradas por el caller. El record no tiene `tipo`
    // adrede: todo lo que llegue aquí SE PINTA como pago recibido.
    required List<({int fecha, String concepto, double monto})> pagos,
    PdfConfig config = const PdfConfig(),
  }) async {
    final color = _hex(config.colorHex);
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageTheme: _pageTheme(config),
      footer: _footer(config),
      build: (context) => [
        _header('Estado de cuenta del cliente',
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
              border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
          headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold, fontSize: 8, color: _gris500),
          cellStyle: pw.TextStyle(fontSize: 9, color: _gris700),
          oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
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
        _totalLinea('Total del contrato', costoTotal),
        _totalLinea('Pagos recibidos', recibido, color: _verde),
        _totalLinea('SALDO POR COBRAR', pendiente,
            bold: true, color: pendiente > 0 ? _rojo : _verde),
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
            border: null,
            headerDecoration: const pw.BoxDecoration(
                border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
            headerStyle: pw.TextStyle(
                fontWeight: pw.FontWeight.bold, fontSize: 8, color: _gris500),
            cellStyle: pw.TextStyle(fontSize: 8, color: _gris700),
            oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
            cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
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
          border: null,
          headerDecoration: const pw.BoxDecoration(
              border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
          headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold, fontSize: 8, color: _gris500),
          cellStyle: pw.TextStyle(fontSize: 8, color: _gris700),
          oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
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
            border: null,
            headerDecoration: const pw.BoxDecoration(
                border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
            headerStyle: pw.TextStyle(
                fontWeight: pw.FontWeight.bold, fontSize: 8, color: _gris500),
            cellStyle: pw.TextStyle(fontSize: 8, color: _gris700),
            oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
            cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 4),
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
          border: null,
          headerDecoration: const pw.BoxDecoration(
              border: pw.Border(bottom: pw.BorderSide(color: _gris200))),
          headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold, fontSize: 8, color: _gris500),
          cellStyle: pw.TextStyle(fontSize: 9, color: _gris700),
          oddRowDecoration: const pw.BoxDecoration(color: _grisFondo),
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
        _totalLinea('Total ingresos', global.totalEntradas, color: _verde),
        _totalLinea('Total egresos', global.totalSalidas, color: _rojo),
        _totalLinea('SALDO GLOBAL', global.saldo,
            bold: true, color: global.saldo >= 0 ? _verde : _rojo),
      ],
    ));
    return doc.save();
  }
}
