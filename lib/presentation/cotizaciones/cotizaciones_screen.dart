import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../common/async_action_button.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import 'cotizacion_detail_screen.dart';
import 'estado_cotizacion_badge.dart';

class CotizacionesScreen extends ConsumerWidget {
  const CotizacionesScreen({super.key});
  static const _uuid = Uuid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cotsAsync = ref.watch(cotizacionesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Cotizaciones')),
      body: cotsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron cargar las cotizaciones.',
          onRetry: () => ref.invalidate(cotizacionesProvider),
        ),
        data: (cots) {
          if (cots.isEmpty) {
            return const EmptyStateView(
              icon: Icons.description_outlined,
              title: 'No hay cotizaciones.',
              hint: 'Toca “Nueva” para crear una.',
            );
          }
          return ListView.separated(
            itemCount: cots.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final c = cots[i];
              return ListTile(
                title: Text(c.nombreProyecto),
                // El estado dejó de ser un círculo de color a la izquierda —que
                // obligaba a memorizar qué significaba cada tono— y pasó a ser
                // una etiqueta que lo dice con palabras, igual que en la web.
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      EstadoCotizacionBadge(c.estado),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${c.cliente} · ${Fmt.date(c.fecha)}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                trailing: PopupMenuButton<String>(
                  tooltip: 'Acciones de la cotización',
                  onSelected: (v) {
                    if (v == 'editar') _dialog(context, ref, c);
                    if (v == 'eliminar') _confirmDelete(context, ref, c);
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'editar', child: Text('Editar')),
                    PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
                  ],
                ),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => CotizacionDetailScreen(cotizacion: c),
                )),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _dialog(context, ref, null),
        icon: const Icon(Icons.add),
        label: const Text('Nueva'),
      ),
    );
  }


  Future<void> _dialog(BuildContext context, WidgetRef ref, Cotizacion? cot) async {
    final nombreCtrl = TextEditingController(text: cot?.nombreProyecto ?? '');
    final clienteCtrl = TextEditingController(text: cot?.cliente ?? '');
    final ubicacionCtrl = TextEditingController(text: cot?.ubicacion ?? '');
    final descuentoCtrl = TextEditingController(
        text: (cot?.descuento ?? 0) > 0 ? cot!.descuento.toString() : '');
    final formKey = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(cot == null ? 'Nueva cotización' : 'Editar cotización'),
        content: Form(
          key: formKey,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(
              controller: nombreCtrl,
              decoration: const InputDecoration(labelText: 'Nombre del proyecto'),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Requerido' : null,
            ),
            TextFormField(
              controller: clienteCtrl,
              decoration: const InputDecoration(labelText: 'Cliente'),
            ),
            TextFormField(
              controller: ubicacionCtrl,
              decoration: const InputDecoration(labelText: 'Ubicación'),
            ),
            TextFormField(
              controller: descuentoCtrl,
              decoration: const InputDecoration(
                  labelText: 'Descuento (%)', suffixText: '%'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          AsyncActionButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              await ref.read(cotizacionRepositoryProvider).upsert(
                    CotizacionesCompanion(
                      id: Value(cot?.id ?? _uuid.v4()),
                      nombreProyecto: Value(nombreCtrl.text.trim()),
                      cliente: Value(clienteCtrl.text.trim()),
                      ubicacion: Value(ubicacionCtrl.text.trim()),
                      fecha: Value(cot?.fecha ?? DateTime.now().millisecondsSinceEpoch),
                      estado: Value(cot?.estado ?? 'BORRADOR'),
                      ivaEnabled: Value(cot?.ivaEnabled ?? true),
                      descuento: Value(double.tryParse(descuentoCtrl.text.trim()) ?? 0),
                    ),
                  );
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, Cotizacion c) async {
    final ok = await confirmDialog(
      context,
      title: 'Eliminar cotización',
      message:
          '¿Eliminar la cotización "${c.nombreProyecto}"? Se borran sus secciones, partidas y pagos. '
          'Esta acción no se puede deshacer.',
      actionLabel: 'Eliminar',
    );
    if (ok) await ref.read(cotizacionRepositoryProvider).delete(c.id);
  }
}
