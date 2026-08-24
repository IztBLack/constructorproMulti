import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/sync/cloud_providers.dart';
import '../../data/providers.dart';
import '../../data/repositories_nota_obra.dart';
import '../../domain/logic/notas_obra_calculo.dart';
import '../../pdf/pdf_service.dart';
import '../common/confirm_dialog.dart';
import '../pdf_preview_screen.dart';

/// Editor de una NOTA DE OBRA. Gemelo de `/admin/obras/[id]/notas/[notaId]`.
///
/// Cada renglón se guarda solo, como las partidas del presupuesto: una nota se
/// captura a ratos y obligar a guardar todo de golpe obliga a terminarla de una
/// sentada. Los totales se recalculan en vivo con el mismo módulo que usa la
/// web, así que la cuenta es la misma en los dos lados.
class NotaObraDetailScreen extends ConsumerWidget {
  const NotaObraDetailScreen({
    super.key,
    required this.notaId,
    required this.obraNombre,
  });

  final String notaId;
  final String obraNombre;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notaObraProvider(notaId));

    return async.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('No se pudo cargar la nota.\n$e')),
      ),
      data: (nota) {
        if (nota == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Esta nota ya no existe.')),
          );
        }
        return _Editor(nota: nota, obraNombre: obraNombre);
      },
    );
  }
}

class _Editor extends ConsumerWidget {
  const _Editor({required this.nota, required this.obraNombre});

  final NotaConRenglones nota;
  final String obraNombre;

  NotaObraRepository _repo(WidgetRef ref) => ref.read(notaObraRepositoryProvider);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final t = nota.totales;
    final liquidada = estadoNotaDeCadena(nota.nota.estado) == EstadoNota.liquidada;

    return Scaffold(
      appBar: AppBar(
        title: Text(nota.nota.destinatario.isEmpty
            ? 'Nota'
            : nota.nota.destinatario),
        actions: [
          IconButton(
            icon: const Icon(Icons.picture_as_pdf),
            tooltip: 'PDF para compartir',
            onPressed: () => _exportarPdf(context, ref),
          ),
          PopupMenuButton<String>(
            onSelected: (v) async {
              switch (v) {
                case 'encabezado':
                  await _editarEncabezado(context, ref);
                case 'estado':
                  await _repo(ref).actualizar(NotaObraCompanion(
                    id: Value(nota.nota.id),
                    estado: Value(estadoNotaACadena(
                        liquidada ? EstadoNota.abierta : EstadoNota.liquidada)),
                    updatedAt: Value(DateTime.now().millisecondsSinceEpoch),
                  ));
                case 'eliminar':
                  await _eliminar(context, ref);
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'encabezado', child: Text('Editar datos')),
              PopupMenuItem(
                  value: 'estado',
                  child: Text(liquidada
                      ? 'Marcar como abierta'
                      : 'Marcar como liquidada')),
              const PopupMenuItem(value: 'eliminar', child: Text('Eliminar nota')),
            ],
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
        children: [
          _Encabezado(nota: nota, obraNombre: obraNombre, liquidada: liquidada),
          const SizedBox(height: 12),

          if (nota.renglones.isEmpty)
            Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Center(
                  child: Text('La nota está vacía. Agrega el primer trabajo acordado.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: cs.onSurfaceVariant)),
                ),
              ),
            )
          else
            Card(
              margin: EdgeInsets.zero,
              child: ReorderableListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                itemCount: nota.renglones.length,
                onReorder: (viejo, nuevo) => _reordenar(ref, viejo, nuevo),
                itemBuilder: (context, i) {
                  final r = nota.renglones[i];
                  return _FilaRenglon(
                    key: ValueKey(r.id),
                    indice: i,
                    renglon: r,
                    onEditar: () => _editarRenglon(context, ref, r),
                    onEliminar: () => _repo(ref).eliminarRenglon(r.id),
                  );
                },
              ),
            ),

          const SizedBox(height: 12),
          _Cuentas(totales: t),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'fabRenglon',
        onPressed: () => _editarRenglon(context, ref, null),
        icon: const Icon(Icons.add),
        label: const Text('Renglón'),
      ),
    );
  }

  /// `ReorderableListView` entrega el índice destino contando la lista SIN el
  /// elemento arrastrado cuando se mueve hacia abajo; de ahí el ajuste.
  Future<void> _reordenar(WidgetRef ref, int viejo, int nuevo) async {
    final ids = nota.renglones.map((r) => r.id).toList();
    if (nuevo > viejo) nuevo -= 1;
    final movido = ids.removeAt(viejo);
    ids.insert(nuevo, movido);
    await _repo(ref).reordenarRenglones(ids);
  }

  Future<void> _eliminar(BuildContext context, WidgetRef ref) async {
    final ok = await confirmDialog(
      context,
      title: 'Eliminar nota',
      message: '¿Eliminar la nota de ${nota.nota.destinatario}? '
          'No se puede deshacer.',
    );
    if (!ok) return;
    await _repo(ref).eliminar(nota.nota.id);
    if (context.mounted) Navigator.of(context).pop();
  }

  Future<void> _editarEncabezado(BuildContext context, WidgetRef ref) async {
    final destinatario = TextEditingController(text: nota.nota.destinatario);
    final titulo = TextEditingController(text: nota.nota.titulo);
    final pie = TextEditingController(text: nota.nota.notas);

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Datos de la nota'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
              controller: destinatario,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'A nombre de'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: titulo,
              decoration: const InputDecoration(
                  labelText: 'Título', hintText: 'Ej. MZ 2 LT 1'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: pie,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Nota al pie',
                helperText: 'Sale impresa en el PDF.',
              ),
            ),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Guardar')),
        ],
      ),
    );
    if (ok != true) return;

    await _repo(ref).actualizar(NotaObraCompanion(
      id: Value(nota.nota.id),
      destinatario: Value(destinatario.text.trim()),
      titulo: Value(titulo.text.trim()),
      notas: Value(pie.text.trim()),
      updatedAt: Value(DateTime.now().millisecondsSinceEpoch),
    ));
  }

  Future<void> _editarRenglon(
      BuildContext context, WidgetRef ref, NotaObraRenglonRow? actual) async {
    final resultado = await showModalBottomSheet<_DatosRenglon>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _HojaRenglon(actual: actual),
    );
    if (resultado == null) return;

    if (actual == null) {
      final empresaId = ref.read(empresaIdProvider);
      if (empresaId == null) return;
      await _repo(ref).agregarRenglon(
        notaId: nota.nota.id,
        empresaId: empresaId,
        tipo: resultado.tipo,
        etiqueta: resultado.etiqueta,
        monto: resultado.monto,
        montoBase: resultado.montoBase,
        porcentaje: resultado.porcentaje,
        texto: resultado.texto,
        orden: (nota.renglones.length + 1) * pasoOrdenRenglon,
      );
    } else {
      await _repo(ref).actualizarRenglon(NotaObraRenglonCompanion(
        id: Value(actual.id),
        tipo: Value(tipoRenglonACadena(resultado.tipo)),
        etiqueta: Value(resultado.etiqueta),
        monto: Value(resultado.monto),
        montoBase: Value(resultado.montoBase),
        porcentaje: Value(resultado.porcentaje),
        texto: Value(resultado.texto),
        updatedAt: Value(DateTime.now().millisecondsSinceEpoch),
      ));
    }
  }

  Future<void> _exportarPdf(BuildContext context, WidgetRef ref) async {
    final config = await ref.read(pdfConfigEfectivaProvider.future);
    final bytes = await PdfService.notaObra(
      nota: nota,
      obraNombre: obraNombre,
      config: config,
      textosEmpresa: ref.read(textosPdfProvider),
    );
    if (!context.mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PdfPreviewScreen(
        bytes: bytes,
        titulo: 'Nota',
        filename: 'nota.pdf',
      ),
    ));
  }
}

// ── Encabezado ────────────────────────────────────────────────────────────

class _Encabezado extends StatelessWidget {
  const _Encabezado({
    required this.nota,
    required this.obraNombre,
    required this.liquidada,
  });

  final NotaConRenglones nota;
  final String obraNombre;
  final bool liquidada;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text(
                [obraNombre, if (nota.nota.titulo.isNotEmpty) nota.nota.titulo]
                    .join(' · '),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            if (liquidada)
              Chip(
                label: const Text('Liquidada', style: TextStyle(fontSize: 11)),
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                backgroundColor: cs.tertiaryContainer,
                side: BorderSide.none,
              ),
          ]),
          const SizedBox(height: 4),
          Text(Fmt.date(nota.nota.fecha),
              style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          if (nota.nota.notas.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(nota.nota.notas, style: TextStyle(color: cs.onSurfaceVariant)),
          ],
        ]),
      ),
    );
  }
}

// ── Una fila ──────────────────────────────────────────────────────────────

class _FilaRenglon extends StatelessWidget {
  const _FilaRenglon({
    super.key,
    required this.indice,
    required this.renglon,
    required this.onEditar,
    required this.onEliminar,
  });

  final int indice;
  final NotaObraRenglonRow renglon;
  final VoidCallback onEditar;
  final VoidCallback onEliminar;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tipo = tipoRenglonDeCadena(renglon.tipo);
    final calc = RenglonCalc(
      tipo: tipo,
      monto: renglon.monto,
      montoBase: renglon.montoBase,
      porcentaje: renglon.porcentaje,
    );
    final negativo = tipo == TipoRenglon.deduccion || tipo == TipoRenglon.pago;

    final detalle = <String>[
      if (renglon.texto.isNotEmpty) renglon.texto,
      if (renglon.montoBase != null)
        '${Fmt.money(renglon.montoBase!)}'
            '${renglon.porcentaje != null ? ' − ${renglon.porcentaje!.toStringAsFixed(0)}%' : ''}'
            ' = ${Fmt.money(montoEfectivo(calc))}',
    ];

    return ListTile(
      key: ValueKey('tile-${renglon.id}'),
      dense: true,
      leading: ReorderableDragStartListener(
        index: indice,
        child: Icon(Icons.drag_handle, color: cs.outline),
      ),
      title: Text(renglon.etiqueta,
          style: const TextStyle(fontWeight: FontWeight.w500)),
      subtitle: detalle.isEmpty ? null : Text(detalle.join(' · ')),
      trailing: tipo == TipoRenglon.texto
          ? null
          : Text(
              '${negativo ? '−' : ''}${Fmt.money(montoEfectivo(calc))}',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: negativo ? cs.error : null,
              ),
            ),
      onTap: onEditar,
      onLongPress: onEliminar,
    );
  }
}

// ── Cuentas ───────────────────────────────────────────────────────────────

class _Cuentas extends StatelessWidget {
  const _Cuentas({required this.totales});

  final TotalesNota totales;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    Widget fila(String etiqueta, double valor,
            {bool fuerte = false, Color? color}) =>
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(etiqueta,
                style: TextStyle(fontWeight: fuerte ? FontWeight.bold : null)),
            Text(Fmt.money(valor),
                style: TextStyle(
                    fontWeight: fuerte ? FontWeight.bold : null, color: color)),
          ]),
        );

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(children: [
          fila('Suma de conceptos', totales.subtotal),
          if (totales.deducciones > 0)
            fila('Deducciones', -totales.deducciones, color: cs.error),
          const Divider(),
          fila('TOTAL', totales.total, fuerte: true),
          if (totales.totalFijado)
            _Aclaracion('Fijado a mano · calculado ${Fmt.money(totales.totalCalculado)}'),
          fila('Pagado', -totales.pagado, color: cs.primary),
          const Divider(),
          fila('SALDO', totales.saldo, fuerte: true),
          if (totales.saldoFijado)
            _Aclaracion('Fijado a mano · calculado ${Fmt.money(totales.saldoCalculado)}'),
        ]),
      ),
    );
  }
}

/// Cuando un total se fijó a mano se enseña también el calculado: la diferencia
/// entre los dos suele ser justo lo que hay que poder explicar de frente.
class _Aclaracion extends StatelessWidget {
  const _Aclaracion(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerRight,
        child: Text(texto,
            style: TextStyle(
                fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
      );
}

// ── Hoja de captura de un renglón ─────────────────────────────────────────

class _DatosRenglon {
  const _DatosRenglon({
    required this.tipo,
    required this.etiqueta,
    this.monto,
    this.montoBase,
    this.porcentaje,
    this.texto = '',
  });

  final TipoRenglon tipo;
  final String etiqueta;
  final double? monto;
  final double? montoBase;
  final double? porcentaje;
  final String texto;
}

class _HojaRenglon extends StatefulWidget {
  const _HojaRenglon({this.actual});
  final NotaObraRenglonRow? actual;

  @override
  State<_HojaRenglon> createState() => _HojaRenglonState();
}

class _HojaRenglonState extends State<_HojaRenglon> {
  late TipoRenglon _tipo = tipoRenglonDeCadena(widget.actual?.tipo);
  late final _etiqueta = TextEditingController(text: widget.actual?.etiqueta ?? '');
  late final _monto = TextEditingController(text: _num(widget.actual?.monto));
  late final _base = TextEditingController(text: _num(widget.actual?.montoBase));
  late final _pct = TextEditingController(text: _num(widget.actual?.porcentaje));
  late final _texto = TextEditingController(text: widget.actual?.texto ?? '');

  /// Sin formato de moneda: es un campo donde se teclea, y un "$123,000.00"
  /// dentro del input obliga a borrar los símbolos antes de corregir el número.
  static String _num(double? v) {
    if (v == null) return '';
    return v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
  }

  double? _leer(TextEditingController c) {
    final s = c.text.trim().replaceAll(',', '');
    if (s.isEmpty) return null;
    return double.tryParse(s);
  }

  @override
  void dispose() {
    _etiqueta.dispose();
    _monto.dispose();
    _base.dispose();
    _pct.dispose();
    _texto.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final esTexto = _tipo == TipoRenglon.texto;
    final sugerido = montoSugerido(_tipo, _leer(_base), _leer(_pct));

    return Padding(
      // El teclado no debe tapar los campos: es la falla clásica de una hoja
      // inferior con formulario en pantalla chica.
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<TipoRenglon>(
            initialValue: _tipo,
            decoration: const InputDecoration(labelText: 'Tipo'),
            items: const [
              DropdownMenuItem(
                  value: TipoRenglon.concepto, child: Text('Concepto (suma)')),
              DropdownMenuItem(
                  value: TipoRenglon.deduccion, child: Text('Deducción (resta)')),
              DropdownMenuItem(
                  value: TipoRenglon.pago, child: Text('Pago o proyección')),
              DropdownMenuItem(
                  value: TipoRenglon.texto, child: Text('Apunte sin monto')),
            ],
            onChanged: (v) => setState(() => _tipo = v ?? TipoRenglon.concepto),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _etiqueta,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(
              labelText: 'Concepto *',
              hintText: esTexto ? 'Ej. LIQUIDADO' : 'Ej. BASE DE TINACOS',
            ),
          ),
          const SizedBox(height: 8),
          if (esTexto)
            TextField(
              controller: _texto,
              decoration: const InputDecoration(
                labelText: 'Apunte',
                hintText: 'Ej. BASES DE TINACOS, PRETIL Y RECORTE DE PUERTAS',
              ),
            )
          else ...[
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _base,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                      labelText: 'Bruto', helperText: 'Opcional'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _pct,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                      labelText: 'Retención %', helperText: 'Opcional'),
                ),
              ),
            ]),
            const SizedBox(height: 8),
            TextField(
              controller: _monto,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Importe',
                helperText: sugerido != null
                    ? 'Vacío = ${Fmt.money(sugerido)} (el sugerido).'
                    : 'El monto de este renglón.',
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _texto,
              decoration: const InputDecoration(
                  labelText: 'Aclaración', helperText: 'Opcional'),
            ),
          ],
          const SizedBox(height: 16),
          Row(children: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancelar')),
            const Spacer(),
            FilledButton(
              onPressed: _etiqueta.text.trim().isEmpty
                  ? null
                  : () => Navigator.pop(
                        context,
                        _DatosRenglon(
                          tipo: _tipo,
                          etiqueta: _etiqueta.text.trim(),
                          // Un TEXTO no lleva importe: se limpian los tres para
                          // que cambiar de tipo no deje montos fantasma sumando.
                          monto: esTexto ? null : _leer(_monto),
                          montoBase: esTexto ? null : _leer(_base),
                          porcentaje: esTexto ? null : _leer(_pct),
                          texto: _texto.text.trim(),
                        ),
                      ),
              child: Text(widget.actual == null ? 'Agregar' : 'Guardar'),
            ),
          ]),
        ]),
      ),
    );
  }
}
