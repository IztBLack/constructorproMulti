/// Redondeo de cifras de dinero para la proyección de nómina.
///
/// Existe porque la raya se paga en efectivo: nadie reparte $3,499.88 en un
/// sobre. El maestro redondea a $3,500 de cabeza y luego el papel no cuadra con
/// lo que entregó. Esto lo hace la app, con la regla a la vista.
///
/// Dos reglas gobiernan el archivo:
///
///   1. **El redondeo NUNCA toca el cálculo.** `ProyeccionCalculator` y
///      `NominaCalculator` siguen dando el número exacto; esto se aplica encima,
///      al mostrar. Por eso vive fuera del calculador y por eso el original
///      siempre se conserva: la pantalla lo enseña en chiquito debajo.
///   2. **Se redondea la MAGNITUD, no el número con signo.** Un anticipo de
///      −$799.60 «hacia arriba» con paso de $100 da −$800, no −$700: el usuario
///      piensa en «ochocientos de anticipo», no en la recta numérica. Sin esta
///      regla, subir y bajar significarían cosas distintas para un cargo y para
///      un descuento, que es justo la clase de sorpresa que hace desconfiar de
///      una cifra.
///
/// La aritmética es en CENTAVOS enteros. Con `double`, un paso de $0.50 sobre
/// $3,499.88 se decide por un `0.4999999999` y el resultado cambia según el
/// valor: en dinero eso no es un detalle, es un centavo que falta en el sobre.
library;

/// Hacia dónde se mueve la cifra cuando no cae justo en el paso.
enum ModoRedondeo {
  /// Al múltiplo más cercano; el empate exacto sube. Es el default.
  alMasCercano,

  /// Siempre al múltiplo de arriba. Es lo que se usa en obra cuando se quiere
  /// que a nadie le falte.
  haciaArriba,

  /// Siempre al múltiplo de abajo.
  haciaAbajo,
}

extension ModoRedondeoX on ModoRedondeo {
  String get label => switch (this) {
        ModoRedondeo.alMasCercano => 'Al más cercano',
        ModoRedondeo.haciaArriba => 'Siempre hacia arriba',
        ModoRedondeo.haciaAbajo => 'Siempre hacia abajo',
      };

  String get ayuda => switch (this) {
        ModoRedondeo.alMasCercano =>
          '\$3,499 → \$3,500 · \$3,420 → \$3,400',
        ModoRedondeo.haciaArriba => '\$3,420 → \$3,500. A nadie le falta.',
        ModoRedondeo.haciaAbajo => '\$3,499 → \$3,400.',
      };

  String get code => switch (this) {
        ModoRedondeo.alMasCercano => 'CERCANO',
        ModoRedondeo.haciaArriba => 'ARRIBA',
        ModoRedondeo.haciaAbajo => 'ABAJO',
      };
}

ModoRedondeo modoRedondeoFromCode(String? code) => switch (code) {
      'ARRIBA' => ModoRedondeo.haciaArriba,
      'ABAJO' => ModoRedondeo.haciaAbajo,
      _ => ModoRedondeo.alMasCercano,
    };

/// Qué cifra de la pantalla se redondea.
///
/// Son ámbitos separados y no un solo interruptor porque no significan lo mismo:
/// redondear la **raya** cambia lo que se entrega en la mano; redondear el
/// **salario por día** cambia una tarifa que multiplica; y redondear solo el
/// **total** es puro cosmético de portada. El usuario que pidió esto puede
/// querer uno sin el otro.
///
/// Lo que el usuario TECLEÓ nunca se redondea: un anticipo de \$799.60 se
/// capturó así porque así se entregó. Redondear un dato de entrada sería
/// cambiarle el dato, no la presentación.
enum CampoRedondeo {
  /// El salario por día de cada quien. Ojo: multiplica, así que redondearlo
  /// mueve todo lo demás.
  salarioDia,

  /// Lo que se le paga a cada persona (su renglón completo, ajustes incluidos).
  rayaPersona,

  /// Los subtotales por cuadrilla y el costo de cada día.
  subtotales,

  /// El gran total de la semana.
  totalSemana,
}

extension CampoRedondeoX on CampoRedondeo {
  String get label => switch (this) {
        CampoRedondeo.salarioDia => 'Salario por día',
        CampoRedondeo.rayaPersona => 'La raya de cada persona',
        CampoRedondeo.subtotales => 'Subtotales por cuadrilla y por día',
        CampoRedondeo.totalSemana => 'Total de la semana',
      };

  String get ayuda => switch (this) {
        CampoRedondeo.salarioDia =>
          'Cuidado: es una tarifa que multiplica, así que mueve todos los demás números.',
        CampoRedondeo.rayaPersona =>
          'Lo que de verdad se entrega en el sobre. Es el que casi siempre se quiere.',
        CampoRedondeo.subtotales => 'Solo de presentación; no mueve el total.',
        CampoRedondeo.totalSemana => 'Solo la cifra de portada.',
      };

  String get code => switch (this) {
        CampoRedondeo.salarioDia => 'SALARIO_DIA',
        CampoRedondeo.rayaPersona => 'RAYA',
        CampoRedondeo.subtotales => 'SUBTOTALES',
        CampoRedondeo.totalSemana => 'TOTAL',
      };
}

CampoRedondeo? campoRedondeoFromCode(String? code) => switch (code) {
      'SALARIO_DIA' => CampoRedondeo.salarioDia,
      'RAYA' => CampoRedondeo.rayaPersona,
      'SUBTOTALES' => CampoRedondeo.subtotales,
      'TOTAL' => CampoRedondeo.totalSemana,
      _ => null,
    };

/// Pasos ofrecidos en la UI. En pesos.
const List<double> pasosRedondeo = [1, 5, 10, 50, 100];

/// Cómo quiere el usuario ver las cifras. Inmutable.
class RedondeoConfig {
  /// El interruptor maestro. Apagado, `aplicar` devuelve el valor intacto sin
  /// mirar nada más — así la pantalla puede llamar a `aplicar` en todos lados
  /// sin condicionar cada uso.
  final bool activo;

  /// Múltiplo al que se redondea, en pesos.
  final double paso;

  final ModoRedondeo modo;

  /// Qué cifras se redondean. Vacío con [activo] en true es un estado válido
  /// aunque inútil: la UI lo evita apagando el interruptor.
  final Set<CampoRedondeo> campos;

  const RedondeoConfig({
    this.activo = false,
    this.paso = 1,
    this.modo = ModoRedondeo.alMasCercano,
    this.campos = const {CampoRedondeo.rayaPersona, CampoRedondeo.totalSemana},
  });

  /// El default de la app: apagado, y si se prende, redondea lo que se entrega
  /// en la mano y la cifra de portada, al peso.
  static const apagado = RedondeoConfig();

  bool aplicaA(CampoRedondeo campo) => activo && campos.contains(campo);

  /// Redondea [valor] si [campo] está seleccionado; si no, lo devuelve igual.
  double aplicar(double valor, CampoRedondeo campo) =>
      aplicaA(campo) ? redondearMonto(valor, paso, modo) : valor;

  RedondeoConfig copyWith({
    bool? activo,
    double? paso,
    ModoRedondeo? modo,
    Set<CampoRedondeo>? campos,
  }) =>
      RedondeoConfig(
        activo: activo ?? this.activo,
        paso: paso ?? this.paso,
        modo: modo ?? this.modo,
        campos: campos ?? this.campos,
      );

  /// Prende o apaga un ámbito. Quitar el último apaga el interruptor maestro:
  /// «redondeo activo, cero cifras redondeadas» se ve como un bug en la
  /// pantalla y el usuario no tendría cómo saber que no está roto.
  RedondeoConfig alternarCampo(CampoRedondeo campo) {
    final nuevos = {...campos};
    nuevos.contains(campo) ? nuevos.remove(campo) : nuevos.add(campo);
    return copyWith(campos: nuevos, activo: nuevos.isEmpty ? false : activo);
  }

  /// Frase corta para el chip de la barra: «Redondeo $100 ↑».
  String get resumenCorto {
    if (!activo) return 'Sin redondeo';
    final flecha = switch (modo) {
      ModoRedondeo.haciaArriba => ' ↑',
      ModoRedondeo.haciaAbajo => ' ↓',
      ModoRedondeo.alMasCercano => '',
    };
    return 'Redondeo \$${paso.toStringAsFixed(0)}$flecha';
  }

  bool mismaConfigQue(RedondeoConfig otra) =>
      activo == otra.activo &&
      paso == otra.paso &&
      modo == otra.modo &&
      campos.length == otra.campos.length &&
      campos.containsAll(otra.campos);

  Map<String, Object?> toJson() => {
        'activo': activo,
        'paso': paso,
        'modo': modo.code,
        'campos': campos.map((c) => c.code).toList(),
      };

  factory RedondeoConfig.fromJson(Map<String, Object?> json) => RedondeoConfig(
        activo: json['activo'] == true,
        paso: (json['paso'] as num?)?.toDouble() ?? 1,
        modo: modoRedondeoFromCode(json['modo'] as String?),
        campos: {
          for (final c in (json['campos'] as List?) ?? const [])
            ?campoRedondeoFromCode(c as String?),
        },
      );
}

/// Redondea [valor] al múltiplo de [paso] según [modo], conservando el signo.
///
/// Con [paso] ≤ 0 devuelve el valor sin tocar: un paso de cero no tiene
/// múltiplos y devolver 0 borraría la raya de alguien.
double redondearMonto(double valor, double paso, ModoRedondeo modo) {
  if (!paso.isFinite || paso <= 0 || !valor.isFinite) return valor;
  final pasoCent = (paso * 100).round();
  if (pasoCent <= 0) return valor;

  final negativo = valor < 0;
  final cent = (valor.abs() * 100).round();
  final resto = cent % pasoCent;
  // Ya cae en el paso: se devuelve normalizado a centavos, que de paso limpia
  // la basura de coma flotante que arrastran las divisiones del reparto.
  if (resto == 0) return (negativo ? -cent : cent) / 100;

  final abajo = cent - resto;
  final arriba = abajo + pasoCent;
  final destino = switch (modo) {
    ModoRedondeo.haciaArriba => arriba,
    ModoRedondeo.haciaAbajo => abajo,
    // El empate sube: es lo que la gente espera de «al más cercano» y lo que
    // hace `round()` de Dart para los positivos.
    ModoRedondeo.alMasCercano => resto * 2 >= pasoCent ? arriba : abajo,
  };
  return (negativo ? -destino : destino) / 100;
}
