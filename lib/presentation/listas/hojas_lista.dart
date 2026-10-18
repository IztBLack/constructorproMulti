import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/db/app_database.dart';
import '../../core/theme/app_colors.dart';
import '../../domain/listas/leer_nota_material.dart';
import '../../domain/listas/listas_calculo.dart';

/// Hojas de captura de las listas de material: datos de la lista, un renglón y
/// «Pegar nota». Todas son hojas inferiores que suben con el teclado.

/// Lee una medida como se escribe en la obra: «10:45», «10,45» o «10.45».
/// Null si está vacía o no es un número.
double? leerMedida(String texto) {
  final t = texto.trim().replaceAll(':', '.').replaceAll(',', '.');
  if (t.isEmpty) return null;
  return double.tryParse(t);
}

Future<T?> _hoja<T>(BuildContext context, Widget Function(BuildContext) build) =>
    showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: build(ctx),
        ),
      ),
    );

Widget _titulo(BuildContext context, String texto) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Text(texto, style: Theme.of(context).textTheme.titleLarge),
    );

const _teclado = TextInputType.numberWithOptions(decimal: true);

// ── Datos de la lista ─────────────────────────────────────────────────────

class DatosLista {
  const DatosLista({required this.titulo, required this.plano, this.notas = ''});
  final String titulo;
  final String plano;
  final String notas;
}

Future<DatosLista?> mostrarHojaDatosLista(BuildContext context,
        {ListaMaterialRow? actual}) =>
    _hoja(context, (_) => _HojaDatosLista(actual: actual));

class _HojaDatosLista extends StatefulWidget {
  const _HojaDatosLista({this.actual});
  final ListaMaterialRow? actual;

  @override
  State<_HojaDatosLista> createState() => _HojaDatosListaState();
}

class _HojaDatosListaState extends State<_HojaDatosLista> {
  late final _nombre = TextEditingController(text: widget.actual?.titulo);
  late final _plano = TextEditingController(text: widget.actual?.plano);
  late final _notas = TextEditingController(text: widget.actual?.notas);

  @override
  void dispose() {
    _nombre.dispose();
    _plano.dispose();
    _notas.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final nueva = widget.actual == null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        _titulo(context, nueva ? 'Nueva lista' : 'Datos de la lista'),
        TextField(
          controller: _nombre,
          autofocus: nueva,
          textCapitalization: TextCapitalization.sentences,
          maxLength: 200,
          decoration: const InputDecoration(
            labelText: 'Nombre de la lista',
            hintText: 'Ej. Trabes y pasillo planta alta',
          ),
        ),
        TextField(
          controller: _plano,
          maxLength: 60,
          decoration: const InputDecoration(
            labelText: 'Plano (opcional)',
            hintText: 'Clave u hoja del plano, ej. E-03',
          ),
        ),
        if (!nueva)
          TextField(
            controller: _notas,
            minLines: 2,
            maxLines: 5,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Notas (salen en el PDF)',
            ),
          ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: () => Navigator.pop(
            context,
            DatosLista(
              titulo: _nombre.text.trim(),
              plano: _plano.text.trim(),
              notas: _notas.text.trim(),
            ),
          ),
          child: Text(nueva ? 'Crear lista' : 'Guardar'),
        ),
      ],
    );
  }
}

// ── Un renglón ────────────────────────────────────────────────────────────

class RenglonEditado {
  const RenglonEditado({
    required this.seccion,
    required this.tipo,
    required this.cantidad,
    this.largo,
    this.separacionCm,
    this.unidad = '',
    this.descripcion = '',
    this.nota = '',
    this.borrar = false,
  });

  /// Quien llama borra el renglón (con «Deshacer»).
  const RenglonEditado.borrar()
      : this(seccion: '', tipo: TipoRenglonLista.libre, cantidad: 0, borrar: true);

  final String seccion;
  final TipoRenglonLista tipo;
  final double cantidad;
  final double? largo;
  final double? separacionCm;
  final String unidad;
  final String descripcion;
  final String nota;
  final bool borrar;
}

Future<RenglonEditado?> mostrarHojaRenglon(
  BuildContext context, {
  ListaMaterialRenglonRow? actual,
  List<String> secciones = const [],
  String seccionInicial = '',
}) =>
    _hoja(
      context,
      (_) => _HojaRenglon(
        actual: actual,
        secciones: secciones,
        seccionInicial: seccionInicial,
      ),
    );

class _HojaRenglon extends StatefulWidget {
  const _HojaRenglon({
    this.actual,
    required this.secciones,
    required this.seccionInicial,
  });

  final ListaMaterialRenglonRow? actual;
  final List<String> secciones;
  final String seccionInicial;

  @override
  State<_HojaRenglon> createState() => _HojaRenglonState();
}

class _HojaRenglonState extends State<_HojaRenglon> {
  late TipoRenglonLista _tipo = widget.actual == null
      ? TipoRenglonLista.pieza
      : tipoRenglonListaDeCadena(widget.actual!.tipo);
  late final _seccion =
      TextEditingController(text: widget.actual?.seccion ?? widget.seccionInicial);
  late final _cantidad = TextEditingController(
      text: widget.actual == null ? '' : numeroCorto(widget.actual!.cantidad));
  late final _largo = TextEditingController(
      text: widget.actual?.largo == null ? '' : metros2(widget.actual!.largo!));
  late final _separacion = TextEditingController(
      text: widget.actual?.separacionCm == null
          ? ''
          : numeroCorto(widget.actual!.separacionCm!));
  late final _unidad = TextEditingController(text: widget.actual?.unidad);
  late final _descripcion =
      TextEditingController(text: widget.actual?.descripcion);
  late final _nota = TextEditingController(text: widget.actual?.nota);
  String? _error;

  @override
  void dispose() {
    for (final c in [
      _seccion, _cantidad, _largo, _separacion, _unidad, _descripcion, _nota,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _pieza => _tipo == TipoRenglonLista.pieza;

  /// Lo que la cuenta da con lo escrito hasta ahora, o null si no hay base.
  String? _resultado() {
    final cantidad = leerMedida(_cantidad.text);
    if (!_pieza || cantidad == null) return null;
    final calc = RenglonListaCalc(
      tipo: _tipo,
      cantidad: cantidad,
      largo: leerMedida(_largo.text),
      separacionCm: leerMedida(_separacion.text),
    );
    final metros = metrosLineales(calc);
    final porPieza = estribosPorPieza(calc.largo, calc.separacionCm);
    final partes = [
      if (metros != null) '${metros2(metros)} m lineales',
      if (porPieza != null) '$porPieza estribos por pieza',
    ];
    return partes.isEmpty ? null : partes.join(' · ');
  }

  void _guardar() {
    final cantidad = leerMedida(_cantidad.text);
    final largo = leerMedida(_largo.text);
    final separacion = leerMedida(_separacion.text);
    String? error;
    if (cantidad == null || cantidad <= 0) {
      error = 'Escribe la cantidad.';
    } else if (_pieza && _largo.text.trim().isNotEmpty &&
        (largo == null || largo <= 0 || largo >= 1000)) {
      error = 'El largo va en metros, por ejemplo 10.45.';
    } else if (_pieza && _separacion.text.trim().isNotEmpty &&
        (separacion == null || separacion <= 0 || separacion >= 1000)) {
      error = 'La separación de estribos va en centímetros, por ejemplo 25.';
    } else if (!_pieza && _descripcion.text.trim().isEmpty) {
      error = 'Escribe qué material es.';
    }
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    Navigator.pop(
      context,
      RenglonEditado(
        seccion: _seccion.text.trim(),
        tipo: _tipo,
        cantidad: cantidad!,
        largo: _pieza ? largo : null,
        separacionCm: _pieza ? separacion : null,
        unidad: _pieza ? '' : _unidad.text.trim(),
        descripcion: _pieza ? '' : _descripcion.text.trim(),
        nota: _nota.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final texto = Theme.of(context).textTheme;
    final resultado = _resultado();
    final otrasSecciones = widget.secciones
        .where((s) => s.isNotEmpty && s != _seccion.text.trim())
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        _titulo(context, widget.actual == null ? 'Agregar' : 'Editar renglón'),
        SegmentedButton<TipoRenglonLista>(
          segments: const [
            ButtonSegment(
              value: TipoRenglonLista.pieza,
              label: Text('Piezas'),
              icon: Icon(Icons.straighten),
            ),
            ButtonSegment(
              value: TipoRenglonLista.libre,
              label: Text('Material suelto'),
              icon: Icon(Icons.inventory_2_outlined),
            ),
          ],
          selected: {_tipo},
          onSelectionChanged: (s) => setState(() {
            _tipo = s.first;
            _error = null;
          }),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _seccion,
          textCapitalization: TextCapitalization.sentences,
          maxLength: 120,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Sección',
            hintText: 'Ej. Trabes, Pasillo, Castillos',
          ),
        ),
        if (otrasSecciones.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              for (final s in otrasSecciones)
                ActionChip(
                  label: Text(s),
                  onPressed: () => setState(() => _seccion.text = s),
                ),
            ],
          ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _cantidad,
                autofocus: widget.actual == null,
                keyboardType: _teclado,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: _pieza ? 'Piezas' : 'Cantidad',
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _pieza
                  ? TextField(
                      controller: _largo,
                      keyboardType: _teclado,
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Largo',
                        suffixText: 'm',
                        hintText: '10.45',
                      ),
                    )
                  : TextField(
                      controller: _unidad,
                      maxLength: 20,
                      decoration: const InputDecoration(
                        labelText: 'Unidad',
                        hintText: 'bultos, kg, pzas',
                      ),
                    ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_pieza)
          TextField(
            controller: _separacion,
            keyboardType: _teclado,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Estribos a cada (opcional)',
              suffixText: 'cm',
              helperText: 'Como lo marca el plano',
            ),
          )
        else
          TextField(
            controller: _descripcion,
            maxLength: 300,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Material',
              hintText: 'Ej. cemento gris, arena, alambre recocido',
            ),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _nota,
          maxLength: 500,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Nota (opcional)',
            hintText: 'Ej. chica',
          ),
        ),
        if (resultado != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(resultado,
                style: texto.bodyMedium?.copyWith(
                  color: c.textStrong,
                  fontFeatures: const [FontFeature.tabularFigures()],
                )),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!,
                style: texto.bodyMedium?.copyWith(color: c.danger)),
          ),
        FilledButton(onPressed: _guardar, child: const Text('Guardar')),
        if (widget.actual != null)
          TextButton(
            style: TextButton.styleFrom(foregroundColor: c.danger),
            onPressed: () =>
                Navigator.pop(context, const RenglonEditado.borrar()),
            child: const Text('Borrar renglón'),
          ),
      ],
    );
  }
}

// ── Pegar nota ────────────────────────────────────────────────────────────

/// Pega la nota de WhatsApp, enseña cómo se entendió cada línea y devuelve
/// los renglones a guardar. Lo dudoso se marca, nunca se tira.
Future<List<RenglonLeido>?> mostrarHojaPegarNota(BuildContext context,
        {String seccionInicial = ''}) =>
    _hoja(context, (_) => _HojaPegarNota(seccionInicial: seccionInicial));

class _HojaPegarNota extends StatefulWidget {
  const _HojaPegarNota({required this.seccionInicial});
  final String seccionInicial;

  @override
  State<_HojaPegarNota> createState() => _HojaPegarNotaState();
}

class _HojaPegarNotaState extends State<_HojaPegarNota> {
  final _texto = TextEditingController();
  List<RenglonLeido> _leidos = const [];

  @override
  void initState() {
    super.initState();
    _desdePortapapeles();
  }

  /// Si lo copiado parece una nota (tiene números), se pone solo.
  Future<void> _desdePortapapeles() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final t = data?.text ?? '';
    if (!mounted || _texto.text.isNotEmpty || !RegExp(r'\d').hasMatch(t)) {
      return;
    }
    _texto.text = t;
    _leer();
  }

  void _leer() => setState(() => _leidos = leerNotaMaterial(_texto.text,
      seccionInicial: widget.seccionInicial));

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  String _interpretacion(RenglonLeido r) {
    if (r.tipo == TipoRenglonLista.pieza) {
      return [
        '${numeroCorto(r.cantidad)} × ${r.largo != null ? '${metros2(r.largo!)} m' : '?'}',
        if (r.separacionCm != null) 'estribo @${numeroCorto(r.separacionCm!)}',
        if (r.nota.isNotEmpty) r.nota,
      ].join(' · ');
    }
    return [numeroCorto(r.cantidad), r.unidad, r.descripcion]
        .where((s) => s.isNotEmpty)
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final texto = Theme.of(context).textTheme;
    final dudas = _leidos.where((r) => r.duda != null).length;
    final grupos = agruparPorSeccion(_leidos, (r) => r.seccion);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        _titulo(context, 'Pegar nota'),
        Text(
          'Una pieza por renglón: «4 10:45» son 4 piezas de 10.45 m. Una línea '
          'sin números es el nombre de la sección («Trabes»).',
          style: texto.bodyMedium?.copyWith(color: c.textMuted),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _texto,
          minLines: 5,
          maxLines: 12,
          onChanged: (_) => _leer(),
          decoration: const InputDecoration(
            labelText: 'Nota',
            hintText: 'Trabes\n4 10:45\n2 12:25\nPasillo\n2 3:55 estribo 25',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: 16),
        if (_leidos.isNotEmpty) ...[
          Text('Así se entendió', style: texto.labelLarge?.copyWith(color: c.textMuted)),
          const SizedBox(height: 8),
          for (final (seccion, renglones) in grupos) ...[
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 4),
              child: Text(seccion.isEmpty ? 'Sin sección' : seccion,
                  style: texto.titleSmall),
            ),
            for (final r in renglones)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      r.duda == null ? Icons.check_circle_outline : Icons.help_outline,
                      size: 20,
                      color: r.duda == null ? c.success : c.warning,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_interpretacion(r), style: texto.bodyLarge),
                          Text('«${r.linea}»',
                              style: texto.bodySmall?.copyWith(color: c.textMuted)),
                          if (r.duda != null)
                            Text('Revisa: ${r.duda}',
                                style: texto.bodySmall?.copyWith(color: c.textStrong)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (dudas > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                dudas == 1
                    ? '1 renglón para revisar: se guarda igual y lo corriges con el lápiz.'
                    : '$dudas renglones para revisar: se guardan igual y los corriges con el lápiz.',
                style: texto.bodyMedium?.copyWith(color: c.textStrong),
              ),
            ),
          const SizedBox(height: 12),
        ],
        FilledButton(
          onPressed:
              _leidos.isEmpty ? null : () => Navigator.pop(context, _leidos),
          child: Text(_leidos.isEmpty
              ? 'Agregar'
              : 'Agregar ${_leidos.length} '
                  '${_leidos.length == 1 ? 'renglón' : 'renglones'}'),
        ),
      ],
    );
  }
}
