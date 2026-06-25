import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../data/providers.dart';
import '../../domain/logic/flujo_calculator.dart';
import '../../domain/logic/nomina_calculator.dart';
import '../../domain/logic/presupuesto_calculator.dart';
import '../../domain/mappers.dart';
import '../../pdf/pdf_service.dart';
import '../asistencia/pase_lista_screen.dart';
import '../configuraciones/catalogo_screen.dart';
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
          PopupMenuButton<String>(
            icon: const Icon(Icons.picture_as_pdf),
            tooltip: 'Reportes globales',
            onSelected: (v) {
              if (v == 'flujo') _exportarGlobal(ref);
              if (v == 'nomina') _exportarNominaGlobal(ref);
              if (v == 'presupuestos') _exportarPresupuestosGlobal(ref);
              if (v == 'asistencias') _exportarAsistenciasGlobal(ref);
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'flujo', child: Text('Flujo de caja global')),
              PopupMenuItem(value: 'nomina', child: Text('Nómina global (semana)')),
              PopupMenuItem(value: 'presupuestos', child: Text('Presupuestos global')),
              PopupMenuItem(value: 'asistencias', child: Text('Asistencias global (semana)')),
            ],
          ),
        ],
      ),
      body: obrasAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
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

          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              // Selector de periodo
              Row(children: [
                Expanded(
                  child: SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: false, label: Text('Mes')),
                      ButtonSegment(value: true, label: Text('Año')),
                    ],
                    selected: {_anual},
                    onSelectionChanged: (s) => setState(() => _anual = s.first),
                  ),
                ),
              ]),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _navPeriodo(-1)),
                  Text(_periodoLabel, style: Theme.of(context).textTheme.titleMedium),
                  IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _navPeriodo(1)),
                ],
              ),
              // Contadores
              Row(children: [
                _contador('Obras', obras.where((o) => o.activa).length, Icons.foundation),
                _contador('Equipo', colabs.where((c) => c.activo).length, Icons.people),
                _contador('Cotizaciones', cots.length, Icons.description),
              ]),
              const SizedBox(height: 8),
              // Pipeline: valor de cotizaciones pendientes
              Card(
                child: ListTile(
                  leading: const Icon(Icons.trending_up, color: Colors.teal),
                  title: const Text('Pipeline'),
                  subtitle: const Text('Cotizaciones pendientes (borrador/enviada)'),
                  trailing: Text(Fmt.money(pipeline),
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: Colors.teal)),
                ),
              ),
              const SizedBox(height: 8),
              // Accesos rápidos
              _accesosRapidos(),
              const SizedBox(height: 12),
              // Flujo del periodo
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(children: [
                    Text('Flujo de caja · $_periodoLabel',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 12),
                    Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
                      _kpi('Ingresos', global.totalEntradas, Colors.green),
                      _kpi('Egresos', global.totalSalidas, Colors.red),
                      _kpi('Saldo', global.saldo, global.saldo >= 0 ? Colors.green : Colors.red),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(height: 8),
              // % de gasto
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Distribución del gasto · $_periodoLabel',
                        style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 8),
                    _barraGasto('Nómina', salNomina, totalSal, Colors.indigo),
                    _barraGasto('Material', salMaterial, totalSal, Colors.orange),
                    _barraGasto('Otros', salOtros, totalSal, Colors.grey),
                    const SizedBox(height: 4),
                    Text('Nómina ${pct(salNomina)}% · Material ${pct(salMaterial)}% · Otros ${pct(salOtros)}%',
                        style: Theme.of(context).textTheme.bodySmall),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              Text('Saldo por obra', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
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
                  return Card(
                    child: ListTile(
                      title: Text(o.nombre),
                      subtitle: Text(sub),
                      trailing: Text(Fmt.money(r.saldo),
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: r.saldo >= 0 ? Colors.green : Colors.red)),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => ObraDetailScreen(obra: o))),
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
          _accion(Icons.note_add, 'Cotizar', () => ref.read(homeTabProvider.notifier).state = 1),
          _accion(Icons.person_add, 'Equipo', () => ref.read(homeTabProvider.notifier).state = 2),
          _accion(Icons.menu_book, 'Catálogo',
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CatalogoScreen()))),
        ],
      );

  Widget _accion(IconData icon, String label, VoidCallback onTap) => Column(
        children: [
          IconButton.filledTonal(onPressed: onTap, icon: Icon(icon)),
          Text(label, style: const TextStyle(fontSize: 11)),
        ],
      );

  Widget _barraGasto(String label, double valor, double total, Color color) {
    final frac = total > 0 ? valor / total : 0.0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        SizedBox(width: 70, child: Text(label, style: const TextStyle(fontSize: 12))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: frac, minHeight: 10,
              backgroundColor: color.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(width: 80, child: Text(Fmt.money(valor),
            textAlign: TextAlign.right, style: const TextStyle(fontSize: 11))),
      ]),
    );
  }

  Widget _contador(String label, int n, IconData icon) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(children: [
              Icon(icon),
              const SizedBox(height: 4),
              Text('$n', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              Text(label, style: const TextStyle(fontSize: 12)),
            ]),
          ),
        ),
      );

  Widget _kpi(String label, double v, Color color) => Column(
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          Text(Fmt.money(v), style: TextStyle(color: color, fontWeight: FontWeight.bold)),
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
    await Printing.sharePdf(bytes: bytes, filename: 'flujo_global.pdf');
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
    await Printing.sharePdf(bytes: bytes, filename: 'nomina_global.pdf');
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
    await Printing.sharePdf(bytes: bytes, filename: 'asistencias_global.pdf');
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
      datos.add((proyecto: c.nombreProyecto, cliente: c.cliente, totales: totales));
    }
    final base = await PdfPrefs.load();
    if (!mounted) return;
    final config = await showPdfPreDialog(context, base);
    if (config == null) return;
    final bytes = await PdfService.presupuestosGlobal(datos: datos, config: config);
    await Printing.sharePdf(bytes: bytes, filename: 'presupuestos_global.pdf');
  }
}
