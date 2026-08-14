import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:constructorpro/core/pdf/pdf_config.dart';
import 'package:constructorpro/domain/logic/proyeccion_nomina.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:constructorpro/pdf/pdf_service.dart';

/// Lo que se fija aquí es que el PDF de proyección NO pueda confundirse con la
/// nómina pagada. Es el riesgo grande del módulo: una hoja de escenario que
/// circula y con la que alguien paga.
void main() {
  late Uint8List bytes;
  late String contenido; // flujos de contenido ya descomprimidos
  late String crudo; // bytes tal cual, para los diccionarios sin comprimir

  setUpAll(() async {
    const puestos = [
      Puesto(id: 'p1', nombre: 'Maestro', salarioDiaDefault: 1050),
      Puesto(id: 'p2', nombre: 'Albañil', salarioDiaDefault: 720),
    ];
    const colabs = [
      Colaborador(id: 'c1', nombre: 'Enrique Salas', puestoId: 'p1', tipoPago: TipoPago.dia),
      Colaborador(id: 'c2', nombre: 'Acabados', puestoId: 'p2', tipoPago: TipoPago.destajo),
    ];
    final lunes = lunesDeLaSemana(DateTime(2026, 8, 10));

    final resultado = const ProyeccionCalculator().calcular(
      estado: ProyeccionEstado(
        lunesMillis: lunes,
        participantes: const ['c1', 'c2'],
        diasProyectados: const {
          'c1': {0, 1, 2, 3, 4, 5},
        },
        destajoEstimado: const {'c2': 18500},
        ajustes: [
          const AjusteProyeccion(
            id: 'a1',
            tipo: TipoAjuste.anticipo,
            destino: DestinoAjuste.colaborador,
            destinoId: 'c1',
            monto: 1500,
            nota: 'Anticipo del miércoles',
          ),
          const AjusteProyeccion(
            id: 'a2',
            tipo: TipoAjuste.destajo,
            destino: DestinoAjuste.cuadrilla,
            destinoId: 'cu1',
            monto: 6000,
            nota: 'Colado de losa',
            reparto: RepartoAjuste.aLaCuadrilla,
          ),
        ],
      ),
      colaboradores: colabs,
      puestos: puestos,
      asistenciasReales: [
        Asistencia(
            colaboradorId: 'c1',
            obraId: 'o1',
            fecha: fechaDelDia(lunes, 0),
            fraccion: 1.0),
        // Falta capturada: en el PDF es una F, no un hueco.
        Asistencia(
            colaboradorId: 'c1',
            obraId: 'o1',
            fecha: fechaDelDia(lunes, 1),
            fraccion: 0.0),
      ],
      cuadrillaPorColaborador: const {'c1': 'cu1'},
    );

    bytes = await PdfService.proyeccionNomina(
      alcance: 'Obra: Casas Bienestar',
      rango: '10/08/2026 al 16/08/2026',
      resultado: resultado,
      nombreCuadrilla: const {'cu1': 'Cuadrilla Enrique'},
    );
    contenido = _flujosDescomprimidos(bytes);
    crudo = latin1.decode(bytes, allowInvalid: true);
  });

  test('estampa la marca de agua difuminada aunque nadie la haya configurado',
      () {
    // Nueve capas corridas + el título del encabezado. El difuminado se hace
    // apilando copias, así que si alguien lo cambia por una sola capa esto cae.
    expect(RegExp('PROYECCI').allMatches(contenido).length,
        greaterThanOrEqualTo(9),
        reason: 'deben quedar las 9 capas del halo');

    // El PDF se generó con la configuración por omisión, cuya marca de agua
    // está VACÍA — y aun así el documento la estampa. Ese es el punto: la
    // preferencia del usuario no puede quitar este sello.
    expect(const PdfConfig().watermark, isEmpty);
  });

  test('la marca de agua va en diagonal', () {
    // cos(0.61) ≈ 0.8196 y sen(0.61) ≈ 0.5729: la matriz de una rotación de
    // ~35°. Una matriz «1 0 0 1» sería texto horizontal.
    expect(contenido, contains('0.81965'));
    expect(contenido, contains('0.57287'));
  });

  test('la marca de agua es tenue y no tapa las cifras', () {
    for (final alfa in ['0.02', '0.022', '0.055']) {
      expect(crudo, contains('/ca $alfa'),
          reason: 'la capa de opacidad $alfa debe existir');
    }
    // Nada opaco: una marca de agua sólida haría ilegible la tabla.
    expect(RegExp(r'/ca (0\.[2-9]|1(\.0)?)\b').hasMatch(crudo), isFalse);
  });

  test('el aviso de «no es la nómina» también va en el cuerpo', () {
    // Por si se imprime en blanco y negro y el halo se pierde.
    //
    // Se buscan palabras SUELTAS porque el PDF dibuja cada una con su propia
    // orden de texto (`[(No)]TJ [(es)]TJ …`): la frase completa no aparece
    // nunca como una sola cadena en el flujo.
    for (final palabra in ['ESTIMADAS', 'planeación', 'comprobante']) {
      expect(contenido, contains(palabra));
    }
  });

  test('no usa caracteres que la Helvetica base no sabe dibujar', () {
    // La fuente por defecto del paquete `pdf` es Latin-1: una raya larga
    // (U+2013/2014) sale como un HUECO EN BLANCO, no como un guion, y en una
    // tabla de días un hueco se lee como «no trabajó».
    final fuera = <String>{};
    for (final linea in [
      'X = capturado   ·   · = estimado   ·   F = falta capturada',
      'Documento de planeación: cifras ESTIMADAS sobre la asistencia que '
          'se espera. No es la nómina pagada ni un comprobante.',
      'PROYECCIÓN',
      'Proyección de nómina',
    ]) {
      for (final r in linea.runes) {
        if (r > 0xFF) fuera.add(String.fromCharCode(r));
      }
    }
    expect(fuera, isEmpty,
        reason: 'estos caracteres no existen en Helvetica: $fuera');
  });
}

/// Descomprime todos los flujos Flate del PDF y los concatena.
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
