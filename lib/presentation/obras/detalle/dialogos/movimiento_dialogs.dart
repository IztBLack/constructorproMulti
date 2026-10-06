/// Todo lo que ALTA o BORRA movimientos de la caja de una obra: el formulario
/// de entrada/salida (con su autocompletado), el borrado de uno y el borrado
/// de todos.
///
/// Los tres van juntos porque comparten dueño (la lista de movimientos de la
/// pestaña Caja) y porque el autocompletado y la canonización de etiquetas son
/// privados de este archivo: nadie más los usa.
library;

import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/db/app_database.dart';
import '../../../../core/format/format.dart';
import '../../../../data/providers.dart';
import '../../../common/app_snackbar.dart';
import '../../../common/confirm_dialog.dart';

/// Formulario de nuevo movimiento ([tipo] es `'ENTRADA'` o `'SALIDA'`).
Future<void> nuevoMovimientoDialog(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
  required String tipo,
}) async {
  final conceptoCtrl = TextEditingController();
  final conceptoFocus = FocusNode();
  final nombreCtrl = TextEditingController();
  final nombreFocus = FocusNode();
  final montoCtrl = TextEditingController();
  String metodo = 'Transferencia';
  final formKey = GlobalKey<FormState>();

  // Sugerencias de autocompletado: valores DISTINTOS ya usados en esta obra.
  final movs =
      ref.read(movimientosPorObraProvider(obraId)).asData?.value ?? const [];
  const sentinelas = {
    'INGRESO_LIBRE',
    'GASTO_LIBRE',
    'NOMINA',
    'MATERIAL',
  };
  final nombresExistentes = <String>{
    for (final m in movs)
      if (m.nombre.trim().isNotEmpty) m.nombre.trim(),
  }.toList()
    ..sort();
  final categoriasExistentes = <String>{
    for (final m in movs)
      if (m.categoria.trim().isNotEmpty &&
          !sentinelas.contains(m.categoria.trim()))
        m.categoria.trim(),
    for (final m in movs)
      if (m.concepto.trim().isNotEmpty) m.concepto.trim(),
  }.toList()
    ..sort();

  // Para SALIDA: cargar partidas de la cotización de la obra (ligar gasto).
  Cotizacion? cot;
  List<Partida> partidasObra = const [];
  String? partidaId;
  if (tipo == 'SALIDA') {
    cot = await ref.read(cotizacionDeObraProvider(obraId).future);
    if (cot != null) {
      partidasObra = await ref.read(partidasDeCotizacionProvider(cot.id).future);
    }
  }
  if (!context.mounted) return;

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setS) => AlertDialog(
        title: Text(tipo == 'ENTRADA' ? 'Nueva entrada' : 'Nueva salida'),
        content: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              _autocompleteField(
                label: 'Concepto / Categoría',
                controller: conceptoCtrl,
                focusNode: conceptoFocus,
                opciones: categoriasExistentes,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Requerido' : null,
              ),
              _autocompleteField(
                label: tipo == 'ENTRADA'
                    ? 'De quién (opcional)'
                    : 'Beneficiario (opcional)',
                controller: nombreCtrl,
                focusNode: nombreFocus,
                opciones: nombresExistentes,
              ),
              TextFormField(
                controller: montoCtrl,
                decoration: const InputDecoration(labelText: 'Monto (\$)'),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  final d = double.tryParse((v ?? '').trim());
                  return (d == null || d <= 0) ? 'Monto inválido' : null;
                },
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: metodo,
                decoration: const InputDecoration(labelText: 'Método'),
                items: const [
                  DropdownMenuItem(
                      value: 'Transferencia', child: Text('Transferencia')),
                  DropdownMenuItem(value: 'Efectivo', child: Text('Efectivo')),
                  DropdownMenuItem(value: 'Cheque', child: Text('Cheque')),
                ],
                onChanged: (v) => setS(() => metodo = v ?? 'Transferencia'),
              ),
              if (tipo == 'SALIDA' && partidasObra.isNotEmpty) ...[
                const SizedBox(height: 8),
                DropdownButtonFormField<String?>(
                  initialValue: partidaId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                      labelText: 'Ligar a partida (opcional)'),
                  items: [
                    const DropdownMenuItem(
                        value: null, child: Text('Sin ligar')),
                    ...partidasObra.map((p) => DropdownMenuItem(
                          value: p.id,
                          child: Text(p.descripcion,
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        )),
                  ],
                  onChanged: (v) => setS(() => partidaId = v),
                ),
              ],
            ]),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              final partida = partidaId == null
                  ? null
                  : partidasObra.firstWhereOrNull((p) => p.id == partidaId);
              // Canoniza a la etiqueta existente (case/acento-insensible) para
              // que las cubetas de "Recibido por tipo" / "Pagado por persona"
              // no se fragmenten; permite texto nuevo libre.
              final concepto =
                  _canonizar(conceptoCtrl.text, categoriasExistentes);
              final nombre = _canonizar(nombreCtrl.text, nombresExistentes);
              await ref.read(movimientoRepositoryProvider).add(
                    obraId: obraId,
                    fecha: DateTime.now().millisecondsSinceEpoch,
                    tipo: tipo,
                    // categoria = concepto: la caja agrupa entradas por
                    // categoria (igual que el import de estado de cuenta).
                    categoria: concepto,
                    concepto: concepto,
                    monto: double.parse(montoCtrl.text.trim()),
                    metodoPago: metodo,
                    nombre: nombre,
                    cotizacionId: partida != null ? cot?.id : null,
                    seccionId: partida?.seccionId,
                    partidaId: partida?.id,
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

/// Campo de texto con autocompletado sobre [opciones] (valores existentes de
/// la obra). Matching case/acento-insensible; se permite texto libre nuevo.
Widget _autocompleteField({
  required String label,
  required TextEditingController controller,
  required FocusNode focusNode,
  required List<String> opciones,
  String? Function(String?)? validator,
}) {
  return Autocomplete<String>(
    // Usa NUESTRO controller/focus: así el valor tecleado es legible al
    // guardar sin sincronizar controllers internos.
    textEditingController: controller,
    focusNode: focusNode,
    optionsBuilder: (TextEditingValue value) {
      final q = _normAccent(value.text);
      if (q.isEmpty) return const Iterable<String>.empty();
      return opciones.where((o) => _normAccent(o).contains(q));
    },
    fieldViewBuilder: (context, textCtrl, textFocus, onSubmit) {
      return TextFormField(
        controller: textCtrl,
        focusNode: textFocus,
        decoration: InputDecoration(labelText: label),
        validator: validator,
      );
    },
  );
}

/// Normaliza para comparar: minúsculas, sin acentos, espacios colapsados.
String _normAccent(String s) {
  var t = s.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  const acentos = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n',
  };
  acentos.forEach((k, v) => t = t.replaceAll(k, v));
  return t;
}

/// Si [typed] coincide (case/acento-insensible) con una opción existente,
/// devuelve la etiqueta canónica existente; si no, el texto recortado.
String _canonizar(String typed, List<String> existentes) {
  final t = typed.trim();
  if (t.isEmpty) return '';
  final norm = _normAccent(t);
  for (final e in existentes) {
    if (_normAccent(e) == norm) return e;
  }
  return t;
}

/// Borra UN movimiento, SIEMPRE pidiendo confirmar y avisando que no se puede
/// deshacer.
///
/// Antes borraba al instante y ofrecía "Deshacer" (el borrado es SUAVE y
/// reversible). El dueño pidió lo contrario: en su operación un movimiento
/// borrado por error puede pasar inadvertido cuando el aviso de "Deshacer" ya
/// desapareció, así que prefiere el freno de un diálogo en cada borrado.
/// Reutilizamos `confirmDialog` (el mismo helper con el que se borra la obra),
/// con el monto en el mensaje y la advertencia de que la acción es
/// irreversible.
Future<void> eliminarMovimientoDialog(
    BuildContext context, WidgetRef ref, Movimiento m) async {
  final ok = await confirmDialog(
    context,
    title: 'Eliminar movimiento',
    message: 'Se eliminará el movimiento de ${Fmt.money(m.monto)}'
        '${m.concepto.trim().isEmpty ? '' : ' («${m.concepto}»)'}.\n\n'
        'Esta acción NO se puede deshacer.',
    actionLabel: 'Eliminar',
    destructive: true,
  );
  if (!ok) return;
  await ref.read(movimientoRepositoryProvider).delete(m.id);
  if (context.mounted) showAppSnack(context, 'Movimiento eliminado.');
}

/// Borra TODOS los movimientos de la obra. Es mucho más destructivo que borrar
/// uno, así que además del aviso de irreversibilidad exige un paso extra:
/// escribir la palabra "BORRAR". Es el mismo patrón de la "Zona de peligro" de
/// Configuración, replicado aquí a propósito porque aquel helper (`_dangerConfirm`)
/// es privado de esa pantalla.
Future<void> borrarTodosMovsDialog(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
  required int cantidad,
}) async {
  final ctrl = TextEditingController();
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Borrar todos los movimientos'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('Se borrarán los $cantidad movimientos de esta obra.\n'
            'Esta acción es IRREVERSIBLE.\n\n'
            'Escribe "BORRAR" para confirmar.'),
        const SizedBox(height: 12),
        TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'BORRAR'),
        ),
      ]),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar')),
        FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirmar')),
      ],
    ),
  );
  if (ok != true) return;
  if (ctrl.text.trim().toUpperCase() != 'BORRAR') {
    if (context.mounted) {
      showAppSnack(context, 'La palabra no coincide. Cancelado.');
    }
    return;
  }
  final n = await ref.read(movimientoRepositoryProvider).deleteAllByObra(obraId);
  if (context.mounted) showAppSnack(context, '$n movimiento(s) eliminados.');
}
