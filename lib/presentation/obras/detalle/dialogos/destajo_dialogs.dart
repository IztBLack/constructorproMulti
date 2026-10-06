/// Diálogos de DESTAJOS de la semana de nómina activa: la lista de destajos de
/// una persona (con su borrado) y el alta de uno nuevo.
///
/// Van en el mismo archivo porque son las dos mitades de la misma acción: el
/// botón «Agregar» de la lista cierra el diálogo y abre el alta.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/db/app_database.dart';
import '../../../../core/format/format.dart';
import '../../../../data/providers.dart';

/// Lista de destajos de [nombre] en la semana visible.
void destajosDialog(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
  required int inicioSemana,
  required String colaboradorId,
  required String nombre,
  required List<Destajo> destajos,
}) {
  final propios =
      destajos.where((d) => d.colaboradorId == colaboradorId).toList();
  showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Destajos — $nombre'),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (propios.isEmpty)
            const Padding(
                padding: EdgeInsets.all(8),
                child: Text('Sin destajos esta semana.'))
          else
            ...propios.map((d) => ListTile(
                  dense: true,
                  title: Text(d.concepto),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(Fmt.money(d.monto)),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, size: 20),
                      onPressed: () async {
                        await ref.read(destajoRepositoryProvider).delete(d.id);
                        if (ctx.mounted) Navigator.pop(ctx);
                      },
                    ),
                  ]),
                )),
        ]),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
        FilledButton.icon(
          onPressed: () {
            Navigator.pop(ctx);
            agregarDestajoDialog(context, ref,
                obraId: obraId,
                inicioSemana: inicioSemana,
                colaboradorId: colaboradorId);
          },
          icon: const Icon(Icons.add),
          label: const Text('Agregar'),
        ),
      ],
    ),
  );
}

/// Alta de un destajo. Se registra en el lunes de la semana activa.
Future<void> agregarDestajoDialog(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
  required int inicioSemana,
  required String colaboradorId,
}) async {
  final conceptoCtrl = TextEditingController();
  final montoCtrl = TextEditingController();
  final formKey = GlobalKey<FormState>();
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Agregar destajo'),
      content: Form(
        key: formKey,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextFormField(
            controller: conceptoCtrl,
            decoration: const InputDecoration(labelText: 'Concepto'),
            validator: (v) =>
                (v == null || v.trim().isEmpty) ? 'Requerido' : null,
          ),
          TextFormField(
            controller: montoCtrl,
            decoration: const InputDecoration(labelText: 'Monto (\$)'),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            validator: (v) {
              final d = double.tryParse((v ?? '').trim());
              return (d == null || d <= 0) ? 'Monto inválido' : null;
            },
          ),
        ]),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
        FilledButton(
          onPressed: () async {
            if (!formKey.currentState!.validate()) return;
            await ref.read(destajoRepositoryProvider).insert(
                  obraId: obraId,
                  colaboradorId: colaboradorId,
                  fecha: inicioSemana, // se registra en el lunes de la semana activa
                  concepto: conceptoCtrl.text.trim(),
                  monto: double.parse(montoCtrl.text.trim()),
                );
            if (ctx.mounted) Navigator.pop(ctx);
          },
          child: const Text('Guardar'),
        ),
      ],
    ),
  );
}
