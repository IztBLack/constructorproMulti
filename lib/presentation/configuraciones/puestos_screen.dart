import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../data/providers.dart';

class PuestosScreen extends ConsumerWidget {
  const PuestosScreen({super.key});

  static const _uuid = Uuid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final puestosAsync = ref.watch(puestosProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Puestos y salarios')),
      body: puestosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (puestos) {
          if (puestos.isEmpty) {
            return const Center(
              child: Text('No hay puestos configurados.\nToca + para agregar uno.',
                  textAlign: TextAlign.center),
            );
          }
          return ListView.separated(
            itemCount: puestos.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final p = puestos[i];
              return ListTile(
                leading: const CircleAvatar(child: Icon(Icons.badge_outlined)),
                title: Text(p.nombre),
                subtitle: Text('\$${p.salarioDiaDefault.toStringAsFixed(2)} / día'),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _confirmDelete(context, ref, p),
                ),
                onTap: () => _showDialog(context, ref, p),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showDialog(context, ref, null),
        child: const Icon(Icons.add),
      ),
    );
  }

  Future<void> _showDialog(BuildContext context, WidgetRef ref, Puesto? puesto) async {
    final nombreCtrl = TextEditingController(text: puesto?.nombre ?? '');
    final salarioCtrl = TextEditingController(
        text: puesto != null ? puesto.salarioDiaDefault.toString() : '');
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(puesto == null ? 'Nuevo puesto' : 'Editar puesto'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: nombreCtrl,
                decoration: const InputDecoration(labelText: 'Nombre del puesto'),
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'El nombre es obligatorio'
                    : null,
              ),
              TextFormField(
                controller: salarioCtrl,
                decoration: const InputDecoration(labelText: 'Salario por día (\$)'),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  final d = double.tryParse((v ?? '').trim());
                  if (d == null || d < 0) return 'Ingresa un salario válido';
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              await ref.read(puestoRepositoryProvider).upsert(PuestosCompanion(
                    id: Value(puesto?.id ?? _uuid.v4()),
                    nombre: Value(nombreCtrl.text.trim()),
                    salarioDiaDefault:
                        Value(double.parse(salarioCtrl.text.trim())),
                  ));
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, Puesto p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar eliminación'),
        content: Text('¿Eliminar el puesto "${p.nombre}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (ok == true) await ref.read(puestoRepositoryProvider).delete(p.id);
  }
}
