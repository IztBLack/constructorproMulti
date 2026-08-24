import 'package:flutter_test/flutter_test.dart';

import 'package:constructorpro/core/pdf/textos_finales.dart';

/// Prueba de PARIDAD con `web/src/lib/pdf/textos-finales.test.ts`.
///
/// El riesgo real no es que la función falle sola: es que alguien cambie la
/// redacción en una plataforma y no en la otra, y el mismo documento salga con
/// condiciones distintas según desde dónde se mandó. Por eso los textos
/// esperados están escritos LITERALES aquí y allá, en vez de compararse contra
/// la propia función.
void main() {
  const ctx = ContextoTextoFinal(
    nombreEmpresa: 'ConstructorPro',
    ivaEnabled: true,
    ivaPct: 16,
  );

  group('textoIntegrado', () {
    test('la cotización dice exactamente lo que dice la web', () {
      expect(
        textoIntegrado(TipoDocumento.cotizacion, ctx),
        'Esta cotización tiene una vigencia de 30 días naturales a partir de la '
        'fecha de emisión. Los precios están expresados en pesos mexicanos (MXN). '
        'Los precios incluyen IVA (16%). Para consultas o aclaraciones '
        'comuníquese con ConstructorPro.',
      );
    });

    test('sin IVA cambia solo la leyenda', () {
      final sin = textoIntegrado(
        TipoDocumento.cotizacion,
        const ContextoTextoFinal(nombreEmpresa: 'ConstructorPro'),
      );
      expect(sin, contains('Los precios no incluyen IVA.'));
      expect(sin, isNot(contains('incluyen IVA (16%)')));
    });

    test('el porcentaje entero se imprime sin decimales', () {
      // 16.0 tiene que salir "16%", no "16.0%": así lo escribe la web.
      expect(
        textoIntegrado(
          TipoDocumento.cotizacion,
          const ContextoTextoFinal(
            nombreEmpresa: 'ConstructorPro',
            ivaEnabled: true,
            ivaPct: 8,
          ),
        ),
        contains('IVA (8%)'),
      );
    });

    test('la nota nombra a las dos partes del trato', () {
      expect(
        textoIntegrado(
          TipoDocumento.nota,
          const ContextoTextoFinal(
            nombreEmpresa: 'ConstructorPro',
            destinatario: 'ORLANDO RAMOZ',
          ),
        ),
        'Relación de trabajos y pagos acordados entre ConstructorPro y '
        'ORLANDO RAMOZ. Montos en pesos mexicanos (MXN). Cualquier diferencia '
        'se aclara antes del siguiente pago.',
      );
    });

    test('una nota sin destinatario no imprime un hueco vacío', () {
      expect(
        textoIntegrado(
          TipoDocumento.nota,
          const ContextoTextoFinal(nombreEmpresa: 'ConstructorPro', destinatario: '   '),
        ),
        contains('entre ConstructorPro y la parte indicada.'),
      );
    });

    test('sin nombre de empresa cae a la marca', () {
      expect(
        textoIntegrado(
          TipoDocumento.estadoCuenta,
          const ContextoTextoFinal(nombreEmpresa: ''),
        ),
        contains('comuníquese con ConstructorPro.'),
      );
    });
  });

  group('resolverTextoFinal — quién gana', () {
    test('sin nada escrito, el integrado', () {
      expect(
        resolverTextoFinal(tipo: TipoDocumento.cotizacion, ctx: ctx),
        textoIntegrado(TipoDocumento.cotizacion, ctx),
      );
    });

    test('el de la empresa le gana al integrado', () {
      expect(
        resolverTextoFinal(
          tipo: TipoDocumento.cotizacion,
          textosEmpresa: const {TipoDocumento.cotizacion: 'Vigencia de 15 días.'},
          ctx: ctx,
        ),
        'Vigencia de 15 días.',
      );
    });

    test('el del documento le gana a todos', () {
      expect(
        resolverTextoFinal(
          tipo: TipoDocumento.cotizacion,
          documento: 'Precios firmes hasta el 30 de septiembre.',
          textosEmpresa: const {TipoDocumento.cotizacion: 'Vigencia de 15 días.'},
          ctx: ctx,
        ),
        'Precios firmes hasta el 30 de septiembre.',
      );
    });

    test('un texto en blanco no cuenta: cae al siguiente nivel', () {
      expect(
        resolverTextoFinal(
          tipo: TipoDocumento.cotizacion,
          documento: '   \n  ',
          textosEmpresa: const {TipoDocumento.cotizacion: 'De empresa.'},
          ctx: ctx,
        ),
        'De empresa.',
      );
    });

    test('el texto general de OTRO tipo no se cuela', () {
      expect(
        resolverTextoFinal(
          tipo: TipoDocumento.nota,
          textosEmpresa: const {TipoDocumento.cotizacion: 'Vigencia de 15 días.'},
          ctx: ctx,
        ),
        textoIntegrado(TipoDocumento.nota, ctx),
      );
    });

    test('nunca devuelve cadena vacía', () {
      expect(
        resolverTextoFinal(tipo: TipoDocumento.cotizacion, documento: '', ctx: ctx),
        isNotEmpty,
      );
    });
  });

  group('origenTextoFinal', () {
    test('distingue los tres orígenes', () {
      expect(origenTextoFinal(tipo: TipoDocumento.cotizacion), OrigenTexto.integrado);
      expect(
        origenTextoFinal(
          tipo: TipoDocumento.cotizacion,
          textosEmpresa: const {TipoDocumento.cotizacion: 'x'},
        ),
        OrigenTexto.empresa,
      );
      expect(
        origenTextoFinal(tipo: TipoDocumento.cotizacion, documento: 'x'),
        OrigenTexto.documento,
      );
    });

    test('un documento en blanco no se marca como personalizado', () {
      expect(
        origenTextoFinal(tipo: TipoDocumento.cotizacion, documento: '  '),
        OrigenTexto.integrado,
      );
    });
  });
}
