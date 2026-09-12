import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:constructorpro/core/db/app_database.dart';
import 'package:constructorpro/data/repositories_nota_obra.dart';
import 'package:constructorpro/pdf/pdf_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// El apartado «Para» de la NOTA DE OBRA y el desglose del % en las deducciones
/// (Supabase 0034), comprobados en el PDF que de verdad se manda por WhatsApp.
///
/// CÓMO SE COMPRUEBA. Qué se imprime y qué no se mide por el TAMAÑO del
/// archivo, como en `estado_cuenta_texto_final_test.dart`: si una línea llega a
/// la hoja, quitarla cambia el peso; si nunca llegó, no lo cambia. Sirve para
/// comparar dos variantes sin depender de cómo quedó escrito el texto.
///
/// Solo la prueba de la raya baja a los flujos descomprimidos, porque ahí sí
/// importa QUÉ carácter se dibujó y no nada más que se dibujara algo.
void main() {
  // `Fmt.date` usa el locale es_MX.
  setUpAll(() => initializeDateFormatting('es_MX'));

  const cuando = 1704067200000;

  NotaObraRow nota({String destinatario = '', bool mostrarPara = true}) =>
      NotaObraRow(
        empresaId: 'e1',
        createdAt: cuando,
        updatedAt: cuando,
        syncStatus: 'synced',
        orden: 100,
        id: 'n1',
        obraId: 'o1',
        destinatario: destinatario,
        titulo: 'MZ 2 LT 1',
        fecha: cuando,
        estado: 'ABIERTA',
        mostrarPara: mostrarPara,
        notas: '',
      );

  NotaObraRenglonRow renglon({
    required String tipo,
    bool mostrarPorcentaje = false,
  }) =>
      NotaObraRenglonRow(
        empresaId: 'e1',
        createdAt: cuando,
        updatedAt: cuando,
        syncStatus: 'synced',
        orden: 100,
        id: 'r1',
        notaId: 'n1',
        tipo: tipo,
        etiqueta: 'RETENCION',
        montoBase: 62000,
        porcentaje: 4,
        mostrarPorcentaje: mostrarPorcentaje,
        texto: '',
      );

  Future<int> peso(NotaConRenglones n) async {
    final bytes = await PdfService.notaObra(nota: n, obraNombre: 'Casa Bienestar');
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    return bytes.length;
  }

  group('apartado «Para»', () {
    test('con nombre se imprime y la opción no lo puede quitar', () async {
      final conOpcion = await peso(NotaConRenglones(
          nota(destinatario: 'ORLANDO RAMOZ', mostrarPara: true), const []));
      final sinOpcion = await peso(NotaConRenglones(
          nota(destinatario: 'ORLANDO RAMOZ', mostrarPara: false), const []));
      expect(conOpcion, sinOpcion,
          reason: 'habiendo nombre, «mostrar_para» no se consulta siquiera');
    });

    test('sin nombre, apagarlo quita la línea de la hoja', () async {
      final conRaya = await peso(NotaConRenglones(nota(), const []));
      final sinApartado =
          await peso(NotaConRenglones(nota(mostrarPara: false), const []));
      expect(conRaya, isNot(sinApartado),
          reason: 'si la línea no se imprimiera nunca, el peso no cambiaría');
    });

    test('la raya se dibuja: nada de caracteres que Helvetica no tenga',
        () async {
      // La fuente base del PDF es Latin-1. Una raya larga (U+2014) saldría como
      // un hueco en blanco y el apartado quedaría sin dónde escribir, que es
      // justo para lo que existe.
      final bytes = await PdfService.notaObra(
          nota: NotaConRenglones(nota(), const []), obraNombre: 'Casa Bienestar');
      // El PDF dibuja cada palabra con su propia orden de texto, así que se
      // busca la raya suelta y no la frase completa.
      expect(_flujosDescomprimidos(bytes), contains('____'));
    });
  });

  group('desglose del porcentaje', () {
    test('la DEDUCCIÓN lo oculta por default y lo enseña si se pide', () async {
      final callada = await peso(NotaConRenglones(
          nota(destinatario: 'ORLANDO RAMOZ'),
          [renglon(tipo: 'DEDUCCION')]));
      final hablada = await peso(NotaConRenglones(
          nota(destinatario: 'ORLANDO RAMOZ'),
          [renglon(tipo: 'DEDUCCION', mostrarPorcentaje: true)]));
      expect(callada, isNot(hablada));
    });

    test('un CONCEPTO enseña su cuenta pase lo que pase', () async {
      final a = await peso(NotaConRenglones(
          nota(destinatario: 'ORLANDO RAMOZ'), [renglon(tipo: 'CONCEPTO')]));
      final b = await peso(NotaConRenglones(nota(destinatario: 'ORLANDO RAMOZ'),
          [renglon(tipo: 'CONCEPTO', mostrarPorcentaje: true)]));
      expect(a, b,
          reason: '«mostrar_porcentaje» es cosa de las DEDUCCION y de nadie más');
    });
  });
}

/// Descomprime todos los flujos Flate del PDF y los concatena.
///
/// Copiado de `proyeccion_pdf_test.dart`: son cuatro líneas de lectura de bytes
/// que no pertenecen a la app, y moverlas a un archivo común obligaría a que
/// una prueba dependa de otra para algo que ninguna de las dos comprueba.
String _flujosDescomprimidos(Uint8List bytes) {
  final salida = StringBuffer();
  for (var i = 0; i < bytes.length - 6; i++) {
    if (String.fromCharCodes(bytes.sublist(i, i + 6)) != 'stream') continue;
    var inicio = i + 6;
    while (inicio < bytes.length &&
        (bytes[inicio] == 13 || bytes[inicio] == 10)) {
      inicio++;
    }
    final fin = _indiceDe(bytes, 'endstream', inicio);
    if (fin < 0) continue;
    try {
      salida.writeln(latin1.decode(
          const ZLibDecoder().decodeBytes(bytes.sublist(inicio, fin)),
          allowInvalid: true));
    } catch (_) {
      // No todos los flujos están comprimidos (fuentes, metadatos).
    }
  }
  return salida.toString();
}

int _indiceDe(List<int> bytes, String patron, int desde) {
  final p = patron.codeUnits;
  for (var i = desde; i < bytes.length - p.length; i++) {
    var coincide = true;
    for (var j = 0; j < p.length; j++) {
      if (bytes[i + j] != p[j]) {
        coincide = false;
        break;
      }
    }
    if (coincide) return i;
  }
  return -1;
}
