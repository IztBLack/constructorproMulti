import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../data/providers.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import '../../domain/numeros.dart';
import '../common/hoja_formulario.dart';
import '../common/app_snackbar.dart';
import '../common/sync_status_action.dart';
import '../../core/theme/app_colors.dart';
import '../common/app_spacing.dart';
import '../common/money_text.dart';

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
        title: const Text('Catálogo'),
        actions: [
          const SyncStatusAction(),
          IconButton(
            icon: const Icon(Icons.cloud_download_outlined),
            tooltip: 'Cargar catálogo oficial',
            onPressed: () async {
              final n = await ref
                  .read(catalogoRepositoryProvider)
                  .cargarOficial();
              if (context.mounted) {
                showAppSnack(context, '$n conceptos oficiales agregados.');
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
        error: (e, _) =>
            ErrorStateView(onRetry: () => ref.invalidate(catalogoTodoProvider)),
        data: (todos) {
          final lista = todos
              .where(
                (c) =>
                    c.clave.toLowerCase().contains(_query) ||
                    c.descripcion.toLowerCase().contains(_query) ||
                    c.categoria.toLowerCase().contains(_query),
              )
              .toList();
          if (lista.isEmpty) {
            // Vacío por búsqueda y vacío de verdad no se arreglan igual.
            return _query.isEmpty
                ? const EmptyStateView(
                    icon: Icons.menu_book_outlined,
                    title: 'Sin conceptos en el catálogo.',
                    hint:
                        'Carga el catálogo oficial con el botón de la nube '
                        'de arriba.',
                  )
                : const EmptyStateView(
                    icon: Icons.search_off,
                    title: 'Ningún concepto coincide con la búsqueda.',
                  );
          }
          // Agrupar por categoría. Lista PEREZOSA (`ListView.builder`): el
          // catálogo oficial trae más de mil conceptos y armarlos todos de
          // golpe trababa la pantalla.
          final porCategoria = <String, List<CatalogoConcepto>>{};
          for (final c in lista) {
            porCategoria.putIfAbsent(c.categoria, () => []).add(c);
          }
          final cats = porCategoria.keys.toList()..sort();
          final filas = <Object>[
            for (final cat in cats) ...[cat, ...porCategoria[cat]!],
          ];
          final t = Theme.of(context).textTheme;
          final col = context.colores;
          return ListView.builder(
            padding: const EdgeInsets.only(bottom: 88),
            itemCount: filas.length,
            itemBuilder: (context, i) {
              final f = filas[i];
              if (f is String) {
                // Encabezado de grupo: oración, gris, como en Ajustes.
                return Padding(
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.xs),
                  child: Semantics(
                    header: true,
                    child: Text(f.isEmpty ? 'Sin categoría' : f,
                        style: t.labelLarge?.copyWith(color: col.textMuted)),
                  ),
                );
              }
              final c = f as CatalogoConcepto;
              return ListTile(
                title: Text(c.descripcion,
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                subtitle: Text([
                  if (c.clave.trim().isNotEmpty) c.clave.trim(),
                  if (c.unidad.trim().isNotEmpty) c.unidad.trim(),
                ].join(' · ')),
                // El valor a la vista; borrar vive en la hoja de edición.
                trailing: MoneyText(c.precioUnitarioDefault),
                onTap: () => _dialog(c),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'fabCatalogo',
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
    final precioCtrl = TextEditingController(
      text: numeroParaEditar(c?.precioUnitarioDefault),
    );
    final catCtrl = TextEditingController(text: c?.categoria ?? '');

    await mostrarHojaFormulario(
      context,
      builder: (ctx) => HojaFormulario(
        titulo: c == null ? 'Nuevo concepto' : 'Editar concepto',
        subtitulo: c?.clave,
        textoGuardar: c == null ? 'Agregar concepto' : 'Guardar cambios',
        textoQuitar: c == null ? null : 'Borrar concepto',
        onQuitar: c == null ? null : () => _confirmDelete(c),
        campos: [
          TextFormField(
            controller: claveCtrl,
            decoration: const InputDecoration(labelText: 'Clave'),
          ),
          TextFormField(
            controller: descCtrl,
            decoration: const InputDecoration(labelText: 'Descripción'),
            validator: (v) =>
                (v == null || v.trim().isEmpty) ? 'Requerido' : null,
          ),
          TextFormField(
            controller: unidadCtrl,
            decoration: const InputDecoration(labelText: 'Unidad'),
          ),
          TextFormField(
            controller: precioCtrl,
            decoration: const InputDecoration(
              labelText: 'Precio unitario (opcional)',
              prefixText: r'$ ',
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            // Antes un precio mal escrito («1,250») se guardaba como $0.
            validator: (v) =>
                (v ?? '').trim().isEmpty || (leerNumero(v) ?? -1) >= 0
                ? null
                : 'Escribe un precio válido, p. ej. 1,250',
          ),
          TextFormField(
            controller: catCtrl,
            decoration: const InputDecoration(labelText: 'Categoría'),
          ),
        ],
        onGuardar: () async {
          final repo = ref.read(catalogoRepositoryProvider);
          await repo.upsert(
            CatalogoConceptosCompanion(
              id: Value(c?.id ?? repo.newId()),
              clave: Value(claveCtrl.text.trim()),
              descripcion: Value(descCtrl.text.trim()),
              unidad: Value(unidadCtrl.text.trim()),
              precioUnitarioDefault: Value(leerNumero(precioCtrl.text) ?? 0),
              categoria: Value(
                catCtrl.text.trim().isEmpty ? 'GENERAL' : catCtrl.text.trim(),
              ),
              esPersonalizado: const Value(true),
            ),
          );
          return true;
        },
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
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(catalogoRepositoryProvider).delete(c.id);
  }
}
