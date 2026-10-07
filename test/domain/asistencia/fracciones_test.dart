import 'dart:io';

import 'package:constructorpro/domain/asistencia/fracciones.dart';
import 'package:flutter_test/flutter_test.dart';

/// Catálogo de fracciones del pase de lista (web:
/// `web/src/lib/asistencia/fracciones.ts`).
///
/// El primer grupo LEE la web y falla si el móvil se queda con otros valores,
/// otros símbolos u otras etiquetas (mismo enfoque que
/// `test/domain/bitacora/bitacora_reglas_test.dart`); el segundo fija los
/// ayudantes.
void main() {
  group('espejo de la web', () {
    final ts = File('web/src/lib/asistencia/fracciones.ts').readAsStringSync();

    test('opcionesFraccion tiene los valores, símbolos y etiquetas de la web, '
        'en su orden', () {
      final i = ts.indexOf('export const OPCIONES');
      expect(i, isNonNegative, reason: 'no se encontró OPCIONES en la web');
      final bloque = ts.substring(i, ts.indexOf('];', i));
      final web = [
        for (final m in RegExp(
          r"valor:\s*([\d.]+),\s*simbolo:\s*'([^']*)',\s*etiqueta:\s*'([^']*)'",
        ).allMatches(bloque))
          (double.parse(m.group(1)!), m.group(2)!, m.group(3)!),
      ];
      expect(web, hasLength(4));
      expect(
        [for (final o in opcionesFraccion) (o.valor, o.simbolo, o.etiqueta)],
        web,
      );
    });

    test('simboloFraccion devuelve lo mismo que etiquetaFraccion de la web', () {
      final i = ts.indexOf('export function etiquetaFraccion');
      expect(i, isNonNegative);
      final cuerpo = ts.substring(i, ts.indexOf('}', i));
      for (final m in RegExp(
        r"f === ([\d.]+)\) return '([^']*)'",
      ).allMatches(cuerpo)) {
        expect(simboloFraccion(double.parse(m.group(1)!)), m.group(2));
      }
      // El caso por defecto de la web (todo lo demás) es el punto de "Falta".
      final defecto = RegExp(r"return '([^']*)';\s*$").firstMatch(cuerpo.trim());
      expect(simboloFraccion(0), defecto!.group(1));
    });
  });

  group('ayudantes', () {
    test('cada valor tiene su símbolo y su nombre', () {
      expect(simboloFraccion(0), '·');
      expect(simboloFraccion(0.5), '½');
      expect(simboloFraccion(0.75), '¾');
      expect(simboloFraccion(1), '1');
      expect(nombreFraccion(0), 'Falta');
      expect(nombreFraccion(0.5), 'Medio');
      expect(nombreFraccion(0.75), 'Tres cuartos');
      expect(nombreFraccion(1), 'Completo');
    });

    test('un valor fuera del catálogo cae en Falta, como en la web', () {
      expect(simboloFraccion(0.3), '·');
      expect(nombreFraccion(0.3), 'Falta');
    });

    test('ningún símbolo es una letra que el lector de pantalla deletree', () {
      // "F" se leía "efe" en TalkBack: el nombre completo va aparte.
      for (final o in opcionesFraccion) {
        expect(o.simbolo, isNot(matches(RegExp(r'^[A-Za-z]$'))));
        expect(o.etiqueta.length, greaterThan(1));
      }
    });
  });
}
