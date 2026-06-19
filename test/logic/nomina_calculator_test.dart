import 'package:flutter_test/flutter_test.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:constructorpro/domain/logic/nomina_calculator.dart';

void main() {
  const calc = NominaCalculator();

  final puestos = [
    const Puesto(id: 'p1', nombre: 'Albañil', salarioDiaDefault: 550.0),
    const Puesto(id: 'p2', nombre: 'Maestro', salarioDiaDefault: 800.0),
  ];

  group('NominaCalculator — tipo DIA', () {
    test('suma fracciones × salario del puesto', () {
      final colaboradores = [
        const Colaborador(
            id: 'c1', nombre: 'Juan', puestoId: 'p1', tipoPago: TipoPago.dia),
      ];
      // 1 + 1 + 0.5 = 2.5 días × 550 = 1375
      final asistencias = [
        const Asistencia(colaboradorId: 'c1', obraId: 'o1', fecha: 0, fraccion: 1.0),
        const Asistencia(colaboradorId: 'c1', obraId: 'o1', fecha: 0, fraccion: 1.0),
        const Asistencia(colaboradorId: 'c1', obraId: 'o1', fecha: 0, fraccion: 0.5),
      ];

      final r = calc.calcular(
        colaboradores: colaboradores,
        asistencias: asistencias,
        destajos: const [],
        puestos: puestos,
      );

      expect(r.items.single.totalDias, 2.5);
      expect(r.items.single.totalPagar, 1375.0);
      expect(r.totalDia, 1375.0);
      expect(r.totalDestajo, 0.0);
      expect(r.totalNomina, 1375.0);
    });

    test('salarioPersonalizado tiene prioridad sobre el del puesto', () {
      final colaboradores = [
        const Colaborador(
          id: 'c1',
          nombre: 'Juan',
          puestoId: 'p1',
          tipoPago: TipoPago.dia,
          salarioPersonalizado: 700.0,
        ),
      ];
      final asistencias = [
        const Asistencia(colaboradorId: 'c1', obraId: 'o1', fecha: 0, fraccion: 1.0),
      ];

      final r = calc.calcular(
        colaboradores: colaboradores,
        asistencias: asistencias,
        destajos: const [],
        puestos: puestos,
      );

      expect(r.items.single.salarioBaseCalculado, 700.0);
      expect(r.items.single.totalPagar, 700.0);
    });

    test('puesto inexistente → salario 0 y "Sin Puesto"', () {
      final colaboradores = [
        const Colaborador(
            id: 'c1', nombre: 'X', puestoId: 'zzz', tipoPago: TipoPago.dia),
      ];
      final asistencias = [
        const Asistencia(colaboradorId: 'c1', obraId: 'o1', fecha: 0, fraccion: 1.0),
      ];
      final r = calc.calcular(
        colaboradores: colaboradores,
        asistencias: asistencias,
        destajos: const [],
        puestos: puestos,
      );
      expect(r.items.single.puestoNombre, 'Sin Puesto');
      expect(r.items.single.totalPagar, 0.0);
    });
  });

  group('NominaCalculator — tipo DESTAJO', () {
    test('suma montos de destajos', () {
      final colaboradores = [
        const Colaborador(
            id: 'c2', nombre: 'Pedro', puestoId: 'p1', tipoPago: TipoPago.destajo),
      ];
      final destajos = [
        const Destajo(colaboradorId: 'c2', obraId: 'o1', fecha: 0, monto: 1200.0),
        const Destajo(colaboradorId: 'c2', obraId: 'o1', fecha: 0, monto: 800.0),
      ];
      final r = calc.calcular(
        colaboradores: colaboradores,
        asistencias: const [],
        destajos: destajos,
        puestos: puestos,
      );
      expect(r.items.single.totalDestajos, 2000.0);
      expect(r.items.single.totalPagar, 2000.0);
      expect(r.totalDestajo, 2000.0);
    });
  });

  group('NominaCalculator — mixto', () {
    test('totalNomina = totalDia + totalDestajo', () {
      final colaboradores = [
        const Colaborador(id: 'c1', nombre: 'Juan', puestoId: 'p2', tipoPago: TipoPago.dia),
        const Colaborador(id: 'c2', nombre: 'Pedro', puestoId: 'p1', tipoPago: TipoPago.destajo),
      ];
      final asistencias = [
        const Asistencia(colaboradorId: 'c1', obraId: 'o1', fecha: 0, fraccion: 1.0), // 800
      ];
      final destajos = [
        const Destajo(colaboradorId: 'c2', obraId: 'o1', fecha: 0, monto: 500.0),
      ];
      final r = calc.calcular(
        colaboradores: colaboradores,
        asistencias: asistencias,
        destajos: destajos,
        puestos: puestos,
      );
      expect(r.totalDia, 800.0);
      expect(r.totalDestajo, 500.0);
      expect(r.totalNomina, 1300.0);
    });
  });

  group('Semana (lunes→domingo)', () {
    test('miércoles cae en el lunes de esa semana', () {
      // 2026-06-17 es miércoles → inicio 2026-06-15 (lunes)
      final inicio = NominaCalculator.getStartOfWeek(DateTime(2026, 6, 17, 14, 30));
      expect(inicio, DateTime(2026, 6, 15));
      expect(inicio.weekday, DateTime.monday);
    });

    test('domingo pertenece a la semana que inició el lunes anterior', () {
      // 2026-06-21 es domingo → inicio 2026-06-15 (lunes)
      final inicio = NominaCalculator.getStartOfWeek(DateTime(2026, 6, 21));
      expect(inicio, DateTime(2026, 6, 15));
    });

    test('fin de semana = domingo 23:59:59.999', () {
      final inicio = DateTime(2026, 6, 15);
      final fin = NominaCalculator.getEndOfWeek(inicio);
      expect(fin.weekday, DateTime.sunday);
      expect(fin.day, 21);
      expect(fin.hour, 23);
      expect(fin.minute, 59);
    });
  });
}
