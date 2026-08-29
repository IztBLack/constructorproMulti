import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:constructorpro/domain/logic/proyeccion_nomina.dart';
import 'package:constructorpro/domain/logic/redondeo_proyeccion.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:constructorpro/pdf/pdf_service.dart';
import 'package:flutter_test/flutter_test.dart';

/// El PDF tiene que decir la verdad sobre dos cosas que la pantalla ya dice:
///
///  1. **Qué parte del total no es gente contratada.** Una hoja que mezcla
///     personas reales con plazas hipotéticas y presenta un solo número es una
///     cifra que alguien lleva al banco.
///  2. **Que las cifras están redondeadas, y con qué regla.** Si el papel dijera
///     el exacto y la pantalla el redondeado, uno de los dos estaría mintiendo.
void main() {
  const puestos = [
    Puesto(id: 'pM', nombre: 'Maestro', salarioDiaDefault: 583.33),
  ];
  const juan = Colaborador(
      id: 'c1', nombre: 'Juan Perez', puestoId: 'pM', tipoPago: TipoPago.dia);

  final lunes = lunesDeLaSemana(DateTime(2026, 8, 24));

  /// Un escenario con una persona real y dos plazas de \$600/día.
  ProyeccionEstado escenario() =>
      ProyeccionEstado(lunesMillis: lunes, participantes: const ['c1'],
          diasProyectados: const {
            'c1': {0, 1, 2, 3, 4, 5}
          }).conPlazas([
        const PlazaProyectada(
          id: '${prefijoPlaza}1',
          etiqueta: 'Maestro 1',
          puestoId: 'pM',
          sueldo: SueldoProyectado(
              periodo: PeriodoPago.semanal, monto: 3600, diasSemana: 6),
        ),
        const PlazaProyectada(
          id: '${prefijoPlaza}2',
          etiqueta: 'Maestro 2',
          puestoId: 'pM',
          sueldo: SueldoProyectado(
              periodo: PeriodoPago.semanal, monto: 3600, diasSemana: 6),
        ),
      ]);

  ProyeccionResultado calcular(ProyeccionEstado estado) =>
      const ProyeccionCalculator().calcular(
        estado: estado,
        colaboradores: [
          juan,
          for (final p in estado.plazas.values) p.comoColaborador,
        ],
        puestos: puestos,
      );

  Future<String> generar({RedondeoConfig? config}) async {
    final estado = escenario();
    final resultado = calcular(estado);
    final bytes = await PdfService.proyeccionNomina(
      alcance: 'Todas las obras activas',
      rango: '24/08/2026 al 30/08/2026',
      resultado: resultado,
      nombre: 'Simulacion 20 de mayo',
      redondeada: config == null
          ? null
          : ProyeccionRedondeada(resultado, config),
    );
    return _flujosDescomprimidos(bytes);
  }

  test('las plazas se marcan y su dinero se declara aparte', () async {
    final contenido = await generar();

    // Se buscan palabras sueltas: el PDF dibuja cada una con su propia
    // instrucción de texto, así que una frase entera no aparece literal.
    for (final palabra in ['plaza', 'contratar', 'Maestro']) {
      expect(contenido, contains(palabra),
          reason: 'el papel debe distinguir las plazas: falta «$palabra»');
    }
    // 2 plazas x 6 dias x $600 = $7,200 declarados antes del total.
    expect(contenido, contains('7,200'),
        reason: 'lo que no es gente contratada se resta a la vista');
  });

  test('sin redondeo, el papel imprime el exacto y no dice nada de redondeo',
      () async {
    final contenido = await generar();
    // Juan: 6 x 583.33 = 3,499.98
    expect(contenido, contains('3,499.98'));
    expect(contenido, isNot(contains('redondead')));
  });

  test('con redondeo, el papel imprime lo mismo que la pantalla y lo declara',
      () async {
    final contenido = await generar(
      config: const RedondeoConfig(
        activo: true,
        paso: 100,
        modo: ModoRedondeo.haciaArriba,
        campos: {CampoRedondeo.rayaPersona, CampoRedondeo.totalSemana},
      ),
    );

    // La raya de Juan sube de 3,499.98 a 3,500.
    expect(contenido, contains('3,500'));

    // Y se dice con qué regla, más el exacto del gran total al pie. Se buscan
    // palabras SUELTAS: el PDF dibuja cada una con su propia instrucción de
    // texto, así que una frase entera no aparece literal en el flujo.
    expect(contenido, contains('redondeadas'));
    expect(contenido, contains('redondear:'),
        reason: 'el pie con la cifra exacta del gran total');
    expect(contenido, contains('10,699.98'),
        reason: 'y esa cifra exacta es la del total sin redondear');
  });

  test('el nombre de la proyección guardada va en el encabezado', () async {
    final contenido = await generar();
    // El encabezado va en mayúsculas (`_header` lo pone así para todos los
    // documentos), y cada palabra es su propia instrucción de texto.
    expect(contenido, contains('SIMULACION'),
        reason: 'dos impresiones de la misma semana tienen que distinguirse');
  });
}

/// Descomprime los flujos de contenido del PDF para poder buscar texto.
/// Copiado de `proyeccion_pdf_test.dart`, que hace lo mismo por lo mismo.
String _flujosDescomprimidos(Uint8List bytes) {
  final salida = StringBuffer();
  var i = 0;
  while (true) {
    final inicioTag = _indiceDe(bytes, 'stream', i);
    if (inicioTag < 0) break;
    var inicio = inicioTag + 'stream'.length;
    if (inicio < bytes.length && bytes[inicio] == 13) inicio++;
    if (inicio < bytes.length && bytes[inicio] == 10) inicio++;
    final fin = _indiceDe(bytes, 'endstream', inicio);
    if (fin < 0) break;
    i = fin + 'endstream'.length;
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
