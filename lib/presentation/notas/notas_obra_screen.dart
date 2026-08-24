import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../core/sync/cloud_providers.dart';
import '../../data/providers.dart';
import '../../data/repositories_nota_obra.dart';
import '../../domain/logic/notas_obra_calculo.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import 'nota_obra_detail_screen.dart';

/// Listado de NOTAS DE OBRA: las cuentas de los tratos de palabra con socios
/// que no están en el sistema. Gemela de `/admin/obras/[id]/notas` en la web.
///
/// Una nota por socio dentro de la obra. El alta pide solo el nombre y la
/// fecha; los renglones se capturan dentro, porque crear la nota vacía no es la
/// meta de nadie: es el paso previo a apuntar el trato.
class NotasObraScreen extends ConsumerWidget {
  const NotasObraScreen({super.key, required this.obraId, required this.obraNombre});

  final String obraId;
  final String obraNombre;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notasAsync = ref.watch(notasDeObraProvider(obraId));

    return Scaffold(
      appBar: AppBar(title: Text('Notas · $obraNombre')),
      body: notasAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron cargar las notas.',
          onRetry: () => ref.invalidate(notasDeObraProvider(obraId)),
        ),
        data: (notas) {
          if (notas.isEmpty) {
            return const EmptyStateView(
              icon: Icons.handshake_outlined,
              title: 'Sin notas todavía.',
              hint: 'Aquí van las cuentas de los tratos de esta obra: cuánto se '
                  'acordó por cada trabajo, qué se ha pagado y qué falta.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
            itemCount: notas.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (_, i) => _TarjetaNota(notas[i], obraNombre: obraNombre),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'fabNota',
        onPressed: () => _nuevaNota(context, ref),
        icon: const Icon(Icons.note_add_outlined),
        label: const Text('Nueva nota'),
      ),
    );
  }

  Future<void> _nuevaNota(BuildContext context, WidgetRef ref) async {
    final destinatario = TextEditingController();
    final titulo = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nueva nota'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: destinatario,
            autofocus: true,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
              labelText: 'A nombre de *',
              hintText: 'Ej. ORLANDO RAMOZ',
              helperText: 'Como lo conoces. No necesita estar dado de alta.',
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: titulo,
            decoration: const InputDecoration(
                labelText: 'Título', hintText: 'Ej. MZ 2 LT 1'),
          ),
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Crear y capturar')),
        ],
      ),
    );

    if (ok != true || destinatario.text.trim().isEmpty) return;

    final empresaId = ref.read(empresaIdProvider);
    if (empresaId == null) return;

    final cuantas = ref.read(notasDeObraProvider(obraId)).asData?.value.length ?? 0;
    final id = await ref.read(notaObraRepositoryProvider).crear(
          obraId: obraId,
          empresaId: empresaId,
          destinatario: destinatario.text.trim(),
          titulo: titulo.text.trim(),
          orden: (cuantas + 1) * pasoOrdenRenglon,
        );

    if (!context.mounted) return;
    // Se entra directo a capturar: es lo que sigue siempre.
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => NotaObraDetailScreen(notaId: id, obraNombre: obraNombre),
    ));
  }
}

class _TarjetaNota extends StatelessWidget {
  const _TarjetaNota(this.nota, {required this.obraNombre});

  final NotaConRenglones nota;
  final String obraNombre;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final t = nota.totales;
    final liquidada = estadoNotaDeCadena(nota.nota.estado) == EstadoNota.liquidada;

    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
        title: Row(children: [
          Expanded(
            child: Text(
              nota.nota.destinatario.isEmpty
                  ? 'Sin destinatario'
                  : nota.nota.destinatario,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          Chip(
            label: Text(liquidada ? 'Liquidada' : 'Abierta',
                style: const TextStyle(fontSize: 11)),
            visualDensity: VisualDensity.compact,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            backgroundColor:
                liquidada ? cs.tertiaryContainer : cs.secondaryContainer,
            side: BorderSide.none,
          ),
        ]),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (nota.nota.titulo.isNotEmpty) Text(nota.nota.titulo),
            const SizedBox(height: 4),
            Row(children: [
              Expanded(child: Text('Total ${Fmt.money(t.total)}')),
              Text(
                'Saldo ${Fmt.money(t.saldo)}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: t.saldo > 0 ? cs.error : cs.primary,
                ),
              ),
            ]),
          ]),
        ),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => NotaObraDetailScreen(
              notaId: nota.nota.id, obraNombre: obraNombre),
        )),
      ),
    );
  }
}
