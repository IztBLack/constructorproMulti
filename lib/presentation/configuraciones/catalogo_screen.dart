import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../data/providers.dart';

class CatalogoScreen extends ConsumerStatefulWidget {
  const CatalogoScreen({super.key});

  @override
  ConsumerState<CatalogoScreen> createState() => _CatalogoScreenState();
}

class _CatalogoScreenState extends ConsumerState<CatalogoScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final catalogoAsync = ref.watch(catalogoTodoProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Catálogo de conceptos'),
        actions: [
          IconButton(
            icon: const Icon(Icons.cloud_download_outlined),
            tooltip: 'Cargar catálogo oficial',
            onPressed: () async {
              final n = await ref.read(catalogoRepositoryProvider).cargarOficial();
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('$n conceptos oficiales agregados.')));
              }
            },
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Buscar (clave, descripción, categoría)…',
                prefixIcon: Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(),
              ),
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
            ),
          ),
        ),
      ),
      body: catalogoAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (todos) {
          final lista = todos.where((c) =>
              c.clave.toLowerCase().contains(_query) ||
              c.descripcion.toLowerCase().contains(_query) ||
              c.categoria.toLowerCase().contains(_query)).toList();
          if (lista.isEmpty) {
            return const Center(child: Text('Sin conceptos.'));
          }
          // Agrupar por categoría.
          final porCategoria = <String, List<CatalogoConcepto>>{};
          for (final c in lista) {
            porCategoria.putIfAbsent(c.categoria, () => []).add(c);
          }
          final cats = porCategoria.keys.toList()..sort();
          return ListView(
            children: cats.expand((cat) {
              return [
                Container(
                  width: double.infinity,
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Text(cat,
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
                ...porCategoria[cat]!.map((c) => ListTile(
                      dense: true,
                      title: Text('${c.clave} · ${c.descripcion}',
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${c.unidad} · ${Fmt.money(c.precioUnitarioDefault)}'),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => _confirmDelete(c),
                      ),
                      onTap: () => _dialog(c),
                    )),
              ];
            }).toList(),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _dialog(null),
        icon: const Icon(Icons.add),
        label: const Text('Concepto'),
      ),
    );
  }

  Future<void> _dialog(CatalogoConcepto? c) async {
    final claveCtrl = TextEditingController(text: c?.clave ?? '');
    final descCtrl = TextEditingController(text: c?.descripcion ?? '');
    final unidadCtrl = TextEditingController(text: c?.unidad ?? '');
    final precioCtrl = TextEditingController(text: c?.precioUnitarioDefault.toString() ?? '');
    final catCtrl = TextEditingController(text: c?.categoria ?? '');
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(c == null ? 'Nuevo concepto' : 'Editar concepto'),
        content: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(controller: claveCtrl, decoration: const InputDecoration(labelText: 'Clave')),
              TextFormField(
                controller: descCtrl,
                decoration: const InputDecoration(labelText: 'Descripción'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Requerido' : null,
              ),
              TextFormField(controller: unidadCtrl, decoration: const InputDecoration(labelText: 'Unidad')),
              TextFormField(
                controller: precioCtrl,
                decoration: const InputDecoration(labelText: 'Precio unitario (\$)'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
              ),
              TextFormField(controller: catCtrl, decoration: const InputDecoration(labelText: 'Categoría')),
            ]),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              final repo = ref.read(catalogoRepositoryProvider);
              await repo.upsert(CatalogoConceptosCompanion(
                id: Value(c?.id ?? repo.newId()),
                clave: Value(claveCtrl.text.trim()),
                descripcion: Value(descCtrl.text.trim()),
                unidad: Value(unidadCtrl.text.trim()),
                precioUnitarioDefault: Value(double.tryParse(precioCtrl.text.trim()) ?? 0),
                categoria: Value(catCtrl.text.trim().isEmpty ? 'GENERAL' : catCtrl.text.trim()),
                esPersonalizado: const Value(true),
              ));
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(CatalogoConcepto c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar concepto'),
        content: Text('¿Eliminar "${c.clave} · ${c.descripcion}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (ok == true) await ref.read(catalogoRepositoryProvider).delete(c.id);
  }
}
