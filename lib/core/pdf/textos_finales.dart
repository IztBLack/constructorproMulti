/// El PÁRRAFO FINAL de cada documento imprimible: las condiciones que van al
/// pie, arriba del pie de página.
///
/// Puerto en Dart de `web/src/lib/pdf/textos-finales.ts`. Los dos archivos
/// tienen que decir LO MISMO palabra por palabra: el dueño manda la cotización
/// desde donde le queda a la mano, y dos versiones del mismo documento con
/// condiciones distintas es un problema con un cliente enfrente, no un detalle
/// cosmético. `test/logic/textos_finales_test.dart` fija esos textos.
///
/// Tres niveles, gana el más específico:
///   1. El texto del DOCUMENTO (`cotizaciones.texto_final`, Supabase 0032).
///   2. El texto de la EMPRESA (Ajustes → PDF en la web).
///   3. El texto INTEGRADO, armado con datos vivos.
library;

enum TipoDocumento { cotizacion, nota, estadoCuenta }

/// Datos vivos que necesita el texto integrado para armarse.
class ContextoTextoFinal {
  const ContextoTextoFinal({
    required this.nombreEmpresa,
    this.ivaEnabled = false,
    this.ivaPct = 16,
    this.destinatario,
  });

  final String nombreEmpresa;
  final bool ivaEnabled;
  final double ivaPct;
  final String? destinatario;
}

/// Tope de longitud: este texto se imprime completo al pie de una hoja y sin
/// límite un pegado accidental rompe el documento en silencio.
const int largoMaximoTextoFinal = 1200;

bool _hayTexto(String? v) => v != null && v.trim().isNotEmpty;

/// Formatea el porcentaje sin decimales cuando es entero (16, no 16.0), igual
/// que la web: si difieren, los dos documentos dejan de ser el mismo.
String _pct(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

/// El texto de siempre. Es el que se imprime mientras nadie escriba el suyo, y
/// el que se propone al editar: nadie debería empezar frente a un campo vacío.
String textoIntegrado(TipoDocumento tipo, ContextoTextoFinal ctx) {
  final empresa =
      ctx.nombreEmpresa.trim().isEmpty ? 'ConstructorPro' : ctx.nombreEmpresa.trim();

  switch (tipo) {
    case TipoDocumento.cotizacion:
      final iva = ctx.ivaEnabled
          ? ' Los precios incluyen IVA (${_pct(ctx.ivaPct)}%).'
          : ' Los precios no incluyen IVA.';
      return 'Esta cotización tiene una vigencia de 30 días naturales a partir '
          'de la fecha de emisión. Los precios están expresados en pesos '
          'mexicanos (MXN).$iva Para consultas o aclaraciones comuníquese con '
          '$empresa.';

    case TipoDocumento.nota:
      final quien = _hayTexto(ctx.destinatario)
          ? ctx.destinatario!.trim()
          : 'la parte indicada';
      return 'Relación de trabajos y pagos acordados entre $empresa y $quien. '
          'Montos en pesos mexicanos (MXN). Cualquier diferencia se aclara '
          'antes del siguiente pago.';

    case TipoDocumento.estadoCuenta:
      return 'Documento informativo del avance de pagos de su obra. Los montos '
          'están expresados en pesos mexicanos (MXN). Para cualquier aclaración '
          'comuníquese con $empresa.';
  }
}

/// El texto que realmente se imprime. Documento → empresa → integrado.
///
/// `textosEmpresa` los sirve [TextosPdfService] desde `empresa_config.pdf_textos`
/// (migración 0033), con caché en SharedPreferences para que el PDF salga bien
/// sin señal: lo que se escribe en la web aparece en el celular y al revés.
/// Llega vacío solo si nadie ha escrito ninguno, y entonces manda el integrado.
String resolverTextoFinal({
  required TipoDocumento tipo,
  String? documento,
  Map<TipoDocumento, String>? textosEmpresa,
  required ContextoTextoFinal ctx,
}) {
  if (_hayTexto(documento)) return documento!.trim();

  final general = textosEmpresa?[tipo];
  if (_hayTexto(general)) return general!.trim();

  return textoIntegrado(tipo, ctx);
}

/// De dónde salió el texto que se está imprimiendo. Alimenta la insignia.
enum OrigenTexto { documento, empresa, integrado }

OrigenTexto origenTextoFinal({
  required TipoDocumento tipo,
  String? documento,
  Map<TipoDocumento, String>? textosEmpresa,
}) {
  if (_hayTexto(documento)) return OrigenTexto.documento;
  if (_hayTexto(textosEmpresa?[tipo])) return OrigenTexto.empresa;
  return OrigenTexto.integrado;
}
