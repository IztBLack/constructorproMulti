import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../data/providers.dart';
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
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (obras) {
          if (obras.isEmpty) {
            return const _EmptyState();
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
          FilledButton(
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
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar eliminación'),
        content: Text('¿Eliminar la obra "${obra.nombre}"?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Eliminar')),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(obraRepositoryProvider).delete(obra.id);
    }
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.foundation,
              size: 72, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          const Text('No hay obras registradas.'),
          const SizedBox(height: 4),
          Text('Toca “Nueva obra” para agregar una.',
              style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
