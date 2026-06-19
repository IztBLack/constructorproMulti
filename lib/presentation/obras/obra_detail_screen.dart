import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../../domain/logic/flujo_calculator.dart';
import '../../domain/logic/nomina_calculator.dart';
import '../../domain/mappers.dart';

class ObraDetailScreen extends ConsumerStatefulWidget {
  final Obra obra;
  const ObraDetailScreen({super.key, required this.obra});

  @override
  ConsumerState<ObraDetailScreen> createState() => _ObraDetailScreenState();
}

class _ObraDetailScreenState extends ConsumerState<ObraDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 4, vsync: this);

  DateTime _diaAsistencia = DateTime.now();
  int _inicioSemana = Semana.inicioSemana(DateTime.now());

  String get _obraId => widget.obra.id;

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.obra.nombre),
        bottom: TabBar(
          controller: _tab,
          isScrollable: true,
          tabs: const [
            Tab(text: 'Equipo'),
            Tab(text: 'Asistencia'),
            Tab(text: 'Nómina'),
            Tab(text: 'Caja'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _equipoTab(),
          _asistenciaTab(),
          _nominaTab(),
          _cajaTab(),
        ],
      ),
    );
  }

  // ============ EQUIPO ============
  Widget _equipoTab() {
    final asignadosAsync = ref.watch(colaboradoresPorObraProvider(_obraId));
    return Scaffold(
      body: asignadosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (asignados) {
          if (asignados.isEmpty) {
            return const Center(
                child: Text('Sin equipo asignado.\nToca + para asignar.',
                    textAlign: TextAlign.center));
          }
          return ListView(
            children: asignados
                .map((c) => ListTile(
                      leading: CircleAvatar(child: Text(_ini(c.nombre))),
                      title: Text(c.nombre),
                      subtitle: Text(c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo'),
                      trailing: IconButton(
                        icon: const Icon(Icons.person_remove_outlined),
                        onPressed: () => _desvincular(c),
                      ),
                    ))
                .toList(),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _asignarDialog,
        icon: const Icon(Icons.group_add),
        label: const Text('Asignar'),
      ),
    );
  }

  Future<void> _asignarDialog() async {
    final todos = ref.read(colaboradoresProvider).asData?.value ?? [];
    final asignados = ref.read(colaboradoresPorObraProvider(_obraId)).asData?.value ?? [];
    final asignadosIds = asignados.map((c) => c.id).toSet();
    final disponibles = todos.where((c) => !asignadosIds.contains(c.id)).toList();

    if (disponibles.isEmpty) {
      _snack('No hay colaboradores disponibles. Crea más en Equipo.');
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => ListView(
        children: disponibles
            .map((c) => ListTile(
                  leading: CircleAvatar(child: Text(_ini(c.nombre))),
                  title: Text(c.nombre),
                  subtitle: Text(c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo'),
                  onTap: () async {
                    await ref.read(colaboradorRepositoryProvider).asignarObra(
                          ObraColaboradorCompanion.insert(
                            obraId: _obraId,
                            colaboradorId: c.id,
                            fechaIngreso: DateTime.now().millisecondsSinceEpoch,
                          ),
                        );
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                ))
            .toList(),
      ),
    );
  }

  Future<void> _desvincular(Colaborador c) async {
    final ok = await _confirm('¿Desvincular a "${c.nombre}" de esta obra?', 'Desvincular');
    if (ok) {
      await ref.read(colaboradorRepositoryProvider).desvincular(_obraId, c.id);
    }
  }

  // ============ ASISTENCIA ============
  Widget _asistenciaTab() {
    final diaMillis = Semana.inicioDia(_diaAsistencia);
    final rango = (obraId: _obraId, start: diaMillis, end: diaMillis);
    final asignadosAsync = ref.watch(colaboradoresPorObraProvider(_obraId));
    final asistenciasAsync = ref.watch(asistenciasRangoProvider(rango));

    return Column(
      children: [
        ListTile(
          leading: const Icon(Icons.event),
          title: Text('Día: ${Fmt.dayName(_diaAsistencia)}'),
          trailing: const Icon(Icons.edit_calendar),
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: _diaAsistencia,
              firstDate: DateTime(2020),
              lastDate: DateTime(2100),
            );
            if (d != null) setState(() => _diaAsistencia = d);
          },
        ),
        const Divider(height: 1),
        Expanded(
          child: asignadosAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (asignados) {
              final dia = asignados.where((c) => c.tipoPago == 'DIA').toList();
              if (dia.isEmpty) {
                return const Center(
                    child: Text('Sin trabajadores por día asignados.'));
              }
              final asistencias = asistenciasAsync.asData?.value ?? [];
              final fracPorColab = {
                for (final a in asistencias) a.colaboradorId: a.fraccion
              };
              return ListView(
                children: dia.map((c) {
                  final frac = fracPorColab[c.id] ?? 0.0;
                  return Card(
                    margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.nombre,
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          SegmentedButton<double>(
                            segments: const [
                              ButtonSegment(value: 0.0, label: Text('Falta')),
                              ButtonSegment(value: 0.5, label: Text('½')),
                              ButtonSegment(value: 0.75, label: Text('¾')),
                              ButtonSegment(value: 1.0, label: Text('Completo')),
                            ],
                            selected: {frac},
                            onSelectionChanged: (s) async {
                              await ref
                                  .read(asistenciaRepositoryProvider)
                                  .setFraccion(
                                    obraId: _obraId,
                                    colaboradorId: c.id,
                                    fecha: diaMillis,
                                    fraccion: s.first,
                                  );
                            },
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ),
      ],
    );
  }

  // ============ NÓMINA ============
  Widget _nominaTab() {
    final fin = Semana.finSemana(_inicioSemana);
    final rango = (obraId: _obraId, start: _inicioSemana, end: fin);
    final workersAsync = ref.watch(colaboradoresPorObraProvider(_obraId));
    final puestosAsync = ref.watch(puestosProvider);
    final asisAsync = ref.watch(asistenciasRangoProvider(rango));
    final destAsync = ref.watch(destajosRangoProvider(rango));

    final lunes = DateTime.fromMillisecondsSinceEpoch(_inicioSemana);
    final domingo = lunes.add(const Duration(days: 6));

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: () => setState(() => _inicioSemana =
                  lunes.subtract(const Duration(days: 7)).millisecondsSinceEpoch),
            ),
            Text('${Fmt.date(_inicioSemana)} – ${Fmt.date(domingo.millisecondsSinceEpoch)}',
                style: Theme.of(context).textTheme.titleSmall),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: () => setState(() => _inicioSemana =
                  lunes.add(const Duration(days: 7)).millisecondsSinceEpoch),
            ),
          ],
        ),
        const Divider(height: 1),
        Expanded(
          child: Builder(builder: (context) {
            if (workersAsync.isLoading || puestosAsync.isLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            final workers = workersAsync.asData?.value ?? [];
            final puestos = puestosAsync.asData?.value ?? [];
            final asistencias = asisAsync.asData?.value ?? [];
            final destajos = destAsync.asData?.value ?? [];

            final summary = const NominaCalculator().calcular(
              colaboradores: workers.map(colaboradorToDomain).toList(),
              asistencias: asistencias.map(asistenciaToDomain).toList(),
              destajos: destajos.map(destajoToDomain).toList(),
              puestos: puestos.map(puestoToDomain).toList(),
            );

            if (summary.items.isEmpty) {
              return const Center(child: Text('Sin equipo asignado.'));
            }
            return Column(
              children: [
                Expanded(
                  child: ListView(
                    children: summary.items.map((it) {
                      final esDia = it.colaborador.tipoPago.name == 'dia';
                      final detalle = esDia
                          ? '${it.totalDias.toStringAsFixed(2)} días × ${Fmt.money(it.salarioBaseCalculado)}'
                          : '${destajos.where((d) => d.colaboradorId == it.colaborador.id).length} destajo(s)';
                      return ListTile(
                        title: Text(it.colaborador.nombre),
                        subtitle: Text(detalle),
                        trailing: Text(Fmt.money(it.totalPagar),
                            style: const TextStyle(fontWeight: FontWeight.bold)),
                        onTap: esDia
                            ? null
                            : () => _agregarDestajoDialog(it.colaborador.id),
                      );
                    }).toList(),
                  ),
                ),
                _totalBar('TOTAL NÓMINA', summary.totalNomina),
              ],
            );
          }),
        ),
      ],
    );
  }

  Future<void> _agregarDestajoDialog(String colaboradorId) async {
    final conceptoCtrl = TextEditingController();
    final montoCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Agregar destajo'),
        content: Form(
          key: formKey,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(
              controller: conceptoCtrl,
              decoration: const InputDecoration(labelText: 'Concepto'),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Requerido' : null,
            ),
            TextFormField(
              controller: montoCtrl,
              decoration: const InputDecoration(labelText: 'Monto (\$)'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (v) {
                final d = double.tryParse((v ?? '').trim());
                return (d == null || d <= 0) ? 'Monto inválido' : null;
              },
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              await ref.read(destajoRepositoryProvider).insert(
                    obraId: _obraId,
                    colaboradorId: colaboradorId,
                    fecha: _inicioSemana, // se registra en el lunes de la semana activa
                    concepto: conceptoCtrl.text.trim(),
                    monto: double.parse(montoCtrl.text.trim()),
                  );
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  // ============ CAJA ============
  Widget _cajaTab() {
    final movsAsync = ref.watch(movimientosPorObraProvider(_obraId));
    return Scaffold(
      body: movsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (movs) {
          final resumen = const FlujoCalculator()
              .resumen(movs.map(movimientoToDomain).toList());
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _kpi('Entradas', resumen.totalEntradas, Colors.green),
                    _kpi('Salidas', resumen.totalSalidas, Colors.red),
                    _kpi('Saldo', resumen.saldo,
                        resumen.saldo >= 0 ? Colors.green : Colors.red),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: movs.isEmpty
                    ? const Center(child: Text('Sin movimientos.'))
                    : ListView.separated(
                        itemCount: movs.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          final m = movs[i];
                          final entrada = m.tipo == 'ENTRADA';
                          return ListTile(
                            leading: Icon(
                              entrada ? Icons.south_west : Icons.north_east,
                              color: entrada ? Colors.green : Colors.red,
                            ),
                            title: Text(m.concepto),
                            subtitle: Text('${Fmt.date(m.fecha)} · ${m.metodoPago}'),
                            trailing: Text(
                              '${entrada ? '+' : '-'}${Fmt.money(m.monto)}',
                              style: TextStyle(
                                  color: entrada ? Colors.green : Colors.red,
                                  fontWeight: FontWeight.bold),
                            ),
                            onLongPress: () => _eliminarMov(m),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          FloatingActionButton.extended(
            heroTag: 'ent',
            onPressed: () => _movDialog('ENTRADA'),
            backgroundColor: Colors.green,
            icon: const Icon(Icons.add),
            label: const Text('Entrada'),
          ),
          const SizedBox(width: 12),
          FloatingActionButton.extended(
            heroTag: 'sal',
            onPressed: () => _movDialog('SALIDA'),
            backgroundColor: Colors.red,
            icon: const Icon(Icons.remove),
            label: const Text('Salida'),
          ),
        ],
      ),
    );
  }

  Future<void> _movDialog(String tipo) async {
    final conceptoCtrl = TextEditingController();
    final montoCtrl = TextEditingController();
    String metodo = 'Transferencia';
    final formKey = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          title: Text(tipo == 'ENTRADA' ? 'Nueva entrada' : 'Nueva salida'),
          content: Form(
            key: formKey,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(
                controller: conceptoCtrl,
                decoration: const InputDecoration(labelText: 'Concepto'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Requerido' : null,
              ),
              TextFormField(
                controller: montoCtrl,
                decoration: const InputDecoration(labelText: 'Monto (\$)'),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  final d = double.tryParse((v ?? '').trim());
                  return (d == null || d <= 0) ? 'Monto inválido' : null;
                },
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: metodo,
                decoration: const InputDecoration(labelText: 'Método'),
                items: const [
                  DropdownMenuItem(value: 'Transferencia', child: Text('Transferencia')),
                  DropdownMenuItem(value: 'Efectivo', child: Text('Efectivo')),
                  DropdownMenuItem(value: 'Cheque', child: Text('Cheque')),
                ],
                onChanged: (v) => setS(() => metodo = v ?? 'Transferencia'),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!formKey.currentState!.validate()) return;
                await ref.read(movimientoRepositoryProvider).add(
                      obraId: _obraId,
                      fecha: DateTime.now().millisecondsSinceEpoch,
                      tipo: tipo,
                      categoria: tipo == 'ENTRADA' ? 'INGRESO_LIBRE' : 'GASTO_LIBRE',
                      concepto: conceptoCtrl.text.trim(),
                      monto: double.parse(montoCtrl.text.trim()),
                      metodoPago: metodo,
                    );
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _eliminarMov(Movimiento m) async {
    final ok = await _confirm(
        '¿Eliminar el movimiento de ${Fmt.money(m.monto)}?', 'Eliminar');
    if (ok) await ref.read(movimientoRepositoryProvider).delete(m.id);
  }

  // ============ Helpers UI ============
  Widget _kpi(String label, double value, Color color) => Column(
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          Text(Fmt.money(value),
              style: TextStyle(color: color, fontWeight: FontWeight.bold)),
        ],
      );

  Widget _totalBar(String label, double value) => Container(
        width: double.infinity,
        color: Theme.of(context).colorScheme.primaryContainer,
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
            Text(Fmt.money(value),
                style: const TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
      );

  String _ini(String n) => n.isNotEmpty ? n[0].toUpperCase() : '?';

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  Future<bool> _confirm(String msg, String accion) async {
    return await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Confirmar'),
            content: Text(msg),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancelar')),
              FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: Text(accion)),
            ],
          ),
        ) ??
        false;
  }
}
