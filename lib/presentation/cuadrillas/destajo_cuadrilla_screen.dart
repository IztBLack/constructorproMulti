import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../common/async_action_button.dart';
import 'cuadrillas_screen.dart' show especialidadLabel;

/// Fase 4 — Destajo por cuadrilla: captura una BOLSA (concepto + total) y la
/// reparte por porcentaje entre los miembros vigentes. Al guardar genera una
/// fila de `destajos` por miembro (monto = bolsa × %), etiquetadas con el
/// `cuadrilla_id`. La nómina las suma por colaborador sin cambios.
class DestajoCuadrillaScreen extends ConsumerStatefulWidget {
  const DestajoCuadrillaScreen({super.key, required this.cuadrillaId});

  final String cuadrillaId;

  @override
  ConsumerState<DestajoCuadrillaScreen> createState() =>
      _DestajoCuadrillaScreenState();
}

class _DestajoCuadrillaScreenState
    extends ConsumerState<DestajoCuadrillaScreen> {
  final _conceptoCtrl = TextEditingController();
  final _bolsaCtrl = TextEditingController();
  String? _obraId;
  DateTime _fecha = DateTime.now();
  final Map<String, int> _pct = {};

  @override
  void dispose() {
    _conceptoCtrl.dispose();
    _bolsaCtrl.dispose();
    super.dispose();
  }

  /// Inicializa/normaliza el reparto en partes iguales (el resto al primero).
  void _repartirIgual(List<Colaborador> miembros) {
    _pct.clear();
    if (miembros.isEmpty) return;
    final base = 100 ~/ miembros.length;
    final resto = 100 - base * miembros.length;
    for (var i = 0; i < miembros.length; i++) {
      _pct[miembros[i].id] = base + (i == 0 ? resto : 0);
    }
  }

  /// Reparto de montos que suma EXACTO la bolsa (el último absorbe el redondeo).
  List<({String colaboradorId, double monto})> _reparto(
      double bolsa, List<Colaborador> miembros) {
    final res = <({String colaboradorId, double monto})>[];
    double acum = 0;
    for (var i = 0; i < miembros.length; i++) {
      final id = miembros[i].id;
      double m;
      if (i == miembros.length - 1) {
        m = double.parse((bolsa - acum).toStringAsFixed(2));
      } else {
        m = double.parse((bolsa * (_pct[id] ?? 0) / 100).toStringAsFixed(2));
        acum += m;
      }
      res.add((colaboradorId: id, monto: m));
    }
    return res;
  }

  @override
  Widget build(BuildContext context) {
    final cuadrilla = ref.watch(cuadrillasProvider).asData?.value
        .where((c) => c.id == widget.cuadrillaId)
        .firstOrNull;
    final miembros =
        ref.watch(miembrosDeCuadrillaProvider(widget.cuadrillaId)).asData?.value ??
            const <Colaborador>[];
    final obras = (ref.watch(obrasProvider).asData?.value ?? const <Obra>[])
        .where((o) => o.activa)
        .toList();

    // Inicializa el reparto la primera vez que hay miembros.
    if (_pct.keys.toSet().difference(miembros.map((c) => c.id).toSet()).isNotEmpty ||
        (_pct.isEmpty && miembros.isNotEmpty)) {
      _repartirIgual(miembros);
    }

    final bolsa = double.tryParse(_bolsaCtrl.text.trim()) ?? 0;
    final totalPct = miembros.fold<int>(0, (a, c) => a + (_pct[c.id] ?? 0));
    final reparto = _reparto(bolsa, miembros);
    final montoDe = {for (final r in reparto) r.colaboradorId: r.monto};

    final cuadra = totalPct == 100;
    final puedeGuardar = cuadra &&
        bolsa > 0 &&
        _obraId != null &&
        miembros.isNotEmpty &&
        _conceptoCtrl.text.trim().isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Destajo por cuadrilla'),
      ),
      body: miembros.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                    'La cuadrilla no tiene miembros. Agrega miembros antes de repartir un destajo.',
                    textAlign: TextAlign.center),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (cuadrilla != null)
                  Row(
                    children: [
                      const Icon(Icons.groups, size: 18),
                      const SizedBox(width: 8),
                      Text('${cuadrilla.nombre} · '
                          '${especialidadLabel(cuadrilla.especialidad)}'),
                    ],
                  ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _obraId,
                  decoration: const InputDecoration(labelText: 'Obra'),
                  items: obras
                      .map((o) =>
                          DropdownMenuItem(value: o.id, child: Text(o.nombre)))
                      .toList(),
                  onChanged: (v) => setState(() => _obraId = v),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text('Fecha: ${Fmt.date(_fechaMillis)}'),
                    ),
                    TextButton.icon(
                      icon: const Icon(Icons.calendar_today, size: 18),
                      label: const Text('Cambiar'),
                      onPressed: () async {
                        final d = await showDatePicker(
                          context: context,
                          initialDate: _fecha,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2100),
                        );
                        if (d != null) setState(() => _fecha = d);
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _conceptoCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Concepto',
                    hintText: 'Ej. Armado de castillos',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _bolsaCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Total de la bolsa (MXN)',
                    prefixText: r'$ ',
                  ),
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Reparto entre miembros',
                        style: Theme.of(context).textTheme.titleMedium),
                    TextButton(
                      onPressed: () => setState(() => _repartirIgual(miembros)),
                      child: const Text('Partes iguales'),
                    ),
                  ],
                ),
                ...miembros.map((m) {
                  final p = _pct[m.id] ?? 0;
                  final esJefe = m.id == cuadrilla?.jefeColaboradorId;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                  '${m.nombre}${esJefe ? ' · Cabo' : ''}'),
                            ),
                            Text('$p%  ·  ${Fmt.money(montoDe[m.id] ?? 0)}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold)),
                          ],
                        ),
                        Slider(
                          value: p.toDouble(),
                          min: 0,
                          max: 100,
                          divisions: 100,
                          label: '$p%',
                          onChanged: (v) =>
                              setState(() => _pct[m.id] = v.round()),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: cuadra
                        ? Theme.of(context).colorScheme.surfaceContainerHighest
                        : Theme.of(context).colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Total repartido'),
                          Text(Fmt.money(bolsa),
                              style: Theme.of(context).textTheme.titleLarge),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('$totalPct%',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(
                                      color: cuadra
                                          ? null
                                          : Theme.of(context)
                                              .colorScheme
                                              .error)),
                          Text(
                            cuadra
                                ? 'cuadra la bolsa'
                                : (totalPct > 100
                                    ? 'sobra ${totalPct - 100}%'
                                    : 'falta ${100 - totalPct}%'),
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(
                                    color: cuadra
                                        ? null
                                        : Theme.of(context).colorScheme.error),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: AsyncActionButton(
                  onPressed: puedeGuardar
                      ? () async {
                          await ref
                              .read(destajoRepositoryProvider)
                              .registrarBolsaCuadrilla(
                                obraId: _obraId!,
                                cuadrillaId: widget.cuadrillaId,
                                fecha: _fechaMillis,
                                concepto: _conceptoCtrl.text.trim(),
                                reparto: _reparto(bolsa, miembros),
                              );
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text('Destajo repartido y guardado.')),
                            );
                            Navigator.of(context).pop();
                          }
                        }
                      : null,
                  child: const Text('Guardar reparto'),
                  ),
                ),
              ],
            ),
    );
  }

  int get _fechaMillis =>
      DateTime(_fecha.year, _fecha.month, _fecha.day).millisecondsSinceEpoch;
}
