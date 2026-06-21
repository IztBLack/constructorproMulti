import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../data/providers.dart';

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
            onPressed: () => setState(() => _dia = _dia.subtract(const Duration(days: 1))),
          ),
          Center(child: Text(Fmt.dayName(_dia))),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: () => setState(() => _dia = _dia.add(const Duration(days: 1))),
          ),
          IconButton(
            icon: const Icon(Icons.calendar_today),
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
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (obras) {
          final activas = obras.where((o) => o.activa).toList();
          if (activas.isEmpty) {
            return const Center(child: Text('No hay obras activas.'));
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
    final dia = workers.where((c) => c.tipoPago == 'DIA').toList();
    if (dia.isEmpty) return const SizedBox.shrink();
    final frac = {for (final a in asistencias) a.colaboradorId: a.fraccion};

    return ExpansionTile(
      initiallyExpanded: true,
      title: Text(obraNombre, style: const TextStyle(fontWeight: FontWeight.bold)),
      subtitle: Text('${dia.length} trabajador(es)'),
      children: dia.map((c) {
        final f = frac[c.id] ?? 0.0;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(c.nombre),
              const SizedBox(height: 4),
              SegmentedButton<double>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 0.0, label: Text('F')),
                  ButtonSegment(value: 0.5, label: Text('½')),
                  ButtonSegment(value: 0.75, label: Text('¾')),
                  ButtonSegment(value: 1.0, label: Text('✓')),
                ],
                selected: {f},
                onSelectionChanged: (s) => ref.read(asistenciaRepositoryProvider).setFraccion(
                      obraId: obraId,
                      colaboradorId: c.id,
                      fecha: diaMillis,
                      fraccion: s.first,
                    ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
