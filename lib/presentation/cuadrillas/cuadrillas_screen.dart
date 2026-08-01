import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../common/async_action_button.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import 'destajo_cuadrilla_screen.dart';

/// Especialidades de cuadrilla (código en BD → etiqueta visible).
const cuadrillaEspecialidades = <String, String>{
  'ALBANILERIA': 'Albañilería',
  'ACERO': 'Acero / fierro',
  'CIMBRA': 'Cimbra / carpintería',
  'INSTALACIONES': 'Instalaciones',
  'ACABADOS': 'Acabados',
  'MIXTA': 'Mixta',
};

String especialidadLabel(String code) =>
    cuadrillaEspecialidades[code] ?? cuadrillaEspecialidades['MIXTA']!;

/// Gestión de CUADRILLAS (equipos de colaboradores). Se abre desde la pantalla
/// "Equipo" (colaboradores). Lista, crea/edita y da de baja cuadrillas; el
/// detalle gestiona miembros, jefe y asignación a obras.
class CuadrillasScreen extends ConsumerStatefulWidget {
  const CuadrillasScreen({super.key});

  @override
  ConsumerState<CuadrillasScreen> createState() => _CuadrillasScreenState();
}

class _CuadrillasScreenState extends ConsumerState<CuadrillasScreen> {
  static const _uuid = Uuid();
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final cuadrillasAsync = ref.watch(cuadrillasProvider);
    final conteos = ref.watch(conteoMiembrosCuadrillaProvider).asData?.value ??
        const <String, int>{};
    final colaboradores =
        ref.watch(colaboradoresProvider).asData?.value ?? const <Colaborador>[];
    final colabNombre = {for (final c in colaboradores) c.id: c.nombre};

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cuadrillas'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Buscar cuadrilla…',
                prefixIcon: Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(),
              ),
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.read(syncServiceProvider).syncAll(),
        child: cuadrillasAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorStateView(
            message: 'No se pudieron cargar las cuadrillas.',
            onRetry: () => ref.invalidate(cuadrillasProvider),
          ),
          data: (todas) {
            final lista = todas
                .where((c) => c.nombre.toLowerCase().contains(_query))
                .toList()
              ..sort((a, b) => a.nombre.compareTo(b.nombre));
            if (lista.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  EmptyStateView(
                    icon: Icons.groups_2_outlined,
                    title: 'No hay cuadrillas.',
                    hint: 'Toca “Nueva” para armar un equipo.',
                  ),
                ],
              );
            }
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: lista.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final c = lista[i];
                final n = conteos[c.id] ?? 0;
                final jefe = c.jefeColaboradorId == null
                    ? null
                    : colabNombre[c.jefeColaboradorId];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor:
                        c.activa ? null : context.colores.neutralSoft,
                    child: const Icon(Icons.groups),
                  ),
                  title: Text(c.nombre,
                      style: TextStyle(
                          decoration:
                              c.activa ? null : TextDecoration.lineThrough)),
                  subtitle: Text(
                    '${especialidadLabel(c.especialidad)} · $n ${n == 1 ? 'miembro' : 'miembros'}'
                    '${jefe != null ? ' · Cabo: $jefe' : ''}'
                    '${c.activa ? '' : ' · INACTIVA'}',
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (v) async {
                      final repo = ref.read(cuadrillaRepositoryProvider);
                      switch (v) {
                        case 'editar':
                          _showEditDialog(c);
                        case 'toggle':
                          await repo.setActiva(c.id, !c.activa);
                        case 'eliminar':
                          _confirmDelete(c);
                      }
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(
                          value: 'editar', child: Text('Editar')),
                      PopupMenuItem(
                          value: 'toggle',
                          child: Text(
                              c.activa ? 'Marcar inactiva' : 'Marcar activa')),
                      const PopupMenuItem(
                          value: 'eliminar', child: Text('Eliminar')),
                    ],
                  ),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => CuadrillaDetailScreen(cuadrillaId: c.id),
                  )),
                );
              },
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showEditDialog(null),
        icon: const Icon(Icons.group_add),
        label: const Text('Nueva'),
      ),
    );
  }

  Future<void> _showEditDialog(Cuadrilla? cuadrilla) async {
    final nombreCtrl = TextEditingController(text: cuadrilla?.nombre ?? '');
    String especialidad = cuadrilla?.especialidad ?? 'MIXTA';
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(cuadrilla == null ? 'Nueva cuadrilla' : 'Editar cuadrilla'),
          content: Form(
            key: formKey,
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
                  initialValue: especialidad,
                  decoration: const InputDecoration(labelText: 'Especialidad'),
                  items: cuadrillaEspecialidades.entries
                      .map((e) => DropdownMenuItem(
                          value: e.key, child: Text(e.value)))
                      .toList(),
                  onChanged: (v) => setLocal(() => especialidad = v ?? 'MIXTA'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancelar')),
            AsyncActionButton(
              onPressed: () async {
                if (!formKey.currentState!.validate()) return;
                await ref.read(cuadrillaRepositoryProvider).upsert(
                      CuadrillasCompanion(
                        id: Value(cuadrilla?.id ?? _uuid.v4()),
                        nombre: Value(nombreCtrl.text.trim()),
                        especialidad: Value(especialidad),
                        // Conserva jefe/activa al editar (upsert reemplaza fila).
                        jefeColaboradorId:
                            Value(cuadrilla?.jefeColaboradorId),
                        activa: Value(cuadrilla?.activa ?? true),
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

  Future<void> _confirmDelete(Cuadrilla c) async {
    final ok = await confirmDialog(
      context,
      title: 'Eliminar cuadrilla',
      message:
          '¿Eliminar la cuadrilla "${c.nombre}"? Se quitarán sus miembros y '
          'asignaciones. Si prefieres conservar el historial, márcala inactiva.',
      actionLabel: 'Eliminar',
    );
    if (ok) await ref.read(cuadrillaRepositoryProvider).delete(c.id);
  }
}

/// Detalle de una cuadrilla: miembros, cabo/jefe y asignación a obras.
class CuadrillaDetailScreen extends ConsumerWidget {
  const CuadrillaDetailScreen({super.key, required this.cuadrillaId});

  final String cuadrillaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cuadrillasAsync = ref.watch(cuadrillasProvider);
    final cuadrilla = cuadrillasAsync.asData?.value
        .where((c) => c.id == cuadrillaId)
        .firstOrNull;
    final miembros =
        ref.watch(miembrosDeCuadrillaProvider(cuadrillaId)).asData?.value ??
            const <Colaborador>[];

    if (cuadrilla == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cuadrilla')),
        body: const Center(child: Text('Cuadrilla no encontrada.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(cuadrilla.nombre),
        actions: [
          IconButton(
            tooltip: 'Destajo por cuadrilla',
            icon: const Icon(Icons.payments_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => DestajoCuadrillaScreen(cuadrillaId: cuadrillaId),
            )),
          ),
        ],
      ),
      body: ListView(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text('Especialidad: ${especialidadLabel(cuadrilla.especialidad)}',
                style: Theme.of(context).textTheme.bodyMedium),
          ),
          // ── Miembros ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Miembros (${miembros.length})',
                    style: Theme.of(context).textTheme.titleMedium),
                TextButton.icon(
                  icon: const Icon(Icons.person_add, size: 18),
                  label: const Text('Agregar'),
                  onPressed: () => _agregarMiembroSheet(context, ref),
                ),
              ],
            ),
          ),
          if (miembros.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Aún no hay miembros. Toca “Agregar”.'),
            )
          else
            ...miembros.map((m) {
              final esJefe = m.id == cuadrilla.jefeColaboradorId;
              return ListTile(
                leading: CircleAvatar(
                  child: Text(
                      m.nombre.isNotEmpty ? m.nombre[0].toUpperCase() : '?'),
                ),
                title: Text(m.nombre),
                subtitle: esJefe ? const Text('Cabo / jefe de cuadrilla') : null,
                trailing: PopupMenuButton<String>(
                  onSelected: (v) async {
                    final repo = ref.read(cuadrillaRepositoryProvider);
                    switch (v) {
                      case 'jefe':
                        await repo.setJefe(cuadrillaId, esJefe ? null : m.id);
                      case 'quitar':
                        await repo.quitarMiembro(cuadrillaId, m.id);
                        // Si era el jefe, deja la cuadrilla sin cabo.
                        if (esJefe) await repo.setJefe(cuadrillaId, null);
                    }
                  },
                  itemBuilder: (_) => [
                    PopupMenuItem(
                        value: 'jefe',
                        child: Text(esJefe
                            ? 'Quitar como cabo'
                            : 'Marcar como cabo')),
                    const PopupMenuItem(
                        value: 'quitar', child: Text('Quitar de la cuadrilla')),
                  ],
                ),
                leadingAndTrailingTextStyle:
                    esJefe ? const TextStyle(fontWeight: FontWeight.bold) : null,
              );
            }),
          const Divider(height: 24),
          // ── Obras asignadas ──
          _AsignacionesObra(cuadrillaId: cuadrillaId),
        ],
      ),
    );
  }

  Future<void> _agregarMiembroSheet(BuildContext context, WidgetRef ref) async {
    await showModalBottomSheet<void>(
      useSafeArea: true,
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Consumer(builder: (ctx, ref2, _) {
        final todos =
            ref2.watch(colaboradoresProvider).asData?.value ?? const <Colaborador>[];
        final miembros =
            ref2.watch(miembrosDeCuadrillaProvider(cuadrillaId)).asData?.value ??
                const <Colaborador>[];
        final miembrosIds = miembros.map((c) => c.id).toSet();
        final disponibles = todos
            .where((c) => c.activo && !miembrosIds.contains(c.id))
            .toList()
          ..sort((a, b) => a.nombre.compareTo(b.nombre));
        final repo = ref2.read(cuadrillaRepositoryProvider);
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.6,
          maxChildSize: 0.9,
          builder: (_, controller) => ListView(
            controller: controller,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Agregar miembro',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              const Divider(height: 1),
              if (disponibles.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('No hay colaboradores activos disponibles.'),
                )
              else
                ...disponibles.map((c) => ListTile(
                      leading: CircleAvatar(
                          child: Text(c.nombre.isNotEmpty
                              ? c.nombre[0].toUpperCase()
                              : '?')),
                      title: Text(c.nombre),
                      trailing: const Icon(Icons.add),
                      onTap: () => repo.agregarMiembro(
                          cuadrillaId: cuadrillaId, colaboradorId: c.id),
                    )),
              const SizedBox(height: 8),
            ],
          ),
        );
      }),
    );
  }
}

/// Sección de obras asignadas a la cuadrilla (asignar / desasignar).
class _AsignacionesObra extends ConsumerWidget {
  const _AsignacionesObra({required this.cuadrillaId});

  final String cuadrillaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Reutiliza el stream por-obra invirtiéndolo: aquí basta listar todas las
    // obras y marcar en cuáles está asignada esta cuadrilla.
    final obras = (ref.watch(obrasProvider).asData?.value ?? const <Obra>[])
        .where((o) => o.activa)
        .toList()
      ..sort((a, b) => a.nombre.compareTo(b.nombre));
    final repo = ref.read(cuadrillaRepositoryProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: Text('Obras', style: Theme.of(context).textTheme.titleMedium),
        ),
        if (obras.isEmpty)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('No hay obras activas.'),
          )
        else
          ...obras.map((o) {
            // Marca de asignación reactiva por obra.
            final asignadas =
                ref.watch(cuadrillasPorObraProvider(o.id)).asData?.value ??
                    const <Cuadrilla>[];
            final asignada = asignadas.any((c) => c.id == cuadrillaId);
            return SwitchListTile(
              title: Text(o.nombre),
              subtitle: o.cliente.isEmpty ? null : Text(o.cliente),
              value: asignada,
              onChanged: (v) async {
                if (v) {
                  await repo.asignarAObra(
                      cuadrillaId: cuadrillaId, obraId: o.id);
                } else {
                  await repo.desasignarDeObra(cuadrillaId, o.id);
                }
              },
            );
          }),
        const SizedBox(height: 16),
      ],
    );
  }
}
