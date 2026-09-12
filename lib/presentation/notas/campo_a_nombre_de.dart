import 'package:flutter/material.dart';

import '../../core/db/app_database.dart';

/// El campo «A nombre de» de una nota de obra: se escribe libre y va sugiriendo
/// gente del padrón (Supabase 0034).
///
/// Antes eran DOS controles —un texto obligatorio y un select «Ligada a»— y
/// eso obligaba a decidir dos veces lo mismo. Aquí el nombre es uno solo: si
/// coincide con alguien del padrón se guarda además su `colaborador_id`, y si
/// no, se guarda el puro nombre. El socio de un trato de palabra normalmente NO
/// está dado de alta, así que el texto libre es el caso normal, no la excepción.
///
/// Ligar la nota a un colaborador es solo un puntero al padrón: NO le da a esa
/// persona acceso a la nota (la policy de lectura de `nota_obra` sigue siendo
/// admin/supervisor/contador).
///
/// El nombre tampoco es obligatorio: la nota se puede abrir sin él y ponerlo
/// después, o nunca. De ahí el checkbox del apartado «Para», que solo aparece
/// mientras el campo está vacío porque es la única situación en que hay algo
/// que decidir: con nombre, el PDF siempre lo imprime.
class CampoANombreDe extends StatefulWidget {
  const CampoANombreDe({
    super.key,
    required this.controller,
    required this.colaboradores,
    this.colaboradorIdInicial,
    required this.onColaborador,
    required this.mostrarParaInicial,
    required this.onMostrarPara,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final List<Colaborador> colaboradores;

  /// Con quién viene ligada la nota, si es que lo está.
  final String? colaboradorIdInicial;

  /// Se llama con el id al elegir una sugerencia y con `null` al desligar.
  final ValueChanged<String?> onColaborador;

  final bool mostrarParaInicial;
  final ValueChanged<bool> onMostrarPara;

  final bool autofocus;

  @override
  State<CampoANombreDe> createState() => _CampoANombreDeState();
}

class _CampoANombreDeState extends State<CampoANombreDe> {
  final _foco = FocusNode();
  String? _colaboradorId;
  late bool _mostrarPara = widget.mostrarParaInicial;

  /// El nombre con el que se ligó, para saber cuándo el usuario lo editó a mano
  /// y la liga dejó de corresponder.
  String? _nombreLigado;

  @override
  void initState() {
    super.initState();
    _colaboradorId = widget.colaboradorIdInicial;
    _nombreLigado = _colaboradorId == null ? null : widget.controller.text;
    widget.controller.addListener(_alTeclear);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_alTeclear);
    _foco.dispose();
    super.dispose();
  }

  /// Teclear DESLIGA en cuanto el texto deja de ser el nombre con el que se
  /// eligió: una nota que dice «ORLANDO R.» pero apunta a otra ficha del padrón
  /// es peor que una sin ligar, porque nadie la revisaría.
  void _alTeclear() {
    final texto = widget.controller.text;
    if (_colaboradorId != null && texto.trim() != (_nombreLigado ?? '').trim()) {
      _colaboradorId = null;
      _nombreLigado = null;
      widget.onColaborador(null);
    }
    // El checkbox del apartado «Para» aparece y desaparece con el campo vacío.
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final vacio = widget.controller.text.trim().isEmpty;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Autocomplete<Colaborador>(
        // Se le pasan NUESTRO controller y foco: así el texto tecleado es
        // legible al guardar sin tener que sincronizar dos controllers.
        textEditingController: widget.controller,
        focusNode: _foco,
        displayStringForOption: (c) => c.nombre,
        optionsBuilder: (valor) {
          final q = normalizarNombre(valor.text);
          if (q.isEmpty) return const Iterable<Colaborador>.empty();
          return widget.colaboradores
              .where((c) => normalizarNombre(c.nombre).contains(q));
        },
        onSelected: (c) {
          _colaboradorId = c.id;
          _nombreLigado = c.nombre;
          widget.onColaborador(c.id);
          setState(() {});
        },
        fieldViewBuilder: (context, ctrl, foco, _) => TextField(
          controller: ctrl,
          focusNode: foco,
          autofocus: widget.autofocus,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(
            labelText: 'A nombre de',
            hintText: 'Ej. ORLANDO RAMOZ',
            helperText: _colaboradorId != null
                ? 'Ligada al padrón de colaboradores.'
                : 'Como lo conoces. No necesita estar dado de alta.',
            suffixIcon: _colaboradorId == null
                ? null
                : Icon(Icons.link, size: 18, color: cs.primary),
          ),
        ),
      ),
      if (vacio)
        _CasillaPara(
          valor: _mostrarPara,
          onChanged: (v) {
            setState(() => _mostrarPara = v);
            widget.onMostrarPara(v);
          },
        ),
    ]);
  }
}

/// El nombre de una nota tal como se lee EN PANTALLA: si está vacío sale un
/// asterisco gris, que quiere decir «por completar».
///
/// El asterisco es solo del móvil y de la web: al PDF NUNCA llega. Ahí el hueco
/// se resuelve con el apartado «Para», que se imprime con una raya o se quita,
/// según lo que haya decidido el dueño en [CampoANombreDe].
class NombreDeNota extends StatelessWidget {
  const NombreDeNota(this.destinatario, {super.key, this.style});

  final String destinatario;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final nombre = destinatario.trim();
    if (nombre.isNotEmpty) return Text(nombre, style: style);
    return Text(
      '*',
      style: (style ?? const TextStyle())
          .copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
      semanticsLabel: 'Sin nombre, por completar',
    );
  }
}

/// La casilla del apartado «Para». Va armada a mano en vez de con un
/// `CheckboxListTile` porque vive dentro de diálogos angostos, donde el ancho
/// intrínseco de un `ListTile` con subtítulo estira la ventana de más.
class _CasillaPara extends StatelessWidget {
  const _CasillaPara({required this.valor, required this.onChanged});

  final bool valor;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: () => onChanged(!valor),
      child: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Checkbox(
            value: valor,
            onChanged: (v) => onChanged(v ?? true),
            visualDensity: VisualDensity.compact,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Dejar el apartado «Para» en el PDF'),
              Text(
                valor
                    ? 'Sale con una raya, para llenarlo a mano.'
                    : 'No se imprime: el encabezado se cierra sin él.',
                style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Para comparar nombres como los lee una persona: sin mayúsculas, sin acentos
/// y sin espacios de más. Es lo que hace que «ramirez» encuentre a «Ramírez».
String normalizarNombre(String s) {
  var t = s.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  const acentos = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n',
  };
  acentos.forEach((k, v) => t = t.replaceAll(k, v));
  return t;
}
