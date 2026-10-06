import 'package:flutter_test/flutter_test.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:constructorpro/domain/logic/nomina_calculator.dart';

import '../contracts/golden_loader.dart';

/// Prueba de PARIDAD contra los vectores dorados de `contracts/nomina/`.
///
/// Los casos y los números NO viven aquí: viven en los `.golden.json`, que lee
/// también `web/src/lib/data/nomina-calculo.test.ts`. Esta fórmula está
/// duplicada en Dart y en TypeScript porque el móvil trabaja sin señal, y el
/// riesgo real no es que una de las dos esté mal por su cuenta, sino que dejen
/// de coincidir. Un caso nuevo se agrega en el JSON y las dos suites lo corren
/// solas (ver `contracts/README.md`).
void main() {
  const calc = NominaCalculator();

  Puesto puestoDe(MapaGolden m) => Puesto(
        id: m.texto('id'),
        nombre: m.texto('nombre'),
        salarioDiaDefault: m.numero('salarioDiaDefault'),
      );

  Colaborador colaboradorDe(MapaGolden m) => Colaborador(
        id: m.texto('id'),
        nombre: m.texto('nombre'),
        puestoId: m.texto('puestoId'),
        tipoPago:
            m.texto('tipoPago') == 'DESTAJO' ? TipoPago.destajo : TipoPago.dia,
        salarioPersonalizado: m.numeroOpcional('salarioPersonalizado'),
      );

  // La obra y la fecha no entran en el cálculo (el rango ya viene filtrado por
  // el llamador), así que el contrato no los pide y aquí se fijan.
  Asistencia asistenciaDe(MapaGolden m) => Asistencia(
        colaboradorId: m.texto('colaboradorId'),
        obraId: 'o1',
        fecha: 0,
        fraccion: m.numero('fraccion'),
      );

  Destajo destajoDe(MapaGolden m) => Destajo(
        colaboradorId: m.texto('colaboradorId'),
        obraId: 'o1',
        fecha: 0,
        monto: m.numero('monto'),
      );

  group('contrato nomina/calculo-nomina', () {
    final contrato = cargarContrato('nomina/calculo-nomina');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        final r = calc.calcular(
          colaboradores: caso.entrada.lista('colaboradores').map(colaboradorDe).toList(),
          asistencias: caso.entrada.lista('asistencias').map(asistenciaDe).toList(),
          destajos: caso.entrada.lista('destajos').map(destajoDe).toList(),
          puestos: caso.entrada.lista('puestos').map(puestoDe).toList(),
        );

        expect(r.totalDia, caso.coincide(caso.esperado.numero('totalDia')));
        expect(r.totalDestajo, caso.coincide(caso.esperado.numero('totalDestajo')));
        expect(r.totalNomina, caso.coincide(caso.esperado.numero('totalNomina')));

        final items = caso.esperado.lista('items');
        expect(r.items, hasLength(items.length));
        for (var i = 0; i < items.length; i++) {
          final esperado = items[i];
          final item = r.items[i];
          expect(item.colaborador.id, esperado.texto('colaboradorId'),
              reason: 'item $i: el orden de la nómina sigue al de los colaboradores');
          expect(item.puestoNombre, esperado.texto('puestoNombre'), reason: 'item $i');
          expect(item.totalDias, caso.coincide(esperado.numero('totalDias')),
              reason: 'item $i');
          expect(item.totalDestajos, caso.coincide(esperado.numero('totalDestajos')),
              reason: 'item $i');
          expect(item.salarioBaseCalculado,
              caso.coincide(esperado.numero('salarioBaseCalculado')),
              reason: 'item $i');
          expect(item.totalPagar, caso.coincide(esperado.numero('totalPagar')),
              reason: 'item $i');
        }
      });
    }
  });

  group('contrato nomina/semana', () {
    final contrato = cargarContrato('nomina/semana');

    for (final caso in contrato.casos) {
      test(caso.titulo, () {
        caso.anotaElPorque();
        final e = caso.entrada;
        // En el móvil la fecha es un DateTime local, y el dispositivo con el
        // que se pasa lista está en México: el calendario del contrato es el
        // calendario del aparato.
        final fecha = DateTime(
          e.entero('año'),
          e.entero('mes'),
          e.entero('dia'),
          e.entero('hora'),
          e.entero('minuto'),
        );

        final lunes = caso.esperado.mapa('lunes');
        final domingo = caso.esperado.mapa('domingo');

        final inicio = NominaCalculator.getStartOfWeek(fecha);
        expect(
          inicio,
          DateTime(lunes.entero('año'), lunes.entero('mes'), lunes.entero('dia')),
        );
        expect(inicio.weekday, DateTime.monday);

        final fin = NominaCalculator.getEndOfWeek(inicio);
        expect(
          DateTime(fin.year, fin.month, fin.day),
          DateTime(domingo.entero('año'), domingo.entero('mes'), domingo.entero('dia')),
        );
        expect(fin.weekday, DateTime.sunday);
        expect([fin.hour, fin.minute, fin.second, fin.millisecond],
            [23, 59, 59, 999]);
      });
    }
  });
}
