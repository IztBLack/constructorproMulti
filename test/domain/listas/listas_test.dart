import 'dart:convert';
import 'dart:io';

import 'package:constructorpro/domain/listas/leer_nota_material.dart';
import 'package:constructorpro/domain/listas/listas_calculo.dart';
import 'package:flutter_test/flutter_test.dart';

/// Los casos viven en `web/src/lib/listas/casos.json` y los lee también la
/// prueba de la web: si una plataforma lee la nota distinto, falla aquí.
void main() {
  final casos = json.decode(
          File('web/src/lib/listas/casos.json').readAsStringSync())
      as Map<String, dynamic>;

  double? d(Object? v) => (v as num?)?.toDouble();

  group('leerNotaMaterial', () {
    for (final c in (casos['lectura'] as List).cast<Map<String, dynamic>>()) {
      test(c['nombre'], () {
        final leidos = leerNotaMaterial(c['texto'] as String);
        final esperados =
            (c['renglones'] as List).cast<Map<String, dynamic>>();
        expect(leidos.length, esperados.length);
        for (var i = 0; i < esperados.length; i++) {
          final e = esperados[i];
          final r = leidos[i];
          final donde = 'renglón $i («${r.linea}»)';
          expect(r.seccion, e['seccion'], reason: donde);
          expect(tipoRenglonListaACadena(r.tipo), e['tipo'], reason: donde);
          expect(r.cantidad, d(e['cantidad']), reason: donde);
          expect(r.largo, d(e['largo']), reason: donde);
          expect(r.separacionCm, d(e['separacionCm']), reason: donde);
          expect(r.unidad, e['unidad'], reason: donde);
          expect(r.descripcion, e['descripcion'], reason: donde);
          expect(r.nota, e['nota'], reason: donde);
          expect(r.duda != null, e['conDuda'], reason: '$donde: ${r.duda}');
        }
      });
    }

    test('nada se descarta: una línea incomprensible queda para revisar', () {
      final r = leerNotaMaterial('Trabes\nestribo 25');
      expect(r, hasLength(1));
      expect(r.single.duda, isNotNull);
      expect(r.single.descripcion, 'estribo 25');
    });
  });

  group('estribosPorPieza', () {
    for (final c in (casos['estribos'] as List).cast<Map<String, dynamic>>()) {
      test('${c['largo']} m @${c['separacionCm']}', () {
        expect(estribosPorPieza(d(c['largo']), d(c['separacionCm'])),
            c['porPieza']);
      });
    }
  });

  group('totalesDe', () {
    for (final c in (casos['totales'] as List).cast<Map<String, dynamic>>()) {
      test(c['nombre'], () {
        final t = totalesDe([
          for (final r
              in (c['renglones'] as List).cast<Map<String, dynamic>>())
            RenglonListaCalc(
              tipo: tipoRenglonListaDeCadena(r['tipo'] as String),
              cantidad: d(r['cantidad'])!,
              largo: d(r['largo']),
              separacionCm: d(r['separacionCm']),
              marcado: r['marcado'] as bool,
            ),
        ]);
        final e = c['esperado'] as Map<String, dynamic>;
        expect(t.renglones, e['renglones']);
        expect(t.marcados, e['marcados']);
        expect(t.piezas, d(e['piezas']));
        expect(t.metros, d(e['metros']));
        expect(t.estribos, e['estribos']);
      });
    }
  });

  group('agruparPorSeccion', () {
    test('respeta el orden de aparición', () {
      final g = agruparPorSeccion(
          ['Trabes:a', 'Pasillo:b', 'Trabes:c'], (s) => s.split(':').first);
      expect(g.map((e) => e.$1), ['Trabes', 'Pasillo']);
      expect(g.first.$2, ['Trabes:a', 'Trabes:c']);
    });
  });

  group('formato', () {
    test('numeroCorto y metros2', () {
      expect(numeroCorto(4), '4');
      expect(numeroCorto(2.5), '2.5');
      expect(numeroCorto(10.45), '10.45');
      expect(metros2(3), '3.00');
    });
  });
}
