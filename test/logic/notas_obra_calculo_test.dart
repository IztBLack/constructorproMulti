import 'package:flutter_test/flutter_test.dart';

import 'package:constructorpro/domain/logic/notas_obra_calculo.dart';

import '../contracts/golden_loader.dart';

/// Prueba de PARIDAD contra los vectores dorados de `contracts/notas-obra/`.
///
/// Los casos y los números viven en los `.golden.json`, que lee también
/// `web/src/lib/data/notas-obra-calculo.test.ts`. La misma nota se abre desde
/// la oficina y desde el celular, y que cada lado calcule un saldo distinto es
/// un problema con un socio enfrente, no un detalle.
///
/// El caso guía de `totales-nota` es la nota REAL que originó la funcionalidad
/// (Orlando Ramoz, Casas Bienestar MZ 2 LT 1), con su descuadre de 6,000 y
/// todo: es el motivo de que el saldo se pueda fijar a mano.
void main() {
  TipoRenglon tipoDe(String s) => tipoRenglonDeCadena(s);

  RenglonCalc renglonDe(MapaGolden m) => RenglonCalc(
        tipo: tipoDe(m.texto('tipo')),
        monto: m.numeroOpcional('monto'),
        montoBase: m.numeroOpcional('montoBase'),
        porcentaje: m.numeroOpcional('porcentaje'),
      );

  group('contrato notas-obra/monto-sugerido', () {
    final contrato = cargarContrato('notas-obra/monto-sugerido');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        final sugerido = montoSugerido(
          tipoDe(caso.entrada.texto('tipo')),
          caso.entrada.numeroOpcional('montoBase'),
          caso.entrada.numeroOpcional('porcentaje'),
        );

        final esperado = caso.esperado.numeroOpcional('monto');
        if (esperado == null) {
          expect(sugerido, isNull);
        } else {
          expect(sugerido, caso.coincide(esperado));
        }
      });
    }
  });

  group('contrato notas-obra/monto-efectivo', () {
    final contrato = cargarContrato('notas-obra/monto-efectivo');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        expect(
          montoEfectivo(renglonDe(caso.entrada)),
          caso.coincide(caso.esperado.numero('monto')),
        );
      });
    }
  });

  group('contrato notas-obra/totales-nota', () {
    final contrato = cargarContrato('notas-obra/totales-nota');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        final t = calcularTotales(
          totalOverride: caso.entrada.numeroOpcional('totalOverride'),
          saldoOverride: caso.entrada.numeroOpcional('saldoOverride'),
          renglones: caso.entrada.lista('renglones').map(renglonDe).toList(),
        );

        final e = caso.esperado;
        expect(t.subtotal, caso.coincide(e.numero('subtotal')));
        expect(t.deducciones, caso.coincide(e.numero('deducciones')));
        expect(t.totalCalculado, caso.coincide(e.numero('totalCalculado')));
        expect(t.total, caso.coincide(e.numero('total')));
        expect(t.pagado, caso.coincide(e.numero('pagado')));
        expect(t.saldoCalculado, caso.coincide(e.numero('saldoCalculado')));
        expect(t.saldo, caso.coincide(e.numero('saldo')));
        expect(t.totalFijado, e.bandera('totalFijado'));
        expect(t.saldoFijado, e.bandera('saldoFijado'));
      });
    }
  });

  /// Fuera del contrato: la traducción a las cadenas que viajan a Supabase.
  /// En la web los tipos son uniones de literales y no hay nada que parsear;
  /// aquí sí, y es donde una nota escrita en el celular se leería mal en la
  /// oficina si las cadenas se separaran.
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

    test('ida y vuelta del estado de la nota', () {
      for (final e in EstadoNota.values) {
        expect(estadoNotaDeCadena(estadoNotaACadena(e)), e);
      }
      expect(estadoNotaDeCadena(null), EstadoNota.abierta);
    });
  });
}
