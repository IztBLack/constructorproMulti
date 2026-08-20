import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../pdf_preview_screen.dart';
import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../core/sync/rol_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../../domain/cotizacion_titulo.dart';
import '../../domain/logic/flujo_calculator.dart';
import '../../domain/logic/nomina_calculator.dart';
import '../../domain/logic/presupuesto_calculator.dart';
import '../../domain/mappers.dart';
import '../../pdf/pdf_service.dart';
import '../asistencia/pase_lista_screen.dart';
import '../configuraciones/catalogo_screen.dart';
import '../common/app_card.dart';
import '../common/error_state_view.dart';
import '../common/sync_status_action.dart';
import '../common/money_text.dart';
import '../common/section_header.dart';
import '../nomina/proyeccion_screen.dart';
import '../obras/obra_detail_screen.dart';
import '../pdf_pre_dialog.dart';

const _meses = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

class ResumenScreen extends ConsumerStatefulWidget {
  const ResumenScreen({super.key});

  @override
  ConsumerState<ResumenScreen> createState() => _ResumenScreenState();
}

class _ResumenScreenState extends ConsumerState<ResumenScreen> {
  bool _anual = false;
  DateTime _ancla = DateTime.now();

  (int, int) _periodo() {
    if (_anual) {
      return (
        DateTime(_ancla.year, 1, 1).millisecondsSinceEpoch,
        DateTime(_ancla.year + 1, 1, 1).millisecondsSinceEpoch,
      );
    }
    return (
      DateTime(_ancla.year, _ancla.month, 1).millisecondsSinceEpoch,
      DateTime(_ancla.year, _ancla.month + 1, 1).millisecondsSinceEpoch,
    );
  }

  String get _periodoLabel =>
      _anual ? '${_ancla.year}' : '${_meses[_ancla.month]} ${_ancla.year}';

  void _navPeriodo(int dir) {
    setState(() {
      _ancla = _anual
          ? DateTime(_ancla.year + dir, _ancla.month, 1)
          : DateTime(_ancla.year, _ancla.month + dir, 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    final obrasAsync = ref.watch(obrasProvider);
    final movsAsync = ref.watch(movimientosTodosProvider);
    final colabs = ref.watch(colaboradoresProvider).asData?.value ?? [];
    final cots = ref.watch(cotizacionesProvider).asData?.value ?? [];
    final pipeline = ref.watch(pipelineValueProvider).asData?.value ?? 0.0;
    final obrasPorColab =
        ref.watch(colaboradorObrasProvider).asData?.value ?? const {};
    // obraId → # de colaboradores activos asignados
    final equipoPorObra = <String, int>{};
    obrasPorColab.forEach((_, obras) {
      for (final o in obras) {
        equipoPorObra[o.id] = (equipoPorObra[o.id] ?? 0) + 1;
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Resumen'),
        actions: [
          const SyncStatusAction(),
          PopupMenuButton<String>(
            icon: const Icon(Icons.picture_as_pdf),
            tooltip: 'Reportes globales',
            onSelected: (v) {
              if (v == 'flujo') _exportarGlobal(ref);
              // Segunda línea: el menú ya no ofrece la opción, pero el gate
              // vive también aquí para que no dependa del dibujo.
              if (v == 'nomina' && ref.read(puedeVerSueldosProvider)) {
                _exportarNominaGlobal(ref);
              }
              if (v == 'presupuestos') _exportarPresupuestosGlobal(ref);
              if (v == 'asistencias') _exportarAsistenciasGlobal(ref);
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'flujo', child: Text('Flujo de caja global')),
              // La nómina global lleva el sueldo de toda la plantilla, así que
              // se rige por la misma lista blanca que la proyección.
              if (ref.watch(puedeVerSueldosProvider))
                const PopupMenuItem(value: 'nomina', child: Text('Nómina global (semana)')),
              const PopupMenuItem(value: 'presupuestos', child: Text('Presupuestos global')),
              const PopupMenuItem(value: 'asistencias', child: Text('Asistencias global (semana)')),
            ],
          ),
        ],
      ),
      body: obrasAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: 'No se pudo cargar el resumen.',
          onRetry: () => ref.invalidate(obrasProvider),
        ),
        data: (obras) {
          final movs = movsAsync.asData?.value ?? [];
          final (pIni, pFin) = _periodo();
          final movsPeriodo = movs.where((m) => m.fecha >= pIni && m.fecha < pFin).toList();
          final global = const FlujoCalculator().resumen(movsPeriodo.map(movimientoToDomain).toList());

          // % de gasto por categoría (en el periodo)
          double salNomina = 0, salMaterial = 0, salOtros = 0;
          for (final m in movsPeriodo.where((m) => m.tipo == 'SALIDA')) {
            if (m.categoria == 'NOMINA') {
              salNomina += m.monto;
            } else if (m.categoria == 'MATERIAL') {
              salMaterial += m.monto;
            } else {
              salOtros += m.monto;
            }
          }
          final totalSal = salNomina + salMaterial + salOtros;
          pct(double v) => totalSal > 0 ? (v / totalSal * 100).toStringAsFixed(0) : '0';

          // Saldo por obra (histórico, todas las fechas)
          final porObra = {
            for (final o in obras)
              o.id: const FlujoCalculator()
                  .resumen(movs.where((x) => x.obraId == o.id).map(movimientoToDomain).toList())
          };

          final colores = context.colores;
          final textTheme = Theme.of(context).textTheme;

          return ListView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
            children: [
              // Selector de periodo
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Mes')),
                  ButtonSegment(value: true, label: Text('Año')),
                ],
                selected: {_anual},
                onSelectionChanged: (s) => setState(() => _anual = s.first),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left),
                    tooltip: _anual ? 'Año anterior' : 'Mes anterior',
                    onPressed: () => _navPeriodo(-1),
                  ),
                  Text(_periodoLabel, style: textTheme.titleMedium),
                  IconButton(
                    icon: const Icon(Icons.chevron_right),
                    tooltip: _anual ? 'Año siguiente' : 'Mes siguiente',
                    onPressed: () => _navPeriodo(1),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              // Contadores
              Row(children: [
                _contador('Obras', obras.where((o) => o.activa).length, Icons.foundation),
                const SizedBox(width: 8),
                _contador('Equipo', colabs.where((c) => c.activo).length, Icons.people),
                const SizedBox(width: 8),
                _contador('Cotizaciones', cots.length, Icons.description),
              ]),
              const SizedBox(height: 12),
              // Pipeline: valor de cotizaciones pendientes
              AppCard(
                padding: CardPadding.sm,
                child: Row(
                  children: [
                    Icon(Icons.trending_up, color: colores.info),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Pipeline', style: textTheme.titleSmall),
                          Text('Cotizaciones pendientes (borrador/enviada)',
                              style: textTheme.bodySmall),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    MoneyText(
                      pipeline,
                      color: colores.info,
                      style: textTheme.titleMedium,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Accesos rápidos
              _accesosRapidos(),
              const SizedBox(height: 16),
              // Flujo del periodo
              AppCard(
                child: Column(children: [
                  Text('Flujo de caja · $_periodoLabel',
                      style: textTheme.titleSmall),
                  const SizedBox(height: 16),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
                    _kpi('Ingresos', global.totalEntradas, colores.success),
                    _kpi('Egresos', global.totalSalidas, colores.danger),
                    _kpi('Saldo', global.saldo, colores.montoTone(global.saldo)),
                  ]),
                ]),
              ),
              const SizedBox(height: 12),
              // % de gasto
              AppCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SectionHeader(title: 'Distribución del gasto · $_periodoLabel'),
                  _barraGasto('Nómina', salNomina, totalSal, colores.chartPayroll),
                  _barraGasto('Material', salMaterial, totalSal, colores.chartMaterial),
                  _barraGasto('Otros', salOtros, totalSal, colores.chartOther),
                  const SizedBox(height: 8),
                  Text('Nómina ${pct(salNomina)}% · Material ${pct(salMaterial)}% · Otros ${pct(salOtros)}%',
                      style: textTheme.bodySmall),
                ]),
              ),
              const SizedBox(height: 20),
              const SectionHeader(
                title: 'Saldo por obra',
                description: 'Histórico completo, sin filtrar por periodo.',
              ),
              if (obras.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: Text('Sin obras registradas.')),
                )
              else
                ...obras.map((o) {
                  final r = porObra[o.id]!;
                  final nEquipo = equipoPorObra[o.id] ?? 0;
                  final sub = o.cliente.isEmpty
                      ? '$nEquipo en equipo'
                      : '${o.cliente} · $nEquipo en equipo';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: AppCard(
                      padding: CardPadding.sm,
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => ObraDetailScreen(obra: o))),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(o.nombre, style: textTheme.bodyLarge),
                                Text(sub, style: textTheme.bodySmall),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          MoneyText(
                            r.saldo,
                            colorearPorSigno: true,
                            style: textTheme.titleSmall,
                          ),
                        ],
                      ),
                    ),
                  );
                }),
            ],
          );
        },
      ),
    );
  }

  Widget _accesosRapidos() => Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _accion(Icons.fact_check, 'Pase lista',
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PaseListaScreen()))),
          // La proyección enseña el salario de cada persona junto a su nombre,
          // así que ni siquiera se ofrece a quien no puede verla: el gate de la
          // pantalla es la segunda línea de defensa, no la primera.
          if (ref.watch(puedeVerSueldosProvider))
            _accion(Icons.calculate_outlined, 'Proyección',
                () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const ProyeccionScreen()))),
          _accion(Icons.note_add, 'Cotizar', () => ref.read(homeTabProvider.notifier).state = 1),
          _accion(Icons.person_add, 'Equipo', () => ref.read(homeTabProvider.notifier).state = 2),
          _accion(Icons.menu_book, 'Catálogo',
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CatalogoScreen()))),
        ],
      );

  /// El `Tooltip` explícito es lo que le da nombre al botón para el lector de
  /// pantalla: el ícono por sí solo no dice nada (regla `aria-labels`). La
  /// etiqueta visible de abajo no cumple ese papel — es un `Text` hermano, no el
  /// nombre accesible del control.
  Widget _accion(IconData icon, String label, VoidCallback onTap) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton.filledTonal(
            onPressed: onTap,
            icon: Icon(icon),
            tooltip: label,
          ),
          const SizedBox(height: 2),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ],
      );

  Widget _barraGasto(String label, double valor, double total, Color color) {
    final frac = total > 0 ? valor / total : 0.0;
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        SizedBox(width: 66, child: Text(label, style: textTheme.bodySmall)),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: frac,
              minHeight: 8,
              backgroundColor: context.colores.surfaceMuted,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 86,
          child: MoneyText(
            valor,
            textAlign: TextAlign.right,
            style: textTheme.bodySmall,
          ),
        ),
      ]),
    );
  }

  Widget _contador(String label, int n, IconData icon) {
    final textTheme = Theme.of(context).textTheme;
    return Expanded(
      child: AppCard(
        padding: CardPadding.sm,
        child: Column(children: [
          Icon(icon, size: 20, color: context.colores.textMuted),
          const SizedBox(height: 6),
          Text('$n', style: textTheme.headlineSmall),
          Text(label, style: textTheme.labelSmall, textAlign: TextAlign.center),
        ]),
      ),
    );
  }

  Widget _kpi(String label, double v, Color color) => Column(
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: 2),
          MoneyText(
            v,
            color: color,
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      );

  // ================= Reportes globales =================
  Future<void> _exportarGlobal(WidgetRef ref) async {
    final obras = ref.read(obrasProvider).asData?.value ?? [];
    final movs = ref.read(movimientosTodosProvider).asData?.value ?? [];
    final global = const FlujoCalculator().resumen(movs.map(movimientoToDomain).toList());
    final porObra = obras
        .map((o) => (
              obra: o.nombre,
              resumen: const FlujoCalculator().resumen(
                  movs.where((x) => x.obraId == o.id).map(movimientoToDomain).toList()),
            ))
        .toList();
    final base = await PdfPrefs.load();
    if (!mounted) return;
    final config = await showPdfPreDialog(context, base);
    if (config == null) return;
    final bytes = await PdfService.flujoCajaGlobal(porObra: porObra, global: global, config: config);
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PdfPreviewScreen(
            bytes: bytes, titulo: 'Flujo de caja global', filename: 'flujo_global.pdf')));
  }

  Future<void> _exportarNominaGlobal(WidgetRef ref) async {
    final dia = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      helpText: 'Semana de la nómina',
    );
    if (dia == null) return;
    final obras = ref.read(obrasProvider).asData?.value ?? [];
    final puestos = await ref.read(puestoRepositoryProvider).getAll();
    final inicio = Semana.inicioSemana(dia);
    final fin = Semana.finSemana(inicio);
    final colabRepo = ref.read(colaboradorRepositoryProvider);
    final asisRepo = ref.read(asistenciaRepositoryProvider);
    final destRepo = ref.read(destajoRepositoryProvider);

    final datos = <({String obra, NominaSummary summary})>[];
    for (final o in obras.where((o) => o.activa)) {
      final workers = await colabRepo.watchActivosPorObra(o.id).first;
      final asis = await asisRepo.watchRango(o.id, inicio, fin).first;
      final dest = await destRepo.watchRango(o.id, inicio, fin).first;
      final summary = const NominaCalculator().calcular(
        colaboradores: workers.map(colaboradorToDomain).toList(),
        asistencias: asis.map(asistenciaToDomain).toList(),
        destajos: dest.map(destajoToDomain).toList(),
        puestos: puestos.map(puestoToDomain).toList(),
      );
      if (summary.items.isNotEmpty) datos.add((obra: o.nombre, summary: summary));
    }
    final base = await PdfPrefs.load();
    if (!mounted) return;
    final config = await showPdfPreDialog(context, base);
    if (config == null) return;
    final bytes = await PdfService.nominaGlobal(
        datos: datos, rango: '${Fmt.date(inicio)} – ${Fmt.date(fin)}', config: config);
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PdfPreviewScreen(
            bytes: bytes, titulo: 'Nómina global', filename: 'nomina_global.pdf')));
  }

  Future<void> _exportarAsistenciasGlobal(WidgetRef ref) async {
    final obras = ref.read(obrasProvider).asData?.value ?? [];
    final inicio = Semana.inicioSemana(DateTime.now());
    final fin = Semana.finSemana(inicio);
    final colabRepo = ref.read(colaboradorRepositoryProvider);
    final asisRepo = ref.read(asistenciaRepositoryProvider);

    final datos = <({String obra, List<({String trabajador, double dias})> filas})>[];
    for (final o in obras.where((o) => o.activa)) {
      final workers = await colabRepo.watchActivosPorObra(o.id).first;
      final asis = await asisRepo.watchRango(o.id, inicio, fin).first;
      final porColab = <String, double>{};
      for (final a in asis) {
        porColab[a.colaboradorId] = (porColab[a.colaboradorId] ?? 0) + a.fraccion;
      }
      final filas = workers
          .where((c) => c.tipoPago == 'DIA')
          .map((c) => (trabajador: c.nombre, dias: porColab[c.id] ?? 0.0))
          .toList();
      if (filas.isNotEmpty) datos.add((obra: o.nombre, filas: filas));
    }
    final base = await PdfPrefs.load();
    if (!mounted) return;
    final config = await showPdfPreDialog(context, base);
    if (config == null) return;
    final bytes = await PdfService.asistenciasGlobal(
        datos: datos, rango: '${Fmt.date(inicio)} – ${Fmt.date(fin)}', config: config);
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PdfPreviewScreen(
            bytes: bytes, titulo: 'Asistencias global', filename: 'asistencias_global.pdf')));
  }

  Future<void> _exportarPresupuestosGlobal(WidgetRef ref) async {
    final cots = ref.read(cotizacionesProvider).asData?.value ?? [];
    final partidaRepo = ref.read(partidaRepositoryProvider);
    final datos = <({String proyecto, String cliente, PresupuestoTotales totales})>[];
    for (final c in cots) {
      final partidas = await partidaRepo.watchDeCotizacion(c.id).first;
      final totales = const PresupuestoCalculator().calcular(
        partidas: partidas.map(partidaToDomain).toList(),
        ivaEnabled: c.ivaEnabled,
      );
      datos.add((
        proyecto: tituloCotizacion(
            nombreProyecto: c.nombreProyecto,
            ubicacion: c.ubicacion,
            cliente: c.cliente),
        cliente: c.cliente,
        totales: totales
      ));
    }
    final base = await PdfPrefs.load();
    if (!mounted) return;
    final config = await showPdfPreDialog(context, base);
    if (config == null) return;
    final bytes = await PdfService.presupuestosGlobal(datos: datos, config: config);
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PdfPreviewScreen(
            bytes: bytes, titulo: 'Presupuestos global', filename: 'presupuestos_global.pdf')));
  }
}
