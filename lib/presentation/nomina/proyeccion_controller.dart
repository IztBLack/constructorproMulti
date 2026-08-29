import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart'; // StateProvider
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart' as db;
import '../../core/settings/settings_provider.dart';
import '../../data/providers.dart';
import '../../data/repositories_proyeccion.dart';
import '../../domain/logic/proyeccion_nomina.dart';
import '../../domain/logic/redondeo_proyeccion.dart';
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
// La sesión: qué proyección se está trabajando y cómo
// ═══════════════════════════════════════════════════════════════════════════

/// En qué modo está la pantalla.
enum ModoProyeccion {
  /// Un escenario nuevo, sin nombre y sin fila en la base. Es como arrancaba
  /// siempre la pantalla antes de que hubiera memoria.
  nueva,

  /// Se está editando una proyección guardada: los cambios se pueden guardar
  /// sobre ella.
  editando,

  /// Se está CONSULTANDO una guardada. Nada se puede mover.
  soloLectura,
}

/// Qué proyección hay abierta y en qué modo.
class SesionProyeccion {
  final ModoProyeccion modo;

  /// Id de la fila guardada; `null` cuando el escenario todavía no se guarda.
  final String? id;

  final String nombre;

  const SesionProyeccion({
    this.modo = ModoProyeccion.nueva,
    this.id,
    this.nombre = '',
  });

  bool get soloLectura => modo == ModoProyeccion.soloLectura;

  /// ¿Está atada a una fila guardada? Decide si «Guardar» reemplaza o pregunta
  /// un nombre.
  bool get tieneArchivo => id != null;
}

final sesionProyeccionProvider =
    NotifierProvider<SesionNotifier, SesionProyeccion>(SesionNotifier.new);

/// Dueño del modo de trabajo y de la ida y vuelta con la base.
///
/// Vive aparte de [ProyeccionNotifier] a propósito: el escenario es un valor de
/// dominio puro y no tiene por qué saber si está guardado, cómo se llama ni si
/// alguien lo está viendo sin permiso de tocarlo.
class SesionNotifier extends Notifier<SesionProyeccion> {
  @override
  SesionProyeccion build() => const SesionProyeccion();

  ProyeccionRepository get _repo => ref.read(proyeccionRepositoryProvider);

  /// Empieza de cero: escenario nuevo sembrado de la semana actual.
  void nueva() {
    state = const SesionProyeccion();
    ref.read(proyeccionEstadoProvider.notifier).reiniciar();
  }

  /// Abre una proyección guardada.
  ///
  /// El orden importa: primero la semana y el filtro de obra —que reconstruyen
  /// el escenario desde cero— y solo después se carga el guardado. Al revés, el
  /// rebuild por cambio de semana se llevaría por delante lo que se acaba de
  /// cargar.
  ///
  /// Devuelve `false` si el escenario no se pudo leer (se guardó con una
  /// versión más nueva de la app, o la fila está corrupta), para que la pantalla
  /// lo diga en vez de abrir una proyección vacía que parecería un borrado.
  bool abrir(db.ProyeccionGuardadaRow fila, {required bool soloLectura}) {
    final estado = escenarioDe(fila);
    if (estado == null) return false;

    ref.read(semanaProyeccionProvider.notifier).state = estado.lunesMillis;
    ref.read(obraFiltroProyeccionProvider.notifier).state =
        fila.obraFiltro.isEmpty ? null : fila.obraFiltro;
    ref.read(proyeccionEstadoProvider.notifier).cargar(estado);

    state = SesionProyeccion(
      modo: soloLectura ? ModoProyeccion.soloLectura : ModoProyeccion.editando,
      id: fila.id,
      nombre: fila.nombre,
    );
    return true;
  }

  /// Pasa de consultar a editar la misma proyección.
  void editarLaAbierta() {
    if (state.modo != ModoProyeccion.soloLectura) return;
    state = SesionProyeccion(
        modo: ModoProyeccion.editando, id: state.id, nombre: state.nombre);
  }

  /// Guarda: crea una fila nueva si no había, o reemplaza la abierta.
  ///
  /// [nombre] solo se usa al crear o al renombrar; guardar sobre una abierta sin
  /// pasar nombre conserva el suyo.
  ///
  /// [foto] es el total y las personas que se están enseñando, para la lista.
  /// Lo pasa quien llama y NO se lee de `proyeccionVistaProvider` aquí: la
  /// vista depende de esta sesión (para saber si es de solo lectura), así que
  /// leerla desde dentro cerraría el círculo y Riverpod lanzaría
  /// `CircularDependencyError` justo al tocar «Guardar».
  Future<void> guardar({
    String? nombre,
    ({double total, int personas})? foto,
  }) async {
    final estado = ref.read(proyeccionEstadoProvider);
    final obraFiltro = ref.read(obraFiltroProyeccionProvider) ?? '';
    final total = foto?.total ?? 0;
    final personas = foto?.personas ?? estado.participantes.length;

    if (state.id == null) {
      final id = await _repo.crear(
        nombre: nombre?.trim().isNotEmpty == true
            ? nombre!
            : nombreSugerido(estado.lunesMillis),
        estado: estado,
        obraFiltro: obraFiltro,
        totalSnapshot: total,
        personasSnapshot: personas,
      );
      state = SesionProyeccion(
        modo: ModoProyeccion.editando,
        id: id,
        nombre: nombre?.trim().isNotEmpty == true
            ? nombre!.trim()
            : nombreSugerido(estado.lunesMillis),
      );
      // También al CREAR, no solo al reemplazar: si no, la pantalla seguiría
      // avisando «tienes cambios sin guardar» justo después de guardar, y el
      // aviso al cambiar de semana saltaría sin motivo.
      ref.read(proyeccionEstadoProvider.notifier).marcarGuardado();
      return;
    }

    await _repo.actualizar(
      id: state.id!,
      estado: estado,
      nombre: nombre,
      obraFiltro: obraFiltro,
      totalSnapshot: total,
      personasSnapshot: personas,
    );
    state = SesionProyeccion(
      modo: ModoProyeccion.editando,
      id: state.id,
      nombre: nombre?.trim().isNotEmpty == true ? nombre!.trim() : state.nombre,
    );
    ref.read(proyeccionEstadoProvider.notifier).marcarGuardado();
  }

  /// Guarda una copia con otro nombre y la deja abierta. Es el «Guardar como»:
  /// sirve para partir de una proyección buena sin pisarla.
  Future<void> guardarComo(
    String nombre, {
    ({double total, int personas})? foto,
  }) async {
    final estado = ref.read(proyeccionEstadoProvider);
    final id = await _repo.crear(
      nombre: nombre.trim().isEmpty ? nombreSugerido(estado.lunesMillis) : nombre,
      estado: estado,
      obraFiltro: ref.read(obraFiltroProyeccionProvider) ?? '',
      totalSnapshot: foto?.total ?? 0,
      personasSnapshot: foto?.personas ?? estado.participantes.length,
    );
    state = SesionProyeccion(
        modo: ModoProyeccion.editando, id: id, nombre: nombre.trim());
    ref.read(proyeccionEstadoProvider.notifier).marcarGuardado();
  }

  Future<String?> duplicar(String id, {String? nombre}) =>
      _repo.duplicar(id, nombre: nombre);

  Future<void> renombrar(String id, String nombre) async {
    await _repo.renombrar(id, nombre);
    if (state.id == id) {
      state = SesionProyeccion(
          modo: state.modo, id: id, nombre: nombre.trim());
    }
  }

  /// Elimina una guardada. Si era la abierta, la pantalla se queda con el
  /// escenario en la mano pero ya sin archivo: así el usuario puede volver a
  /// guardarla si se arrepiente, en vez de perderla dos veces.
  Future<void> eliminar(String id) async {
    await _repo.eliminar(id);
    if (state.id == id) {
      state = SesionProyeccion(
          modo: ModoProyeccion.nueva, nombre: state.nombre);
    }
  }

  Future<void> restaurar(String id) => _repo.restaurar(id);

  /// Nombre que se propone al guardar por primera vez: «Simulación 20 de
  /// mayo», con la fecha del lunes de la semana proyectada.
  static String nombreSugerido(int lunesMillis) {
    final d = DateTime.fromMillisecondsSinceEpoch(lunesMillis);
    const meses = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    return 'Simulación ${d.day} de ${meses[d.month - 1]}';
  }
}

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
    // El redondeo arranca con la preferencia del usuario: quien trabaja siempre
    // al peso no debería prenderlo en cada proyección nueva.
    return _inicial = ProyeccionEstado(
      lunesMillis: lunes,
      redondeo: ref.read(redondeoPorDefectoProvider),
    );
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
      // Se conserva lo que ya hubiera: sembrar solo rellena participantes.
      redondeo: state.redondeo,
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
    state = _inicial = ProyeccionEstado(
        lunesMillis: state.lunesMillis, redondeo: state.redondeo);
  }

  /// Carga un escenario guardado tal cual, sin sembrar nada encima.
  ///
  /// Marca el escenario como ya sembrado —si no, la pantalla lo pisaría con los
  /// participantes sugeridos en cuanto llegaran los datos de la base— y fija la
  /// línea base de [tocado] en lo cargado: al abrir una proyección guardada no
  /// hay trabajo sin guardar todavía.
  void cargar(ProyeccionEstado escenario) {
    _sembrado = true;
    state = _inicial = escenario;
  }

  /// Reconoce el estado actual como «lo último guardado», para que [tocado]
  /// deje de reportar cambios pendientes justo después de guardar.
  void marcarGuardado() => _inicial = state;

  // ── El candado de solo lectura ───────────────────────────────────────────

  /// Una proyección abierta para consultar no se toca. El candado vive AQUÍ y
  /// no en cada botón de la pantalla: hay más de treinta puntos que mutan el
  /// escenario, y el que se olvide sería una edición silenciosa sobre algo que
  /// el usuario abrió «solo para ver». La UI además apaga los controles, pero
  /// eso es cortesía; esto es la garantía.
  bool get _bloqueado =>
      ref.read(sesionProyeccionProvider).modo == ModoProyeccion.soloLectura;

  /// Escribe el escenario si la sesión lo permite. Devuelve si escribió.
  bool _escribir(ProyeccionEstado nuevo) {
    if (_bloqueado) return false;
    state = nuevo;
    return true;
  }

  // ── Días ─────────────────────────────────────────────────────────────────

  void alternarDia(String colaboradorId, int dia) =>
      _escribir(state.alternarDia(colaboradorId, dia));

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
    _escribir(state.fijarColumna(dia, movibles,
        prender: !todosPrendidos, bloqueados: bloqueados));
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
    _escribir(state.copyWith(diasProyectados: mapa));
  }

  /// Presta un día de alguien a otra obra, o lo devuelve con [obraId] en `null`.
  void moverDia(String colaboradorId, int dia, String? obraId) =>
      _escribir(state.conDiaEnObra(colaboradorId, dia, obraId));

  // ── Participantes ────────────────────────────────────────────────────────

  void agregar(String colaboradorId, {int diasSemana = 6, int desdeDia = 0}) {
    // Quien entra a media semana arranca proyectado de hoy en adelante: no tiene
    // sentido proponerle días que ya pasaron sin que estuviera.
    final dias = {
      for (var d = desdeDia; d < diasSemana.clamp(1, 7); d++) d,
    };
    _escribir(state.conParticipante(colaboradorId, dias: dias));
  }

  /// Mete a varios del equipo de un solo golpe.
  ///
  /// Un solo estado nuevo y, por tanto, un solo «Deshacer»: llamar ocho veces a
  /// [agregar] dejaría ocho estados intermedios y el aviso solo podría quitar al
  /// último, que es peor que no ofrecer deshacer.
  void agregarVarios(
    Iterable<String> ids, {
    required Map<String, int> diasPorColaborador,
    int desdeDia = 0,
  }) {
    final mapa = <String, Set<int>>{};
    for (final id in ids) {
      final n = (diasPorColaborador[id] ?? 6).clamp(1, 7);
      mapa[id] = {for (var d = desdeDia; d < n; d++) d};
    }
    if (mapa.isEmpty) return;
    _escribir(state.conParticipantes(mapa));
  }

  /// Crea plazas nuevas (puestos sin nadie todavía) y las mete al escenario.
  ///
  /// [cuantas] renglones del mismo puesto y sueldo se numeran «Maestro 1…n»
  /// continuando desde las que ya haya de ese puesto: si se quitan la 2 y la 3,
  /// las demás NO se renumeran, porque un renglón que cambia de nombre solo es
  /// un renglón que se deja de reconocer.
  List<PlazaProyectada> agregarPlazas({
    required String puestoId,
    required String puestoNombre,
    required int cuantas,
    required SueldoProyectado sueldo,
    String? obraId,
    String? cuadrillaId,
  }) {
    if (cuantas <= 0) return const [];
    final yaDeEstePuesto =
        state.plazas.values.where((p) => p.puestoId == puestoId).length;
    final nuevas = [
      for (var i = 0; i < cuantas; i++)
        PlazaProyectada(
          id: '$prefijoPlaza${_uuid.v4()}',
          etiqueta: '$puestoNombre ${yaDeEstePuesto + i + 1}',
          puestoId: puestoId,
          obraId: obraId,
          cuadrillaId: cuadrillaId,
          sueldo: sueldo,
        ),
    ];
    return _escribir(state.conPlazas(nuevas)) ? nuevas : const [];
  }

  /// Reemplaza la ficha de una plaza (nombre, puesto, obra, cuadrilla, sueldo).
  void actualizarPlaza(PlazaProyectada plaza) =>
      _escribir(state.conPlaza(plaza));

  /// Cambia el id de una plaza por el de un colaborador ya dado de alta,
  /// conservando TODO lo que el escenario tenía de ella.
  ///
  /// Es lo que hace «darla de alta»: si en vez de esto se quitara la plaza y se
  /// agregara al colaborador, se perderían sus días, sus préstamos y sus
  /// ajustes — y el usuario tendría que volver a capturarlos justo después de
  /// una acción que sonaba a «ya quedó».
  ///
  /// El sueldo capturado se BORRA a propósito: ya quedó escrito en la ficha del
  /// colaborador, y dejarlo también como override del escenario haría que
  /// cambiarlo en la ficha no se reflejara aquí.
  void sustituirPlazaPorColaborador(String plazaId, String colaboradorId) {
    final s = state;
    if (!s.plazas.containsKey(plazaId)) return;

    Map<K, V> renombrar<K, V>(Map<K, V> mapa) {
      if (!mapa.containsKey(plazaId as K)) return mapa;
      final copia = {...mapa};
      copia[colaboradorId as K] = copia.remove(plazaId as K) as V;
      return copia;
    }

    _escribir(s.copyWith(
      participantes: [
        for (final id in s.participantes) id == plazaId ? colaboradorId : id,
      ],
      diasProyectados: renombrar(s.diasProyectados),
      obraPorDia: renombrar(s.obraPorDia),
      destajoEstimado: renombrar(s.destajoEstimado),
      // El diario se queda mientras dure este escenario, para que el total no
      // brinque en el momento del alta; el sueldo capturado se va porque ya
      // vive en la ficha.
      salarioOverride: renombrar(s.salarioOverride),
      sueldoOverride: {...s.sueldoOverride}..remove(plazaId),
      plazas: {...s.plazas}..remove(plazaId),
      ajustes: [
        for (final a in s.ajustes)
          if (a.destino == DestinoAjuste.colaborador && a.destinoId == plazaId)
            a.copyWith(destinoId: colaboradorId)
          else
            a,
      ],
    ));
  }

  /// Guarda el sueldo capturado de alguien; `null` lo devuelve al del puesto.
  void setSueldo(String colaboradorId, SueldoProyectado? sueldo) =>
      _escribir(state.conSueldo(colaboradorId, sueldo));

  /// Cómo se enseñan las cifras. No pasa por el candado de solo lectura: mirar
  /// una proyección guardada con otro redondeo no la cambia, y prohibirlo
  /// obligaría a duplicarla solo para ver los números al peso.
  void setRedondeo(RedondeoConfig config) {
    state = state.conRedondeo(config);
    // Y se recuerda como preferencia: el siguiente escenario nuevo arranca así.
    ref.read(redondeoPorDefectoProvider.notifier).set(config);
  }

  void quitar(String colaboradorId) =>
      _escribir(state.sinParticipante(colaboradorId));

  /// Vuelve a un escenario anterior tal cual. Es lo que hace el «Deshacer» del
  /// aviso al quitar a alguien: restaurar el participante con `agregar` no
  /// serviría, porque perdería sus días, su salario y sus ajustes — y quitar a
  /// alguien por error para volver a meterlo peor de como estaba es exactamente
  /// el tipo de pérdida silenciosa que hace desconfiar de la pantalla.
  void restaurar(ProyeccionEstado anterior) => _escribir(anterior);

  // ── Montos ───────────────────────────────────────────────────────────────

  void setSalario(String colaboradorId, double? salario) =>
      _escribir(state.conSalario(colaboradorId, salario));

  void setDestajo(String colaboradorId, double monto) =>
      _escribir(state.conDestajo(colaboradorId, monto));

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
    _escribir(state.conAjuste(AjusteProyeccion(
      id: id,
      tipo: tipo,
      destino: destino,
      destinoId: destinoId,
      monto: monto.abs(),
      nota: nota,
      reparto: reparto,
    )));
    return id;
  }

  void guardarAjuste(AjusteProyeccion ajuste) =>
      _escribir(state.conAjuste(ajuste.copyWith(monto: ajuste.monto.abs())));

  void borrarAjuste(String ajusteId) => _escribir(state.sinAjuste(ajusteId));

  /// Tira los ajustes que apuntan a alguien que ya no está en el escenario.
  void limpiarAjustesHuerfanos(Iterable<String> ids) {
    var s = state;
    for (final id in ids) {
      s = s.sinAjuste(id);
    }
    _escribir(s);
  }

  // ── Hipótesis ────────────────────────────────────────────────────────────

  void setSimularCompleta(bool valor) =>
      _escribir(state.copyWith(simularCompleta: valor));
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

  /// El mismo [resultado], visto a través de la configuración de redondeo del
  /// escenario. La pantalla pinta SIEMPRE desde aquí; el `resultado` crudo queda
  /// para quien necesite la cifra exacta.
  final ProyeccionRedondeada redondeada;

  /// Puestos del catálogo, para la hoja de alta masiva (crear plazas necesita
  /// elegir puesto y proponer su sueldo).
  final List<db.Puesto> puestos;

  /// La proyección abierta es de solo consulta.
  final bool soloLectura;

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
    required this.redondeada,
    required this.puestos,
    required this.soloLectura,
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

  // El sueldo llega por su propia tabla desde el esquema v10 (RLS de 0027). En
  // un dispositivo sin permiso el mapa viene vacío y todo cae al salario del
  // puesto — que es justo lo que debe pasar, no un error.
  final sueldos = ref.watch(sueldosPorColaboradorProvider).asData?.value ??
      const <String, db.ColaboradorSueldoRow>{};

  // Las plazas entran al cálculo como colaboradores sintéticos: mismo id, misma
  // forma. Es lo que permite que `ProyeccionCalculator` no sepa que existen y
  // que días, préstamos, ajustes y subtotales les funcionen sin código nuevo.
  final plazas = estado.plazas.values.toList();

  final obraPorColaborador = <String, String>{
    for (final e in ultimaObra.entries) e.key: e.value.id,
    for (final p in plazas)
      if (p.obraId != null) p.id: p.obraId!,
  };
  final cuadrillaPorColaborador = <String, String>{
    for (final e in cuadrillaDe.entries) e.key: e.value.id,
    for (final p in plazas)
      if (p.cuadrillaId != null) p.id: p.cuadrillaId!,
  };
  final diasPorColaborador = <String, int>{
    for (final c in colabs) c.id: sueldos[c.id]?.diasSemana ?? 6,
    for (final p in plazas) p.id: p.sueldo.diasSemana,
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
    colaboradores: [
      for (final c in colabs) colaboradorToDomain(c, sueldo: sueldos[c.id]),
      for (final p in plazas) p.comoColaborador,
    ],
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
    redondeada: ProyeccionRedondeada(resultado, estado.redondeo),
    puestos: puestos,
    soloLectura: ref.watch(sesionProyeccionProvider).soloLectura,
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
  final sueldos = ref.watch(sueldosPorColaboradorProvider).asData?.value ??
      const <String, db.ColaboradorSueldoRow>{};
  return {
    for (final c in colabs) c.id: colaboradorToDomain(c, sueldo: sueldos[c.id]),
  };
});
