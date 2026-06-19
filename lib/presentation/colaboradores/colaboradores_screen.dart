import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../data/providers.dart';

class ColaboradoresScreen extends ConsumerWidget {
  const ColaboradoresScreen({super.key});

  static const _uuid = Uuid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colaboradoresAsync = ref.watch(colaboradoresProvider);
    final puestosAsync = ref.watch(puestosProvider);
    final puestos = puestosAsync.asData?.value ?? const <Puesto>[];
    final puestoNombre = {for (final p in puestos) p.id: p.nombre};

    return Scaffold(
      appBar: AppBar(title: const Text('Colaboradores')),
      body: colaboradoresAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (colaboradores) {
          if (colaboradores.isEmpty) {
            return const Center(
              child: Text('No hay colaboradores.\nToca + para agregar uno.',
                  textAlign: TextAlign.center),
            );
          }
          return ListView.separated(
            itemCount: colaboradores.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final c = colaboradores[i];
              final tipo = c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo';
              return ListTile(
                leading: CircleAvatar(
                  child: Text(c.nombre.isNotEmpty ? c.nombre[0].toUpperCase() : '?'),
                ),
                title: Text(c.nombre),
                subtitle: Text(
                    '${puestoNombre[c.puestoId] ?? 'Sin puesto'} · $tipo'),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _confirmDelete(context, ref, c),
                ),
                onTap: () => _showDialog(context, ref, c, puestos),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (puestos.isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Primero crea un puesto en Configuración.'),
            ));
            return;
          }
          _showDialog(context, ref, null, puestos);
        },
        icon: const Icon(Icons.person_add),
        label: const Text('Nuevo'),
      ),
    );
  }

  Future<void> _showDialog(
    BuildContext context,
    WidgetRef ref,
    Colaborador? colaborador,
    List<Puesto> puestos,
  ) async {
    final nombreCtrl = TextEditingController(text: colaborador?.nombre ?? '');
    final salarioCtrl = TextEditingController(
        text: colaborador?.salarioPersonalizado?.toString() ?? '');
    String? puestoId = colaborador?.puestoId ??
        (puestos.isNotEmpty ? puestos.first.id : null);
    String tipoPago = colaborador?.tipoPago ?? 'DIA';
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text(colaborador == null ? 'Nuevo colaborador' : 'Editar colaborador'),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: nombreCtrl,
                    decoration: const InputDecoration(labelText: 'Nombre'),
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'El nombre es obligatorio'
                        : null,
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: puestoId,
                    decoration: const InputDecoration(labelText: 'Puesto'),
                    items: puestos
                        .map((p) => DropdownMenuItem(value: p.id, child: Text(p.nombre)))
                        .toList(),
                    onChanged: (v) => setState(() => puestoId = v),
                    validator: (v) => v == null ? 'Selecciona un puesto' : null,
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: tipoPago,
                    decoration: const InputDecoration(labelText: 'Tipo de pago'),
                    items: const [
                      DropdownMenuItem(value: 'DIA', child: Text('Por día')),
                      DropdownMenuItem(value: 'DESTAJO', child: Text('Por destajo')),
                    ],
                    onChanged: (v) => setState(() => tipoPago = v ?? 'DIA'),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: salarioCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Salario personalizado (opcional)',
                      helperText: 'Si se deja vacío, usa el del puesto',
                    ),
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!formKey.currentState!.validate()) return;
                final salarioText = salarioCtrl.text.trim();
                final salario = salarioText.isEmpty ? null : double.tryParse(salarioText);
                await ref.read(colaboradorRepositoryProvider).upsert(
                      ColaboradoresCompanion(
                        id: Value(colaborador?.id ?? _uuid.v4()),
                        nombre: Value(nombreCtrl.text.trim()),
                        puestoId: Value(puestoId!),
                        tipoPago: Value(tipoPago),
                        salarioPersonalizado: Value(salario),
                        activo: Value(colaborador?.activo ?? true),
                      ),
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

  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, Colaborador c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar eliminación'),
        content: Text('¿Eliminar a "${c.nombre}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (ok == true) await ref.read(colaboradorRepositoryProvider).delete(c.id);
  }
}
