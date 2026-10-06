import 'package:flutter_test/flutter_test.dart';

import 'package:constructorpro/core/pdf/textos_finales.dart';

import '../contracts/golden_loader.dart';

/// Prueba de PARIDAD contra los vectores dorados de `contracts/pdf/`.
///
/// Los textos esperados viven LITERALES en los `.golden.json`, que lee también
/// `web/src/lib/pdf/textos-finales.test.ts`. El riesgo real no es que la
/// función falle sola: es que alguien cambie la redacción en una plataforma y
/// no en la otra, y el mismo documento salga con condiciones distintas según
/// desde dónde se mandó. Por eso el texto se compara contra el contrato y no
/// contra la propia función.
void main() {
  TipoDocumento tipoDe(String s) => switch (s) {
        'nota' => TipoDocumento.nota,
        'estado_cuenta' => TipoDocumento.estadoCuenta,
        _ => TipoDocumento.cotizacion,
      };

  ContextoTextoFinal ctxDe(MapaGolden m) => ContextoTextoFinal(
        nombreEmpresa: m.texto('nombreEmpresa'),
        ivaEnabled: m.bandera('ivaEnabled'),
        ivaPct: m.numero('ivaPct'),
        destinatario: m.textoOpcional('destinatario'),
      );

  Map<TipoDocumento, String> empresaDe(MapaGolden m) => {
        for (final e in m.mapaDeTextos('empresa').entries) tipoDe(e.key): e.value,
      };

  group('contrato pdf/texto-integrado', () {
    final contrato = cargarContrato('pdf/texto-integrado');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        expect(
          textoIntegrado(
            tipoDe(caso.entrada.texto('tipo')),
            ctxDe(caso.entrada.mapa('ctx')),
          ),
          caso.esperado.texto('texto'),
        );
      });
    }
  });

  group('contrato pdf/resolver-texto-final', () {
    final contrato = cargarContrato('pdf/resolver-texto-final');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        final tipo = tipoDe(caso.entrada.texto('tipo'));
        final ctx = ctxDe(caso.entrada.mapa('ctx'));
        final documento = caso.entrada.textoOpcional('documento');
        final empresa = empresaDe(caso.entrada);

        final resuelto = resolverTextoFinal(
          tipo: tipo,
          documento: documento,
          textosEmpresa: empresa,
          ctx: ctx,
        );

        // `esperado.texto == null` significa «el mismo que devuelve
        // textoIntegrado»: el literal ya vive en pdf/texto-integrado y
        // repetirlo aquí sería la copia que estos contratos vienen a quitar.
        final esperado = caso.esperado.textoOpcional('texto');
        expect(resuelto, esperado ?? textoIntegrado(tipo, ctx));

        expect(
          origenTextoFinal(tipo: tipo, documento: documento, textosEmpresa: empresa),
          switch (caso.esperado.texto('origen')) {
            'documento' => OrigenTexto.documento,
            'empresa' => OrigenTexto.empresa,
            _ => OrigenTexto.integrado,
          },
        );
      });
    }
  });

  /// Fuera del contrato: no es un texto concreto, es una garantía de forma.
  group('resolverTextoFinal — garantías que no son un texto', () {
    const ctx = ContextoTextoFinal(
      nombreEmpresa: 'ConstructorPro',
      ivaEnabled: true,
      ivaPct: 16,
    );

    test('nunca devuelve cadena vacía', () {
      // Si alguien quiere un documento SIN párrafo final, la forma de decirlo
      // no puede ser dejar un campo en blanco por descuido.
      expect(
        resolverTextoFinal(tipo: TipoDocumento.cotizacion, documento: '', ctx: ctx),
        isNotEmpty,
      );
    });

    test('el tope de longitud es el mismo para los tres tipos', () {
      for (final tipo in TipoDocumento.values) {
        expect(
          resolverTextoFinal(tipo: tipo, ctx: ctx).length,
          lessThanOrEqualTo(largoMaximoTextoFinal),
        );
      }
    });
  });
}
