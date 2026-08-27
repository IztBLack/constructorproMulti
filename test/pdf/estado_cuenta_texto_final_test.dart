import 'package:constructorpro/core/pdf/textos_finales.dart';
import 'package:constructorpro/pdf/pdf_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// El ESTADO DE CUENTA DEL CLIENTE imprime su párrafo final, y elige el mismo
/// nivel que elegiría la web.
///
/// Existe porque durante un tiempo no lo imprimía: de los diez PDF del móvil
/// solo el presupuesto y la nota llevaban párrafo, así que el mismo documento,
/// para el mismo cliente, salía con condiciones o sin ellas según lo mandara la
/// oficina o el celular.
///
/// CÓMO SE COMPRUEBA. El paquete `pdf` comprime los flujos de texto, así que
/// buscar el párrafo dentro de los bytes no funciona, y la salida ni siquiera es
/// byte a byte idéntica entre dos renders iguales. Lo que sí es estable es el
/// TAMAÑO: si el párrafo llega a la hoja, cambiarlo cambia el peso del archivo,
/// y si no llega, no lo cambia. Sobre esa base se comparan los tres niveles.
///
/// La REDACCIÓN de cada texto no se fija aquí sino en
/// `test/logic/textos_finales_test.dart`, contra la de la web palabra por
/// palabra. Aquí solo se fija que este documento la consulte, y con su tipo.
void main() {
  // `Fmt.date` usa el locale es_MX.
  setUpAll(() => initializeDateFormatting('es_MX'));

  Future<int> pesoCon({
    String? textoFinalObra,
    Map<TipoDocumento, String> textosEmpresa = const {},
  }) async {
    final bytes = await PdfService.estadoCuentaCliente(
      obraNombre: 'Casa Bienestar',
      cliente: 'Juan Pérez',
      costoTotal: 100000,
      recibido: 60000,
      pendiente: 40000,
      pagos: const [(fecha: 1704067200000, concepto: 'Anticipo', monto: 40000)],
      textoFinalObra: textoFinalObra,
      textosEmpresa: textosEmpresa,
    );
    expect(bytes, isNotEmpty);
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    return bytes.length;
  }

  // Largo y repetitivo a propósito: con el texto comprimido, un párrafo corto
  // podría pesar casi lo mismo que el integrado y la comparación no probaría
  // nada.
  final propio = 'Condiciones propias de esta obra. ' * 18;

  test('el párrafo propio de la obra llega a la hoja', () async {
    expect(
      await pesoCon(textoFinalObra: propio),
      isNot(await pesoCon()),
      reason: 'si `obras.texto_final` no se imprimiera, el peso no cambiaría',
    );
  });

  test('a falta de propio, manda el texto general de la empresa', () async {
    expect(
      await pesoCon(textosEmpresa: {TipoDocumento.estadoCuenta: propio}),
      isNot(await pesoCon()),
    );
  });

  test('no se cuela el texto general de OTRO tipo de documento', () async {
    // El error fácil al copiar este bloque de `presupuesto` es dejar
    // `TipoDocumento.cotizacion`. Si pasara, el estado de cuenta saldría con la
    // vigencia de 30 días de una cotización y este peso cambiaría.
    expect(
      await pesoCon(textosEmpresa: {TipoDocumento.cotizacion: propio}),
      await pesoCon(),
      reason: 'el estado de cuenta solo lee el texto general de su propio tipo',
    );
  });
}
