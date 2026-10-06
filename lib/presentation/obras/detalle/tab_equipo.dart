/// Pestaña «Equipo» del detalle de obra: quién está asignado a esta obra, con
/// el botón para asignar a alguien más y el de desvincular a cada uno.
///
/// No guarda estado propio —la lista viene del stream
/// `colaboradoresPorObraProvider`— así que es un [ConsumerWidget] que solo
/// necesita el id de la obra. Los dos diálogos del flujo de alta viven en
/// `dialogos/colaborador_dialogs.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/app_database.dart';
import '../../../data/providers.dart';
import 'detalle_comunes.dart';
import 'dialogos/colaborador_dialogs.dart';

class TabEquipo extends ConsumerWidget {
  final String obraId;
  const TabEquipo({super.key, required this.obraId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asignadosAsync = ref.watch(colaboradoresPorObraProvider(obraId));
    return Scaffold(
      body: asignadosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (asignados) {
          if (asignados.isEmpty) {
            return const Center(
                child: Text('Sin equipo asignado.\nToca + para asignar.',
                    textAlign: TextAlign.center));
          }
          return ListView(
            children: asignados
                .map((c) => ListTile(
                      leading: CircleAvatar(child: Text(inicialDe(c.nombre))),
                      title: Text(c.nombre),
                      subtitle:
                          Text(c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo'),
                      trailing: IconButton(
                        icon: const Icon(Icons.person_remove_outlined),
                        onPressed: () => _desvincular(context, ref, c),
                      ),
                    ))
                .toList(),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'fabAsignar',
        onPressed: () => asignarColaboradorSheet(context, ref, obraId: obraId),
        icon: const Icon(Icons.group_add),
        label: const Text('Asignar'),
      ),
    );
  }

  Future<void> _desvincular(
      BuildContext context, WidgetRef ref, Colaborador c) async {
    final ok = await confirmarAccion(
        context, '¿Desvincular a "${c.nombre}" de esta obra?', 'Desvincular');
    if (ok) {
      await ref.read(colaboradorRepositoryProvider).desvincular(obraId, c.id);
    }
  }
}
