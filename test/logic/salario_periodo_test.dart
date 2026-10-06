import 'package:flutter_test/flutter_test.dart';
import 'package:constructorpro/domain/logic/salario_periodo.dart';

import '../contracts/golden_loader.dart';

/// Prueba de PARIDAD contra los vectores dorados de `contracts/nomina/`.
///
/// El usuario captura el sueldo SEMANAL, QUINCENAL o MENSUAL; el salario diario
/// —el número que después multiplica la nómina— se deriva de aquí y no se edita
/// a mano. Un error en esta división no se ve en pantalla: se ve en el sobre. Y
/// como el mismo colaborador se da de alta indistintamente desde la web o desde
/// el celular, los dos tienen que dividir igual.
///
/// Los casos viven en `contracts/nomina/dias-del-periodo.golden.json` y
/// `contracts/nomina/salario-diario.golden.json`, que lee también
/// `web/src/lib/data/salario.test.ts`.
void main() {
  group('contrato nomina/dias-del-periodo', () {
    final contrato = cargarContrato('nomina/dias-del-periodo');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        final periodo = periodoPagoFromCode(caso.entrada.texto('periodo'));
        final dias = periodo.diasDelPeriodo(caso.entrada.entero('diasSemana'));

        expect(dias, caso.coincide(caso.esperado.numero('dias')));
      });
    }
  });

  group('contrato nomina/salario-diario', () {
    final contrato = cargarContrato('nomina/salario-diario');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        final diario = salarioDiarioDesdePeriodo(
          caso.entrada.numeroOpcional('montoPeriodo'),
          periodoPagoFromCode(caso.entrada.texto('periodo')),
          caso.entrada.entero('diasSemana'),
        );

        final esperado = caso.esperado.numeroOpcional('salarioDiario');
        if (esperado == null) {
          expect(diario, isNull);
        } else {
          expect(diario, caso.coincide(esperado));
        }
      });
    }
  });

  /// Fuera del contrato: el código persistido no es un número, es una cadena
  /// que viaja a Supabase y vuelve. Aquí se fija su lectura, incluido el caso
  /// de una fila vieja o corrupta, que en la web no existe porque allá el tipo
  /// lo garantiza el compilador.
  group('periodoPagoFromCode', () {
    test('lee los tres códigos que escribe la web', () {
      expect(periodoPagoFromCode('SEMANAL'), PeriodoPago.semanal);
      expect(periodoPagoFromCode('QUINCENAL'), PeriodoPago.quincenal);
      expect(periodoPagoFromCode('MENSUAL'), PeriodoPago.mensual);
    });

    test('un código nulo o desconocido cae a MENSUAL, no revienta', () {
      expect(periodoPagoFromCode(null), PeriodoPago.mensual);
      expect(periodoPagoFromCode('DIARIO'), PeriodoPago.mensual);
      expect(periodoPagoFromCode('semanal'), PeriodoPago.mensual);
    });

    test('el código de ida y vuelta es el mismo', () {
      for (final p in PeriodoPago.values) {
        expect(periodoPagoFromCode(p.code), p);
      }
    });
  });
}
