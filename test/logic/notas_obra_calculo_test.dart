import 'package:flutter_test/flutter_test.dart';

import 'package:constructorpro/domain/logic/notas_obra_calculo.dart';

/// Prueba de PARIDAD con `web/src/lib/data/notas-obra-calculo.test.ts`: mismos
/// casos y mismos números. La misma nota se abre desde la oficina y desde el
/// celular, y que cada lado calcule un saldo distinto es un problema con un
/// socio enfrente, no un detalle.
///
/// El caso guía es la nota REAL que originó la funcionalidad (Orlando Ramoz,
/// Casas Bienestar MZ 2 LT 1):
///
///   BASE DE TINACOS 123 000 | PRETIL 25 000 | RECORTE DE PUERTAS 8 400
///   TOTAL 156 400
///   PROYECCIÓN 11/AGOST/26: 62,000 − 4%(RETENCIÓN) = 60 000
///   156 400 − 60 000 = 90 400   ← el papel; la aritmética da 96,400
void main() {
  const notaDeOrlando = [
    RenglonCalc(tipo: TipoRenglon.concepto, monto: 123000),
    RenglonCalc(tipo: TipoRenglon.concepto, monto: 25000),
    RenglonCalc(tipo: TipoRenglon.concepto, monto: 8400),
    // El acuerdo fue 60,000 aunque 62,000 − 4% den 59,520: el monto fijado manda.
    RenglonCalc(
        tipo: TipoRenglon.pago, monto: 60000, montoBase: 62000, porcentaje: 4),
    RenglonCalc(tipo: TipoRenglon.texto),
  ];

  group('montoSugerido', () {
    test('sin bruto no hay sugerencia: el monto se captura directo', () {
      expect(montoSugerido(TipoRenglon.pago, null, 4), isNull);
    });

    test('sin porcentaje el sugerido es el bruto', () {
      expect(montoSugerido(TipoRenglon.pago, 62000, null), 62000);
    });

    test('un PAGO con retención vale lo que queda después de retener', () {
      expect(montoSugerido(TipoRenglon.pago, 62000, 4), 59520);
    });

    test('una DEDUCCION con porcentaje vale la parte retenida, no el resto', () {
      expect(montoSugerido(TipoRenglon.deduccion, 100000, 4), 4000);
    });
  });

  group('montoEfectivo', () {
    test('un TEXTO nunca suma, aunque traiga monto', () {
      expect(montoEfectivo(const RenglonCalc(tipo: TipoRenglon.texto, monto: 99999)), 0);
    });

    test('el monto fijado le gana al sugerido', () {
      expect(
        montoEfectivo(const RenglonCalc(
            tipo: TipoRenglon.pago, monto: 60000, montoBase: 62000, porcentaje: 4)),
        60000,
      );
    });

    test('sin monto fijado cae al sugerido', () {
      expect(
        montoEfectivo(const RenglonCalc(
            tipo: TipoRenglon.pago, montoBase: 62000, porcentaje: 4)),
        59520,
      );
    });

    test('sin monto ni bruto vale cero, no NaN', () {
      expect(montoEfectivo(const RenglonCalc(tipo: TipoRenglon.concepto)), 0);
    });
  });

  group('calcularTotales — la nota de Orlando', () {
    final t = calcularTotales(renglones: notaDeOrlando);

    test('el total es la suma de los conceptos', () {
      expect(t.subtotal, 156400);
      expect(t.total, 156400);
      expect(t.totalFijado, isFalse);
    });

    test('el saldo descuenta la proyección pagada', () {
      expect(t.pagado, 60000);
      expect(t.saldo, 96400);
      expect(t.saldoFijado, isFalse);
    });

    /// La nota de papel cierra en 90,400, pero 156,400 − 60,000 son 96,400: en
    /// el original faltan 6,000 sin explicar. No se "arregla" el dato ni se
    /// fuerza la fórmula — es un caso REAL de por qué el saldo se fija a mano.
    test('el 90,400 del papel es lo que resuelve el saldo fijado', () {
      final conPapel =
          calcularTotales(saldoOverride: 90400, renglones: notaDeOrlando);
      expect(conPapel.saldoCalculado, 96400);
      expect(conPapel.saldo, 90400);
      expect(conPapel.saldoFijado, isTrue);
    });
  });

  group('calcularTotales — deducciones y valores fijados', () {
    test('las DEDUCCION restan del subtotal antes del total', () {
      final t = calcularTotales(renglones: const [
        RenglonCalc(tipo: TipoRenglon.concepto, monto: 100000),
        RenglonCalc(tipo: TipoRenglon.deduccion, montoBase: 100000, porcentaje: 4),
      ]);
      expect(t.subtotal, 100000);
      expect(t.deducciones, 4000);
      expect(t.total, 96000);
    });

    test('el total fijado pisa al calculado y arrastra al saldo', () {
      final t = calcularTotales(totalOverride: 160000, renglones: notaDeOrlando);
      expect(t.totalCalculado, 156400);
      expect(t.total, 160000);
      expect(t.totalFijado, isTrue);
      expect(t.saldo, 100000);
    });

    test('el saldo fijado pisa al calculado sin tocar el total', () {
      final t = calcularTotales(saldoOverride: 90000, renglones: notaDeOrlando);
      expect(t.total, 156400);
      expect(t.saldoCalculado, 96400);
      expect(t.saldo, 90000);
      expect(t.saldoFijado, isTrue);
    });

    test('fijar el MISMO número que el cálculo no se marca como intervenido', () {
      final t = calcularTotales(totalOverride: 156400, renglones: notaDeOrlando);
      expect(t.totalFijado, isFalse);
    });

    test('una nota vacía da ceros, no NaN', () {
      final t = calcularTotales(renglones: const []);
      expect(t.subtotal, 0);
      expect(t.total, 0);
      expect(t.saldo, 0);
    });

    test('los centavos no arrastran cola binaria', () {
      final t = calcularTotales(renglones: const [
        RenglonCalc(tipo: TipoRenglon.concepto, monto: 0.1),
        RenglonCalc(tipo: TipoRenglon.concepto, monto: 0.2),
      ]);
      expect(t.subtotal, 0.3);
    });
  });

  group('cadenas que viajan a Supabase', () {
    test('ida y vuelta de los cuatro tipos', () {
      for (final t in TipoRenglon.values) {
        expect(tipoRenglonDeCadena(tipoRenglonACadena(t)), t);
      }
    });

    test('son las MISMAS cadenas que escribe la web', () {
      expect(tipoRenglonACadena(TipoRenglon.concepto), 'CONCEPTO');
      expect(tipoRenglonACadena(TipoRenglon.deduccion), 'DEDUCCION');
      expect(tipoRenglonACadena(TipoRenglon.pago), 'PAGO');
      expect(tipoRenglonACadena(TipoRenglon.texto), 'TEXTO');
      expect(estadoNotaACadena(EstadoNota.abierta), 'ABIERTA');
      expect(estadoNotaACadena(EstadoNota.liquidada), 'LIQUIDADA');
    });

    test('un tipo desconocido del servidor no revienta la pantalla', () {
      expect(tipoRenglonDeCadena('ALGO_NUEVO'), TipoRenglon.concepto);
      expect(tipoRenglonDeCadena(null), TipoRenglon.concepto);
    });
  });
}
