/// Diálogos de la pestaña Equipo: elegir a quién asignar a la obra y dar de
/// alta a alguien que todavía no existe.
///
/// Van juntos porque son un solo flujo: la hoja de asignar ofrece «Crear nuevo
/// colaborador» como primera opción, y el alta termina asignando a la obra. Los
/// dos comparten [_asignar], que es el único punto que toca el repositorio.
library;

import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../../core/db/app_database.dart';
import '../../../../data/providers.dart';
import '../../../common/app_snackbar.dart';
import '../detalle_comunes.dart';

Future<void> _asignar(WidgetRef ref,
        {required String obraId, required String colaboradorId}) =>
    ref.read(colaboradorRepositoryProvider).asignarObra(
          obraId: obraId,
          colaboradorId: colaboradorId,
        );

/// Hoja para asignar a la obra a alguien del catálogo (o crearlo al vuelo).
Future<void> asignarColaboradorSheet(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
}) async {
  final todos = ref.read(colaboradoresProvider).asData?.value ?? [];
  final asignados =
      ref.read(colaboradoresPorObraProvider(obraId)).asData?.value ?? [];
  final asignadosIds = asignados.map((c) => c.id).toSet();
  final disponibles = todos.where((c) => !asignadosIds.contains(c.id)).toList();

  await showModalBottomSheet<void>(
    useSafeArea: true,
    context: context,
    builder: (ctx) => ListView(
      children: [
        ListTile(
          leading: const CircleAvatar(child: Icon(Icons.person_add_alt)),
          title: const Text('Crear nuevo colaborador'),
          onTap: () {
            Navigator.pop(ctx);
            crearColaboradorDialog(context, ref, obraId: obraId);
          },
        ),
        const Divider(),
        if (disponibles.isEmpty)
          const ListTile(title: Text('No hay colaboradores disponibles.'))
        else
          ...disponibles.map((c) => ListTile(
                leading: CircleAvatar(child: Text(inicialDe(c.nombre))),
                title: Text(c.nombre),
                subtitle:
                    Text(c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo'),
                onTap: () async {
                  await _asignar(ref, obraId: obraId, colaboradorId: c.id);
                  if (ctx.mounted) Navigator.pop(ctx);
                },
              )),
      ],
    ),
  );
}

/// Alta rápida de colaborador desde la obra: se crea y se asigna de una vez.
Future<void> crearColaboradorDialog(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
}) async {
  final puestos = ref.read(puestosProvider).asData?.value ?? [];
  if (puestos.isEmpty) {
    showAppSnack(context, 'Primero crea un puesto en Configuración.');
    return;
  }
  final nombreCtrl = TextEditingController();
  String puestoId = puestos.first.id;
  String tipoPago = 'DIA';
  final formKey = GlobalKey<FormState>();
  final id = const Uuid().v4();

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setS) => AlertDialog(
        title: const Text('Nuevo colaborador'),
        content: Form(
          key: formKey,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(
              controller: nombreCtrl,
              decoration: const InputDecoration(labelText: 'Nombre'),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Requerido' : null,
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: puestoId,
              decoration: const InputDecoration(labelText: 'Puesto'),
              items: puestos
                  .map((p) =>
                      DropdownMenuItem(value: p.id, child: Text(p.nombre)))
                  .toList(),
              onChanged: (v) => setS(() => puestoId = v ?? puestoId),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: tipoPago,
              decoration: const InputDecoration(labelText: 'Tipo de pago'),
              items: const [
                DropdownMenuItem(value: 'DIA', child: Text('Por día')),
                DropdownMenuItem(value: 'DESTAJO', child: Text('Por destajo')),
              ],
              onChanged: (v) => setS(() => tipoPago = v ?? 'DIA'),
            ),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              await ref
                  .read(colaboradorRepositoryProvider)
                  .upsert(ColaboradoresCompanion(
                    id: Value(id),
                    nombre: Value(nombreCtrl.text.trim()),
                    puestoId: Value(puestoId),
                    tipoPago: Value(tipoPago),
                    activo: const Value(true),
                  ));
              await _asignar(ref, obraId: obraId, colaboradorId: id);
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Crear y asignar'),
          ),
        ],
      ),
    ),
  );
}
