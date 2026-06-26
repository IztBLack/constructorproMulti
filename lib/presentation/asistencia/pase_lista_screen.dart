import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../common/app_spacing.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';

/// Pase de lista UNIFICADO: pasa lista de todas las obras activas en un día.
class PaseListaScreen extends ConsumerStatefulWidget {
  const PaseListaScreen({super.key});

  @override
  ConsumerState<PaseListaScreen> createState() => _PaseListaScreenState();
}

class _PaseListaScreenState extends ConsumerState<PaseListaScreen> {
  DateTime _dia = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final obrasAsync = ref.watch(obrasProvider);
    final diaMillis = Semana.inicioDia(_dia);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pase de lista'),
        actions: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Día anterior',
            onPressed: () => setState(() => _dia = _dia.subtract(const Duration(days: 1))),
          ),
          Center(child: Text(Fmt.dayName(_dia))),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Día siguiente',
            onPressed: () => setState(() => _dia = _dia.add(const Duration(days: 1))),
          ),
          IconButton(
            icon: const Icon(Icons.calendar_today),
            tooltip: 'Elegir fecha',
            onPressed: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: _dia,
                firstDate: DateTime(2020),
                lastDate: DateTime(2100),
              );
              if (d != null) setState(() => _dia = d);
            },
          ),
        ],
      ),
      body: obrasAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron cargar las obras.',
          onRetry: () => ref.invalidate(obrasProvider),
        ),
        data: (obras) {
          final activas = obras.where((o) => o.activa).toList();
          if (activas.isEmpty) {
            return const EmptyStateView(
              icon: Icons.event_busy,
              title: 'No hay obras activas.',
              hint: 'Activa una obra para pasar lista.',
            );
          }
          return ListView(
            children: activas
                .map((o) => _ObraPaseLista(obraId: o.id, obraNombre: o.nombre, diaMillis: diaMillis))
                .toList(),
          );
        },
      ),
    );
  }
}

class _ObraPaseLista extends ConsumerWidget {
  final String obraId;
  final String obraNombre;
  final int diaMillis;
  const _ObraPaseLista({required this.obraId, required this.obraNombre, required this.diaMillis});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workers = ref.watch(colaboradoresPorObraProvider(obraId)).asData?.value ?? [];
    final asistencias = ref
            .watch(asistenciasRangoProvider((obraId: obraId, start: diaMillis, end: diaMillis)))
            .asData
            ?.value ??
        [];
    // Cada colaborador se muestra SOLO bajo su última obra asignada, para no
    // duplicarlo cuando está en varias obras a la vez.
    final ultimaObra = ref.watch(ultimaObraPorColaboradorProvider).asData?.value ?? {};
    final dia = workers
        .where((c) => c.tipoPago == 'DIA')
        .where((c) => ultimaObra[c.id]?.id == obraId)
        .toList();
    if (dia.isEmpty) return const SizedBox.shrink();
    final frac = {for (final a in asistencias) a.colaboradorId: a.fraccion};

    return ExpansionTile(
      initiallyExpanded: true,
      title: Text(obraNombre, style: const TextStyle(fontWeight: FontWeight.bold)),
      subtitle: Text('${dia.length} trabajador(es)'),
      children: dia.map((c) {
        return _PaseListaRow(
          key: ValueKey('${obraId}_${c.id}_$diaMillis'),
          obraId: obraId,
          colaboradorId: c.id,
          nombre: c.nombre,
          diaMillis: diaMillis,
          fraccionInicial: frac[c.id] ?? 0.0,
        );
      }).toList(),
    );
  }
}

enum _SaveState { idle, saving, saved, error }

/// Fila individual de pase de lista con feedback de guardado y targets táctiles
/// grandes para uso en campo (guantes/sol). Mantiene su propio estado de
/// guardado por fila en vez de depender solo de un SnackBar global.
class _PaseListaRow extends ConsumerStatefulWidget {
  const _PaseListaRow({
    super.key,
    required this.obraId,
    required this.colaboradorId,
    required this.nombre,
    required this.diaMillis,
    required this.fraccionInicial,
  });

  final String obraId;
  final String colaboradorId;
  final String nombre;
  final int diaMillis;
  final double fraccionInicial;

  @override
  ConsumerState<_PaseListaRow> createState() => _PaseListaRowState();
}

class _PaseListaRowState extends ConsumerState<_PaseListaRow> {
  late double _fraccion = widget.fraccionInicial;
  _SaveState _save = _SaveState.idle;

  Future<void> _guardar(double nueva) async {
    final previa = _fraccion;
    setState(() {
      _fraccion = nueva;
      _save = _SaveState.saving;
    });
    try {
      await ref.read(asistenciaRepositoryProvider).setFraccion(
            obraId: widget.obraId,
            colaboradorId: widget.colaboradorId,
            fecha: widget.diaMillis,
            fraccion: nueva,
          );
      if (mounted) setState(() => _save = _SaveState.saved);
    } catch (_) {
      if (mounted) {
        setState(() {
          _fraccion = previa; // revertir selección visual
          _save = _SaveState.error;
        });
      }
    }
  }

  /// Reasignación no destructiva: mueve al colaborador a otra obra activa
  /// (esa pasa a ser su última obra) y registra la asistencia de hoy ahí.
  /// Sigue perteneciendo a la obra anterior (historial).
  Future<void> _moverAObra() async {
    final obras = (ref.read(obrasProvider).asData?.value ?? [])
        .where((o) => o.activa && o.id != widget.obraId)
        .toList();
    if (obras.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No hay otra obra activa a la cual mover.')));
      return;
    }
    final destino = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: AppSpacing.allLg,
              child: Text('Mover a ${widget.nombre} a:',
                  style: Theme.of(ctx).textTheme.titleMedium),
            ),
            const Divider(height: 1),
            ...obras.map((o) => ListTile(
                  leading: const Icon(Icons.swap_horiz),
                  title: Text(o.nombre),
                  subtitle: o.cliente.isEmpty ? null : Text(o.cliente),
                  onTap: () => Navigator.pop(ctx, o.id),
                )),
          ],
        ),
      ),
    );
    if (destino == null) return;
    try {
      await ref.read(movimientoColaboradorServiceProvider).moverAObra(
            obraDestinoId: destino,
            colaboradorId: widget.colaboradorId,
            fechaHoy: widget.diaMillis,
            fraccionHoy: _fraccion == 0.0 ? 1.0 : _fraccion,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${widget.nombre} movido a la otra obra.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('No se pudo mover: $e')));
      }
    }
  }

  Widget _statusIcon() {
    switch (_save) {
      case _SaveState.saving:
        return const SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        );
      case _SaveState.saved:
        return const Icon(Icons.check_circle, size: 18, color: Colors.green);
      case _SaveState.error:
        return Tooltip(
          message: 'No se guardó. Toca de nuevo para reintentar.',
          child: Icon(Icons.error_outline,
              size: 18, color: Theme.of(context).colorScheme.error),
        );
      case _SaveState.idle:
        return const SizedBox(width: 16);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: AppSpacing.rowLg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(widget.nombre)),
              _statusIcon(),
              IconButton(
                icon: const Icon(Icons.swap_horiz),
                tooltip: 'Mover a otra obra',
                visualDensity: VisualDensity.compact,
                onPressed: _moverAObra,
              ),
            ],
          ),
          AppSpacing.gapXs,
          SegmentedButton<double>(
            showSelectedIcon: false,
            style: const ButtonStyle(
              // Target táctil amplio para dedos con guantes / pantalla sucia.
              minimumSize: WidgetStatePropertyAll(Size(48, 48)),
              tapTargetSize: MaterialTapTargetSize.padded,
            ),
            segments: const [
              ButtonSegment(value: 0.0, label: Text('F')),
              ButtonSegment(value: 0.5, label: Text('½')),
              ButtonSegment(value: 0.75, label: Text('¾')),
              ButtonSegment(value: 1.0, label: Text('✓')),
            ],
            selected: {_fraccion},
            onSelectionChanged: (s) => _guardar(s.first),
          ),
        ],
      ),
    );
  }
}
