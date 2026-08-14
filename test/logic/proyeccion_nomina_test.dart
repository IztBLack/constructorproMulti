import 'package:flutter_test/flutter_test.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:constructorpro/domain/logic/nomina_calculator.dart';
import 'package:constructorpro/domain/logic/proyeccion_nomina.dart';

/// El contrato que estos tests fijan:
///
///  1. Una proyección SIN ajustes da exactamente lo mismo que
///     [NominaCalculator] con esas asistencias. Es la razón de existir de este
///     diseño: si alguien mete una segunda fórmula de nómina aquí, el test que
///     compara contra el calculador se cae.
///  2. Lo capturado manda y no se puede pisar con una palomita.
///  3. Los ajustes se reparten sin perder ni inventar centavos.
void main() {
  // Lunes 10 de agosto de 2026, 00:00 local.
  final lunes = DateTime(2026, 8, 10).millisecondsSinceEpoch;

  const puestos = [
    Puesto(id: 'pAlb', nombre: 'Albañil', salarioDiaDefault: 700),
    Puesto(id: 'pAyu', nombre: 'Ayudante', salarioDiaDefault: 500),
  ];

  const albanil = Colaborador(
      id: 'c1', nombre: 'Marcos', puestoId: 'pAlb', tipoPago: TipoPago.dia);
  const ayudante = Colaborador(
      id: 'c2', nombre: 'Ramiro', puestoId: 'pAyu', tipoPago: TipoPago.dia);
  const destajista = Colaborador(
      id: 'c3', nombre: 'Acabados', puestoId: 'pAlb', tipoPago: TipoPago.destajo);

  const colaboradores = [albanil, ayudante, destajista];
  const calc = ProyeccionCalculator();

  ProyeccionEstado escenario({
    List<String> participantes = const ['c1'],
    Map<String, Set<int>> dias = const {},
    Map<String, double> destajo = const {},
    Map<String, double> salarios = const {},
    List<AjusteProyeccion> ajustes = const [],
    bool simular = false,
  }) =>
      ProyeccionEstado(
        lunesMillis: lunes,
        participantes: participantes,
        diasProyectados: dias,
        destajoEstimado: destajo,
        salarioOverride: salarios,
        ajustes: ajustes,
        simularCompleta: simular,
      );

  // ═════════════════════════════════════════════════════════════════════════
  group('Proyección sin nada capturado', () {
    test('días completos × salario del puesto', () {
      final r = calc.calcular(
        estado: escenario(dias: {'c1': {0, 1, 2, 3, 4}}),
        colaboradores: colaboradores,
        puestos: puestos,
      );

      final renglon = r.renglones.single;
      expect(renglon.diasProyectados, 5);
      expect(renglon.fraccionCapturada, 0);
      expect(renglon.total, 3500.0); // 5 × 700
      expect(r.total, 3500.0);
      expect(r.totalCapturado, 0.0);
      expect(r.totalProyectado, 3500.0);
      expect(r.diasHombre, 5.0);
    });

    test('el override de salario pisa al del puesto sin tocar el catálogo', () {
      final r = calc.calcular(
        estado: escenario(dias: {'c1': {0, 1}}, salarios: {'c1': 900}),
        colaboradores: colaboradores,
        puestos: puestos,
      );

      expect(r.renglones.single.salarioDia, 900.0);
      expect(r.total, 1800.0);
      // El catálogo sigue intacto: el objeto original no se mutó.
      expect(albanil.salarioPersonalizado, isNull);
    });

    test('totales por día: cuánto cuesta cada columna y cuánta gente cuenta', () {
      final r = calc.calcular(
        estado: escenario(
          participantes: const ['c1', 'c2'],
          dias: {
            'c1': {0, 1},
            'c2': {0},
          },
        ),
        colaboradores: colaboradores,
        puestos: puestos,
      );

      expect(r.totalPorDia[0], 1200.0); // 700 + 500
      expect(r.totalPorDia[1], 700.0);
      expect(r.totalPorDia[2], 0.0);
      expect(r.personasPorDia[0], 2);
      expect(r.personasPorDia[1], 1);
      expect(r.total, 1900.0);
    });

    test('sin días proyectados el total es cero, no un error', () {
      final r = calc.calcular(
        estado: escenario(),
        colaboradores: colaboradores,
        puestos: puestos,
      );
      expect(r.total, 0.0);
      expect(r.renglones.single.celdas.every((c) => !c.cuenta), isTrue);
    });

    test('un participante que ya no existe en el catálogo se ignora', () {
      final r = calc.calcular(
        estado: escenario(participantes: const ['c1', 'fantasma']),
        colaboradores: colaboradores,
        puestos: puestos,
      );
      expect(r.renglones.length, 1);
      expect(r.renglones.single.colaborador.id, 'c1');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  group('Lo capturado manda', () {
    List<Asistencia> reales() => [
          // Lunes completo, martes medio día, miércoles falta.
          Asistencia(
              colaboradorId: 'c1',
              obraId: 'o1',
              fecha: fechaDelDia(lunes, 0),
              fraccion: 1.0),
          Asistencia(
              colaboradorId: 'c1',
              obraId: 'o1',
              fecha: fechaDelDia(lunes, 1),
              fraccion: 0.5),
          Asistencia(
              colaboradorId: 'c1',
              obraId: 'o1',
              fecha: fechaDelDia(lunes, 2),
              fraccion: 0.0),
        ];

    test('las fracciones capturadas se respetan tal cual', () {
      final r = calc.calcular(
        estado: escenario(),
        colaboradores: colaboradores,
        puestos: puestos,
        asistenciasReales: reales(),
      );

      final renglon = r.renglones.single;
      expect(renglon.fraccionCapturada, 1.5);
      expect(renglon.total, 1050.0); // 1.5 × 700
      expect(r.totalCapturado, 1050.0);
      expect(r.totalProyectado, 0.0);
    });

    test('una falta capturada se distingue de un día vacío', () {
      final r = calc.calcular(
        estado: escenario(),
        colaboradores: colaboradores,
        puestos: puestos,
        asistenciasReales: reales(),
      );

      final celdas = r.renglones.single.celdas;
      expect(celdas[2].esFaltaCapturada, isTrue);
      expect(celdas[2].bloqueada, isTrue);
      expect(celdas[3].esFaltaCapturada, isFalse);
      expect(celdas[3].bloqueada, isFalse);
    });

    test('proyectar un día ya capturado NO lo duplica ni lo sube a día completo',
        () {
      final r = calc.calcular(
        // El usuario palomea lunes (completo ya) y martes (medio día ya).
        estado: escenario(dias: {'c1': {0, 1, 3}}),
        colaboradores: colaboradores,
        puestos: puestos,
        asistenciasReales: reales(),
      );

      final renglon = r.renglones.single;
      expect(renglon.fraccionCapturada, 1.5); // sigue siendo 1 + 0.5
      expect(renglon.diasProyectados, 1); // solo el jueves era nuevo
      expect(renglon.total, 1750.0); // (1.5 + 1) × 700
    });

    test('las asistencias de otra semana no se cuelan', () {
      final r = calc.calcular(
        estado: escenario(),
        colaboradores: colaboradores,
        puestos: puestos,
        asistenciasReales: [
          // Lunes de la semana anterior y lunes de la siguiente.
          Asistencia(
              colaboradorId: 'c1',
              obraId: 'o1',
              fecha: DateTime(2026, 8, 3).millisecondsSinceEpoch,
              fraccion: 1.0),
          Asistencia(
              colaboradorId: 'c1',
              obraId: 'o1',
              fecha: DateTime(2026, 8, 17).millisecondsSinceEpoch,
              fraccion: 1.0),
        ],
      );
      expect(r.total, 0.0);
    });

    test('simularCompleta ignora lo capturado y deja mover todo', () {
      final r = calc.calcular(
        estado: escenario(dias: {'c1': {0, 1}}, simular: true),
        colaboradores: colaboradores,
        puestos: puestos,
        asistenciasReales: reales(),
      );

      final renglon = r.renglones.single;
      expect(renglon.fraccionCapturada, 0.0);
      expect(renglon.diasProyectados, 2);
      expect(renglon.total, 1400.0); // 2 días completos, el ½ desaparece
      expect(renglon.celdas.every((c) => !c.bloqueada), isTrue);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  group('Destajo', () {
    test('el monto estimado es el total de la semana, no días × salario', () {
      final r = calc.calcular(
        estado: escenario(
          participantes: const ['c3'],
          // Aunque se le palomeen días, a destajo no cuentan.
          dias: {'c3': {0, 1, 2}},
          destajo: {'c3': 18500},
        ),
        colaboradores: colaboradores,
        puestos: puestos,
      );

      final renglon = r.renglones.single;
      expect(renglon.esDestajista, isTrue);
      expect(renglon.destajo, 18500.0);
      expect(renglon.total, 18500.0);
      expect(r.totalDia, 0.0);
      expect(r.totalDestajo, 18500.0);
      // No contamina los totales por día: un destajo no pertenece al martes.
      expect(r.totalPorDia.every((v) => v == 0), isTrue);
      expect(r.diasHombre, 0.0);
    });

    test('sin estimación se usa lo ya capturado', () {
      final r = calc.calcular(
        estado: escenario(participantes: const ['c3']),
        colaboradores: colaboradores,
        puestos: puestos,
        destajosReales: [
          Destajo(
              colaboradorId: 'c3',
              obraId: 'o1',
              fecha: fechaDelDia(lunes, 2),
              monto: 6000),
        ],
      );

      expect(r.renglones.single.destajo, 6000.0);
      expect(r.totalCapturado, 6000.0);
      expect(r.totalProyectado, 0.0);
    });

    test('estimar por encima de lo capturado parte el total en firme y estimado',
        () {
      final r = calc.calcular(
        estado: escenario(participantes: const ['c3'], destajo: {'c3': 18500}),
        colaboradores: colaboradores,
        puestos: puestos,
        destajosReales: [
          Destajo(
              colaboradorId: 'c3',
              obraId: 'o1',
              fecha: fechaDelDia(lunes, 2),
              monto: 6000),
        ],
      );

      expect(r.totalCapturado, 6000.0);
      expect(r.totalProyectado, 12500.0);
      expect(r.renglones.single.destajoIncongruente, isFalse);
    });

    test('estimar por DEBAJO de lo capturado se marca en vez de corregirse solo',
        () {
      final r = calc.calcular(
        estado: escenario(participantes: const ['c3'], destajo: {'c3': 2000}),
        colaboradores: colaboradores,
        puestos: puestos,
        destajosReales: [
          Destajo(
              colaboradorId: 'c3',
              obraId: 'o1',
              fecha: fechaDelDia(lunes, 2),
              monto: 6000),
        ],
      );

      final renglon = r.renglones.single;
      expect(renglon.destajo, 2000.0, reason: 'respeta lo que escribió el usuario');
      expect(renglon.destajoIncongruente, isTrue);
      expect(r.totalProyectado, 0.0, reason: 'no puede haber proyección negativa');
      expect(r.totalCapturado, 2000.0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  group('Ajustes', () {
    AjusteProyeccion aj(
      TipoAjuste tipo,
      double monto, {
      String id = 'a1',
      DestinoAjuste destino = DestinoAjuste.colaborador,
      String destinoId = 'c1',
      RepartoAjuste reparto = RepartoAjuste.partesIguales,
    }) =>
        AjusteProyeccion(
          id: id,
          tipo: tipo,
          destino: destino,
          destinoId: destinoId,
          monto: monto,
          reparto: reparto,
        );

    test('un destajo extra suma a quien cobra por día', () {
      final r = calc.calcular(
        estado: escenario(
          dias: {'c1': {0, 1}},
          ajustes: [aj(TipoAjuste.destajo, 1500)],
        ),
        colaboradores: colaboradores,
        puestos: puestos,
      );

      expect(r.renglones.single.ajustes, 1500.0);
      expect(r.renglones.single.total, 2900.0); // 1400 + 1500
      expect(r.totalAjustes, 1500.0);
      expect(r.total, 2900.0);
    });

    test('anticipo y descuento restan, con el monto capturado en positivo', () {
      final r = calc.calcular(
        estado: escenario(
          dias: {'c1': {0, 1, 2, 3, 4}},
          ajustes: [
            aj(TipoAjuste.anticipo, 1000, id: 'a1'),
            aj(TipoAjuste.descuento, 250, id: 'a2'),
          ],
        ),
        colaboradores: colaboradores,
        puestos: puestos,
      );

      expect(r.totalAjustes, -1250.0);
      expect(r.total, 2250.0); // 3500 − 1250
    });

    test('también aplican a un destajista', () {
      final r = calc.calcular(
        estado: escenario(
          participantes: const ['c3'],
          destajo: {'c3': 10000},
          ajustes: [aj(TipoAjuste.anticipo, 3000, destinoId: 'c3')],
        ),
        colaboradores: colaboradores,
        puestos: puestos,
      );

      expect(r.renglones.single.total, 7000.0);
    });

    test('un ajuste de cuadrilla se reparte solo entre los que están', () {
      final r = calc.calcular(
        estado: escenario(
          participantes: const ['c1', 'c2'],
          ajustes: [
            aj(TipoAjuste.destajo, 1000,
                destino: DestinoAjuste.cuadrilla, destinoId: 'cuad1'),
          ],
        ),
        colaboradores: colaboradores,
        puestos: puestos,
        // c2 está en la cuadrilla pero c3 (que no participa) también lo estaría.
        cuadrillaPorColaborador: const {
          'c1': 'cuad1',
          'c2': 'cuad1',
          'c3': 'cuad1',
        },
      );

      expect(r.renglones[0].ajustes, 500.0);
      expect(r.renglones[1].ajustes, 500.0);
      expect(r.totalAjustes, 1000.0);
      expect(r.lineasCuadrilla.single.repartido, isTrue);
      expect(r.lineasCuadrilla.single.montoConSigno, 0.0,
          reason: 'ya vive en los renglones; contarlo otra vez lo duplicaría');
    });

    test('los centavos que no dividen no se pierden ni se inventan', () {
      final r = calc.calcular(
        estado: escenario(
          participantes: const ['c1', 'c2', 'c3'],
          ajustes: [
            aj(TipoAjuste.destajo, 1000,
                destino: DestinoAjuste.cuadrilla, destinoId: 'cuad1'),
          ],
        ),
        colaboradores: colaboradores,
        puestos: puestos,
        cuadrillaPorColaborador: const {
          'c1': 'cuad1',
          'c2': 'cuad1',
          'c3': 'cuad1',
        },
      );

      // 1000 / 3 = 333.333…  →  333.34 + 333.33 + 333.33 = 1000.00 exacto.
      expect(r.renglones[0].ajustes, closeTo(333.34, 0.001));
      expect(r.renglones[1].ajustes, closeTo(333.33, 0.001));
      expect(r.renglones[2].ajustes, closeTo(333.33, 0.001));
      expect(r.totalAjustes, closeTo(1000.0, 0.001));
    });

    test('reparto «a la cuadrilla» queda como renglón aparte', () {
      final r = calc.calcular(
        estado: escenario(
          participantes: const ['c1', 'c2'],
          ajustes: [
            aj(TipoAjuste.destajo, 8000,
                destino: DestinoAjuste.cuadrilla,
                destinoId: 'cuad1',
                reparto: RepartoAjuste.aLaCuadrilla),
          ],
        ),
        colaboradores: colaboradores,
        puestos: puestos,
        cuadrillaPorColaborador: const {'c1': 'cuad1', 'c2': 'cuad1'},
      );

      expect(r.renglones.every((x) => x.ajustes == 0), isTrue);
      expect(r.lineasCuadrilla.single.montoConSigno, 8000.0);
      expect(r.lineasCuadrilla.single.repartido, isFalse);
      expect(r.total, 8000.0);
    });

    test('una cuadrilla sin miembros en el escenario no se traga el monto', () {
      final r = calc.calcular(
        estado: escenario(
          participantes: const ['c1'],
          ajustes: [
            aj(TipoAjuste.destajo, 4000,
                destino: DestinoAjuste.cuadrilla, destinoId: 'cuadVacia'),
          ],
        ),
        colaboradores: colaboradores,
        puestos: puestos,
        cuadrillaPorColaborador: const {'c1': 'cuad1'},
      );

      expect(r.lineasCuadrilla.single.montoConSigno, 4000.0);
      expect(r.total, 4000.0);
    });

    test('un ajuste dirigido a alguien fuera del escenario se reporta, no se suma',
        () {
      final r = calc.calcular(
        estado: escenario(
          participantes: const ['c1'],
          ajustes: [aj(TipoAjuste.destajo, 900, destinoId: 'c2')],
        ),
        colaboradores: colaboradores,
        puestos: puestos,
      );

      expect(r.totalAjustes, 0.0);
      expect(r.ajustesIgnorados.single.destinoId, 'c2');
    });

    test('quitar a alguien se lleva sus ajustes', () {
      final estado = escenario(
        participantes: const ['c1', 'c2'],
        ajustes: [aj(TipoAjuste.anticipo, 500, destinoId: 'c1')],
      ).sinParticipante('c1');

      expect(estado.participantes, ['c2']);
      expect(estado.ajustes, isEmpty);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  group('Paridad con NominaCalculator', () {
    test('sin ajustes, la proyección da lo mismo que la nómina real', () {
      final estado = escenario(
        participantes: const ['c1', 'c2', 'c3'],
        dias: {
          'c1': {0, 1, 2, 3, 4, 5},
          'c2': {0, 1, 2},
        },
        destajo: {'c3': 7300},
        salarios: {'c2': 560},
      );

      final proy = calc.calcular(
        estado: estado,
        colaboradores: colaboradores,
        puestos: puestos,
      );

      // Las mismas asistencias, pasadas a mano al calculador de siempre.
      final asistencias = <Asistencia>[
        for (final d in [0, 1, 2, 3, 4, 5])
          Asistencia(
              colaboradorId: 'c1',
              obraId: '',
              fecha: fechaDelDia(lunes, d),
              fraccion: 1.0),
        for (final d in [0, 1, 2])
          Asistencia(
              colaboradorId: 'c2',
              obraId: '',
              fecha: fechaDelDia(lunes, d),
              fraccion: 1.0),
      ];
      final real = const NominaCalculator().calcular(
        colaboradores: const [
          albanil,
          Colaborador(
              id: 'c2',
              nombre: 'Ramiro',
              puestoId: 'pAyu',
              tipoPago: TipoPago.dia,
              salarioPersonalizado: 560),
          destajista,
        ],
        asistencias: asistencias,
        destajos: [
          Destajo(colaboradorId: 'c3', obraId: '', fecha: lunes, monto: 7300),
        ],
        puestos: puestos,
      );

      expect(proy.total, real.totalNomina);
      expect(proy.totalDia, real.totalDia);
      expect(proy.totalDestajo, real.totalDestajo);
      expect(proy.resumenNomina.totalNomina, real.totalNomina);
    });

    test('con ajustes, la diferencia contra la nómina es exactamente el neto', () {
      final estado = escenario(
        dias: {'c1': {0, 1, 2}},
        ajustes: const [
          AjusteProyeccion(
              id: 'a1',
              tipo: TipoAjuste.anticipo,
              destino: DestinoAjuste.colaborador,
              destinoId: 'c1',
              monto: 700),
        ],
      );

      final r = calc.calcular(
        estado: estado,
        colaboradores: colaboradores,
        puestos: puestos,
      );

      expect(r.resumenNomina.totalNomina, 2100.0);
      expect(r.total, r.resumenNomina.totalNomina + r.totalAjustes);
      expect(r.total, 1400.0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  group('Mutaciones del escenario', () {
    test('alternarDia prende y apaga', () {
      var e = escenario();
      e = e.alternarDia('c1', 3);
      expect(e.tieneDia('c1', 3), isTrue);
      e = e.alternarDia('c1', 3);
      expect(e.tieneDia('c1', 3), isFalse);
    });

    test('fijarColumna respeta a los bloqueados', () {
      final e = escenario(participantes: const ['c1', 'c2']).fijarColumna(
        5,
        const ['c1', 'c2'],
        prender: true,
        bloqueados: const {'c2'},
      );
      expect(e.tieneDia('c1', 5), isTrue);
      expect(e.tieneDia('c2', 5), isFalse);
    });

    test('conParticipante no duplica a quien ya estaba', () {
      final e = escenario().conParticipante('c1', dias: {0, 1});
      expect(e.participantes, ['c1']);
      expect(e.diasDe('c1'), {0, 1});
    });

    test('conAjuste reemplaza por id en vez de acumular duplicados', () {
      const a = AjusteProyeccion(
          id: 'a1',
          tipo: TipoAjuste.destajo,
          destino: DestinoAjuste.colaborador,
          destinoId: 'c1',
          monto: 100);
      final e = escenario().conAjuste(a).conAjuste(a.copyWith(monto: 250));
      expect(e.ajustes.length, 1);
      expect(e.ajustes.single.monto, 250.0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  group('Fechas', () {
    test('indiceDiaSemana ubica cada día de lunes a domingo', () {
      expect(indiceDiaSemana(lunes, fechaDelDia(lunes, 0)), 0);
      expect(indiceDiaSemana(lunes, fechaDelDia(lunes, 6)), 6);
      expect(indiceDiaSemana(lunes, DateTime(2026, 8, 9).millisecondsSinceEpoch),
          isNull);
      expect(indiceDiaSemana(lunes, DateTime(2026, 8, 17).millisecondsSinceEpoch),
          isNull);
    });

    test('indiceDiaSemana no se equivoca con una hora del día distinta de 00:00',
        () {
      final miercolesTarde = DateTime(2026, 8, 12, 23, 30).millisecondsSinceEpoch;
      expect(indiceDiaSemana(lunes, miercolesTarde), 2);
    });

    test('lunesDeLaSemana coincide con el contrato de NominaCalculator', () {
      for (final d in [
        DateTime(2026, 8, 10),
        DateTime(2026, 8, 13, 15, 4),
        DateTime(2026, 8, 16, 23, 59),
      ]) {
        expect(
          lunesDeLaSemana(d),
          NominaCalculator.getStartOfWeek(d).millisecondsSinceEpoch,
          reason: 'divergir aquí desalinearía la proyección de la nómina real',
        );
      }
    });

    test('fechaDelDia cruza fin de mes', () {
      final lunes31 = DateTime(2026, 8, 31).millisecondsSinceEpoch;
      expect(
        fechaDelDia(lunes31, 3),
        DateTime(2026, 9, 3).millisecondsSinceEpoch,
      );
    });
  });
}
