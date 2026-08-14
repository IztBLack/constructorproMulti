import '../models/models.dart';
import 'nomina_calculator.dart';

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

  /// Trata la semana entera como hipótesis: ignora lo capturado y deja mover
  /// todos los días. Para preguntarse «¿y si la semana hubiera sido así?».
  final bool simularCompleta;

  const ProyeccionEstado({
    required this.lunesMillis,
    this.participantes = const [],
    this.diasProyectados = const {},
    this.destajoEstimado = const {},
    this.salarioOverride = const {},
    this.ajustes = const [],
    this.simularCompleta = false,
  });

  Set<int> diasDe(String colaboradorId) =>
      diasProyectados[colaboradorId] ?? const <int>{};

  bool tieneDia(String colaboradorId, int dia) => diasDe(colaboradorId).contains(dia);

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
  }) =>
      ProyeccionEstado(
        lunesMillis: lunesMillis ?? this.lunesMillis,
        participantes: participantes ?? this.participantes,
        diasProyectados: diasProyectados ?? this.diasProyectados,
        destajoEstimado: destajoEstimado ?? this.destajoEstimado,
        salarioOverride: salarioOverride ?? this.salarioOverride,
        ajustes: ajustes ?? this.ajustes,
        simularCompleta: simularCompleta ?? this.simularCompleta,
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

  const CeldaDia({
    required this.indice,
    required this.origen,
    required this.fraccion,
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
