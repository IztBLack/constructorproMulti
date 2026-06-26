import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../data/providers.dart';
import '../common/async_action_button.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import 'obra_detail_screen.dart';

class ObrasScreen extends ConsumerWidget {
  const ObrasScreen({super.key});

  static const _uuid = Uuid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final obrasAsync = ref.watch(obrasProvider);
    final catalogoAsync = ref.watch(catalogoCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis Obras'),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(right: 12),
              child: catalogoAsync.when(
                data: (n) => Text('Catálogo: $n',
                    style: Theme.of(context).textTheme.labelSmall),
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),
            ),
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
          if (obras.isEmpty) {
            return const EmptyStateView(
              icon: Icons.foundation,
              title: 'No hay obras registradas.',
              hint: 'Toca “Nueva obra” para agregar una.',
            );
          }
          return ListView.separated(
            itemCount: obras.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final obra = obras[i];
              return ListTile(
                leading: CircleAvatar(
                  child: Icon(obra.activa ? Icons.engineering : Icons.archive),
                ),
                title: Text(obra.nombre),
                subtitle: Text(
                  [obra.cliente, obra.ubicacion]
                      .where((s) => s.isNotEmpty)
                      .join(' · '),
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (v) {
                    if (v == 'editar') _showObraDialog(context, ref, obra);
                    if (v == 'eliminar') _confirmDelete(context, ref, obra);
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'editar', child: Text('Editar')),
                    PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
                  ],
                ),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ObraDetailScreen(obra: obra),
                  ),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showObraDialog(context, ref, null),
        icon: const Icon(Icons.add),
        label: const Text('Nueva obra'),
      ),
    );
  }

  Future<void> _showObraDialog(
      BuildContext context, WidgetRef ref, Obra? obra) async {
    final nombreCtrl = TextEditingController(text: obra?.nombre ?? '');
    final clienteCtrl = TextEditingController(text: obra?.cliente ?? '');
    final ubicacionCtrl = TextEditingController(text: obra?.ubicacion ?? '');
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(obra == null ? 'Nueva obra' : 'Editar obra'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: nombreCtrl,
                decoration: const InputDecoration(labelText: 'Nombre de la obra'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'El nombre es obligatorio' : null,
              ),
              TextFormField(
                controller: clienteCtrl,
                decoration: const InputDecoration(labelText: 'Cliente'),
              ),
              TextFormField(
                controller: ubicacionCtrl,
                decoration: const InputDecoration(labelText: 'Ubicación'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          AsyncActionButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              final repo = ref.read(obraRepositoryProvider);
              await repo.upsert(ObrasCompanion(
                id: Value(obra?.id ?? _uuid.v4()),
                nombre: Value(nombreCtrl.text.trim()),
                cliente: Value(clienteCtrl.text.trim()),
                ubicacion: Value(ubicacionCtrl.text.trim()),
                fechaInicio:
                    Value(obra?.fechaInicio ?? DateTime.now().millisecondsSinceEpoch),
                activa: Value(obra?.activa ?? true),
              ));
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, Obra obra) async {
    // Eliminar una obra completa es irreversible y arrastra su historial:
    // confirmación destructiva (botón en color de error) con mensaje fuerte.
    final ok = await confirmDialog(
      context,
      title: 'Eliminar obra',
      message:
          'Se eliminará la obra "${obra.nombre}" y todo su historial relacionado. '
          'Esta acción no se puede deshacer.',
      actionLabel: 'Eliminar obra',
    );
    if (ok) {
      await ref.read(obraRepositoryProvider).delete(obra.id);
    }
  }
}
