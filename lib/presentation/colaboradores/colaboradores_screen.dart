import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../common/async_action_button.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';

enum _Sort { nombreAsc, nombreDesc, puesto, obra }

class ColaboradoresScreen extends ConsumerStatefulWidget {
  const ColaboradoresScreen({super.key});

  @override
  ConsumerState<ColaboradoresScreen> createState() => _ColaboradoresScreenState();
}

class _ColaboradoresScreenState extends ConsumerState<ColaboradoresScreen> {
  static const _uuid = Uuid();
  String _query = '';
  _Sort _sort = _Sort.nombreAsc;
  bool _mostrarInactivos = true;

  @override
  Widget build(BuildContext context) {
    final colaboradoresAsync = ref.watch(colaboradoresProvider);
    final puestos = ref.watch(puestosProvider).asData?.value ?? const <Puesto>[];
    final puestoNombre = {for (final p in puestos) p.id: p.nombre};
    final obrasPorColab =
        ref.watch(colaboradorObrasProvider).asData?.value ??
            const <String, List<Obra>>{};

    return Scaffold(
      appBar: AppBar(
        title: const Text('Colaboradores'),
        actions: [
          PopupMenuButton<_Sort>(
            icon: const Icon(Icons.sort),
            onSelected: (s) => setState(() => _sort = s),
            itemBuilder: (_) => const [
              PopupMenuItem(value: _Sort.nombreAsc, child: Text('Nombre (A-Z)')),
              PopupMenuItem(value: _Sort.nombreDesc, child: Text('Nombre (Z-A)')),
              PopupMenuItem(value: _Sort.puesto, child: Text('Por puesto')),
              PopupMenuItem(value: _Sort.obra, child: Text('Por obra asignada')),
            ],
          ),
          IconButton(
            tooltip: _mostrarInactivos ? 'Ocultar inactivos' : 'Mostrar inactivos',
            icon: Icon(_mostrarInactivos ? Icons.visibility : Icons.visibility_off),
            onPressed: () => setState(() => _mostrarInactivos = !_mostrarInactivos),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Buscar colaborador…',
                prefixIcon: Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(),
              ),
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
            ),
          ),
        ),
      ),
      body: colaboradoresAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron cargar los colaboradores.',
          onRetry: () => ref.invalidate(colaboradoresProvider),
        ),
        data: (todos) {
          var lista = todos
              .where((c) => _mostrarInactivos || c.activo)
              .where((c) => c.nombre.toLowerCase().contains(_query))
              .toList();
          switch (_sort) {
            case _Sort.nombreAsc:
              lista.sort((a, b) => a.nombre.compareTo(b.nombre));
            case _Sort.nombreDesc:
              lista.sort((a, b) => b.nombre.compareTo(a.nombre));
            case _Sort.puesto:
              lista.sort((a, b) => (puestoNombre[a.puestoId] ?? '')
                  .compareTo(puestoNombre[b.puestoId] ?? ''));
            case _Sort.obra:
              String obraKey(Colaborador c) {
                final obras = obrasPorColab[c.id] ?? const <Obra>[];
                if (obras.isEmpty) return 'zzz';
                return obras
                    .map((o) => o.nombre.toLowerCase())
                    .reduce((a, b) => a.compareTo(b) <= 0 ? a : b);
              }

              lista.sort((a, b) {
                final cmp = obraKey(a).compareTo(obraKey(b));
                return cmp != 0 ? cmp : a.nombre.compareTo(b.nombre);
              });
          }
          if (lista.isEmpty) {
            return const EmptyStateView(
              icon: Icons.groups_outlined,
              title: 'No hay colaboradores.',
              hint: 'Toca “Nuevo” para agregar uno.',
            );
          }
          return ListView.separated(
            itemCount: lista.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final c = lista[i];
              final tipo = c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo';
              final obras = obrasPorColab[c.id] ?? const <Obra>[];
              return ListTile(
                isThreeLine: true,
                leading: CircleAvatar(
                  backgroundColor: c.activo ? null : Colors.grey,
                  child: Text(c.nombre.isNotEmpty ? c.nombre[0].toUpperCase() : '?'),
                ),
                title: Text(c.nombre,
                    style: TextStyle(
                        decoration: c.activo ? null : TextDecoration.lineThrough)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        '${puestoNombre[c.puestoId] ?? 'Sin puesto'} · $tipo${c.activo ? '' : ' · INACTIVO'}'),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        ...obras.map((o) => Chip(
                              label: Text(o.nombre),
                              visualDensity: VisualDensity.compact,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              avatar: const Icon(Icons.check, size: 16),
                            )),
                        ActionChip(
                          label: const Text('Asignar'),
                          avatar: const Icon(Icons.add, size: 16),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          onPressed: () => _asignarObraSheet(c),
                        ),
                      ],
                    ),
                  ],
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (v) async {
                    final repo = ref.read(colaboradorRepositoryProvider);
                    switch (v) {
                      case 'editar':
                        _showDialog(c, puestos);
                      case 'asignar':
                        _asignarObraSheet(c);
                      case 'toggle':
                        await repo.setActivo(c.id, !c.activo);
                      case 'historial':
                        _showHistorial(c);
                      case 'eliminar':
                        _confirmDelete(c);
                    }
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'editar', child: Text('Editar')),
                    const PopupMenuItem(
                        value: 'asignar', child: Text('Asignar a obra')),
                    PopupMenuItem(
                        value: 'toggle',
                        child: Text(c.activo ? 'Marcar inactivo' : 'Marcar activo')),
                    const PopupMenuItem(value: 'historial', child: Text('Historial de obras')),
                    const PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
                  ],
                ),
                onTap: () => _showDialog(c, puestos),
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
          _showDialog(null, puestos);
        },
        icon: const Icon(Icons.person_add),
        label: const Text('Nuevo'),
      ),
    );
  }

  /// Bottom sheet para asignar/desvincular el colaborador a varias obras
  /// activas (espejo del bottom sheet de Kotlin). Tocar una obra asignada la
  /// desvincula (con confirmación); tocar una libre la asigna.
  Future<void> _asignarObraSheet(Colaborador c) async {
    final obras = (ref.read(obrasProvider).asData?.value ?? const <Obra>[])
        .where((o) => o.activa)
        .toList();
    if (obras.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No hay obras activas.')));
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) {
        return Consumer(builder: (ctx, ref2, _) {
          final asignadas = ref2.watch(colaboradorObrasProvider).asData?.value ??
              const <String, List<Obra>>{};
          final asignadasIds =
              (asignadas[c.id] ?? const <Obra>[]).map((o) => o.id).toSet();
          final repo = ref2.read(colaboradorRepositoryProvider);
          return ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Obras de ${c.nombre}',
                    style: Theme.of(ctx).textTheme.titleMedium),
              ),
              const Divider(height: 1),
              ...obras.map((o) {
                final asignada = asignadasIds.contains(o.id);
                return ListTile(
                  leading: Icon(
                      asignada ? Icons.check_circle : Icons.circle_outlined,
                      color: asignada
                          ? Theme.of(ctx).colorScheme.primary
                          : null),
                  title: Text(o.nombre),
                  subtitle: o.cliente.isEmpty ? null : Text(o.cliente),
                  trailing: asignada
                      ? const Text('Asignado',
                          style: TextStyle(fontWeight: FontWeight.bold))
                      : null,
                  onTap: () async {
                    if (asignada) {
                      final ok = await confirmDialog(
                        ctx,
                        title: 'Desvincular obra',
                        message:
                            '¿Desvincular a "${c.nombre}" de "${o.nombre}"?',
                        actionLabel: 'Desvincular',
                        destructive: false,
                      );
                      if (ok) await repo.desvincular(o.id, c.id);
                    } else {
                      await repo.asignarObra(obraId: o.id, colaboradorId: c.id);
                    }
                  },
                );
              }),
              const SizedBox(height: 8),
            ],
          );
        });
      },
    );
  }

  Future<void> _showHistorial(Colaborador c) async {
    final historial = await ref.read(colaboradorRepositoryProvider).historial(c.id);
    if (!mounted) return;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Historial — ${c.nombre}'),
        content: SizedBox(
          width: double.maxFinite,
          child: historial.isEmpty
              ? const Text('Sin asignaciones registradas.')
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: historial
                      .map((h) => ListTile(
                            dense: true,
                            title: Text(h.obra.nombre),
                            subtitle: Text(
                                'Ingreso: ${Fmt.date(h.rel.fechaIngreso)}'
                                '${h.rel.fechaSalida != null ? ' · Salida: ${Fmt.date(h.rel.fechaSalida!)}' : ' · Activo'}'),
                          ))
                      .toList(),
                ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
        ],
      ),
    );
  }

  Future<void> _showDialog(Colaborador? colaborador, List<Puesto> puestos) async {
    final nombreCtrl = TextEditingController(text: colaborador?.nombre ?? '');
    final salarioCtrl = TextEditingController(
        text: colaborador?.salarioPersonalizado?.toString() ?? '');
    final telCtrl = TextEditingController(text: colaborador?.telefono ?? '');
    final emNombreCtrl = TextEditingController(text: colaborador?.contactoNombre ?? '');
    final emTelCtrl = TextEditingController(text: colaborador?.contactoTelefono ?? '');
    final emParCtrl = TextEditingController(text: colaborador?.contactoParentesco ?? '');
    String? puestoId = colaborador?.puestoId ??
        (puestos.isNotEmpty ? puestos.first.id : null);
    String tipoPago = colaborador?.tipoPago ?? 'DIA';
    bool activo = colaborador?.activo ?? true;
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
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
                    onChanged: (v) => setLocal(() => puestoId = v),
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
                    onChanged: (v) => setLocal(() => tipoPago = v ?? 'DIA'),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: salarioCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Salario personalizado (opcional)',
                      helperText: 'Si se deja vacío, usa el del puesto',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                  TextFormField(
                    controller: telCtrl,
                    decoration: const InputDecoration(labelText: 'Teléfono'),
                    keyboardType: TextInputType.phone,
                  ),
                  const Divider(height: 24),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Contacto de emergencia',
                        style: Theme.of(context).textTheme.labelMedium),
                  ),
                  TextFormField(
                    controller: emNombreCtrl,
                    decoration: const InputDecoration(labelText: 'Nombre'),
                  ),
                  TextFormField(
                    controller: emTelCtrl,
                    decoration: const InputDecoration(labelText: 'Teléfono'),
                    keyboardType: TextInputType.phone,
                  ),
                  TextFormField(
                    controller: emParCtrl,
                    decoration: const InputDecoration(labelText: 'Parentesco'),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Activo'),
                    value: activo,
                    onChanged: (v) => setLocal(() => activo = v),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            AsyncActionButton(
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
                        telefono: Value(telCtrl.text.trim()),
                        contactoNombre: Value(emNombreCtrl.text.trim()),
                        contactoTelefono: Value(emTelCtrl.text.trim()),
                        contactoParentesco: Value(emParCtrl.text.trim()),
                        activo: Value(activo),
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

  Future<void> _confirmDelete(Colaborador c) async {
    final ok = await confirmDialog(
      context,
      title: 'Eliminar colaborador',
      message:
          '¿Eliminar a "${c.nombre}"? Si tiene asistencias o pagos, mejor márcalo como inactivo.',
      actionLabel: 'Eliminar',
    );
    if (ok) await ref.read(colaboradorRepositoryProvider).delete(c.id);
  }
}
