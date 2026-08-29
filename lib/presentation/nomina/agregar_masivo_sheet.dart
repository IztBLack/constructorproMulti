import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart' as db;
import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../../domain/logic/proyeccion_nomina.dart';
import '../common/app_snackbar.dart';
import 'proyeccion_controller.dart';
import 'sueldo_editor.dart';

/// Meter gente a la proyección por PUESTO y de un solo jalón.
///
/// Antes se agregaba de uno en uno: una lista plana, un toque, la hoja se
/// cerraba, y a volver a abrirla. Para armar «cuatro maestros y tres ayudantes»
/// eran siete viajes y siete ediciones de salario después.
///
/// La hoja tiene dos pestañas que suman al MISMO carrito:
///
///   · **Del equipo** — los candidatos agrupados por puesto, con casilla por
///     persona, casilla por grupo y un sueldo que se aplica a todo el grupo.
///   · **Plazas nuevas** — puestos que todavía no tienen a nadie («4 × Maestro
///     a \$3,600»), para preguntarse cuánto costaría la semana si entraran.
///     Viven solo en el escenario y no tocan el catálogo.
///
/// Todo se aplica con UN «Agregar», que deja UN aviso con UN «Deshacer»: el
/// escenario previo se guarda entero antes de tocar nada, así que deshacer
/// devuelve la pantalla exactamente a como estaba.
Future<void> mostrarAgregarMasivo(BuildContext context) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        maxChildSize: 0.95,
        builder: (_, scroll) => _AgregarMasivo(scroll: scroll),
      ),
    );

/// Un renglón de la pestaña de plazas: un puesto, cuántas y con qué sueldo.
class _RenglonPlaza {
  _RenglonPlaza({required this.puestoId, required this.sueldo});
  String? puestoId;
  int cantidad = 1;
  SueldoProyectado? sueldo;
}

class _AgregarMasivo extends ConsumerStatefulWidget {
  const _AgregarMasivo({required this.scroll});
  final ScrollController scroll;

  @override
  ConsumerState<_AgregarMasivo> createState() => _AgregarMasivoState();
}

class _AgregarMasivoState extends ConsumerState<_AgregarMasivo>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);
  final _busqueda = TextEditingController();

  /// Colaboradores marcados de la pestaña «Del equipo».
  final Set<String> _elegidos = {};

  /// `puestoId → sueldo que se aplicará a los elegidos de ese puesto`. Sin
  /// entrada, cada quien conserva el suyo.
  final Map<String, SueldoProyectado> _sueldoPorPuesto = {};

  /// Qué encabezados de puesto tienen el editor de sueldo desplegado.
  final Set<String> _editorAbierto = {};

  final List<_RenglonPlaza> _plazas = [];

  /// Obra y cuadrilla que se les pone a las plazas nuevas.
  String? _obraPlazas;
  String? _cuadrillaPlazas;
  bool _destinoInicializado = false;

  bool _guardando = false;

  @override
  void dispose() {
    _tabs.dispose();
    _busqueda.dispose();
    super.dispose();
  }

  // ── Datos ────────────────────────────────────────────────────────────────

  Map<String, db.Puesto> get _puestoPorId {
    final vista = ref.read(proyeccionVistaProvider);
    return {for (final p in vista.puestos) p.id: p};
  }

  String _nombrePuesto(String? id) =>
      _puestoPorId[id ?? '']?.nombre ?? 'Sin puesto';

  /// El salario por día que traería esta persona hoy: el suyo, o el del puesto.
  double _diarioActual(db.Colaborador c) {
    final sueldos = ref.read(sueldosPorColaboradorProvider).asData?.value ??
        const <String, db.ColaboradorSueldoRow>{};
    return sueldos[c.id]?.salarioPersonalizado ??
        _puestoPorId[c.puestoId]?.salarioDiaDefault ??
        0;
  }

  int _diasSemanaDe(String id) {
    final sueldos = ref.read(sueldosPorColaboradorProvider).asData?.value ??
        const <String, db.ColaboradorSueldoRow>{};
    return sueldos[id]?.diasSemana ?? 6;
  }

  /// Candidatos agrupados por puesto, filtrados por la búsqueda y con los
  /// destajistas al final (a ellos el sueldo por periodo no les aplica).
  Map<String, List<db.Colaborador>> _porPuesto(List<db.Colaborador> todos) {
    final q = _busqueda.text.trim().toLowerCase();
    final mapa = <String, List<db.Colaborador>>{};
    for (final c in todos) {
      if (q.isNotEmpty &&
          !c.nombre.toLowerCase().contains(q) &&
          !_nombrePuesto(c.puestoId).toLowerCase().contains(q)) {
        continue;
      }
      mapa.putIfAbsent(c.puestoId, () => []).add(c);
    }
    return mapa;
  }

  // ── Lo que va a costar ───────────────────────────────────────────────────

  /// Lo que suman a la semana los elegidos del equipo, con el sueldo que se les
  /// va a aplicar (el del grupo si se cambió, si no el suyo).
  double get _costoEquipo {
    final vista = ref.read(proyeccionVistaProvider);
    var total = 0.0;
    for (final c in vista.candidatos) {
      if (!_elegidos.contains(c.id)) continue;
      if (c.tipoPago == 'DESTAJO') continue;
      final delGrupo = _sueldoPorPuesto[c.puestoId];
      final diario = delGrupo?.salarioDia ?? _diarioActual(c);
      final dias = delGrupo?.diasSemana ?? _diasSemanaDe(c.id);
      total += diario * dias;
    }
    return total;
  }

  double get _costoPlazas {
    var total = 0.0;
    for (final r in _plazas) {
      final s = r.sueldo;
      if (s == null || r.puestoId == null) continue;
      total += (s.salarioDia ?? 0) * s.diasSemana * r.cantidad;
    }
    return total;
  }

  int get _cuantasPlazas => _plazas
      .where((r) => r.puestoId != null && (r.sueldo?.salarioDia ?? 0) > 0)
      .fold(0, (a, r) => a + r.cantidad);

  bool get _hayAlgo => _elegidos.isNotEmpty || _cuantasPlazas > 0;

  // ── Aplicar ──────────────────────────────────────────────────────────────

  Future<void> _aplicar() async {
    if (!_hayAlgo || _guardando) return;
    setState(() => _guardando = true);

    final notifier = ref.read(proyeccionEstadoProvider.notifier);
    // El escenario COMPLETO antes de tocar nada: es lo que hace que un solo
    // «Deshacer» devuelva las ocho altas, los sueldos y las plazas de una vez.
    final antes = ref.read(proyeccionEstadoProvider);
    final vista = ref.read(proyeccionVistaProvider);
    final lunes = ref.read(semanaProyeccionProvider);
    final hoy = indiceDiaSemana(lunes, Semana.inicioDia(DateTime.now()));

    // 1. Del equipo.
    if (_elegidos.isNotEmpty) {
      final puestoDe = {for (final c in vista.candidatos) c.id: c.puestoId};
      notifier.agregarVarios(
        _elegidos,
        diasPorColaborador: {
          for (final id in _elegidos)
            id: _sueldoPorPuesto[puestoDe[id] ?? '']?.diasSemana ??
                _diasSemanaDe(id),
        },
        // Quien entra a media semana arranca de hoy, no del lunes.
        desdeDia: hoy ?? 0,
      );
      for (final c in vista.candidatos) {
        if (!_elegidos.contains(c.id)) continue;
        final delGrupo = _sueldoPorPuesto[c.puestoId];
        if (delGrupo != null) notifier.setSueldo(c.id, delGrupo);
      }
    }

    // 2. Plazas nuevas.
    for (final r in _plazas) {
      final s = r.sueldo;
      if (r.puestoId == null || s == null || (s.salarioDia ?? 0) <= 0) continue;
      notifier.agregarPlazas(
        puestoId: r.puestoId!,
        puestoNombre: _nombrePuesto(r.puestoId),
        cuantas: r.cantidad,
        sueldo: s,
        obraId: _obraPlazas,
        cuadrillaId: _cuadrillaPlazas,
      );
    }

    final cuantos = _elegidos.length + _cuantasPlazas;
    if (!mounted) return;
    final anfitrion = Navigator.of(context).context;
    Navigator.pop(context);

    showAppSnack(
      anfitrion,
      cuantos == 1
          ? 'Se agregó 1 a la proyección.'
          : 'Se agregaron $cuantos a la proyección.',
      onUndo: () => notifier.restaurar(antes),
    );

    // 3. Y solo entonces, la pregunta por el catálogo. Va DESPUÉS de agregar
    //    para que la proyección ya esté hecha decida lo que decida: guardar en
    //    el catálogo es un extra, no un peaje.
    await _ofrecerGuardarEnPuestos(anfitrion);
  }


  /// Pregunta si los sueldos capturados deben quedarse también en el catálogo
  /// de puestos. Solo aparece si alguno DIFIERE del que el puesto ya tenía: un
  /// diálogo que sale siempre se contesta sin leer, y entonces deja de proteger.
  Future<void> _ofrecerGuardarEnPuestos(BuildContext anfitrion) async {
    final puestos = _puestoPorId;
    final cambios = <String, double>{};

    void anotar(String? puestoId, SueldoProyectado? sueldo) {
      final diario = sueldo?.salarioDia;
      if (puestoId == null || diario == null || diario <= 0) return;
      final actual = puestos[puestoId]?.salarioDiaDefault ?? 0;
      if ((actual - diario).abs() >= 0.01) cambios[puestoId] = diario;
    }

    _sueldoPorPuesto.forEach(anotar);
    for (final r in _plazas) {
      anotar(r.puestoId, r.sueldo);
    }
    if (cambios.isEmpty || !anfitrion.mounted) return;

    final guardar = await showDialog<bool>(
      context: anfitrion,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Guardar estos sueldos?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
                'La proyección ya funciona sin guardar nada. Si los guardas, '
                'quedan como el sueldo que se propone la próxima vez que se dé '
                'de alta a alguien de ese puesto.'),
            const SizedBox(height: 12),
            for (final e in cambios.entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  '${puestos[e.key]?.nombre ?? 'Puesto'} · '
                  '${Fmt.money(puestos[e.key]?.salarioDiaDefault ?? 0)} → '
                  '${Fmt.money(e.value)} / día',
                  style: Theme.of(ctx).textTheme.bodyMedium,
                ),
              ),
            const SizedBox(height: 8),
            Text(
              'No cambia el sueldo de nadie que ya tenga el suyo propio.',
              style: Theme.of(ctx)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: ctx.colores.textMuted),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Solo en esta proyección')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Guardar en el puesto')),
        ],
      ),
    );

    if (guardar != true) return;
    final repo = ref.read(puestoRepositoryProvider);
    for (final e in cambios.entries) {
      await repo.upsert(db.PuestosCompanion(
        id: Value(e.key),
        salarioDiaDefault: Value(e.value),
      ));
    }
    if (anfitrion.mounted) {
      showAppSnack(anfitrion, 'Sueldos guardados en el catálogo de puestos.');
    }
  }

  // ── Pintado ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final vista = ref.watch(proyeccionVistaProvider);
    final c = context.colores;
    final t = Theme.of(context).textTheme;

    if (!_destinoInicializado) {
      _destinoInicializado = true;
      _obraPlazas = vista.obraFiltro;
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('Agregar a la proyección', style: t.titleMedium),
          ),
        ),
        TabBar(
          controller: _tabs,
          tabs: [
            Tab(text: 'Del equipo · ${vista.candidatos.length}'),
            Tab(text: _cuantasPlazas == 0
                ? 'Plazas nuevas'
                : 'Plazas nuevas · $_cuantasPlazas'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              _pestanaEquipo(vista),
              _pestanaPlazas(vista),
            ],
          ),
        ),
        _pie(c, t),
      ],
    );
  }

  Widget _pie(AppColors c, TextTheme t) {
    final costo = _costoEquipo + _costoPlazas;
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: c.surface,
          border: Border(top: BorderSide(color: c.border)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _hayAlgo
                        ? '${_elegidos.length + _cuantasPlazas} seleccionados'
                        : 'Nadie seleccionado',
                    style: t.bodySmall?.copyWith(color: c.textMuted),
                  ),
                  // La cifra va ANTES de tocar el botón: es la pregunta que se
                  // está contestando («¿cuánto me sube la raya?»), y verla
                  // después de aplicar llega tarde.
                  Text(
                    _hayAlgo ? '+${Fmt.money(costo)} a la semana' : '—',
                    style: t.titleMedium?.copyWith(
                        color: c.textStrong,
                        fontWeight: FontWeight.w600,
                        fontFeatures: const [FontFeature.tabularFigures()]),
                  ),
                ],
              ),
            ),
            FilledButton(
              onPressed: _hayAlgo && !_guardando ? _aplicar : null,
              child: const Text('Agregar'),
            ),
          ],
        ),
      ),
    );
  }

  // ── Pestaña 1: del equipo ────────────────────────────────────────────────

  Widget _pestanaEquipo(ProyeccionVista vista) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;

    if (vista.candidatos.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Text(
            'Ya está todo el equipo en la proyección. Puedes seguir en «Plazas '
            'nuevas» para simular contrataciones.',
            textAlign: TextAlign.center,
            style: t.bodyMedium?.copyWith(color: c.textMuted),
          ),
        ),
      );
    }

    final grupos = _porPuesto(vista.candidatos);
    final ordenados = grupos.keys.toList()
      ..sort((a, b) => _nombrePuesto(a).compareTo(_nombrePuesto(b)));

    return ListView(
      controller: widget.scroll,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      children: [
        TextField(
          controller: _busqueda,
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search, size: 20),
            hintText: 'Buscar por nombre o puesto',
            isDense: true,
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        for (final puestoId in ordenados) ...[
          _encabezadoGrupo(puestoId, grupos[puestoId]!, c, t),
          if (_editorAbierto.contains(puestoId))
            _editorDelGrupo(puestoId, grupos[puestoId]!, c, t),
          for (final colab in grupos[puestoId]!)
            _renglonPersona(colab, puestoId, c, t),
          const SizedBox(height: 10),
        ],
      ],
    );
  }

  Widget _encabezadoGrupo(
      String puestoId, List<db.Colaborador> gente, AppColors c, TextTheme t) {
    final ids = gente.map((g) => g.id).toSet();
    final marcados = ids.where(_elegidos.contains).length;
    final todos = marcados == ids.length && ids.isNotEmpty;
    final sueldo = _sueldoPorPuesto[puestoId];
    final delPuesto = _puestoPorId[puestoId]?.salarioDiaDefault ?? 0;

    return Container(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(
        children: [
          // Tres estados: nadie, algunos, todos. El «algunos» necesita forma
          // propia o el encabezado miente sobre lo que hay debajo.
          Checkbox(
            value: todos ? true : (marcados == 0 ? false : null),
            tristate: true,
            onChanged: (_) => setState(() {
              todos ? _elegidos.removeAll(ids) : _elegidos.addAll(ids);
            }),
          ),
          Expanded(
            child: Text(
              '${_nombrePuesto(puestoId).toUpperCase()} · ${gente.length}',
              style: t.labelSmall?.copyWith(
                  color: c.textMuted,
                  fontSize: 10.5,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w700),
            ),
          ),
          InkWell(
            onTap: () => setState(() => _editorAbierto.contains(puestoId)
                ? _editorAbierto.remove(puestoId)
                : _editorAbierto.add(puestoId)),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: sueldo != null ? c.accentSoft : Colors.transparent,
                border: Border.all(
                    color: sueldo != null ? c.accentSoft : c.borderStrong),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                sueldo != null
                    ? '${Fmt.money(sueldo.salarioDia ?? 0)}/día · editado'
                    : '${Fmt.money(delPuesto)}/día',
                style: t.bodySmall?.copyWith(
                    color: sueldo != null ? c.accent : c.textMuted,
                    fontWeight:
                        sueldo != null ? FontWeight.w600 : FontWeight.normal),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _editorDelGrupo(
      String puestoId, List<db.Colaborador> gente, AppColors c, TextTheme t) {
    final delPuesto = _puestoPorId[puestoId]?.salarioDiaDefault ?? 0;
    final marcados = gente.where((g) => _elegidos.contains(g.id)).length;

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SueldoEditor(
            key: ValueKey('grupo-$puestoId'),
            valor: _sueldoPorPuesto[puestoId],
            salarioDelPuesto: delPuesto,
            compacto: true,
            onCambio: (s) => setState(() {
              s == null
                  ? _sueldoPorPuesto.remove(puestoId)
                  : _sueldoPorPuesto[puestoId] = s;
            }),
          ),
          const SizedBox(height: 8),
          Text(
            marcados == 0
                ? 'Se aplicará a los que marques de este puesto.'
                : 'Se aplica a los $marcados marcados. Después puedes cambiarle '
                    'el sueldo a uno solo desde su ficha.',
            style: t.bodySmall?.copyWith(color: c.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _renglonPersona(
      db.Colaborador colab, String puestoId, AppColors c, TextTheme t) {
    final marcado = _elegidos.contains(colab.id);
    final destajista = colab.tipoPago == 'DESTAJO';
    final delGrupo = _sueldoPorPuesto[puestoId];
    final diario = delGrupo?.salarioDia ?? _diarioActual(colab);

    return InkWell(
      onTap: () => setState(() =>
          marcado ? _elegidos.remove(colab.id) : _elegidos.add(colab.id)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Checkbox(
              value: marcado,
              onChanged: (_) => setState(() => marcado
                  ? _elegidos.remove(colab.id)
                  : _elegidos.add(colab.id)),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(colab.nombre,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.bodyMedium?.copyWith(color: c.textStrong)),
                  Text(
                    destajista
                        ? 'A destajo · el sueldo por periodo no le aplica'
                        : '${delGrupo?.diasSemana ?? _diasSemanaDe(colab.id)} '
                            'días/sem · ${Fmt.money(diario)}/día',
                    style: t.bodySmall?.copyWith(
                        color: delGrupo != null && !destajista
                            ? c.accent
                            : c.textMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Pestaña 2: plazas nuevas ─────────────────────────────────────────────

  Widget _pestanaPlazas(ProyeccionVista vista) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final obras = ref.watch(obrasProvider).asData?.value ?? const <db.Obra>[];
    final cuadrillas =
        ref.watch(cuadrillasProvider).asData?.value ?? const <db.Cuadrilla>[];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: [
        Text(
          'Gente que todavía no está dada de alta. Sirve para preguntarse '
          'cuánto costaría la semana si entrara. No toca el catálogo.',
          style: t.bodySmall?.copyWith(color: c.textMuted),
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < _plazas.length; i++) _renglonPlaza(i, vista, c, t),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            icon: const Icon(Icons.add, size: 18),
            label: Text(_plazas.isEmpty ? 'Agregar un puesto' : 'Otro puesto'),
            onPressed: vista.puestos.isEmpty
                ? null
                : () => setState(() => _plazas.add(_RenglonPlaza(
                      puestoId: vista.puestos.first.id,
                      sueldo: SueldoProyectado(
                        periodo: PeriodoPago.semanal,
                        monto: vista.puestos.first.salarioDiaDefault * 6,
                        diasSemana: 6,
                      ),
                    ))),
          ),
        ),
        if (vista.puestos.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('No hay puestos en el catálogo todavía.',
                style: t.bodySmall?.copyWith(color: c.textMuted)),
          ),
        if (_plazas.isNotEmpty) ...[
          const SizedBox(height: 18),
          Text('DESTINO',
              style: t.labelSmall?.copyWith(
                  color: c.textMuted,
                  fontSize: 10.5,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String?>(
                  initialValue: _obraPlazas,
                  isExpanded: true,
                  decoration:
                      const InputDecoration(labelText: 'Obra', isDense: true),
                  items: [
                    const DropdownMenuItem<String?>(
                        value: null, child: Text('Sin obra')),
                    ...obras
                        .where((o) => o.activa)
                        .map((o) => DropdownMenuItem<String?>(
                            value: o.id, child: Text(o.nombre))),
                  ],
                  onChanged: (v) => setState(() => _obraPlazas = v),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<String?>(
                  initialValue: _cuadrillaPlazas,
                  isExpanded: true,
                  decoration: const InputDecoration(
                      labelText: 'Cuadrilla', isDense: true),
                  items: [
                    const DropdownMenuItem<String?>(
                        value: null, child: Text('Sin cuadrilla')),
                    ...cuadrillas.map((q) => DropdownMenuItem<String?>(
                        value: q.id, child: Text(q.nombre))),
                  ],
                  onChanged: (v) => setState(() => _cuadrillaPlazas = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Sin obra, la plaza desaparecería en cuanto la pantalla esté
          // filtrada por una. Por eso el campo llega con la obra que se está
          // viendo y por eso se avisa cuando queda vacío.
          if (_obraPlazas == null && vista.obraFiltro != null)
            Text(
              'Estás viendo ${vista.nombreObraFiltro}: sin obra, las plazas no '
              'aparecerían en la tabla.',
              style: t.bodySmall?.copyWith(color: c.warning),
            ),
        ],
      ],
    );
  }

  Widget _renglonPlaza(
      int i, ProyeccionVista vista, AppColors c, TextTheme t) {
    final r = _plazas[i];
    final sueldo = r.sueldo;
    final diario = sueldo?.salarioDia ?? 0;
    final semanal = diario * (sueldo?.diasSemana ?? 0) * r.cantidad;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: r.puestoId,
                  isExpanded: true,
                  decoration:
                      const InputDecoration(labelText: 'Puesto', isDense: true),
                  items: vista.puestos
                      .map((p) =>
                          DropdownMenuItem(value: p.id, child: Text(p.nombre)))
                      .toList(),
                  onChanged: (v) => setState(() => r.puestoId = v),
                ),
              ),
              const SizedBox(width: 10),
              _Contador(
                valor: r.cantidad,
                onCambio: (v) => setState(() => r.cantidad = v),
              ),
              IconButton(
                tooltip: 'Quitar este puesto',
                icon: Icon(Icons.close, size: 18, color: c.textMuted),
                onPressed: () => setState(() => _plazas.removeAt(i)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SueldoEditor(
            key: ValueKey('plaza-$i-${r.puestoId}'),
            valor: sueldo,
            compacto: true,
            onCambio: (s) => setState(() => r.sueldo = s),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  r.cantidad == 1
                      ? '1 plaza'
                      : '${r.cantidad} plazas del mismo sueldo',
                  style: t.bodySmall?.copyWith(color: c.textMuted),
                ),
              ),
              Text(
                diario <= 0 ? 'Falta el sueldo' : '${Fmt.money(semanal)} / sem',
                style: t.bodyMedium?.copyWith(
                    color: diario <= 0 ? c.warning : c.textStrong,
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()]),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Contador de plazas: − n +. Mínimo 1; quitar el renglón es la «✕» de al lado,
/// que es una acción distinta y no debe alcanzarse bajando el contador.
class _Contador extends StatelessWidget {
  const _Contador({required this.valor, required this.onCambio});
  final int valor;
  final ValueChanged<int> onCambio;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: c.borderStrong),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _boton(context, Icons.remove, valor > 1 ? () => onCambio(valor - 1) : null),
          Container(
            constraints: const BoxConstraints(minWidth: 34),
            alignment: Alignment.center,
            child: Text('$valor',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(color: c.textStrong)),
          ),
          _boton(context, Icons.add, valor < 99 ? () => onCambio(valor + 1) : null),
        ],
      ),
    );
  }

  Widget _boton(BuildContext context, IconData icono, VoidCallback? onTap) =>
      InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          child: Icon(icono,
              size: 18,
              color: onTap == null
                  ? context.colores.textFaint
                  : context.colores.textStrong),
        ),
      );
}
