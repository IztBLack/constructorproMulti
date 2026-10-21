import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/rol_provider.dart';
import '../../data/providers.dart';
import '../../data/repositories_lista_material.dart';
import '../../domain/listas/listas_calculo.dart';
import '../common/app_badge.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import '../common/esqueleto.dart';
import '../common/lista_agrupada.dart';
import '../common/sync_status_action.dart';
import 'hojas_lista.dart';
import 'lista_material_screen.dart';

/// Las LISTAS DE MATERIAL de una obra (Supabase 0050, fase 1 de
/// docs/PLAN_LISTAS_MATERIAL.md). Gemela de `/admin/obras/[id]/listas`.
///
/// Cada fila dice cuánto lleva palomeado sin entrar («12 de 20»): es lo que se
/// busca al abrir la pantalla en la obra.
class ListasObraScreen extends ConsumerWidget {
  const ListasObraScreen({
    super.key,
    required this.obraId,
    required this.obraNombre,
  });

  final String obraId;
  final String obraNombre;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listasAsync = ref.watch(listasDeObraProvider(obraId));
    final rol = ref.watch(rolUsuarioProvider).asData?.value;
    final edita = puedeEditarListas(rol);

    return Scaffold(
      appBar: AppBar(
        title: Text('Listas · $obraNombre'),
        actions: const [SyncStatusAction()],
      ),
      body: listasAsync.when(
        loading: () => const EsqueletoLista(filas: 3),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron mostrar las listas. Tus datos están a salvo '
              'en el teléfono.',
          onRetry: () => ref.invalidate(listasDeObraProvider(obraId)),
        ),
        data: (listas) {
          if (listas.isEmpty) {
            return EmptyStateView(
              icon: Icons.checklist_outlined,
              title: 'Sin listas todavía.',
              hint: edita
                  ? 'Haz una lista por cada parte del plano (trabes, castillos, '
                      'pasillo…) y palomea en la obra lo que ya está.'
                  : 'Aquí aparecen las listas de material de esta obra.',
            );
          }
          return LayoutBuilder(
            builder: (context, c) => ListView(
              padding: margenesDeLista(context, c.maxWidth, arriba: 16)
                  .copyWith(bottom: 96),
              children: [
                GrupoLista(children: [
                  for (final l in listas) _FilaListaMaterial(l, obraNombre),
                ]),
              ],
            ),
          );
        },
      ),
      floatingActionButton: edita
          ? FloatingActionButton.extended(
              heroTag: 'fabLista',
              onPressed: () => _nueva(context, ref),
              icon: const Icon(Icons.playlist_add),
              label: const Text('Nueva lista'),
            )
          : null,
    );
  }

  Future<void> _nueva(BuildContext context, WidgetRef ref) async {
    final datos = await mostrarHojaDatosLista(context);
    if (datos == null) return;
    final id = await ref.read(listaMaterialRepositoryProvider).crear(
          obraId: obraId,
          empresaId: ref.read(empresaIdProvider) ?? '',
          titulo: datos.titulo,
          plano: datos.plano,
        );
    if (!context.mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ListaMaterialScreen(
        listaId: id,
        obraNombre: obraNombre,
        // Recién creada lo más probable es pegar la nota de WhatsApp.
        ofrecerPegar: true,
      ),
    ));
  }
}

class _FilaListaMaterial extends StatelessWidget {
  const _FilaListaMaterial(this.l, this.obraNombre);

  final ListaConRenglones l;
  final String obraNombre;

  @override
  Widget build(BuildContext context) {
    final t = l.totales;
    final cerrada = estadoListaDeCadena(l.lista.estado) == EstadoLista.cerrada;
    final subtitulo = [
      if (l.lista.plano.isNotEmpty) 'Plano ${l.lista.plano}',
      Fmt.date(l.lista.fecha),
      if (t.metros > 0) '${metros2(t.metros)} m',
    ].join(' · ');
    return FilaLista(
      icono: t.completa ? Icons.task_alt : Icons.checklist_outlined,
      tono: t.completa ? BadgeTone.success : BadgeTone.info,
      titulo: l.lista.titulo.isEmpty ? 'Lista sin título' : l.lista.titulo,
      subtitulo: cerrada ? '$subtitulo · Cerrada' : subtitulo,
      valor: t.renglones == 0 ? 'Vacía' : '${t.marcados} de ${t.renglones}',
      etiquetaValor: t.renglones == 0
          ? 'Vacía'
          : '${t.marcados} de ${t.renglones} palomeados',
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) =>
            ListaMaterialScreen(listaId: l.lista.id, obraNombre: obraNombre),
      )),
    );
  }
}
