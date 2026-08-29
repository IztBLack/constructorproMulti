import '../models/models.dart';
import 'nomina_calculator.dart';
import 'redondeo.dart';
import 'salario_periodo.dart';

export 'redondeo.dart';
export 'salario_periodo.dart';

/// Modelos del escenario de proyección de nómina y de su resultado.
///
/// Todo es INMUTABLE y sin dependencias de Flutter ni de Drift: el escenario es
/// un valor que se puede copiar, comparar y testear. La pantalla solo guarda uno
/// de estos y lo reemplaza con [ProyeccionEstado.copyWith] en cada toque.

// ═══════════════════════════════════════════════════════════════════════════
// Ajustes
// ═══════════════════════════════════════════════════════════════════════════

/// Qué le hace un ajuste a la raya.
///
/// Existe porque la raya real casi nunca es días × salario: hay un destajo que
/// se pactó aparte, un anticipo que se dio el miércoles, un descuento por una
/// herramienta. El cálculo de nómina no tiene dónde ponerlos, así que la
/// proyección los lleva por su cuenta y los suma al final.
enum TipoAjuste {
  /// Trabajo a precio alzado que se paga ADEMÁS de los días. Suma.
  destajo,

  /// Dinero que ya se le entregó a cuenta de esta raya. Resta.
  anticipo,

  /// Préstamo, herramienta, material roto. Resta.
  descuento,
}

extension TipoAjusteX on TipoAjuste {
  String get label => switch (this) {
        TipoAjuste.destajo => 'Destajo',
        TipoAjuste.anticipo => 'Anticipo',
        TipoAjuste.descuento => 'Descuento',
      };

  /// Valor persistido (si algún día el escenario se guarda en BD).
  String get code => switch (this) {
        TipoAjuste.destajo => 'DESTAJO',
        TipoAjuste.anticipo => 'ANTICIPO',
        TipoAjuste.descuento => 'DESCUENTO',
      };

  /// +1 suma a la raya, −1 la baja.
  int get signo => this == TipoAjuste.destajo ? 1 : -1;
}

TipoAjuste tipoAjusteFromCode(String? code) => switch (code) {
      'ANTICIPO' => TipoAjuste.anticipo,
      'DESCUENTO' => TipoAjuste.descuento,
      _ => TipoAjuste.destajo,
    };

/// A quién se le carga el ajuste.
enum DestinoAjuste { colaborador, cuadrilla }

/// Qué hacer con un ajuste dirigido a una cuadrilla completa.
enum RepartoAjuste {
  /// Se divide entre los miembros de la cuadrilla que están en el escenario.
  /// Es el caso normal: el destajo se pactó con la cuadrilla y se reparte.
  partesIguales,

  /// Queda como un renglón de la cuadrilla, sin atribuirse a nadie. Para
  /// cuando el maestro cobra el alzado y él reparte por fuera.
  aLaCuadrilla,
}

/// Un monto extra (o menos) que entra a la raya sin pasar por la asistencia.
///
/// Se puede dirigir a una persona o a una cuadrilla completa, y aplica igual a
/// quien cobra por día que a quien cobra a destajo — es la «opción adicional»
/// que se pidió: no estorba mientras no se use, y cuando se necesita se agrega
/// sin cambiar la forma de la tabla.
class AjusteProyeccion {
  final String id;
  final TipoAjuste tipo;
  final DestinoAjuste destino;

  /// `colaboradorId` o `cuadrillaId` según [destino].
  final String destinoId;

  /// SIEMPRE positivo. El signo lo pone [TipoAjuste.signo], para que no exista
  /// la ambigüedad de un «descuento de −500» que en realidad sumaría.
  final double monto;

  final String nota;

  /// Solo se usa cuando [destino] es [DestinoAjuste.cuadrilla].
  final RepartoAjuste reparto;

  const AjusteProyeccion({
    required this.id,
    required this.tipo,
    required this.destino,
    required this.destinoId,
    required this.monto,
    this.nota = '',
    this.reparto = RepartoAjuste.partesIguales,
  });

  int get signo => tipo.signo;
  double get montoConSigno => monto.abs() * signo;

  Map<String, Object?> toJson() => {
        'id': id,
        'tipo': tipo.code,
        'destino': destino == DestinoAjuste.cuadrilla ? 'CUADRILLA' : 'COLABORADOR',
        'destinoId': destinoId,
        'monto': monto,
        'nota': nota,
        'reparto': reparto == RepartoAjuste.aLaCuadrilla
            ? 'A_LA_CUADRILLA'
            : 'PARTES_IGUALES',
      };

  factory AjusteProyeccion.fromJson(Map<String, Object?> json) =>
      AjusteProyeccion(
        id: json['id'] as String,
        tipo: tipoAjusteFromCode(json['tipo'] as String?),
        destino: json['destino'] == 'CUADRILLA'
            ? DestinoAjuste.cuadrilla
            : DestinoAjuste.colaborador,
        destinoId: (json['destinoId'] as String?) ?? '',
        monto: (json['monto'] as num?)?.toDouble() ?? 0,
        nota: (json['nota'] as String?) ?? '',
        reparto: json['reparto'] == 'A_LA_CUADRILLA'
            ? RepartoAjuste.aLaCuadrilla
            : RepartoAjuste.partesIguales,
      );

  AjusteProyeccion copyWith({
    TipoAjuste? tipo,
    DestinoAjuste? destino,
    String? destinoId,
    double? monto,
    String? nota,
    RepartoAjuste? reparto,
  }) =>
      AjusteProyeccion(
        id: id,
        tipo: tipo ?? this.tipo,
        destino: destino ?? this.destino,
        destinoId: destinoId ?? this.destinoId,
        monto: monto ?? this.monto,
        nota: nota ?? this.nota,
        reparto: reparto ?? this.reparto,
      );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sueldo capturado
// ═══════════════════════════════════════════════════════════════════════════

/// El sueldo tal como lo tecleó el usuario, no solo el diario que salió de él.
///
/// El escenario ya guardaba un `salarioOverride` con el salario POR DÍA, que es
/// lo que consume el cálculo. Eso alcanzaba mientras el diario se capturaba a
/// mano; ahora que se captura el sueldo del periodo, hace falta recordar de
/// dónde salió ese diario: si solo se guardara el resultado, al reabrir la ficha
/// habría que adivinar si \$600 vinieron de \$3,600 semanales o de \$15,600
/// mensuales, y el campo se mostraría vacío o mentiría.
///
/// Los dos conviven: esto es lo capturado, `salarioOverride` es lo derivado, y
/// `ProyeccionEstado.conSueldo` los escribe SIEMPRE juntos.
class SueldoProyectado {
  final PeriodoPago periodo;

  /// Monto del periodo (semanal, quincenal o mensual). Siempre positivo.
  final double monto;

  /// Días trabajados por semana: el divisor. 5, 6 o 7.
  final int diasSemana;

  const SueldoProyectado({
    required this.periodo,
    required this.monto,
    required this.diasSemana,
  });

  /// Salario por día derivado. `null` si no hay monto válido — mismo contrato
  /// que `salarioDiarioDesdePeriodo`, que es la única fórmula del proyecto.
  double? get salarioDia =>
      salarioDiarioDesdePeriodo(monto, periodo, diasSemana);

  SueldoProyectado copyWith({
    PeriodoPago? periodo,
    double? monto,
    int? diasSemana,
  }) =>
      SueldoProyectado(
        periodo: periodo ?? this.periodo,
        monto: monto ?? this.monto,
        diasSemana: diasSemana ?? this.diasSemana,
      );

  bool mismoQue(SueldoProyectado? otro) =>
      otro != null &&
      periodo == otro.periodo &&
      monto == otro.monto &&
      diasSemana == otro.diasSemana;

  Map<String, Object?> toJson() => {
        'periodo': periodo.code,
        'monto': monto,
        'diasSemana': diasSemana,
      };

  factory SueldoProyectado.fromJson(Map<String, Object?> json) =>
      SueldoProyectado(
        periodo: periodoPagoFromCode(json['periodo'] as String?),
        monto: (json['monto'] as num?)?.toDouble() ?? 0,
        diasSemana: (json['diasSemana'] as num?)?.toInt() ?? 6,
      );
}

// ═══════════════════════════════════════════════════════════════════════════
// Plazas
// ═══════════════════════════════════════════════════════════════════════════

/// Prefijo del id de una plaza. Es lo que permite distinguirla de un
/// colaborador real en cualquier mapa del escenario sin llevar una lista aparte.
const String prefijoPlaza = 'plaza:';

/// ¿Este id es de una plaza y no de alguien dado de alta?
bool esPlaza(String id) => id.startsWith(prefijoPlaza);

/// Un puesto que todavía no tiene a nadie: «cuatro maestros a \$3,600».
///
/// Sirve para la pregunta que la proyección no podía contestar: «¿cuánto me
/// costaría la semana si meto cuatro maestros más?». Vive SOLO en el escenario;
/// no existe en `colaboradores` y no se sincroniza como persona.
///
/// El truco que mantiene el cambio chico: al armar la vista, cada plaza se
/// convierte en un [Colaborador] sintético con este mismo id y se le pasa al
/// calculador junto con los reales. Así los días, los préstamos por día, los
/// ajustes, los subtotales de cuadrilla y el PDF funcionan con ellas sin una
/// línea nueva en `ProyeccionCalculator`.
///
/// Siempre es de pago POR DÍA. Un alzado hipotético se modela mejor con un
/// ajuste de destajo a la cuadrilla, que es lo que ya existe.
class PlazaProyectada {
  final String id;

  /// Cómo se lee en la tabla: «Maestro 2». Editable.
  final String etiqueta;

  final String puestoId;

  /// Obra base. Sin ella, la plaza desaparece en cuanto se filtra por una obra
  /// —por eso la hoja de alta la precarga con la obra que se está viendo.
  final String? obraId;

  final String? cuadrillaId;

  final SueldoProyectado sueldo;

  const PlazaProyectada({
    required this.id,
    required this.etiqueta,
    required this.puestoId,
    required this.sueldo,
    this.obraId,
    this.cuadrillaId,
  });

  double get salarioDia => sueldo.salarioDia ?? 0;

  PlazaProyectada copyWith({
    String? etiqueta,
    String? puestoId,
    String? obraId,
    String? cuadrillaId,
    SueldoProyectado? sueldo,
  }) =>
      PlazaProyectada(
        id: id,
        etiqueta: etiqueta ?? this.etiqueta,
        puestoId: puestoId ?? this.puestoId,
        obraId: obraId ?? this.obraId,
        cuadrillaId: cuadrillaId ?? this.cuadrillaId,
        sueldo: sueldo ?? this.sueldo,
      );

  /// El colaborador sintético que ve el calculador.
  Colaborador get comoColaborador => Colaborador(
        id: id,
        nombre: etiqueta,
        puestoId: puestoId,
        tipoPago: TipoPago.dia,
        salarioPersonalizado: sueldo.salarioDia,
      );

  bool mismaQue(PlazaProyectada otra) =>
      id == otra.id &&
      etiqueta == otra.etiqueta &&
      puestoId == otra.puestoId &&
      obraId == otra.obraId &&
      cuadrillaId == otra.cuadrillaId &&
      sueldo.mismoQue(otra.sueldo);

  Map<String, Object?> toJson() => {
        'id': id,
        'etiqueta': etiqueta,
        'puestoId': puestoId,
        'obraId': obraId,
        'cuadrillaId': cuadrillaId,
        'sueldo': sueldo.toJson(),
      };

  factory PlazaProyectada.fromJson(Map<String, Object?> json) =>
      PlazaProyectada(
        id: json['id'] as String,
        etiqueta: (json['etiqueta'] as String?) ?? 'Plaza',
        puestoId: (json['puestoId'] as String?) ?? '',
        obraId: json['obraId'] as String?,
        cuadrillaId: json['cuadrillaId'] as String?,
        sueldo: SueldoProyectado.fromJson(
            (json['sueldo'] as Map?)?.cast<String, Object?>() ?? const {}),
      );
}

// ═══════════════════════════════════════════════════════════════════════════
// Escenario
// ═══════════════════════════════════════════════════════════════════════════

/// El escenario completo: quiénes, qué días, cuánto.
///
/// No guarda nada de lo que ya está capturado — eso se lee de la BD en cada
/// cálculo. Guardar una copia sería la manera segura de que la proyección se
/// desincronice del pase de lista.
class ProyeccionEstado {
  /// Lunes 00:00 local de la semana proyectada, en epoch millis.
  final int lunesMillis;

  /// `colaboradorId` en el orden en que se muestran. Es la lista de
  /// participantes del escenario: quitar a alguien de aquí NO lo da de baja de
  /// la app, solo lo saca de esta cuenta.
  final List<String> participantes;

  /// `colaboradorId → índices de día (0 = lunes … 6 = domingo)` que se esperan
  /// trabajados. Siempre día completo.
  final Map<String, Set<int>> diasProyectados;

  /// `colaboradorId → total de destajo esperado en la semana`. Solo aplica a
  /// quien cobra a destajo; es el TOTAL, no un extra sobre lo capturado.
  final Map<String, double> destajoEstimado;

  /// `colaboradorId → salario diario` que pisa el del puesto solo dentro del
  /// escenario. No toca el catálogo.
  final Map<String, double> salarioOverride;

  final List<AjusteProyeccion> ajustes;

  /// `colaboradorId → sueldo tal como se capturó`. Convive con
  /// [salarioOverride], que guarda el diario DERIVADO de esto y es lo único que
  /// mira el cálculo. Ver [SueldoProyectado] para por qué hacen falta los dos.
  final Map<String, SueldoProyectado> sueldoOverride;

  /// Puestos sin nombre: «cuatro maestros a \$3,600». Sus ids también están en
  /// [participantes] — una plaza es un participante más, con la diferencia de
  /// que su ficha vive aquí en vez de en `colaboradores`.
  final Map<String, PlazaProyectada> plazas;

  /// Cómo se enseñan las cifras. Es parte del escenario y no una preferencia
  /// suelta porque se guarda CON la proyección: una simulación que se abrió
  /// redondeada a \$100 tiene que reabrirse igual, o los números del papel que
  /// alguien imprimió el martes no van a coincidir con los de la pantalla.
  final RedondeoConfig redondeo;

  /// Trata la semana entera como hipótesis: ignora lo capturado y deja mover
  /// todos los días. Para preguntarse «¿y si la semana hubiera sido así?».
  final bool simularCompleta;

  /// `colaboradorId → {índice de día → obraId}`: préstamos de un día a otra
  /// obra. Solo se guardan los días que se MUEVEN; el resto se queda en la obra
  /// base de la persona.
  ///
  /// Existe porque en la obra real la gente se presta por días: «el jueves me
  /// llevo a Fulanito a Alfaro». Sin esto, la obra es un atributo de la PERSONA
  /// y no se puede preguntar «¿cuánto sale la raya de Alfaro ese día?» sin
  /// reasignarla de verdad. Un préstamo NO cambia el total global —la persona
  /// trabaja los mismos días— pero sí mueve el total de cada obra.
  final Map<String, Map<int, String>> obraPorDia;

  const ProyeccionEstado({
    required this.lunesMillis,
    this.participantes = const [],
    this.diasProyectados = const {},
    this.destajoEstimado = const {},
    this.salarioOverride = const {},
    this.ajustes = const [],
    this.simularCompleta = false,
    this.obraPorDia = const {},
    this.sueldoOverride = const {},
    this.plazas = const {},
    this.redondeo = RedondeoConfig.apagado,
  });

  Set<int> diasDe(String colaboradorId) =>
      diasProyectados[colaboradorId] ?? const <int>{};

  bool tieneDia(String colaboradorId, int dia) => diasDe(colaboradorId).contains(dia);

  /// Días que esta persona tiene prestados a otra obra: `día → obraId`.
  Map<int, String> prestamosDe(String colaboradorId) =>
      obraPorDia[colaboradorId] ?? const <int, String>{};

  /// A qué obra pertenece ESE día: la del préstamo si lo hay, si no la base.
  String obraDelDia(String colaboradorId, int dia, String obraBase) =>
      prestamosDe(colaboradorId)[dia] ?? obraBase;

  /// Ajustes que apuntan a un colaborador concreto.
  List<AjusteProyeccion> ajustesDeColaborador(String colaboradorId) => ajustes
      .where((a) =>
          a.destino == DestinoAjuste.colaborador && a.destinoId == colaboradorId)
      .toList();

  /// Ajustes que apuntan a una cuadrilla.
  List<AjusteProyeccion> ajustesDeCuadrilla(String cuadrillaId) => ajustes
      .where((a) =>
          a.destino == DestinoAjuste.cuadrilla && a.destinoId == cuadrillaId)
      .toList();

  ProyeccionEstado copyWith({
    int? lunesMillis,
    List<String>? participantes,
    Map<String, Set<int>>? diasProyectados,
    Map<String, double>? destajoEstimado,
    Map<String, double>? salarioOverride,
    List<AjusteProyeccion>? ajustes,
    bool? simularCompleta,
    Map<String, Map<int, String>>? obraPorDia,
    Map<String, SueldoProyectado>? sueldoOverride,
    Map<String, PlazaProyectada>? plazas,
    RedondeoConfig? redondeo,
  }) =>
      ProyeccionEstado(
        lunesMillis: lunesMillis ?? this.lunesMillis,
        participantes: participantes ?? this.participantes,
        diasProyectados: diasProyectados ?? this.diasProyectados,
        destajoEstimado: destajoEstimado ?? this.destajoEstimado,
        salarioOverride: salarioOverride ?? this.salarioOverride,
        ajustes: ajustes ?? this.ajustes,
        simularCompleta: simularCompleta ?? this.simularCompleta,
        obraPorDia: obraPorDia ?? this.obraPorDia,
        sueldoOverride: sueldoOverride ?? this.sueldoOverride,
        plazas: plazas ?? this.plazas,
        redondeo: redondeo ?? this.redondeo,
      );

  // ── Mutaciones (devuelven copias) ────────────────────────────────────────

  /// Agrega a alguien al escenario con los días que se le proyectan.
  /// Si ya estaba, no lo duplica: solo reemplaza sus días.
  ProyeccionEstado conParticipante(String colaboradorId, {Set<int>? dias}) {
    final lista = participantes.contains(colaboradorId)
        ? participantes
        : [...participantes, colaboradorId];
    return copyWith(
      participantes: lista,
      diasProyectados: {
        ...diasProyectados,
        colaboradorId: ?dias,
      },
    );
  }

  /// Lo saca del escenario y limpia todo lo suyo, incluidos sus ajustes: dejar
  /// un anticipo colgando de alguien que ya no está sumaría al total sin que se
  /// vea de dónde sale.
  ProyeccionEstado sinParticipante(String colaboradorId) => copyWith(
        participantes:
            participantes.where((id) => id != colaboradorId).toList(),
        diasProyectados: {...diasProyectados}..remove(colaboradorId),
        destajoEstimado: {...destajoEstimado}..remove(colaboradorId),
        salarioOverride: {...salarioOverride}..remove(colaboradorId),
        ajustes: ajustes
            .where((a) => !(a.destino == DestinoAjuste.colaborador &&
                a.destinoId == colaboradorId))
            .toList(),
        obraPorDia: {...obraPorDia}..remove(colaboradorId),
        // Si es una plaza, se va también su ficha: nadie más la referencia y
        // dejarla sería un renglón fantasma que reaparece al guardar.
        sueldoOverride: {...sueldoOverride}..remove(colaboradorId),
        plazas: {...plazas}..remove(colaboradorId),
      );

  /// Prende o apaga un día de una persona.
  ProyeccionEstado alternarDia(String colaboradorId, int dia) {
    final actuales = {...diasDe(colaboradorId)};
    actuales.contains(dia) ? actuales.remove(dia) : actuales.add(dia);
    return copyWith(
      diasProyectados: {...diasProyectados, colaboradorId: actuales},
    );
  }

  /// Pone el mismo día para varias personas de una sola vez (el toque en el
  /// encabezado de la columna). [bloqueados] son los que no se deben mover
  /// porque ya están capturados.
  ProyeccionEstado fijarColumna(
    int dia,
    Iterable<String> colaboradorIds, {
    required bool prender,
    Set<String> bloqueados = const {},
  }) {
    final mapa = {...diasProyectados};
    for (final id in colaboradorIds) {
      if (bloqueados.contains(id)) continue;
      final actuales = {...diasDe(id)};
      prender ? actuales.add(dia) : actuales.remove(dia);
      mapa[id] = actuales;
    }
    return copyWith(diasProyectados: mapa);
  }

  /// Presta (o devuelve) UN día de una persona a otra obra.
  /// [obraId] en `null` regresa ese día a su obra base.
  ///
  /// Mover un día lo marca además como proyectado: si el usuario dice «el
  /// jueves se va a Alfaro» es porque va a trabajar allá, y obligarlo a prender
  /// la celda aparte sería un segundo paso cuyo motivo nadie adivina. Es una
  /// regla del dominio y no de la pantalla, por eso vive aquí: así el mismo
  /// invariante lo cumplen la UI, el PDF y los tests.
  ProyeccionEstado conDiaEnObra(String colaboradorId, int dia, String? obraId) {
    final suyos = {...prestamosDe(colaboradorId)};
    obraId == null ? suyos.remove(dia) : suyos[dia] = obraId;

    final mapa = {...obraPorDia};
    // Sin días movidos no se deja la llave vacía: un mapa `{c1: {}}` haría que
    // el escenario se viera «tocado» y que la persona apareciera al filtrar una
    // obra a la que en realidad ya no va.
    suyos.isEmpty ? mapa.remove(colaboradorId) : mapa[colaboradorId] = suyos;

    final dias = {...diasDe(colaboradorId)};
    if (obraId != null) dias.add(dia);

    return copyWith(
      obraPorDia: mapa,
      diasProyectados: {...diasProyectados, colaboradorId: dias},
    );
  }

  /// Mete a varios de un golpe, cada quien con los días que le tocan.
  ///
  /// Es la versión en plural de [conParticipante] y existe por el deshacer:
  /// llamar ocho veces al singular deja ocho estados intermedios, y el aviso de
  /// «se agregaron 8 · Deshacer» solo podría quitar al último.
  ProyeccionEstado conParticipantes(Map<String, Set<int>> diasPorId) {
    final lista = [...participantes];
    for (final id in diasPorId.keys) {
      if (!lista.contains(id)) lista.add(id);
    }
    return copyWith(
      participantes: lista,
      diasProyectados: {...diasProyectados, ...diasPorId},
    );
  }

  /// Agrega plazas nuevas al escenario, ya con sus días sembrados.
  ///
  /// El diario de cada plaza se copia también a [salarioOverride]: así el
  /// calculador la trata igual que a cualquiera y no hay una segunda ruta por
  /// la que un sueldo pueda llegar al cálculo.
  ProyeccionEstado conPlazas(Iterable<PlazaProyectada> nuevas) {
    final mapaPlazas = {...plazas};
    final mapaDias = {...diasProyectados};
    final mapaSueldo = {...sueldoOverride};
    final mapaSalario = {...salarioOverride};
    final lista = [...participantes];

    for (final p in nuevas) {
      mapaPlazas[p.id] = p;
      mapaSueldo[p.id] = p.sueldo;
      mapaSalario[p.id] = p.salarioDia;
      mapaDias[p.id] = {
        for (var d = 0; d < p.sueldo.diasSemana.clamp(1, 7); d++) d,
      };
      if (!lista.contains(p.id)) lista.add(p.id);
    }

    return copyWith(
      participantes: lista,
      plazas: mapaPlazas,
      diasProyectados: mapaDias,
      sueldoOverride: mapaSueldo,
      salarioOverride: mapaSalario,
    );
  }

  /// Reemplaza la ficha de una plaza (nombre, puesto, obra, cuadrilla, sueldo),
  /// manteniendo el diario derivado en sincronía.
  ProyeccionEstado conPlaza(PlazaProyectada plaza) {
    if (!plazas.containsKey(plaza.id)) return this;
    return copyWith(
      plazas: {...plazas, plaza.id: plaza},
      sueldoOverride: {...sueldoOverride, plaza.id: plaza.sueldo},
      salarioOverride: {...salarioOverride, plaza.id: plaza.salarioDia},
    );
  }

  /// Guarda el sueldo capturado y, con él, el diario que consume el cálculo.
  ///
  /// Se escriben SIEMPRE los dos. Separarlos es la manera segura de que un día
  /// queden en desacuerdo y la ficha enseñe \$3,600 semanales mientras la tabla
  /// cobra un diario viejo.
  ProyeccionEstado conSueldo(String colaboradorId, SueldoProyectado? sueldo) {
    final mapaSueldo = {...sueldoOverride};
    final mapaSalario = {...salarioOverride};
    final mapaPlazas = {...plazas};

    if (sueldo == null) {
      mapaSueldo.remove(colaboradorId);
      mapaSalario.remove(colaboradorId);
    } else {
      mapaSueldo[colaboradorId] = sueldo;
      final diario = sueldo.salarioDia;
      diario == null
          ? mapaSalario.remove(colaboradorId)
          : mapaSalario[colaboradorId] = diario;
      final plaza = mapaPlazas[colaboradorId];
      if (plaza != null) mapaPlazas[colaboradorId] = plaza.copyWith(sueldo: sueldo);
    }

    return copyWith(
      sueldoOverride: mapaSueldo,
      salarioOverride: mapaSalario,
      plazas: mapaPlazas,
    );
  }

  ProyeccionEstado conRedondeo(RedondeoConfig config) =>
      copyWith(redondeo: config);

  /// Sueldo capturado de alguien, si lo hay.
  SueldoProyectado? sueldoDe(String colaboradorId) =>
      sueldoOverride[colaboradorId];

  /// ¿Este participante es una plaza y no una persona dada de alta?
  bool esPlazaDelEscenario(String id) => plazas.containsKey(id);

    ProyeccionEstado conSalario(String colaboradorId, double? salario) {
    final mapa = {...salarioOverride};
    salario == null ? mapa.remove(colaboradorId) : mapa[colaboradorId] = salario;
    return copyWith(salarioOverride: mapa);
  }

  ProyeccionEstado conDestajo(String colaboradorId, double monto) => copyWith(
        destajoEstimado: {...destajoEstimado, colaboradorId: monto},
      );

  /// Agrega o reemplaza un ajuste (empareja por [AjusteProyeccion.id]).
  ProyeccionEstado conAjuste(AjusteProyeccion ajuste) {
    final i = ajustes.indexWhere((a) => a.id == ajuste.id);
    final lista = [...ajustes];
    i >= 0 ? lista[i] = ajuste : lista.add(ajuste);
    return copyWith(ajustes: lista);
  }

  ProyeccionEstado sinAjuste(String ajusteId) =>
      copyWith(ajustes: ajustes.where((a) => a.id != ajusteId).toList());

  /// ¿Este escenario es igual a [otro] en todo lo que el usuario puede mover?
  ///
  /// Se usa para saber si hay trabajo invertido antes de tirarlo (cambiar de
  /// semana). Se compara el escenario COMPLETO contra el sembrado inicial en
  /// vez de llevar una bandera «tocado»: una bandera hay que acordarse de
  /// ponerla en cada mutación nueva, y la que se olvide hará que la pantalla
  /// borre trabajo sin preguntar.
  ///
  /// No se implementa `==` porque un `ProyeccionEstado` con `==` de valor haría
  /// que Riverpod se saltara notificaciones cuando dos escenarios distintos
  /// coincidieran por casualidad, y aquí conviene que cada toque redibuje.
  bool mismoEscenarioQue(ProyeccionEstado otro) {
    if (lunesMillis != otro.lunesMillis ||
        simularCompleta != otro.simularCompleta ||
        ajustes.length != otro.ajustes.length ||
        participantes.length != otro.participantes.length ||
        plazas.length != otro.plazas.length ||
        sueldoOverride.length != otro.sueldoOverride.length ||
        !redondeo.mismaConfigQue(otro.redondeo)) {
      return false;
    }
    for (var i = 0; i < participantes.length; i++) {
      if (participantes[i] != otro.participantes[i]) return false;
    }
    for (var i = 0; i < ajustes.length; i++) {
      final a = ajustes[i];
      final b = otro.ajustes[i];
      if (a.id != b.id ||
          a.tipo != b.tipo ||
          a.destino != b.destino ||
          a.destinoId != b.destinoId ||
          a.monto != b.monto ||
          a.nota != b.nota ||
          a.reparto != b.reparto) {
        return false;
      }
    }
    if (!_mismoMapa(destajoEstimado, otro.destajoEstimado)) return false;
    if (!_mismoMapa(salarioOverride, otro.salarioOverride)) return false;

    // Los días: un `{}` y una llave ausente significan lo mismo, así que se
    // comparan por la unión de llaves en vez de por el tamaño de los mapas.
    for (final id in {...diasProyectados.keys, ...otro.diasProyectados.keys}) {
      final a = diasDe(id);
      final b = otro.diasDe(id);
      if (a.length != b.length || !a.containsAll(b)) return false;
    }
    for (final id in {...obraPorDia.keys, ...otro.obraPorDia.keys}) {
      if (!_mismoMapa(prestamosDe(id), otro.prestamosDe(id))) return false;
    }
    // Las plazas se comparan campo por campo: son trabajo capturado a mano y
    // perderlas al cambiar de semana sin preguntar es justo lo que este método
    // existe para evitar.
    for (final e in plazas.entries) {
      final otra = otro.plazas[e.key];
      if (otra == null || !e.value.mismaQue(otra)) return false;
    }
    for (final e in sueldoOverride.entries) {
      if (!e.value.mismoQue(otro.sueldoOverride[e.key])) return false;
    }
    return true;
  }

  // ── Guardado ─────────────────────────────────────────────────────────────

  /// Versión del formato. Se guarda con el escenario para que una app vieja que
  /// abra una proyección nueva pueda decir «no la entiendo» en vez de leerla mal
  /// y enseñar una raya equivocada.
  static const int versionEsquema = 1;

  /// El escenario como JSON, para guardarlo en una sola columna.
  ///
  /// Se serializa el escenario COMPLETO y nada de lo capturado: al reabrir, la
  /// asistencia y los destajos se vuelven a leer de la base. Guardar una copia
  /// de lo capturado haría que una proyección de hace dos semanas enseñara el
  /// pase de lista de entonces aunque después se hubiera corregido.
  Map<String, Object?> toJson() => {
        'v': versionEsquema,
        'lunes': lunesMillis,
        'participantes': participantes,
        'dias': {
          for (final e in diasProyectados.entries)
            if (e.value.isNotEmpty) e.key: (e.value.toList()..sort()),
        },
        'destajo': destajoEstimado,
        'salario': salarioOverride,
        'sueldo': {
          for (final e in sueldoOverride.entries) e.key: e.value.toJson(),
        },
        'plazas': {for (final e in plazas.entries) e.key: e.value.toJson()},
        'ajustes': [for (final a in ajustes) a.toJson()],
        'simular': simularCompleta,
        'obraPorDia': {
          for (final e in obraPorDia.entries)
            e.key: {
              for (final d in e.value.entries) d.key.toString(): d.value,
            },
        },
        'redondeo': redondeo.toJson(),
      };

  /// Reconstruye un escenario guardado. Tolerante a llaves faltantes: un
  /// escenario de una versión anterior tiene que abrir, no reventar.
  factory ProyeccionEstado.fromJson(Map<String, Object?> json) {
    Map<String, Object?> mapa(Object? v) =>
        (v as Map?)?.cast<String, Object?>() ?? const {};

    return ProyeccionEstado(
      lunesMillis: (json['lunes'] as num?)?.toInt() ?? 0,
      participantes: [
        for (final p in (json['participantes'] as List?) ?? const []) p as String,
      ],
      diasProyectados: {
        for (final e in mapa(json['dias']).entries)
          e.key: {
            for (final d in (e.value as List?) ?? const []) (d as num).toInt(),
          },
      },
      destajoEstimado: {
        for (final e in mapa(json['destajo']).entries)
          e.key: (e.value as num).toDouble(),
      },
      salarioOverride: {
        for (final e in mapa(json['salario']).entries)
          e.key: (e.value as num).toDouble(),
      },
      sueldoOverride: {
        for (final e in mapa(json['sueldo']).entries)
          e.key: SueldoProyectado.fromJson(mapa(e.value)),
      },
      plazas: {
        for (final e in mapa(json['plazas']).entries)
          e.key: PlazaProyectada.fromJson(mapa(e.value)),
      },
      ajustes: [
        for (final a in (json['ajustes'] as List?) ?? const [])
          AjusteProyeccion.fromJson(mapa(a)),
      ],
      simularCompleta: json['simular'] == true,
      obraPorDia: {
        for (final e in mapa(json['obraPorDia']).entries)
          e.key: {
            for (final d in mapa(e.value).entries)
              (int.tryParse(d.key) ?? -1): d.value as String,
          }..removeWhere((k, _) => k < 0),
      },
      redondeo: RedondeoConfig.fromJson(mapa(json['redondeo'])),
    );
  }

    static bool _mismoMapa<K, V>(Map<K, V> a, Map<K, V> b) {
    if (a.length != b.length) return false;
    for (final e in a.entries) {
      if (!b.containsKey(e.key) || b[e.key] != e.value) return false;
    }
    return true;
  }
}

/// Quién aparece cuando se está viendo UNA obra.
///
/// No basta con «los que tienen esa obra base»: si a alguien de Boticaria se le
/// prestó el jueves a Alfaro, tiene que salir en Alfaro —con ese día contando y
/// el resto marcado como prestado—, o la raya de Alfaro no incluiría a quien de
/// verdad va a trabajar ahí. Y al revés: quien se fue TODA la semana sigue
/// saliendo en su obra base, con todos sus días marcados, para que se vea a
/// dónde se fue en vez de desaparecer sin explicación.
List<String> participantesDeObra(
  ProyeccionEstado estado,
  Map<String, String> obraPorColaborador,
  String? obraFiltro,
) {
  if (obraFiltro == null) return estado.participantes;
  return estado.participantes.where((id) {
    if (obraPorColaborador[id] == obraFiltro) return true;
    return estado.prestamosDe(id).values.contains(obraFiltro);
  }).toList();
}

// ═══════════════════════════════════════════════════════════════════════════
// Resultado
// ═══════════════════════════════════════════════════════════════════════════

/// De dónde sale el valor de una celda de día.
enum OrigenCelda {
  /// Ya está en `asistencias`. Manda sobre la proyección y la UI la bloquea.
  real,

  /// La puso el usuario en el escenario. Siempre día completo.
  proyectada,

  /// No cuenta.
  vacia,
}

/// Una celda de la tabla: un día de una persona.
class CeldaDia {
  final int indice; // 0 = lunes … 6 = domingo
  final OrigenCelda origen;

  /// Real: 0 (faltó), 0.5, 0.75 o 1. Proyectada: siempre 1. Vacía: 0.
  final double fraccion;

  /// Obra a la que pertenece ESTE día: la base de la persona, o la del préstamo
  /// si ese día se movió.
  final String obraId;

  /// Cuando se está viendo UNA obra: este día es de otra. Se muestra —para que
  /// se entienda por qué la persona aparece con menos días— pero NO suma a la
  /// raya de la obra que se está viendo.
  final bool prestado;

  const CeldaDia({
    required this.indice,
    required this.origen,
    required this.fraccion,
    this.obraId = '',
    this.prestado = false,
  });

  /// Capturada como falta: existe el registro pero no paga. Se distingue de
  /// [OrigenCelda.vacia] porque la UI la muestra en rojo y bloqueada — decir
  /// «faltó» no es lo mismo que «no sé».
  bool get esFaltaCapturada => origen == OrigenCelda.real && fraccion <= 0;

  bool get cuenta => fraccion > 0;

  /// La UI no debe dejar tocarla (lo capturado no se edita desde aquí).
  bool get bloqueada => origen == OrigenCelda.real;
}

/// Un renglón de la tabla, ya calculado.
class ProyeccionRenglon {
  final Colaborador colaborador;
  final String puestoNombre;
  final String? cuadrillaId;
  final double salarioDia;

  /// Siempre 7, de lunes a domingo.
  final List<CeldaDia> celdas;

  /// Suma de fracciones ya capturadas (puede traer ½ y ¾).
  final double fraccionCapturada;

  /// Días completos que el usuario proyectó y que no estaban capturados.
  final int diasProyectados;

  final double baseCapturada;
  final double baseProyectada;

  /// Pago a destajo (real + estimado) para quien cobra así.
  final double destajo;

  /// Parte del destajo que ya está registrada. Si es mayor que [destajo], el
  /// usuario estimó menos de lo que ya se debe y la UI debería avisarlo.
  final double destajoCapturado;

  /// Neto de ajustes con signo ya aplicado (destajo suma, anticipo resta).
  final double ajustes;

  const ProyeccionRenglon({
    required this.colaborador,
    required this.puestoNombre,
    required this.cuadrillaId,
    required this.salarioDia,
    required this.celdas,
    required this.fraccionCapturada,
    required this.diasProyectados,
    required this.baseCapturada,
    required this.baseProyectada,
    required this.destajo,
    required this.destajoCapturado,
    required this.ajustes,
  });

  bool get esDestajista => colaborador.tipoPago == TipoPago.destajo;

  /// Días que cuentan en total (capturados + proyectados).
  double get diasTotales => fraccionCapturada + diasProyectados;

  /// La raya de esta persona.
  double get total => baseCapturada + baseProyectada + destajo + ajustes;

  /// Estimó menos destajo del que ya está capturado.
  bool get destajoIncongruente => esDestajista && destajo < destajoCapturado;
}

/// Un ajuste de cuadrilla que NO se repartió entre personas.
class LineaCuadrilla {
  final String cuadrillaId;
  final AjusteProyeccion ajuste;

  /// Lo que este renglón suma al total. Es 0 cuando el ajuste sí se repartió
  /// (entonces ya vive dentro de los renglones y contarlo otra vez lo duplicaría).
  final double montoConSigno;

  /// Entre quiénes se repartió. Vacío si quedó como renglón de cuadrilla.
  final List<String> repartidoEntre;

  const LineaCuadrilla({
    required this.cuadrillaId,
    required this.ajuste,
    required this.montoConSigno,
    required this.repartidoEntre,
  });

  bool get repartido => repartidoEntre.isNotEmpty;
}

/// Todo lo que la pantalla necesita pintar.
class ProyeccionResultado {
  final List<ProyeccionRenglon> renglones;
  final List<LineaCuadrilla> lineasCuadrilla;

  /// Ajustes dirigidos a alguien que ya no está en el escenario. No se suman;
  /// se exponen para que la UI pueda ofrecer limpiarlos en vez de perderlos en
  /// silencio.
  final List<AjusteProyeccion> ajustesIgnorados;

  /// 7 posiciones: lo que cuesta cada día (solo pago por día).
  final List<double> totalPorDia;

  /// 7 posiciones: cuánta gente cuenta ese día.
  final List<int> personasPorDia;

  final double totalDia;
  final double totalDestajo;
  final double totalAjustes;

  /// Parte del total que ya está capturada (no se va a mover).
  final double totalCapturado;

  /// Parte del total que es estimación, ajustes incluidos.
  final double totalProyectado;

  final double diasHombre;

  /// El resultado crudo de [NominaCalculator], sin ajustes. Se conserva para
  /// poder afirmar en un test que la proyección y la nómina real dan lo mismo.
  final NominaSummary resumenNomina;

  const ProyeccionResultado({
    required this.renglones,
    required this.lineasCuadrilla,
    required this.ajustesIgnorados,
    required this.totalPorDia,
    required this.personasPorDia,
    required this.totalDia,
    required this.totalDestajo,
    required this.totalAjustes,
    required this.totalCapturado,
    required this.totalProyectado,
    required this.diasHombre,
    required this.resumenNomina,
  });

  /// La raya proyectada de la semana.
  double get total => totalDia + totalDestajo + totalAjustes;

  int get personas => renglones.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// Fechas
// ═══════════════════════════════════════════════════════════════════════════

/// Índice de día (0 = lunes … 6 = domingo) de [fechaMillis] dentro de la semana
/// que empieza en [lunesMillis]; null si cae fuera.
///
/// La diferencia se calcula sobre fechas normalizadas a UTC a propósito: restar
/// epoch millis crudos y dividir entre 86 400 000 se equivoca por un día en
/// cuanto hay un cambio de horario de verano en medio. México lo abolió en 2022,
/// pero la app también corre en teléfonos con otra zona configurada.
int? indiceDiaSemana(int lunesMillis, int fechaMillis) {
  final lunes = DateTime.fromMillisecondsSinceEpoch(lunesMillis);
  final f = DateTime.fromMillisecondsSinceEpoch(fechaMillis);
  final dias = DateTime.utc(f.year, f.month, f.day)
      .difference(DateTime.utc(lunes.year, lunes.month, lunes.day))
      .inDays;
  return (dias >= 0 && dias < 7) ? dias : null;
}

/// Epoch millis de las 00:00 locales del día [indice] de la semana.
int fechaDelDia(int lunesMillis, int indice) {
  final lunes = DateTime.fromMillisecondsSinceEpoch(lunesMillis);
  return DateTime(lunes.year, lunes.month, lunes.day + indice)
      .millisecondsSinceEpoch;
}

/// Lunes 00:00 local de la semana que contiene [fecha], en epoch millis.
/// Mismo contrato que `NominaCalculator.getStartOfWeek` y `Semana.inicioSemana`.
int lunesDeLaSemana(DateTime fecha) {
  final base = DateTime(fecha.year, fecha.month, fecha.day);
  return DateTime(base.year, base.month, base.day - (base.weekday - 1))
      .millisecondsSinceEpoch;
}
