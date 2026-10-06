import 'package:flutter_test/flutter_test.dart';

import 'package:constructorpro/core/pdf/textos_finales.dart';
import 'package:constructorpro/domain/logic/notas_obra_calculo.dart';

import '../contracts/golden_loader.dart';

/// Constantes que las dos plataformas declaran por separado y que tienen que
/// valer lo mismo. No son fórmulas, pero si se separan el efecto es el mismo:
/// dos comportamientos distintos para el mismo dato.
///
/// El contrato es `contracts/comunes/constantes.golden.json`, que lee también
/// `web/src/lib/contracts/constantes.test.ts`.
void main() {
  final valores = <String, num>{
    'LARGO_MAXIMO_TEXTO_FINAL': largoMaximoTextoFinal,
    'PASO_ORDEN_RENGLON': pasoOrdenRenglon,
  };

  group('contrato comunes/constantes', () {
    final contrato = cargarContrato('comunes/constantes');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        final nombre = caso.entrada.texto('constante');
        expect(valores.containsKey(nombre), isTrue,
            reason: 'El contrato declara $nombre y el móvil no la expone.');
        expect(valores[nombre], caso.esperado.numero('valor'));
      });
    }
  });
}
