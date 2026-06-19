import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../../domain/logic/flujo_calculator.dart';
import '../../domain/mappers.dart';

class ResumenScreen extends ConsumerWidget {
  const ResumenScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final obrasAsync = ref.watch(obrasProvider);
    final movsAsync = ref.watch(movimientosTodosProvider);
    final colabsAsync = ref.watch(colaboradoresProvider);
    final cotsAsync = ref.watch(cotizacionesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Resumen')),
      body: obrasAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (obras) {
          final movs = movsAsync.asData?.value ?? [];
          final colabs = colabsAsync.asData?.value ?? [];
          final cots = cotsAsync.asData?.value ?? [];

          final global = const FlujoCalculator()
              .resumen(movs.map(movimientoToDomain).toList());

          // Saldo por obra
          final porObra = <String, ResumenCaja>{};
          for (final o in obras) {
            final m = movs.where((x) => x.obraId == o.id).map(movimientoToDomain).toList();
            porObra[o.id] = const FlujoCalculator().resumen(m);
          }

          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              Row(
                children: [
                  _contador('Obras', obras.where((o) => o.activa).length, Icons.foundation),
                  _contador('Equipo', colabs.where((c) => c.activo).length, Icons.people),
                  _contador('Cotizaciones', cots.length, Icons.description),
                ],
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(children: [
                    Text('Flujo de caja global',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _kpi(context, 'Ingresos', global.totalEntradas, Colors.green),
                        _kpi(context, 'Egresos', global.totalSalidas, Colors.red),
                        _kpi(context, 'Saldo', global.saldo,
                            global.saldo >= 0 ? Colors.green : Colors.red),
                      ],
                    ),
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
                  return Card(
                    child: ListTile(
                      title: Text(o.nombre),
                      subtitle: Text(o.cliente),
                      trailing: Text(Fmt.money(r.saldo),
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: r.saldo >= 0 ? Colors.green : Colors.red)),
                    ),
                  );
                }),
            ],
          );
        },
      ),
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

  Widget _kpi(BuildContext context, String label, double v, Color color) => Column(
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          Text(Fmt.money(v),
              style: TextStyle(color: color, fontWeight: FontWeight.bold)),
        ],
      );
}
