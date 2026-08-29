import 'dart:convert';
import 'dart:io';

import 'package:constructorpro/domain/logic/models_proyeccion.dart';
import 'package:constructorpro/domain/logic/redondeo.dart';
import 'package:flutter_test/flutter_test.dart';

/// CONTRATO del escenario guardado, contra el fixture COMPARTIDO
/// `test/fixtures/proyeccion_v1.json`.
///
/// Su gemela de la web es `web/src/lib/data/proyeccion-contrato.test.ts`, y lee
/// **el mismo archivo**. Ahí está la diferencia con las otras pruebas de
/// paridad del proyecto (`textos_finales_test.dart`,
/// `notas_obra_calculo_test.dart`), que espejan los casos a mano: eso sirve
/// para comparar RESULTADOS —si una calculadora falla, su prueba lo grita—,
/// pero no para comparar FORMATOS. Dos pruebas espejadas pueden estar las dos
/// en verde mientras cada lado escribe un nombre de llave distinto, porque cada
/// una lee lo que ella misma escribió. Con un archivo único ese punto ciego
/// desaparece: renombrar una llave de un lado pone roja a la otra plataforma.
///
/// Lo que se protege no es un detalle de formato. Si la web escribiera
/// `'salarios'` donde el móvil lee `'salario'`, `fromJson` —tolerante a llaves
/// faltantes a propósito— abriría el escenario con los sueldos BASE en vez de
/// los que alguien ajustó a mano. Nada falla, la pantalla se ve bien, y el
/// número que sale mal es el que alguien se lleva al banco.
///
/// Ver `docs/PARIDAD_PROYECCION_WEB.md`.
void main() {
  final crudo =
      jsonDecode(File('test/fixtures/proyeccion_v1.json').readAsStringSync())
          as Map<String, Object?>;

  test('el fixture da la vuelta completa sin perder ni cambiar nada', () {
    final regenerado = ProyeccionEstado.fromJson(crudo).toJson();

    // Comparación profunda: caza una llave renombrada, una que se perdió por el
    // camino y un código de enum que cambió de texto.
    expect(regenerado, equals(crudo));
  });

  test('las llaves de primer nivel son exactamente estas trece', () {
    // Una llave NUEVA que no esté aquí es una que la web todavía no sabe
    // escribir: la lista se toca a la vez que su gemela, o no se toca.
    expect(
      ProyeccionEstado.fromJson(crudo).toJson().keys.toSet(),
      equals({
        'v',
        'lunes',
        'participantes',
        'dias',
        'destajo',
        'salario',
        'sueldo',
        'plazas',
        'ajustes',
        'simular',
        'obraPorDia',
        'obraBase',
        'redondeo',
      }),
    );
  });

  test('el fixture ejercita de verdad cada rama del formato', () {
    // Un fixture que no toque una rama no la protege. Esto fija que siga
    // completo si alguien lo edita.
    final e = ProyeccionEstado.fromJson(crudo);

    expect(e.participantes, hasLength(3));
    expect(e.plazas, hasLength(1), reason: 'sin plaza no se prueba el prefijo');
    expect(e.sueldoOverride, hasLength(2));
    expect(e.ajustes, hasLength(3), reason: 'un ajuste de cada tipo');
    expect(
      e.ajustes.map((a) => a.tipo).toSet(),
      equals(TipoAjuste.values.toSet()),
    );
    expect(e.redondeo.activo, isTrue,
        reason: 'apagado no serializa modo ni campos de verdad');
    expect(e.obraPorDia, isNotEmpty, reason: 'el mapa anidado por índice de día');
    expect(e.obraBase, isNotEmpty, reason: 'la obra asignada dentro del escenario');
    expect(e.simularCompleta, isTrue);
  });

  group('un escenario mal formado no tumba la pantalla', () {
    // El escritor nuevo es JavaScript, donde un `undefined` se serializa como
    // `null` sin que nadie se entere. Antes, cualquiera de estos casos lanzaba
    // y se llevaba por delante la lista ENTERA de proyecciones guardadas, no
    // solo la fila mala.
    //
    // La regla es SALTAR lo que no se entiende, nunca inventar un valor: en una
    // raya, una cifra ausente se ve; una cifra inventada, no.

    Map<String, Object?> conBasura(String llave, Object? valor) => {
          ...crudo,
          llave: valor,
        };

    test('un null donde iba un número se salta, no lanza', () {
      final e = ProyeccionEstado.fromJson(
        conBasura('destajo', {'c-adrian': null, 'c-camilo': 300}),
      );
      expect(e.destajoEstimado, equals({'c-camilo': 300.0}),
          reason: 'la entrada buena sobrevive a la mala');
    });

    test('un texto donde iba un número se salta', () {
      final e = ProyeccionEstado.fromJson(
        conBasura('salario', {'c-adrian': 'seiscientos', 'c-camilo': 620.75}),
      );
      expect(e.salarioOverride, equals({'c-camilo': 620.75}));
    });

    test('listas y mapas cambiados de tipo no lanzan', () {
      expect(
        () => ProyeccionEstado.fromJson(conBasura('participantes', 'c-adrian')),
        returnsNormally,
      );
      expect(
        () => ProyeccionEstado.fromJson(conBasura('dias', 42)),
        returnsNormally,
      );
      expect(
        () => ProyeccionEstado.fromJson(conBasura('redondeo', 'ARRIBA')),
        returnsNormally,
      );
    });

    test('un ajuste y una plaza sin id se saltan; los buenos se quedan', () {
      final e = ProyeccionEstado.fromJson({
        ...crudo,
        'ajustes': [
          {'tipo': 'DESTAJO', 'monto': 100},
          ...(crudo['ajustes']! as List),
        ],
        'plazas': {
          'plaza:rota': {'etiqueta': 'Sin id'},
          ...(crudo['plazas']! as Map).cast<String, Object?>(),
        },
      });

      expect(e.ajustes, hasLength(3), reason: 'el que no traía id se fue');
      expect(e.plazas.keys, equals(['plaza:pl-1']));
    });

    test('el redondeo con campos basura conserva los que sí entiende', () {
      final e = ProyeccionEstado.fromJson(
        conBasura('redondeo', {
          'activo': true,
          'paso': 'cincuenta',
          'modo': 7,
          'campos': ['RAYA', null, 'NO_EXISTE', 42],
        }),
      );

      expect(e.redondeo.activo, isTrue);
      expect(e.redondeo.paso, 1, reason: 'el default, no el texto');
      expect(e.redondeo.modo, ModoRedondeo.alMasCercano);
      expect(e.redondeo.campos, equals({CampoRedondeo.rayaPersona}));
    });
  });
}
