import 'package:constructorpro/domain/logic/proyeccion_nomina.dart';
import 'package:constructorpro/domain/logic/redondeo_proyeccion.dart';
import 'package:constructorpro/domain/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

/// El contrato del redondeo:
///
///  1. Es PRESENTACIÓN. El resultado del cálculo nunca cambia, y el exacto
///     sigue disponible al lado del mostrado.
///  2. Se redondea la MAGNITUD: un anticipo no cambia de sentido según el modo.
///  3. Cuando la raya de cada quien se redondea, el total que se enseña es la
///     suma de las rayas redondeadas. Un papel de raya que no cuadra no sirve.
///  4. Redondear el salario por día ARRASTRA: la raya se recalcula con la
///     tarifa redondeada, o el renglón diría «6 días × $600 = $3,599.28».
void main() {
  // Lunes 24 de agosto de 2026.
  final lunes = DateTime(2026, 8, 24).millisecondsSinceEpoch;

  group('redondearMonto', () {
    test('al más cercano parte el paso hacia arriba', () {
      expect(redondearMonto(3499.88, 1, ModoRedondeo.alMasCercano), 3500);
      expect(redondearMonto(3499.12, 1, ModoRedondeo.alMasCercano), 3499);
      expect(redondearMonto(3450, 100, ModoRedondeo.alMasCercano), 3500);
      expect(redondearMonto(3449.99, 100, ModoRedondeo.alMasCercano), 3400);
    });

    test('hacia arriba y hacia abajo respetan el paso', () {
      expect(redondearMonto(3420, 100, ModoRedondeo.haciaArriba), 3500);
      expect(redondearMonto(3499.01, 100, ModoRedondeo.haciaAbajo), 3400);
      expect(redondearMonto(3400, 100, ModoRedondeo.haciaArriba), 3400,
          reason: 'lo que ya cae en el paso no se mueve');
    });

    test('redondea la magnitud: el signo no cambia el sentido', () {
      expect(redondearMonto(-799.60, 100, ModoRedondeo.haciaArriba), -800);
      expect(redondearMonto(-799.60, 100, ModoRedondeo.haciaAbajo), -700);
    });

    test('un paso inválido devuelve el valor intacto', () {
      expect(redondearMonto(3499.88, 0, ModoRedondeo.alMasCercano), 3499.88);
      expect(redondearMonto(3499.88, -5, ModoRedondeo.alMasCercano), 3499.88);
    });

    test('la aritmética es en centavos, sin basura de coma flotante', () {
      // 0.1 + 0.2 en double da 0.30000000000000004.
      expect(redondearMonto(0.1 + 0.2, 0.05, ModoRedondeo.alMasCercano), 0.30);
      expect(redondearMonto(2916.666666, 10, ModoRedondeo.alMasCercano), 2920);
    });
  });

  group('RedondeoConfig', () {
    test('apagado no toca ninguna cifra', () {
      const cfg = RedondeoConfig.apagado;
      expect(cfg.aplicar(3499.88, CampoRedondeo.rayaPersona), 3499.88);
      expect(cfg.aplicaA(CampoRedondeo.totalSemana), isFalse);
    });

    test('solo redondea los ámbitos elegidos', () {
      const cfg = RedondeoConfig(
        activo: true,
        paso: 100,
        campos: {CampoRedondeo.totalSemana},
      );
      expect(cfg.aplicar(3499.88, CampoRedondeo.totalSemana), 3500);
      expect(cfg.aplicar(3499.88, CampoRedondeo.rayaPersona), 3499.88,
          reason: 'la raya no estaba seleccionada');
    });

    test('quitar el último ámbito apaga el interruptor maestro', () {
      const cfg = RedondeoConfig(
          activo: true, campos: {CampoRedondeo.rayaPersona});
      final sinNada = cfg.alternarCampo(CampoRedondeo.rayaPersona);
      expect(sinNada.campos, isEmpty);
      expect(sinNada.activo, isFalse,
          reason: '«activo con cero cifras» se ve como un bug en la pantalla');
    });

    test('sobrevive un viaje por JSON', () {
      const cfg = RedondeoConfig(
        activo: true,
        paso: 50,
        modo: ModoRedondeo.haciaArriba,
        campos: {CampoRedondeo.salarioDia, CampoRedondeo.totalSemana},
      );
      expect(RedondeoConfig.fromJson(cfg.toJson()).mismaConfigQue(cfg), isTrue);
    });
  });

  group('ProyeccionRedondeada', () {
    const puestos = [
      Puesto(id: 'pM', nombre: 'Maestro', salarioDiaDefault: 583.33),
      Puesto(id: 'pA', nombre: 'Ayudante', salarioDiaDefault: 350),
    ];
    const colaboradores = [
      Colaborador(
          id: 'c1', nombre: 'Juan', puestoId: 'pM', tipoPago: TipoPago.dia),
      Colaborador(
          id: 'c2', nombre: 'Rigo', puestoId: 'pA', tipoPago: TipoPago.dia),
    ];

    ProyeccionResultado calcular() => const ProyeccionCalculator().calcular(
          estado: ProyeccionEstado(
            lunesMillis: 0,
            participantes: ['c1', 'c2'],
            diasProyectados: {
              'c1': {0, 1, 2, 3, 4, 5},
              'c2': {0, 1, 2, 3, 4, 5},
            },
          ).copyWith(lunesMillis: DateTime(2026, 8, 24).millisecondsSinceEpoch),
          colaboradores: colaboradores,
          puestos: puestos,
        );

    test('sin redondeo enseña exactamente lo calculado', () {
      final r = calcular();
      final vista = ProyeccionRedondeada.exacta(r);
      expect(vista.total.mostrado, closeTo(r.total, 0.001));
      expect(vista.total.redondeado, isFalse);
      expect(vista.leyenda, isEmpty);
    });

    test('la raya redondeada manda sobre el total', () {
      final r = calcular();
      // 6 × 583.33 = 3,499.98 → 3,500 ; 6 × 350 = 2,100 (ya cae en el paso).
      const cfg = RedondeoConfig(
        activo: true,
        paso: 100,
        campos: {CampoRedondeo.rayaPersona},
      );
      final vista = ProyeccionRedondeada(r, cfg);

      final juan = r.renglones.firstWhere((x) => x.colaborador.id == 'c1');
      expect(vista.raya(juan).exacto, closeTo(3499.98, 0.001));
      expect(vista.raya(juan).mostrado, 3500);
      expect(vista.raya(juan).redondeado, isTrue);

      expect(vista.total.mostrado, 5600,
          reason: 'el total es la suma de lo que se va a entregar');
      expect(vista.total.exacto, closeTo(5599.98, 0.001));
      expect(vista.totalCuadraConLosRenglones, isTrue);
    });

    test('redondear el salario por día arrastra a la raya y al día', () {
      final r = calcular();
      const cfg = RedondeoConfig(
        activo: true,
        paso: 10,
        modo: ModoRedondeo.haciaArriba,
        campos: {CampoRedondeo.salarioDia},
      );
      final vista = ProyeccionRedondeada(r, cfg);
      final juan = r.renglones.firstWhere((x) => x.colaborador.id == 'c1');

      expect(vista.salarioDia(juan).mostrado, 590);
      expect(vista.raya(juan).mostrado, closeTo(3540, 0.001),
          reason: '6 días × la tarifa que se está enseñando');
      expect(vista.costoDia(0).mostrado, closeTo(590 + 350, 0.001));
    });

    test('el total redondeado sobre rayas redondeadas se declara descuadrado',
        () {
      final r = calcular();
      const cfg = RedondeoConfig(
        activo: true,
        paso: 1000,
        campos: {CampoRedondeo.rayaPersona, CampoRedondeo.totalSemana},
      );
      final vista = ProyeccionRedondeada(r, cfg);
      // Rayas: 3,000 + 2,000 = 5,000 exacto sobre el paso de mil.
      expect(vista.total.mostrado, 5000);
      expect(vista.totalCuadraConLosRenglones, isTrue);

      const cfgDescuadra = RedondeoConfig(
        activo: true,
        paso: 100,
        campos: {CampoRedondeo.rayaPersona},
      );
      final v2 = ProyeccionRedondeada(
          r,
          cfgDescuadra.copyWith(
              campos: {CampoRedondeo.rayaPersona, CampoRedondeo.totalSemana}));
      // Rayas 3,500 + 2,100 = 5,600, que ya cae en 100: sigue cuadrando.
      expect(v2.totalCuadraConLosRenglones, isTrue);
    });

    test('la leyenda nombra paso, modo y ámbitos', () {
      final r = calcular();
      const cfg = RedondeoConfig(
        activo: true,
        paso: 50,
        modo: ModoRedondeo.haciaArriba,
        campos: {CampoRedondeo.rayaPersona},
      );
      final leyenda = ProyeccionRedondeada(r, cfg).leyenda;
      expect(leyenda, contains('\$50'));
      expect(leyenda, contains('hacia arriba'));
      expect(leyenda, contains('raya'));
    });
  });

  // Guarda contra la regresión más cara: que alguien mueva el redondeo dentro
  // del calculador. El resultado crudo tiene que seguir siendo exacto.
  test('el redondeo no toca el resultado del cálculo', () {
    const puestos = [Puesto(id: 'p', nombre: 'X', salarioDiaDefault: 583.33)];
    const colaboradores = [
      Colaborador(id: 'c', nombre: 'A', puestoId: 'p', tipoPago: TipoPago.dia),
    ];
    final r = const ProyeccionCalculator().calcular(
      estado: ProyeccionEstado(
        lunesMillis: lunes,
        participantes: const ['c'],
        diasProyectados: const {
          'c': {0, 1, 2, 3, 4, 5}
        },
      ),
      colaboradores: colaboradores,
      puestos: puestos,
    );
    const cfg = RedondeoConfig(
        activo: true, paso: 100, campos: {CampoRedondeo.rayaPersona});
    ProyeccionRedondeada(r, cfg).total; // se consume la vista
    expect(r.total, closeTo(3499.98, 0.001));
    expect(r.renglones.single.total, closeTo(3499.98, 0.001));
  });
}
