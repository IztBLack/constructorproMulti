import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart'; // StateProvider
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart' as db;
import '../../data/providers.dart';
import '../../domain/logic/proyeccion_nomina.dart';
import '../../domain/mappers.dart';
import '../../domain/models/models.dart' as dom;

const _uuid = Uuid();

/// Cómo se agrupan los renglones de la tabla.
enum AgruparPor { cuadrilla, obra, ninguno }

/// Rellenos rápidos: patrones de semana que se aplican de un toque.
enum RellenoSemana {
  /// Lunes a sábado. La semana estándar de obra.
  lunesASabado,

  /// Cada quien según sus días por semana (`colaboradores.dias_semana`).
  segunSuContrato,

  sinSabado,
  conDomingo,
  limpiar,
}

// ═══════════════════════════════════════════════════════════════════════════
// Controles de la pantalla
// ═══════════════════════════════════════════════════════════════════════════

/// Lunes 00:00 de la semana proyectada.
final semanaProyeccionProvider =
    StateProvider<int>((ref) => lunesDeLaSemana(DateTime.now()));

/// `null` = todas las obras activas.
final obraFiltroProyeccionProvider = StateProvider<String?>((ref) => null);

final agruparProyeccionProvider =
    StateProvider<AgruparPor>((ref) => AgruparPor.cuadrilla);

// ═══════════════════════════════════════════════════════════════════════════
// El escenario
// ═══════════════════════════════════════════════════════════════════════════

final proyeccionEstadoProvider =
    NotifierProvider<ProyeccionNotifier, ProyeccionEstado>(
        ProyeccionNotifier.new);

/// Dueño del escenario. Solo guarda lo que el usuario decidió; lo capturado se
/// vuelve a leer de la base en cada cálculo, para que la proyección no pueda
/// quedarse con una copia vieja del pase de lista.
///
/// El escenario vive en memoria y muere con la sesión de la pantalla. Es
/// deliberado para la primera versión: guardar escenarios con nombre es fácil de
/// agregar después (dos tablas y una migración), y todavía no sabemos si la
/// gente quiere coleccionarlos o solo hacer la cuenta antes de ir al banco.
class ProyeccionNotifier extends Notifier<ProyeccionEstado> {
  /// Si el escenario de ESTA semana ya se sembró desde la base. Vive fuera del
  /// estado porque no es parte del escenario: es un detalle del ciclo de vida.
  bool _sembrado = false;

  /// El escenario tal como quedó al sembrarlo. Se guarda para poder decir si el
  /// usuario invirtió trabajo aquí (ver [tocado]).
  late ProyeccionEstado _inicial;

  @override
  ProyeccionEstado build() {
    // Cambiar de semana reinicia el escenario: un patrón de días de la semana 33
    // no significa nada en la 34, y arrastrarlo daría un total falso sin que se
    // note.
    final lunes = ref.watch(semanaProyeccionProvider);
    _sembrado = false;
    return _inicial = ProyeccionEstado(lunesMillis: lunes);
  }

  /// ¿Falta sembrar? La pantalla lo consulta cuando ya tiene datos.
  bool get necesitaSiembra => !_sembrado;

  /// ¿Hay trabajo invertido que se perdería al tirar el escenario?
  ///
  /// La pantalla lo usa para preguntar antes de cambiar de semana: los
  /// chevrones hacen el mismo daño que «Reiniciar», que sí preguntaba.
  bool get tocado => !state.mismoEscenarioQue(_inicial);

  /// Carga el escenario inicial. Idempotente: solo corre una vez por semana.
  ///
  /// [diasPorColaborador] viene de `colaboradores.dias_semana`, así que cada
  /// quien arranca con los días que de verdad trabaja: 5, 6 o 7. Es mejor
  /// arranque que «todos de lunes a sábado» porque el número que la pantalla
  /// muestra al abrir ya es defendible sin tocar nada.
  void sembrar({
    required List<String> participantes,
    required Map<String, int> diasPorColaborador,
    required Map<String, double> destajoCapturado,
  }) {
    if (_sembrado) return;
    _sembrado = true;
    state = _inicial = ProyeccionEstado(
      lunesMillis: state.lunesMillis,
      participantes: participantes,
      diasProyectados: {
        for (final id in participantes)
          id: _diasIniciales(diasPorColaborador[id] ?? 6),
      },
      // Un destajista arranca con lo que ya se le registró esta semana, no en
      // cero: si ya hay $6,000 capturados, proponer $0 sería un retroceso.
      destajoEstimado: destajoCapturado,
    );
  }

  /// Índices de día para una semana de [dias] días, empezando en lunes.
  Set<int> _diasIniciales(int dias) {
    final n = dias.clamp(1, 7);
    return {for (var i = 0; i < n; i++) i};
  }

  /// Vuelve a sembrar desde cero, tirando lo que el usuario haya movido.
  void reiniciar() {
    _sembrado = false;
    state = _inicial = ProyeccionEstado(lunesMillis: state.lunesMillis);
  }

  // ── Días ─────────────────────────────────────────────────────────────────

  void alternarDia(String colaboradorId, int dia) =>
      state = state.alternarDia(colaboradorId, dia);

  /// Toque en el encabezado de la columna: prende la columna completa si había
  /// algún día apagado, y la apaga si ya estaba toda prendida.
  void alternarColumna(
    int dia,
    Iterable<String> colaboradorIds, {
    Set<String> bloqueados = const {},
  }) {
    final movibles =
        colaboradorIds.where((id) => !bloqueados.contains(id)).toList();
    final todosPrendidos =
        movibles.isNotEmpty && movibles.every((id) => state.tieneDia(id, dia));
    state = state.fijarColumna(dia, movibles,
        prender: !todosPrendidos, bloqueados: bloqueados);
  }

  /// Aplica un relleno rápido a los colaboradores dados.
  ///
  /// [bloqueadosPorDia] son los pares (colaborador, día) que ya están
  /// capturados: un relleno no puede pisarlos, igual que un toque no puede.
  void rellenar(
    RellenoSemana relleno,
    Iterable<String> colaboradorIds, {
    required Map<String, int> diasPorColaborador,
    required Map<String, Set<int>> bloqueadosPorDia,
  }) {
    final mapa = {...state.diasProyectados};
    for (final id in colaboradorIds) {
      final bloqueados = bloqueadosPorDia[id] ?? const <int>{};
      final actuales = {...state.diasDe(id)};

      switch (relleno) {
        case RellenoSemana.lunesASabado:
          for (var d = 0; d < 6; d++) {
            if (!bloqueados.contains(d)) actuales.add(d);
          }
        case RellenoSemana.segunSuContrato:
          final n = (diasPorColaborador[id] ?? 6).clamp(1, 7);
          for (var d = 0; d < 7; d++) {
            if (bloqueados.contains(d)) continue;
            d < n ? actuales.add(d) : actuales.remove(d);
          }
        case RellenoSemana.sinSabado:
          if (!bloqueados.contains(5)) actuales.remove(5);
        case RellenoSemana.conDomingo:
          if (!bloqueados.contains(6)) actuales.add(6);
        case RellenoSemana.limpiar:
          actuales.removeWhere((d) => !bloqueados.contains(d));
      }
      mapa[id] = actuales;
    }
    state = state.copyWith(diasProyectados: mapa);
  }

  /// Presta un día de alguien a otra obra, o lo devuelve con [obraId] en `null`.
  void moverDia(String colaboradorId, int dia, String? obraId) =>
      state = state.conDiaEnObra(colaboradorId, dia, obraId);

  // ── Participantes ────────────────────────────────────────────────────────

  void agregar(String colaboradorId, {int diasSemana = 6, int desdeDia = 0}) {
    // Quien entra a media semana arranca proyectado de hoy en adelante: no tiene
    // sentido proponerle días que ya pasaron sin que estuviera.
    final dias = {
      for (var d = desdeDia; d < diasSemana.clamp(1, 7); d++) d,
    };
    state = state.conParticipante(colaboradorId, dias: dias);
  }

  void quitar(String colaboradorId) =>
      state = state.sinParticipante(colaboradorId);

  /// Vuelve a un escenario anterior tal cual. Es lo que hace el «Deshacer» del
  /// aviso al quitar a alguien: restaurar el participante con `agregar` no
  /// serviría, porque perdería sus días, su salario y sus ajustes — y quitar a
  /// alguien por error para volver a meterlo peor de como estaba es exactamente
  /// el tipo de pérdida silenciosa que hace desconfiar de la pantalla.
  void restaurar(ProyeccionEstado anterior) => state = anterior;

  // ── Montos ───────────────────────────────────────────────────────────────

  void setSalario(String colaboradorId, double? salario) =>
      state = state.conSalario(colaboradorId, salario);

  void setDestajo(String colaboradorId, double monto) =>
      state = state.conDestajo(colaboradorId, monto);

  // ── Ajustes ──────────────────────────────────────────────────────────────

  /// Crea un ajuste nuevo. Devuelve su id para que la UI pueda editarlo luego.
  String agregarAjuste({
    required TipoAjuste tipo,
    required DestinoAjuste destino,
    required String destinoId,
    required double monto,
    String nota = '',
    RepartoAjuste reparto = RepartoAjuste.partesIguales,
  }) {
    final id = _uuid.v4();
    state = state.conAjuste(AjusteProyeccion(
      id: id,
      tipo: tipo,
      destino: destino,
      destinoId: destinoId,
      monto: monto.abs(),
      nota: nota,
      reparto: reparto,
    ));
    return id;
  }

  void guardarAjuste(AjusteProyeccion ajuste) =>
      state = state.conAjuste(ajuste.copyWith(monto: ajuste.monto.abs()));

  void borrarAjuste(String ajusteId) => state = state.sinAjuste(ajusteId);

  /// Tira los ajustes que apuntan a alguien que ya no está en el escenario.
  void limpiarAjustesHuerfanos(Iterable<String> ids) {
    var s = state;
    for (final id in ids) {
      s = s.sinAjuste(id);
    }
    state = s;
  }

  // ── Hipótesis ────────────────────────────────────────────────────────────

  void setSimularCompleta(bool valor) =>
      state = state.copyWith(simularCompleta: valor);
}

// ═══════════════════════════════════════════════════════════════════════════
// Vista: el escenario + los datos de la base, ya calculado
// ═══════════════════════════════════════════════════════════════════════════

/// Todo lo que la pantalla necesita, en un solo objeto.
class ProyeccionVista {
  final ProyeccionResultado resultado;

  /// Colaboradores que podrían entrar al escenario y todavía no están.
  final List<db.Colaborador> candidatos;

  /// `cuadrillaId → nombre`, para los encabezados de grupo y los ajustes.
  final Map<String, String> nombreCuadrilla;

  /// `obraId → nombre`.
  final Map<String, String> nombreObra;

  /// `colaboradorId → obraId` (su última obra activa).
  final Map<String, String> obraPorColaborador;

  /// `colaboradorId → días por semana` de su contrato.
  final Map<String, int> diasPorColaborador;

  /// `colaboradorId → días ya capturados` (no se pueden mover).
  final Map<String, Set<int>> diasBloqueados;

  /// Obra que se está viendo, o `null` si son todas. Cuando trae valor, el
  /// [resultado] es PARCIAL —la raya de esa obra— y la pantalla tiene que
  /// decirlo: leer una cifra parcial como si fuera la de toda la empresa es el
  /// error caro de este módulo.
  final String? obraFiltro;

  /// Está cargando algo de la base.
  final bool cargando;

  const ProyeccionVista({
    required this.resultado,
    required this.candidatos,
    required this.nombreCuadrilla,
    required this.nombreObra,
    required this.obraPorColaborador,
    required this.diasPorColaborador,
    required this.diasBloqueados,
    required this.obraFiltro,
    required this.cargando,
  });

  /// Nombre de la obra filtrada, vacío si son todas.
  String get nombreObraFiltro =>
      obraFiltro == null ? '' : (nombreObra[obraFiltro] ?? '');

  /// Ids de participantes en el orden en que se muestran.
  List<String> get participantes =>
      resultado.renglones.map((r) => r.colaborador.id).toList();
}

/// Ensambla la vista: lee la base, arma el escenario y llama al calculador.
///
/// Es un `Provider` derivado y no un `FutureProvider` a propósito: todas las
/// fuentes son streams locales de Drift, así que recalcular en cada toque es
/// barato y la tabla responde sin parpadeos de carga.
final proyeccionVistaProvider = Provider<ProyeccionVista>((ref) {
  final lunes = ref.watch(semanaProyeccionProvider);
  final finSemana = fechaDelDia(lunes, 6) + 86399999; // domingo 23:59:59.999
  final obraFiltro = ref.watch(obraFiltroProyeccionProvider);
  final estado = ref.watch(proyeccionEstadoProvider);

  final colabsAsync = ref.watch(colaboradoresProvider);
  final puestosAsync = ref.watch(puestosProvider);
  final obrasAsync = ref.watch(obrasProvider);
  final ultimaObraAsync = ref.watch(ultimaObraPorColaboradorProvider);
  final cuadrillaAsync = ref.watch(cuadrillaPorColaboradorProvider);
  final cuadrillasAsync = ref.watch(cuadrillasProvider);

  final colabs = colabsAsync.asData?.value ?? const <db.Colaborador>[];
  final puestos = puestosAsync.asData?.value ?? const <db.Puesto>[];
  final obras = obrasAsync.asData?.value ?? const <db.Obra>[];
  final ultimaObra = ultimaObraAsync.asData?.value ?? const <String, db.Obra>{};
  final cuadrillaDe =
      cuadrillaAsync.asData?.value ?? const <String, db.Cuadrilla>{};
  final cuadrillas = cuadrillasAsync.asData?.value ?? const <db.Cuadrilla>[];

  // Asistencias de la semana de TODOS los colaboradores, sin filtrar obra: la
  // proyección razona por persona. La clave de la familia va ordenada para no
  // provocar cache-miss en cada rebuild.
  final ids = colabs.map((c) => c.id).toList()..sort();
  final asistenciasAsync = ref.watch(asistenciasSemanaTodasObrasProvider(
      (colaboradorIds: ids.join(','), start: lunes, end: finSemana)));
  final destajosAsync = ref.watch(
      destajosRangoTodasObrasProvider((start: lunes, end: finSemana)));

  final asistencias = asistenciasAsync.asData?.value ?? const <db.Asistencia>[];
  final destajos = destajosAsync.asData?.value ?? const <db.Destajo>[];

  final obraPorColaborador = <String, String>{
    for (final e in ultimaObra.entries) e.key: e.value.id,
  };
  final cuadrillaPorColaborador = <String, String>{
    for (final e in cuadrillaDe.entries) e.key: e.value.id,
  };
  final diasPorColaborador = <String, int>{
    for (final c in colabs) c.id: c.diasSemana,
  };

  // Días ya capturados por persona: la UI los bloquea y los rellenos los saltan.
  final diasBloqueados = <String, Set<int>>{};
  if (!estado.simularCompleta) {
    for (final a in asistencias) {
      final d = indiceDiaSemana(lunes, a.fecha);
      if (d == null) continue;
      diasBloqueados.putIfAbsent(a.colaboradorId, () => {}).add(d);
    }
  }

  // Al ver UNA obra, la lista no son «los que la tienen de base»: también entra
  // quien llegó prestado algún día, o la raya de esa obra no incluiría a quien
  // de verdad va a trabajar ahí.
  final visibles = participantesDeObra(estado, obraPorColaborador, obraFiltro);

  final resultado = const ProyeccionCalculator().calcular(
    estado: estado.copyWith(participantes: visibles),
    colaboradores: colabs.map(colaboradorToDomain).toList(),
    puestos: puestos.map(puestoToDomain).toList(),
    asistenciasReales: asistencias.map(asistenciaToDomain).toList(),
    destajosReales: destajos.map(destajoToDomain).toList(),
    cuadrillaPorColaborador: cuadrillaPorColaborador,
    obraPorColaborador: obraPorColaborador,
    obraFiltro: obraFiltro,
  );

  // Candidatos: los que caben en el filtro de obra y no están ya adentro.
  final dentro = estado.participantes.toSet();
  final candidatos = colabs.where((c) {
    if (dentro.contains(c.id)) return false;
    if (obraFiltro == null) return true;
    return obraPorColaborador[c.id] == obraFiltro;
  }).toList()
    ..sort((a, b) => a.nombre.compareTo(b.nombre));

  return ProyeccionVista(
    resultado: resultado,
    candidatos: candidatos,
    nombreCuadrilla: {for (final c in cuadrillas) c.id: c.nombre},
    nombreObra: {for (final o in obras) o.id: o.nombre},
    obraPorColaborador: obraPorColaborador,
    diasPorColaborador: diasPorColaborador,
    diasBloqueados: diasBloqueados,
    obraFiltro: obraFiltro,
    cargando: colabsAsync.isLoading || puestosAsync.isLoading,
  );
});

/// Participantes iniciales del escenario para la semana y el filtro actuales.
///
/// Mismo criterio que el pase de lista: cada colaborador se muestra bajo su
/// ÚLTIMA obra activa, para que quien está en dos obras no aparezca dos veces y
/// se le cuente doble la raya. Se ordena por cuadrilla y luego por el orden
/// personalizado que el usuario ya arrastró en el pase de lista, para que la
/// tabla se parezca a la que tiene en la cabeza.
final participantesSugeridosProvider = Provider<List<String>>((ref) {
  final obraFiltro = ref.watch(obraFiltroProyeccionProvider);
  final colabs = ref.watch(colaboradoresProvider).asData?.value ??
      const <db.Colaborador>[];
  final ultimaObra = ref.watch(ultimaObraPorColaboradorProvider).asData?.value ??
      const <String, db.Obra>{};
  final cuadrillaDe = ref.watch(cuadrillaPorColaboradorProvider).asData?.value ??
      const <String, db.Cuadrilla>{};
  final orden = ref.watch(ordenMiembroPorColaboradorProvider).asData?.value ??
      const <String, int>{};

  final lista = colabs.where((c) {
    final obra = ultimaObra[c.id];
    if (obra == null || !obra.activa) return false;
    return obraFiltro == null || obra.id == obraFiltro;
  }).toList();

  lista.sort((a, b) {
    final ca = cuadrillaDe[a.id]?.nombre ?? '￿'; // sin cuadrilla al final
    final cb = cuadrillaDe[b.id]?.nombre ?? '￿';
    final porCuadrilla = ca.compareTo(cb);
    if (porCuadrilla != 0) return porCuadrilla;
    final oa = orden[a.id] ?? 1 << 30;
    final ob = orden[b.id] ?? 1 << 30;
    if (oa != ob) return oa.compareTo(ob);
    return a.nombre.compareTo(b.nombre);
  });

  return lista.map((c) => c.id).toList();
});

/// Destajo ya capturado esta semana por colaborador, para sembrar el campo de
/// monto estimado de los destajistas.
final destajoCapturadoSemanaProvider = Provider<Map<String, double>>((ref) {
  final lunes = ref.watch(semanaProyeccionProvider);
  final finSemana = fechaDelDia(lunes, 6) + 86399999;
  final destajos = ref
          .watch(destajosRangoTodasObrasProvider(
              (start: lunes, end: finSemana)))
          .asData
          ?.value ??
      const <db.Destajo>[];
  final mapa = <String, double>{};
  for (final d in destajos) {
    mapa[d.colaboradorId] = (mapa[d.colaboradorId] ?? 0) + d.monto;
  }
  return mapa;
});

/// Colaborador de dominio por id, para diálogos que solo tienen el id.
final colaboradorDomPorIdProvider =
    Provider<Map<String, dom.Colaborador>>((ref) {
  final colabs = ref.watch(colaboradoresProvider).asData?.value ??
      const <db.Colaborador>[];
  return {for (final c in colabs) c.id: colaboradorToDomain(c)};
});
