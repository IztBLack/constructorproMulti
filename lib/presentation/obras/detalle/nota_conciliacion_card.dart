/// Tarjeta editable de la nota de conciliación de caja, extraída del detalle de
/// obra. Vive sola porque es la única pieza de la pestaña Caja con estado
/// propio (un controller con ciclo de vida), y mezclarla con el resto del
/// listado obligaba a leer 80 líneas de `TextEditingController` para entender
/// la caja.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import '../../common/app_card.dart';
import '../../common/section_header.dart';

/// Tarjeta editable de la nota de conciliación de caja de una obra.
///
/// Se aísla en su propio widget con State por el ciclo de vida del
/// [TextEditingController]: el detalle de obra se reconstruye seguido (streams
/// de caja), y crear el controller en cada rebuild perdería el cursor y el
/// texto a medio escribir. Aquí el controller se crea UNA vez y se libera en
/// [dispose]. Guarda al perder el foco: escribir en cada tecla dispararía un
/// `pending` de sync por pulsación.
class NotaConciliacionCard extends ConsumerStatefulWidget {
  final String obraId;
  const NotaConciliacionCard({super.key, required this.obraId});

  @override
  ConsumerState<NotaConciliacionCard> createState() =>
      _NotaConciliacionCardState();
}

class _NotaConciliacionCardState extends ConsumerState<NotaConciliacionCard> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    // Guardar al salir del campo, no en cada tecla.
    _focus.addListener(() {
      if (!_focus.hasFocus) _guardar();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _guardar() {
    ref
        .read(obraCajaNotaRepositoryProvider)
        .upsert(widget.obraId, _controller.text);
  }

  @override
  Widget build(BuildContext context) {
    final notaAsync = ref.watch(obraCajaNotaProvider(widget.obraId));
    final nota = notaAsync.asData?.value?.nota ?? '';
    // Refleja el valor del store (carga inicial o llegada por sync) SIN pisar lo
    // que el usuario está escribiendo: solo si el campo no tiene el foco y el
    // texto realmente cambió (evita un bucle de rebuild al reasignar igual).
    if (!_focus.hasFocus && _controller.text != nota) {
      _controller.text = nota;
    }
    final c = context.colores;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(
            title: 'Nota de conciliación',
            description: 'Aclara el porqué del saldo (uso interno).',
          ),
          TextField(
            controller: _controller,
            focusNode: _focus,
            minLines: 2,
            maxLines: null,
            keyboardType: TextInputType.multiline,
            textCapitalization: TextCapitalization.sentences,
            onEditingComplete: _guardar,
            style: Theme.of(context).textTheme.bodyMedium,
            decoration: InputDecoration(
              hintText: 'Ej. DIFERENCIA A FAVOR \$20,957 CON…',
              hintStyle: TextStyle(color: c.textFaint),
              border: const OutlineInputBorder(),
            ),
          ),
        ],
      ),
    );
  }
}
