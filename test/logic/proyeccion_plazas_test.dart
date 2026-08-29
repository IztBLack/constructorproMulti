import 'dart:convert';

import 'package:constructorpro/domain/logic/proyeccion_nomina.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

/// El contrato de las PLAZAS (puestos sin nadie todavía) y del SUELDO POR
/// PERIODO dentro del escenario:
///
///  1. Una plaza es un participante más. El calculador no la distingue: entra
///     como colaborador sintético y sus días, préstamos y ajustes funcionan
///     igual. Si algún día hay un `if (esPlaza)` dentro del calculador, este
///     test es el que debe caerse.
///  2. El sueldo capturado y el diario derivado se escriben SIEMPRE juntos.
///  3. Quitar a alguien se lleva todo lo suyo, plaza incluida.
///  4. El escenario sobrevive un viaje por JSON sin perder nada: es lo que
///     hace posible guardar una proyección con nombre.
void main() {
  // Lunes 24 de agosto de 2026.
  final lunes = DateTime(2026, 8, 24).millisecondsSinceEpoch;

  const puestos = [
    Puesto(id: 'pM', nombre: 'Maestro', salarioDiaDefault: 550),
    Puesto(id: 'pA', nombre: 'Ayudante', salarioDiaDefault: 350),
  ];
  const juan = Colaborador(
      id: 'c1', nombre: 'Juan Pérez Loera', puestoId: 'pM', tipoPago: TipoPago.dia);

  const calc = ProyeccionCalculator();

  PlazaProyectada plaza(String n, {String puesto = 'pM', double monto = 3600}) =>
      PlazaProyectada(
        id: '${prefijoPlaza}$n',
        etiqueta: 'Maestro $n',
        puestoId: puesto,
        obraId: 'o1',
        sueldo: SueldoProyectado(
            periodo: PeriodoPago.semanal, monto: monto, diasSemana: 6),
      );

  group('SueldoProyectado', () {
    test('deriva el diario con la única fórmula del proyecto', () {
      const semanal = SueldoProyectado(
          periodo: PeriodoPago.semanal, monto: 3600, diasSemana: 6);
      expect(semanal.salarioDia, 600);

      const mensual = SueldoProyectado(
          periodo: PeriodoPago.mensual, monto: 14300, diasSemana: 6);
      expect(mensual.salarioDia, 550, reason: '14,300 ÷ 26 días');

      const quincenal = SueldoProyectado(
          periodo: PeriodoPago.quincenal, monto: 7150, diasSemana: 6);
      expect(quincenal.salarioDia, 550, reason: '7,150 ÷ 13 días');
    });

    test('sin monto no hay diario', () {
      const vacio = SueldoProyectado(
          periodo: PeriodoPago.semanal, monto: 0, diasSemana: 6);
      expect(vacio.salarioDia, isNull);
    });
  });

  group('conPlazas', () {
    test('mete la plaza como participante, con sus días y su diario', () {
      final estado = ProyeccionEstado(lunesMillis: lunes)
          .conPlazas([plaza('1'), plaza('2')]);

      expect(estado.participantes, ['${prefijoPlaza}1', '${prefijoPlaza}2']);
      expect(estado.diasDe('${prefijoPlaza}1'), {0, 1, 2, 3, 4, 5},
          reason: 'seis días por semana según su sueldo');
      expect(estado.salarioOverride['${prefijoPlaza}1'], 600,
          reason: 'el diario derivado va al mapa que consume el cálculo');
      expect(estado.sueldoDe('${prefijoPlaza}1')?.monto, 3600);
      expect(estado.esPlazaDelEscenario('${prefijoPlaza}1'), isTrue);
      expect(estado.esPlazaDelEscenario('c1'), isFalse);
    });

    test('el calculador la trata como a cualquiera', () {
      final estado = ProyeccionEstado(
        lunesMillis: lunes,
        participantes: const ['c1'],
        diasProyectados: const {
          'c1': {0, 1, 2, 3, 4, 5}
        },
      ).conPlazas([plaza('1'), plaza('2', puesto: 'pA', monto: 2100)]);

      final resultado = calc.calcular(
        estado: estado,
        colaboradores: [
          juan,
          for (final p in estado.plazas.values) p.comoColaborador,
        ],
        puestos: puestos,
        obraPorColaborador: {
          'c1': 'o1',
          for (final p in estado.plazas.values) p.id: p.obraId ?? '',
        },
      );

      expect(resultado.renglones, hasLength(3));
      final maestro = resultado.renglones
          .firstWhere((r) => r.colaborador.id == '${prefijoPlaza}1');
      expect(maestro.salarioDia, 600);
      expect(maestro.diasProyectados, 6);
      expect(maestro.total, 3600);
      expect(maestro.puestoNombre, 'Maestro');

      final ayudante = resultado.renglones
          .firstWhere((r) => r.colaborador.id == '${prefijoPlaza}2');
      expect(ayudante.salarioDia, 350, reason: '2,100 ÷ 6');
      expect(ayudante.total, 2100);

      // 6 × 550 (Juan, del puesto) + 3,600 + 2,100
      expect(resultado.total, 3300 + 3600 + 2100);
    });

    test('ninguna celda de una plaza nace bloqueada', () {
      final estado =
          ProyeccionEstado(lunesMillis: lunes).conPlazas([plaza('1')]);
      final resultado = calc.calcular(
        estado: estado,
        colaboradores: [estado.plazas.values.single.comoColaborador],
        puestos: puestos,
        // Una asistencia real de OTRA persona no puede tocar a la plaza.
        asistenciasReales: [
          Asistencia(
              colaboradorId: 'c1',
              obraId: 'o1',
              fecha: lunes,
              fraccion: 1.0),
        ],
      );
      expect(
          resultado.renglones.single.celdas.every((c) => !c.bloqueada), isTrue);
    });

    test('un ajuste y un préstamo funcionan sobre una plaza', () {
      var estado = ProyeccionEstado(lunesMillis: lunes).conPlazas([plaza('1')]);
      final id = '${prefijoPlaza}1';
      estado = estado.conDiaEnObra(id, 3, 'o2').conAjuste(
            const AjusteProyeccion(
              id: 'a1',
              tipo: TipoAjuste.anticipo,
              destino: DestinoAjuste.colaborador,
              destinoId: '${prefijoPlaza}1',
              monto: 800,
            ),
          );

      final resultado = calc.calcular(
        estado: estado,
        colaboradores: [estado.plazas.values.single.comoColaborador],
        puestos: puestos,
        obraPorColaborador: {id: 'o1'},
        obraFiltro: 'o1',
      );
      final r = resultado.renglones.single;
      expect(r.diasProyectados, 5, reason: 'el jueves cuenta en la otra obra');
      expect(r.ajustes, -800);
      expect(r.total, 5 * 600 - 800);
    });
  });

  group('conSueldo', () {
    test('escribe el capturado y el derivado a la vez', () {
      final estado = ProyeccionEstado(lunesMillis: lunes).conSueldo(
        'c1',
        const SueldoProyectado(
            periodo: PeriodoPago.semanal, monto: 3600, diasSemana: 6),
      );
      expect(estado.sueldoDe('c1')?.monto, 3600);
      expect(estado.salarioOverride['c1'], 600);
    });

    test('quitarlo limpia los dos mapas', () {
      final estado = ProyeccionEstado(lunesMillis: lunes)
          .conSueldo(
              'c1',
              const SueldoProyectado(
                  periodo: PeriodoPago.semanal, monto: 3600, diasSemana: 6))
          .conSueldo('c1', null);
      expect(estado.sueldoDe('c1'), isNull);
      expect(estado.salarioOverride.containsKey('c1'), isFalse);
    });

    test('sobre una plaza también actualiza su ficha', () {
      var estado =
          ProyeccionEstado(lunesMillis: lunes).conPlazas([plaza('1')]);
      estado = estado.conSueldo(
        '${prefijoPlaza}1',
        const SueldoProyectado(
            periodo: PeriodoPago.semanal, monto: 4200, diasSemana: 6),
      );
      expect(estado.plazas['${prefijoPlaza}1']!.sueldo.monto, 4200);
      expect(estado.plazas['${prefijoPlaza}1']!.salarioDia, 700);
      expect(estado.salarioOverride['${prefijoPlaza}1'], 700);
    });
  });

  group('sinParticipante', () {
    test('quitar una plaza se lleva su ficha y su sueldo', () {
      var estado = ProyeccionEstado(lunesMillis: lunes)
          .conPlazas([plaza('1'), plaza('2')]);
      estado = estado.sinParticipante('${prefijoPlaza}1');

      expect(estado.plazas.containsKey('${prefijoPlaza}1'), isFalse);
      expect(estado.sueldoOverride.containsKey('${prefijoPlaza}1'), isFalse);
      expect(estado.salarioOverride.containsKey('${prefijoPlaza}1'), isFalse);
      expect(estado.participantes, ['${prefijoPlaza}2']);
      expect(estado.plazas, hasLength(1), reason: 'la otra no se toca');
    });
  });

  group('mismoEscenarioQue', () {
    test('una plaza capturada hace que el escenario cuente como tocado', () {
      final vacio = ProyeccionEstado(lunesMillis: lunes);
      final conUna = vacio.conPlazas([plaza('1')]);
      expect(conUna.mismoEscenarioQue(vacio), isFalse,
          reason: 'si no, cambiar de semana tiraría las plazas sin preguntar');
    });

    test('cambiar el redondeo también cuenta como tocado', () {
      final base = ProyeccionEstado(lunesMillis: lunes);
      final redondeado = base.conRedondeo(const RedondeoConfig(
          activo: true, paso: 100, campos: {CampoRedondeo.rayaPersona}));
      expect(redondeado.mismoEscenarioQue(base), isFalse);
    });

    test('cambiar el sueldo capturado cuenta como tocado', () {
      final base = ProyeccionEstado(lunesMillis: lunes);
      final conSueldo = base.conSueldo(
          'c1',
          const SueldoProyectado(
              periodo: PeriodoPago.semanal, monto: 3600, diasSemana: 6));
      expect(conSueldo.mismoEscenarioQue(base), isFalse);
    });
  });

  group('JSON del escenario', () {
    test('un escenario completo va y vuelve sin perder nada', () {
      var estado = ProyeccionEstado(
        lunesMillis: lunes,
        participantes: const ['c1'],
        diasProyectados: const {
          'c1': {0, 1, 2, 5}
        },
        destajoEstimado: const {'c9': 6000},
        simularCompleta: true,
      );
      estado = estado
          .conPlazas([plaza('1'), plaza('2', puesto: 'pA', monto: 2100)])
          .conSueldo(
              'c1',
              const SueldoProyectado(
                  periodo: PeriodoPago.mensual, monto: 14300, diasSemana: 6))
          .conDiaEnObra('c1', 3, 'o2')
          .conAjuste(const AjusteProyeccion(
            id: 'a1',
            tipo: TipoAjuste.destajo,
            destino: DestinoAjuste.cuadrilla,
            destinoId: 'q1',
            monto: 1500,
            nota: 'losa',
            reparto: RepartoAjuste.aLaCuadrilla,
          ))
          .conRedondeo(const RedondeoConfig(
            activo: true,
            paso: 50,
            modo: ModoRedondeo.haciaArriba,
            campos: {CampoRedondeo.rayaPersona},
          ));

      // Se pasa por texto de verdad, como al guardarlo en la columna.
      final vuelta = ProyeccionEstado.fromJson(
          (jsonDecode(jsonEncode(estado.toJson())) as Map)
              .cast<String, Object?>());

      expect(vuelta.mismoEscenarioQue(estado), isTrue);
      expect(vuelta.lunesMillis, lunes);
      expect(vuelta.simularCompleta, isTrue);
      expect(vuelta.diasDe('c1'), {0, 1, 2, 3, 5},
          reason: 'el préstamo del jueves también marca el día');
      expect(vuelta.prestamosDe('c1'), {3: 'o2'});
      expect(vuelta.destajoEstimado['c9'], 6000);
      expect(vuelta.plazas['${prefijoPlaza}2']!.etiqueta, 'Maestro 2');
      expect(vuelta.plazas['${prefijoPlaza}2']!.salarioDia, 350);
      expect(vuelta.sueldoDe('c1')!.periodo, PeriodoPago.mensual);
      expect(vuelta.salarioOverride['c1'], 550);
      expect(vuelta.ajustes.single.nota, 'losa');
      expect(vuelta.ajustes.single.reparto, RepartoAjuste.aLaCuadrilla);
      expect(vuelta.redondeo.paso, 50);
      expect(vuelta.redondeo.modo, ModoRedondeo.haciaArriba);
    });

    test('un JSON vacío o incompleto abre en vez de reventar', () {
      final vacio = ProyeccionEstado.fromJson(const {});
      expect(vacio.participantes, isEmpty);
      expect(vacio.plazas, isEmpty);
      expect(vacio.redondeo.activo, isFalse);

      final parcial = ProyeccionEstado.fromJson(const {
        'lunes': 123,
        'participantes': ['c1'],
      });
      expect(parcial.lunesMillis, 123);
      expect(parcial.participantes, ['c1']);
      expect(parcial.diasDe('c1'), isEmpty);
    });

    test('el escenario guardado no lleva nada de lo capturado', () {
      final estado = ProyeccionEstado(
        lunesMillis: lunes,
        participantes: const ['c1'],
      );
      final json = estado.toJson();
      expect(json.keys, isNot(contains('asistencias')));
      expect(json.keys, isNot(contains('destajosReales')));
      expect(json['v'], ProyeccionEstado.versionEsquema);
    });
  });
}
