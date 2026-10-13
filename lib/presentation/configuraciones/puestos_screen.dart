import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../data/providers.dart';
import '../../core/format/format.dart';
import '../common/app_badge.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import '../../domain/numeros.dart';
import '../common/hoja_formulario.dart';
import '../common/lista_agrupada.dart';
import '../common/sync_status_action.dart';

class PuestosScreen extends ConsumerWidget {
  const PuestosScreen({super.key});

  static const _uuid = Uuid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final puestosAsync = ref.watch(puestosProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Puestos y salarios'),
        actions: const [SyncStatusAction()],
      ),
      body: puestosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            ErrorStateView(onRetry: () => ref.invalidate(puestosProvider)),
        data: (puestos) {
          if (puestos.isEmpty) {
            return const EmptyStateView(
              icon: Icons.badge_outlined,
              title: 'No hay puestos configurados.',
              hint: 'Toca + para agregar uno.',
            );
          }
          // Línea de Ajustes (DISENO_MOVIL §4): grupo de lista con el salario
          // a la vista; tocar edita y borrar vive dentro de la hoja.
          return LayoutBuilder(
            builder: (context, box) => ListView(
              padding: margenesDeLista(context, box.maxWidth),
              children: [
                GrupoLista(
                  titulo: puestos.length == 1
                      ? '1 puesto'
                      : '${puestos.length} puestos',
                  children: [
                    for (final p in puestos)
                      FilaLista(
                        icono: Icons.badge_outlined,
                        tono: BadgeTone.success,
                        titulo: p.nombre,
                        subtitulo:
                            '≈ ${Fmt.money(p.salarioDiaDefault * 6)} a la semana (6 días)',
                        valor: '${Fmt.money(p.salarioDiaDefault)}/día',
                        etiquetaValor:
                            '${Fmt.money(p.salarioDiaDefault)} por día',
                        onTap: () => _showDialog(context, ref, p),
                      ),
                  ],
                ),
                const SizedBox(height: 88), // que el botón + no tape la última fila
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'fabPuesto',
        onPressed: () => _showDialog(context, ref, null),
        child: const Icon(Icons.add),
      ),
    );
  }

  Future<void> _showDialog(
    BuildContext context,
    WidgetRef ref,
    Puesto? puesto,
  ) async {
    final nombreCtrl = TextEditingController(text: puesto?.nombre ?? '');
    final salarioCtrl = TextEditingController(
      text: numeroParaEditar(puesto?.salarioDiaDefault),
    );

    await mostrarHojaFormulario(
      context,
      builder: (ctx) => HojaFormulario(
        titulo: puesto == null ? 'Nuevo puesto' : 'Editar puesto',
        subtitulo: puesto?.nombre,
        textoGuardar: puesto == null ? 'Agregar puesto' : 'Guardar cambios',
        textoQuitar: puesto == null ? null : 'Borrar puesto',
        onQuitar: puesto == null
            ? null
            : () => _confirmDelete(context, ref, puesto),
        campos: [
          TextFormField(
            controller: nombreCtrl,
            decoration: const InputDecoration(labelText: 'Nombre del puesto'),
            validator: (v) => (v == null || v.trim().isEmpty)
                ? 'El nombre es obligatorio'
                : null,
          ),
          TextFormField(
            controller: salarioCtrl,
            decoration: const InputDecoration(
              labelText: 'Salario por día',
              prefixText: r'$ ',
              helperText: 'Por semana: el diario × 6 días',
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            validator: (v) {
              final d = leerNumero(v);
              if (d == null || d < 0) return 'Ingresa un salario válido';
              return null;
            },
          ),
        ],
        onGuardar: () async {
          await ref
              .read(puestoRepositoryProvider)
              .upsert(
                PuestosCompanion(
                  id: Value(puesto?.id ?? _uuid.v4()),
                  nombre: Value(nombreCtrl.text.trim()),
                  salarioDiaDefault: Value(leerNumero(salarioCtrl.text)!),
                ),
              );
          return true;
        },
      ),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    Puesto p,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar eliminación'),
        content: Text('¿Eliminar el puesto "${p.nombre}"?'),
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
    if (ok == true) await ref.read(puestoRepositoryProvider).delete(p.id);
  }
}
