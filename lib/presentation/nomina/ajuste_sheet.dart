import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';
import '../../domain/logic/proyeccion_nomina.dart';
import 'proyeccion_controller.dart';

/// Pide un monto en pesos.
///
/// Es un diálogo y no un campo dentro de la tabla a propósito. Un `TextField`
/// de 70 px metido en una tabla que se redibuja en cada toque trae dos
/// problemas: el controlador se recrea y el cursor salta, y en un teléfono el
/// blanco de toque queda por debajo del mínimo cómodo. Aquí el campo es ancho,
/// llega con el teclado numérico y con el valor preseleccionado para
/// sobrescribirlo de un tecleo.
Future<double?> pedirMonto(
  BuildContext context, {
  required String titulo,
  required String ayuda,
  required double inicial,
}) async {
  final ctrl = TextEditingController(
    text: inicial == 0 ? '' : inicial.toStringAsFixed(inicial % 1 == 0 ? 0 : 2),
  );
  ctrl.selection = TextSelection(baseOffset: 0, extentOffset: ctrl.text.length);

  final valor = await showDialog<double>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(titulo),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(ayuda, style: Theme.of(ctx).textTheme.bodySmall),
          const SizedBox(height: 14),
          TextField(
            controller: ctrl,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
            ],
            decoration: const InputDecoration(
              prefixText: r'$ ',
              border: OutlineInputBorder(),
            ),
            onSubmitted: (t) =>
                Navigator.pop(ctx, double.tryParse(t) ?? 0),
          ),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
        FilledButton(
          onPressed: () =>
              Navigator.pop(ctx, double.tryParse(ctrl.text) ?? 0),
          child: const Text('Guardar'),
        ),
      ],
    ),
  );
  ctrl.dispose();
  // Un monto negativo no significa nada aquí: el signo lo pone el TIPO de
  // ajuste, no el número (ver `AjusteProyeccion.monto`).
  return valor?.abs();
}

/// Alta o edición de un ajuste: destajo, anticipo o descuento.
///
/// Es la «opción adicional» que no estorba: no cambia la forma de la tabla ni
/// aparece en pantalla mientras no se use, y aplica igual a quien cobra por día
/// que a quien cobra a destajo.
Future<void> mostrarAjusteSheet(
  BuildContext context,
  WidgetRef ref, {
  required DestinoAjuste destino,
  required String destinoId,
  required String titulo,
  AjusteProyeccion? existente,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => Padding(
      // El teclado no debe tapar el campo de monto.
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: _AjusteForm(
        destino: destino,
        destinoId: destinoId,
        titulo: titulo,
        existente: existente,
      ),
    ),
  );
}

class _AjusteForm extends ConsumerStatefulWidget {
  const _AjusteForm({
    required this.destino,
    required this.destinoId,
    required this.titulo,
    this.existente,
  });

  final DestinoAjuste destino;
  final String destinoId;
  final String titulo;
  final AjusteProyeccion? existente;

  @override
  ConsumerState<_AjusteForm> createState() => _AjusteFormState();
}

class _AjusteFormState extends ConsumerState<_AjusteForm> {
  late TipoAjuste _tipo = widget.existente?.tipo ?? TipoAjuste.destajo;
  late RepartoAjuste _reparto =
      widget.existente?.reparto ?? RepartoAjuste.partesIguales;
  late final _monto = TextEditingController(
    text: widget.existente == null ? '' : widget.existente!.monto.toStringAsFixed(0),
  );
  late final _nota = TextEditingController(text: widget.existente?.nota ?? '');

  @override
  void dispose() {
    _monto.dispose();
    _nota.dispose();
    super.dispose();
  }

  double get _valor => double.tryParse(_monto.text)?.abs() ?? 0;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final esCuadrilla = widget.destino == DestinoAjuste.cuadrilla;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.existente == null ? 'Nuevo ajuste' : 'Editar ajuste',
              style: t.titleMedium),
          Text(esCuadrilla ? 'Cuadrilla ${widget.titulo}' : widget.titulo,
              style: t.bodySmall?.copyWith(color: c.textMuted)),
          const SizedBox(height: 16),

          SegmentedButton<TipoAjuste>(
            showSelectedIcon: false,
            segments: [
              for (final tipo in TipoAjuste.values)
                ButtonSegment(value: tipo, label: Text(tipo.label)),
            ],
            selected: {_tipo},
            onSelectionChanged: (s) => setState(() => _tipo = s.first),
          ),
          const SizedBox(height: 6),
          Text(_explicacion(_tipo),
              style: t.bodySmall?.copyWith(color: c.textMuted)),
          const SizedBox(height: 16),

          TextField(
            controller: _monto,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
            ],
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Monto',
              prefixText: r'$ ',
              border: const OutlineInputBorder(),
              helperText: _valor == 0
                  ? null
                  : _tipo.signo > 0
                      ? 'Suma ${Fmt.money(_valor)} a la raya'
                      : 'Baja ${Fmt.money(_valor)} de la raya',
              helperStyle: TextStyle(
                  color: _tipo.signo > 0 ? c.success : c.danger,
                  fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 12),

          TextField(
            controller: _nota,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Nota (opcional)',
              hintText: 'Colado de losa, préstamo, herramienta…',
              border: OutlineInputBorder(),
            ),
          ),

          if (esCuadrilla) ...[
            const SizedBox(height: 16),
            Text('¿Cómo se reparte?', style: t.labelLarge),
            RadioListTile<RepartoAjuste>(
              value: RepartoAjuste.partesIguales,
              // ignore: deprecated_member_use
              groupValue: _reparto,
              // ignore: deprecated_member_use
              onChanged: (v) => setState(() => _reparto = v!),
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: const Text('En partes iguales'),
              subtitle: const Text(
                  'Entre los miembros que están en la proyección.'),
            ),
            RadioListTile<RepartoAjuste>(
              value: RepartoAjuste.aLaCuadrilla,
              // ignore: deprecated_member_use
              groupValue: _reparto,
              // ignore: deprecated_member_use
              onChanged: (v) => setState(() => _reparto = v!),
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: const Text('Como renglón de la cuadrilla'),
              subtitle: const Text(
                  'Para cuando el maestro cobra el alzado y él reparte.'),
            ),
          ],

          const SizedBox(height: 18),
          Row(
            children: [
              if (widget.existente != null)
                TextButton(
                  onPressed: () {
                    ref
                        .read(proyeccionEstadoProvider.notifier)
                        .borrarAjuste(widget.existente!.id);
                    Navigator.pop(context);
                  },
                  child: Text('Quitar',
                      style: TextStyle(color: context.colores.danger)),
                ),
              const Spacer(),
              TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancelar')),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _valor <= 0 ? null : _guardar,
                child: const Text('Guardar'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _guardar() {
    final notifier = ref.read(proyeccionEstadoProvider.notifier);
    if (widget.existente != null) {
      notifier.guardarAjuste(widget.existente!.copyWith(
        tipo: _tipo,
        monto: _valor,
        nota: _nota.text.trim(),
        reparto: _reparto,
      ));
    } else {
      notifier.agregarAjuste(
        tipo: _tipo,
        destino: widget.destino,
        destinoId: widget.destinoId,
        monto: _valor,
        nota: _nota.text.trim(),
        reparto: _reparto,
      );
    }
    Navigator.pop(context);
  }

  String _explicacion(TipoAjuste tipo) => switch (tipo) {
        TipoAjuste.destajo =>
          'Trabajo a precio alzado que se paga ADEMÁS de los días.',
        TipoAjuste.anticipo => 'Dinero que ya se entregó a cuenta de esta raya.',
        TipoAjuste.descuento => 'Préstamo, herramienta o material a descontar.',
      };
}
