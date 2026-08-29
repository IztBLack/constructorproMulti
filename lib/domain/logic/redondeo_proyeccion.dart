import 'models_proyeccion.dart';
import '../models/models.dart';

export 'redondeo.dart';

/// Una cifra con sus dos caras: la exacta que salió del cálculo y la que se va
/// a enseñar.
///
/// Las dos viajan juntas a propósito. La pantalla necesita las dos para poder
/// mostrar la redondeada en grande y la original en chiquito debajo, y tenerlas
/// separadas evita el error clásico de guardar la redondeada y perder la buena.
class MontoMostrado {
  final double exacto;
  final double mostrado;

  const MontoMostrado(this.exacto, this.mostrado);

  const MontoMostrado.sinRedondeo(double valor)
      : exacto = valor,
        mostrado = valor;

  /// ¿Hay diferencia que valga la pena enseñar? Medio centavo es el umbral:
  /// por debajo, la «original» y la «redondeada» se imprimirían idénticas y el
  /// renglón chiquito sería ruido.
  bool get redondeado => (exacto - mostrado).abs() >= 0.005;

  double get diferencia => mostrado - exacto;
}

/// El resultado de la proyección, visto a través de la configuración de
/// redondeo.
///
/// No recalcula la nómina: envuelve un [ProyeccionResultado] ya calculado y
/// decide qué número se enseña en cada lugar. Esa es la regla que mantiene
/// honesta a la pantalla — el redondeo es presentación, y el día que alguien
/// quiera el número exacto sigue estando ahí.
///
/// Dos decisiones que no son obvias y conviene tener presentes:
///
///   · **Redondear el salario por día arrastra.** Si el usuario redondea la
///     tarifa, la raya se recalcula con la tarifa redondeada. Si no, el renglón
///     diría «6 días × \$600 = \$3,599.28» y parecería roto.
///   · **Redondear la raya cambia el total.** Cuando la raya de cada quien se
///     redondea, el total que se enseña es la SUMA DE LAS RAYAS REDONDEADAS, no
///     el total exacto: es lo que de verdad va a salir de la caja al llenar los
///     sobres. Un total exacto debajo de una lista de rayas redondeadas no
///     cuadraría, y un papel de raya que no cuadra no sirve.
class ProyeccionRedondeada {
  final ProyeccionResultado resultado;
  final RedondeoConfig config;

  const ProyeccionRedondeada(this.resultado, this.config);

  /// Sin redondeo: todo se enseña tal como salió del cálculo.
  const ProyeccionRedondeada.exacta(this.resultado)
      : config = RedondeoConfig.apagado;

  bool get activo => config.activo;

  // ── Por renglón ─────────────────────────────────────────────────────────

  MontoMostrado salarioDia(ProyeccionRenglon r) => MontoMostrado(
      r.salarioDia, config.aplicar(r.salarioDia, CampoRedondeo.salarioDia));

  /// La raya de una persona, ya con el arrastre del salario redondeado si lo
  /// hay, y redondeada ella misma si se pidió.
  MontoMostrado raya(ProyeccionRenglon r) {
    final base = _rayaConSalarioMostrado(r);
    return MontoMostrado(
        r.total, config.aplicar(base, CampoRedondeo.rayaPersona));
  }

  /// Lo que vale el renglón usando el salario que se está enseñando. Sin
  /// redondeo de tarifa es idéntico a `r.total`.
  double _rayaConSalarioMostrado(ProyeccionRenglon r) {
    if (!config.aplicaA(CampoRedondeo.salarioDia) || r.esDestajista) {
      return r.total;
    }
    final salario = salarioDia(r).mostrado;
    return r.diasTotales * salario + r.destajo + r.ajustes;
  }

  // ── Subtotales ──────────────────────────────────────────────────────────

  /// Subtotal de un grupo (una cuadrilla, una obra) sumando lo que se enseña en
  /// cada renglón. Se suman los MOSTRADOS para que el subtotal cuadre con los
  /// renglones que tiene encima.
  MontoMostrado subtotalDe(Iterable<ProyeccionRenglon> renglones) {
    var exacto = 0.0;
    var mostrado = 0.0;
    for (final r in renglones) {
      exacto += r.total;
      mostrado += raya(r).mostrado;
    }
    return MontoMostrado(
        exacto, config.aplicar(mostrado, CampoRedondeo.subtotales));
  }

  /// Lo que cuesta el día [indice] de la semana (solo pago por día).
  ///
  /// Se recalcula en vez de leer `resultado.totalPorDia` porque con la tarifa
  /// redondeada el costo del martes también cambia; el cálculo espeja el del
  /// calculador, celda por celda, saltando los días prestados.
  MontoMostrado costoDia(int indice) {
    final exacto = indice >= 0 && indice < resultado.totalPorDia.length
        ? resultado.totalPorDia[indice]
        : 0.0;
    if (!config.aplicaA(CampoRedondeo.salarioDia) &&
        !config.aplicaA(CampoRedondeo.subtotales)) {
      return MontoMostrado.sinRedondeo(exacto);
    }
    var mostrado = 0.0;
    for (final r in resultado.renglones) {
      if (r.colaborador.tipoPago != TipoPago.dia) continue;
      for (final celda in r.celdas) {
        if (celda.indice != indice || celda.fraccion <= 0 || celda.prestado) {
          continue;
        }
        mostrado += celda.fraccion * salarioDia(r).mostrado;
      }
    }
    return MontoMostrado(
        exacto, config.aplicar(mostrado, CampoRedondeo.subtotales));
  }

  // ── Totales ─────────────────────────────────────────────────────────────

  /// Suma de las rayas tal como se enseñan, más los renglones de cuadrilla que
  /// no se repartieron entre nadie.
  double get _sumaDeLoMostrado {
    var suma = 0.0;
    for (final r in resultado.renglones) {
      suma += raya(r).mostrado;
    }
    for (final l in resultado.lineasCuadrilla) {
      suma += l.montoConSigno;
    }
    return suma;
  }

  /// El total de la semana. Ver la nota de clase sobre por qué es la suma de lo
  /// mostrado cuando la raya se redondea.
  MontoMostrado get total {
    final base = config.aplicaA(CampoRedondeo.rayaPersona) ||
            config.aplicaA(CampoRedondeo.salarioDia)
        ? _sumaDeLoMostrado
        : resultado.total;
    return MontoMostrado(
        resultado.total, config.aplicar(base, CampoRedondeo.totalSemana));
  }

  /// Cuánto se movió el total por redondear. Es la cifra que la pantalla enseña
  /// como «\$18 más que lo exacto»: sin ella, el redondeo es un número que
  /// cambió sin que nadie diga cuánto.
  double get diferenciaTotal => total.diferencia;

  /// ¿El total que se enseña es exactamente la suma de los renglones que se
  /// enseñan? Deja de serlo cuando se redondea el total POR ENCIMA de rayas ya
  /// redondeadas, y entonces la pantalla tiene que decirlo.
  bool get totalCuadraConLosRenglones {
    if (!config.activo) return true;
    return (total.mostrado - _sumaDeLoMostrado).abs() < 0.005;
  }

  /// Frase para el pie del PDF y el aviso de la pantalla. Vacía si no hay
  /// redondeo, para que el llamador no tenga que preguntar dos veces.
  String get leyenda {
    if (!config.activo) return '';
    final campos =
        CampoRedondeo.values.where(config.campos.contains).map((c) => c.label);
    final paso = config.paso.toStringAsFixed(0);
    final modo = switch (config.modo) {
      ModoRedondeo.alMasCercano => 'al más cercano',
      ModoRedondeo.haciaArriba => 'siempre hacia arriba',
      ModoRedondeo.haciaAbajo => 'siempre hacia abajo',
    };
    return 'Cifras redondeadas a múltiplos de \$$paso, $modo: '
        '${campos.join(', ').toLowerCase()}.';
  }
}
