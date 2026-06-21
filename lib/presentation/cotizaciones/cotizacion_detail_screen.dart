import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart';
import 'package:printing/printing.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/pdf/pdf_config.dart';
import '../../data/providers.dart';
import '../../domain/clave_generator.dart';
import '../../domain/logic/presupuesto_calculator.dart';
import '../../domain/mappers.dart';
import '../../domain/text_import_parser.dart';
import '../../pdf/pdf_service.dart';
import '../pdf_pre_dialog.dart';

class CotizacionDetailScreen extends ConsumerStatefulWidget {
  final Cotizacion cotizacion;
  const CotizacionDetailScreen({super.key, required this.cotizacion});

  @override
  ConsumerState<CotizacionDetailScreen> createState() => _State();
}

class _State extends ConsumerState<CotizacionDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 3, vsync: this);
  late bool _ivaEnabled = widget.cotizacion.ivaEnabled;

  String get _cotId => widget.cotizacion.id;

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.cotizacion.nombreProyecto),
        actions: [
          IconButton(
            icon: const Icon(Icons.picture_as_pdf),
            tooltip: 'Exportar presupuesto PDF',
            onPressed: _exportarPdf,
          ),
          PopupMenuButton<String>(
            onSelected: (v) async {
              switch (v) {
                case 'iva':
                  setState(() => _ivaEnabled = !_ivaEnabled);
                  await ref.read(cotizacionRepositoryProvider).upsert(
                      CotizacionesCompanion(
                          id: Value(_cotId), ivaEnabled: Value(_ivaEnabled)));
                case 'estado':
                  await _cambiarEstado();
                case 'duplicar':
                  await _duplicar();
                case 'vincular':
                  await _vincular();
                case 'ajuste':
                  await _ajusteGlobal();
                case 'convertir':
                  await _convertir();
              }
            },
            itemBuilder: (_) => [
              CheckedPopupMenuItem(
                  value: 'iva', checked: _ivaEnabled, child: const Text('Aplicar IVA 16%')),
              const PopupMenuItem(value: 'estado', child: Text('Cambiar estado')),
              const PopupMenuItem(value: 'ajuste', child: Text('Ajuste global de precios')),
              const PopupMenuItem(value: 'duplicar', child: Text('Duplicar')),
              const PopupMenuItem(value: 'vincular', child: Text('Vincular a obra')),
              const PopupMenuItem(value: 'convertir', child: Text('Convertir en obra')),
            ],
          ),
        ],
        bottom: TabBar(controller: _tab, tabs: const [
          Tab(text: 'Presupuesto'),
          Tab(text: 'Pagos'),
          Tab(text: 'Archivos'),
        ]),
      ),
      body: TabBarView(controller: _tab, children: [
        _presupuestoTab(),
        _pagosTab(),
        _archivosTab(),
      ]),
    );
  }

  Future<void> _cambiarEstado() async {
    const estados = ['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA'];
    final estado = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Estado de la cotización'),
        children: estados
            .map((e) => SimpleDialogOption(
                  onPressed: () => Navigator.pop(ctx, e),
                  child: Text(e),
                ))
            .toList(),
      ),
    );
    if (estado != null) {
      await ref.read(cotizacionRepositoryProvider).cambiarEstado(_cotId, estado);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Estado: $estado')));
      }
    }
  }

  Future<void> _duplicar() async {
    await ref.read(cotizacionRepositoryProvider).duplicar(_cotId);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cotización duplicada (ver la lista).')));
    }
  }

  Future<void> _vincular() async {
    final obras = ref.read(obrasProvider).asData?.value ?? [];
    if (obras.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No hay obras para vincular.')));
      }
      return;
    }
    final obraId = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Vincular a obra'),
        children: obras
            .map((o) => SimpleDialogOption(
                  onPressed: () => Navigator.pop(ctx, o.id),
                  child: Text(o.nombre),
                ))
            .toList(),
      ),
    );
    if (obraId != null) {
      await ref.read(cotizacionRepositoryProvider).vincularAObra(_cotId, obraId);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Cotización vinculada a la obra.')));
      }
    }
  }

  Future<void> _ajusteGlobal() async {
    final ctrl = TextEditingController();
    final pct = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ajuste global de precios'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Porcentaje a aplicar a TODAS las partidas.\n'
              'Ej: 10 = +10%, -5 = −5%.'),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
            decoration: const InputDecoration(labelText: 'Porcentaje (%)', suffixText: '%'),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () {
              final v = double.tryParse(ctrl.text.trim());
              Navigator.pop(ctx, v);
            },
            child: const Text('Aplicar'),
          ),
        ],
      ),
    );
    if (pct == null) return;
    final n = await ref.read(partidaRepositoryProvider)
        .ajustarPrecios(_cotId, 1 + pct / 100);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ajuste de ${pct > 0 ? '+' : ''}$pct% aplicado a $n partidas.')));
    }
  }

  Future<void> _convertir() async {
    final ok = await _confirm(
        '¿Convertir "${widget.cotizacion.nombreProyecto}" en una obra?', 'Convertir');
    if (!ok) return;
    await ref.read(cotizacionRepositoryProvider).convertirEnObra(widget.cotizacion);
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Obra creada desde la cotización.')));
    }
  }

  Future<void> _exportarPdf() async {
    final secciones = ref.read(seccionesProvider(_cotId)).asData?.value ?? [];
    final partidas = ref.read(partidasDeCotizacionProvider(_cotId)).asData?.value ?? [];
    final pagos = ref.read(pagosProvider(_cotId)).asData?.value ?? [];
    final movs = ref.read(movimientosDeCotizacionProvider(_cotId)).asData?.value ?? [];
    final totalPagado = pagos.fold<double>(0, (a, p) => a + p.monto);
    final aportadoPorPartida = <String, double>{};
    for (final m in movs.where((m) => m.tipo == 'SALIDA' && m.partidaId != null)) {
      aportadoPorPartida[m.partidaId!] =
          (aportadoPorPartida[m.partidaId!] ?? 0) + m.monto;
    }
    final ivaPct = await ref.read(ivaPorcentajeProvider.future);
    final totales = const PresupuestoCalculator().calcular(
      partidas: partidas.map(partidaToDomain).toList(),
      ivaEnabled: _ivaEnabled,
      ivaPercentage: ivaPct,
      descuentoPorcentaje: widget.cotizacion.descuento,
      totalPagado: totalPagado,
    );
    final base = await PdfPrefs.load();
    if (!mounted) return;
    final config = await showPdfPreDialog(context, base);
    if (config == null) return;
    final bytes = await PdfService.presupuesto(
      cot: widget.cotizacion,
      secciones: secciones,
      partidas: partidas,
      totales: totales,
      iva: _ivaEnabled,
      aportadoPorPartida: aportadoPorPartida,
      config: config,
    );
    await Printing.sharePdf(bytes: bytes, filename: 'presupuesto.pdf');
  }

  // ============ PRESUPUESTO ============
  Widget _presupuestoTab() {
    final seccionesAsync = ref.watch(seccionesProvider(_cotId));
    final partidasAsync = ref.watch(partidasDeCotizacionProvider(_cotId));
    final pagosAsync = ref.watch(pagosProvider(_cotId));
    final movsAsync = ref.watch(movimientosDeCotizacionProvider(_cotId));

    return Scaffold(
      body: seccionesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (secciones) {
          final partidas = partidasAsync.asData?.value ?? [];
          final pagos = pagosAsync.asData?.value ?? [];
          final movs = movsAsync.asData?.value ?? [];
          final totalPagado = pagos.fold<double>(0, (a, p) => a + p.monto);
          // Aportado (gasto) por partida = Σ salidas ligadas a esa partida.
          final aportadoPorPartida = <String, double>{};
          for (final m in movs.where((m) => m.tipo == 'SALIDA' && m.partidaId != null)) {
            aportadoPorPartida[m.partidaId!] =
                (aportadoPorPartida[m.partidaId!] ?? 0) + m.monto;
          }

          final ivaPct = ref.watch(ivaPorcentajeProvider).asData?.value ?? 16.0;
          final totales = const PresupuestoCalculator().calcular(
            partidas: partidas.map(partidaToDomain).toList(),
            ivaEnabled: _ivaEnabled,
            ivaPercentage: ivaPct,
            descuentoPorcentaje: widget.cotizacion.descuento,
            totalPagado: totalPagado,
          );

          return Column(
            children: [
              Expanded(
                child: secciones.isEmpty
                    ? const Center(
                        child: Text('Sin secciones.\nToca + para agregar una.',
                            textAlign: TextAlign.center))
                    : ListView(
                        children: secciones.map((s) {
                          final pts = partidas.where((p) => p.seccionId == s.id).toList();
                          final subtotal =
                              pts.fold<double>(0, (a, p) => a + p.cantidad * p.precioUnitario);
                          final aportadoSec = pts.fold<double>(
                              0, (a, p) => a + (aportadoPorPartida[p.id] ?? 0));
                          final pctSec = subtotal > 0 ? aportadoSec / subtotal * 100 : 0;
                          return ExpansionTile(
                            title: Text(s.nombre,
                                style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text(
                                '${Fmt.money(subtotal)}  ·  aportado ${Fmt.money(aportadoSec)} (${pctSec.toStringAsFixed(0)}%)'),
                            childrenPadding: const EdgeInsets.only(bottom: 8),
                            children: [
                              ...pts.map((p) {
                                final total = p.cantidad * p.precioUnitario;
                                final aportado = aportadoPorPartida[p.id] ?? 0;
                                final pct = total > 0 ? aportado / total * 100 : 0;
                                return ListTile(
                                    dense: true,
                                    title: Text(p.descripcion),
                                    subtitle: Text(
                                        '${p.cantidad} ${p.unidad} × ${Fmt.money(p.precioUnitario)}'
                                        '${aportado > 0 ? '  ·  aportado ${Fmt.money(aportado)} (${pct.toStringAsFixed(0)}%)' : ''}'),
                                    trailing: Text(Fmt.money(total)),
                                    onTap: () => _partidaDialog(s.id, p),
                                    onLongPress: () => _eliminarPartida(p),
                                  );
                              }),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: Padding(
                                  padding: const EdgeInsets.only(left: 16),
                                  child: TextButton.icon(
                                    icon: const Icon(Icons.add),
                                    label: const Text('Agregar partida'),
                                    onPressed: () => _agregarPartidaFlujo(s.id),
                                  ),
                                ),
                              ),
                              OverflowBar(children: [
                                TextButton(
                                    onPressed: () => _importarTexto(s.id),
                                    child: const Text('Importar texto')),
                                TextButton(
                                    onPressed: () => _seccionDialog(s),
                                    child: const Text('Renombrar')),
                                TextButton(
                                    onPressed: () => _eliminarSeccion(s),
                                    child: const Text('Eliminar sección')),
                              ]),
                            ],
                          );
                        }).toList(),
                      ),
              ),
              _totalesBar(totales),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _seccionDialog(null),
        icon: const Icon(Icons.create_new_folder),
        label: const Text('Sección'),
      ),
    );
  }

  Widget _totalesBar(PresupuestoTotales t) {
    final cs = Theme.of(context).colorScheme;
    Widget row(String l, double v, {bool bold = false, Color? color}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(l,
                  style: TextStyle(
                      fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
              Text(Fmt.money(v),
                  style: TextStyle(
                      fontWeight: bold ? FontWeight.bold : FontWeight.normal,
                      color: color)),
            ],
          ),
        );
    return Container(
      width: double.infinity,
      color: cs.surfaceContainerHighest,
      padding: const EdgeInsets.all(16),
      child: Column(children: [
        row('Subtotal', t.subtotal),
        if (t.descuento > 0)
          row('Descuento (${widget.cotizacion.descuento.toStringAsFixed(0)}%)', -t.descuento),
        if (_ivaEnabled)
          row('IVA (${(ref.watch(ivaPorcentajeProvider).asData?.value ?? 16).toStringAsFixed(0)}%)', t.iva),
        row('TOTAL', t.total, bold: true),
        if (t.total != t.saldoRestante)
          row('Saldo por cobrar', t.saldoRestante, bold: true, color: cs.primary),
      ]),
    );
  }

  Future<void> _seccionDialog(Seccion? s) async {
    final ctrl = TextEditingController(text: s?.nombre ?? '');
    final ok = await _inputDialog(
        s == null ? 'Nueva sección' : 'Renombrar sección', 'Nombre', ctrl);
    if (!ok || ctrl.text.trim().isEmpty) return;
    final repo = ref.read(seccionRepositoryProvider);
    if (s == null) {
      final count = ref.read(seccionesProvider(_cotId)).asData?.value.length ?? 0;
      await repo.insert(_cotId, ctrl.text.trim(), count);
    } else {
      await repo.rename(s.id, ctrl.text.trim());
    }
  }

  /// Pega un listado de conceptos en texto y los importa como partidas
  /// (detecta unidad/cantidad/precio y genera claves automáticas).
  Future<void> _importarTexto(String seccionId) async {
    final textoCtrl = TextEditingController();
    List<ParsedConcepto> preview = [];

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          title: const Text('Importar desde texto'),
          content: SizedBox(
            width: double.maxFinite,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(
                controller: textoCtrl,
                maxLines: 6,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: 'Una partida por línea. Ej:\n'
                      'Muro de block 85 m2 \$201.34\n'
                      'Aplanado interior 120 m2 91.68',
                ),
                onChanged: (v) => setS(() => preview = TextImportParser.parse(v)),
              ),
              const SizedBox(height: 8),
              if (preview.isNotEmpty)
                SizedBox(
                  height: 200,
                  child: ListView(
                    children: preview
                        .map((p) => ListTile(
                              dense: true,
                              title: Text(p.nombre),
                              subtitle: Text(
                                  '${p.cantidad} ${p.unidad} × ${Fmt.money(p.precioUnitario)}'),
                            ))
                        .toList(),
                  ),
                ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: preview.isEmpty
                  ? null
                  : () async {
                      final repo = ref.read(partidaRepositoryProvider);
                      final claves = (ref
                                  .read(partidasDeCotizacionProvider(_cotId))
                                  .asData
                                  ?.value ??
                              [])
                          .map((p) => p.clave)
                          .toList();
                      var orden = 0;
                      for (final c in preview) {
                        final clave = ClaveGenerator.generar(c.nombre, claves);
                        claves.add(clave);
                        await repo.upsert(PartidasCompanion(
                          id: Value(repo.newId()),
                          seccionId: Value(seccionId),
                          clave: Value(clave),
                          descripcion: Value(c.nombre),
                          unidad: Value(c.unidad),
                          cantidad: Value(c.cantidad),
                          precioUnitario: Value(c.precioUnitario),
                          orden: Value(orden++),
                        ));
                      }
                      if (ctx.mounted) Navigator.pop(ctx);
                    },
              child: Text('Importar (${preview.length})'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _eliminarSeccion(Seccion s) async {
    final ok = await _confirm(
        '¿Eliminar la sección "${s.nombre}" y sus partidas?', 'Eliminar');
    if (ok) await ref.read(seccionRepositoryProvider).delete(s.id);
  }

  /// Elige entre buscar en catálogo o capturar manual.
  Future<void> _agregarPartidaFlujo(String seccionId) async {
    final opcion = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.search),
            title: const Text('Buscar en catálogo'),
            onTap: () => Navigator.pop(ctx, 'catalogo'),
          ),
          ListTile(
            leading: const Icon(Icons.edit),
            title: const Text('Captura manual'),
            onTap: () => Navigator.pop(ctx, 'manual'),
          ),
        ]),
      ),
    );
    if (opcion == 'manual') {
      await _partidaDialog(seccionId, null);
    } else if (opcion == 'catalogo') {
      final concepto = await _buscarCatalogo();
      if (concepto != null) {
        await _partidaDialog(seccionId, null,
            preClave: concepto.clave,
            preDesc: concepto.descripcion,
            preUnidad: concepto.unidad,
            prePrecio: concepto.precioUnitarioDefault);
      }
    }
  }

  Future<CatalogoConcepto?> _buscarCatalogo() async {
    return showDialog<CatalogoConcepto>(
      context: context,
      builder: (ctx) {
        final queryCtrl = TextEditingController();
        List<CatalogoConcepto> resultados = [];
        return StatefulBuilder(builder: (ctx, setS) {
          Future<void> buscar(String q) async {
            final r = await ref.read(catalogoRepositoryProvider).buscar(q);
            setS(() => resultados = r);
          }
          return AlertDialog(
            title: const Text('Catálogo de conceptos'),
            content: SizedBox(
              width: double.maxFinite,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(
                  controller: queryCtrl,
                  autofocus: true,
                  decoration: const InputDecoration(
                      hintText: 'Buscar (clave, descripción, categoría)'),
                  onChanged: buscar,
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 320,
                  child: ListView(
                    children: resultados
                        .map((c) => ListTile(
                              dense: true,
                              title: Text('${c.clave} · ${c.descripcion}',
                                  maxLines: 2, overflow: TextOverflow.ellipsis),
                              subtitle: Text(
                                  '${c.unidad} · ${Fmt.money(c.precioUnitarioDefault)}'),
                              onTap: () => Navigator.pop(ctx, c),
                            ))
                        .toList(),
                  ),
                ),
              ]),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
            ],
          );
        });
      },
    );
  }

  Future<void> _partidaDialog(
    String seccionId,
    Partida? partida, {
    String? preClave,
    String? preDesc,
    String? preUnidad,
    double? prePrecio,
  }) async {
    final claveCtrl = TextEditingController(text: partida?.clave ?? preClave ?? '');
    final descCtrl = TextEditingController(text: partida?.descripcion ?? preDesc ?? '');
    final unidadCtrl = TextEditingController(text: partida?.unidad ?? preUnidad ?? '');
    final cantidadCtrl =
        TextEditingController(text: partida?.cantidad.toString() ?? '');
    final precioCtrl = TextEditingController(
        text: partida?.precioUnitario.toString() ?? prePrecio?.toString() ?? '');
    final formKey = GlobalKey<FormState>();
    final repo = ref.read(partidaRepositoryProvider);
    List<CatalogoConcepto> sugerencias = [];

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
        title: Text(partida == null ? 'Nueva partida' : 'Editar partida'),
        content: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(
                controller: claveCtrl,
                decoration: InputDecoration(
                  labelText: 'Clave',
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.auto_fix_high),
                    tooltip: 'Generar clave',
                    onPressed: () {
                      final existentes = (ref
                                  .read(partidasDeCotizacionProvider(_cotId))
                                  .asData
                                  ?.value ??
                              [])
                          .map((p) => p.clave)
                          .toList();
                      claveCtrl.text =
                          ClaveGenerator.generar(descCtrl.text, existentes);
                    },
                  ),
                ),
              ),
              TextFormField(
                controller: descCtrl,
                decoration: const InputDecoration(
                    labelText: 'Descripción',
                    helperText: 'Escribe para ver sugerencias del catálogo'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Requerido' : null,
                onChanged: (v) async {
                  if (v.trim().length >= 2) {
                    final r = await ref.read(catalogoRepositoryProvider).buscar(v.trim());
                    setS(() => sugerencias = r.take(6).toList());
                  } else {
                    setS(() => sugerencias = []);
                  }
                },
              ),
              if (sugerencias.isNotEmpty)
                ...sugerencias.map((c) => ListTile(
                      dense: true,
                      visualDensity: VisualDensity.compact,
                      leading: const Icon(Icons.menu_book, size: 18),
                      title: Text('${c.clave} · ${c.descripcion}',
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12)),
                      subtitle: Text('${c.unidad} · ${Fmt.money(c.precioUnitarioDefault)}',
                          style: const TextStyle(fontSize: 11)),
                      onTap: () {
                        claveCtrl.text = c.clave;
                        descCtrl.text = c.descripcion;
                        unidadCtrl.text = c.unidad;
                        precioCtrl.text = c.precioUnitarioDefault.toString();
                        setS(() => sugerencias = []);
                      },
                    )),
              TextFormField(controller: unidadCtrl, decoration: const InputDecoration(labelText: 'Unidad (M2, ML, PZA…)')),
              TextFormField(
                controller: cantidadCtrl,
                decoration: const InputDecoration(labelText: 'Cantidad'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) =>
                    double.tryParse((v ?? '').trim()) == null ? 'Inválido' : null,
              ),
              TextFormField(
                controller: precioCtrl,
                decoration: const InputDecoration(labelText: 'Precio unitario (\$)'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) =>
                    double.tryParse((v ?? '').trim()) == null ? 'Inválido' : null,
              ),
            ]),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              await repo.upsert(PartidasCompanion(
                id: Value(partida?.id ?? repo.newId()),
                seccionId: Value(seccionId),
                clave: Value(claveCtrl.text.trim()),
                descripcion: Value(descCtrl.text.trim()),
                unidad: Value(unidadCtrl.text.trim()),
                cantidad: Value(double.parse(cantidadCtrl.text.trim())),
                precioUnitario: Value(double.parse(precioCtrl.text.trim())),
                orden: Value(partida?.orden ?? 0),
              ));
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
        ),
      ),
    );
  }

  Future<void> _eliminarPartida(Partida p) async {
    final ok = await _confirm('¿Eliminar la partida "${p.descripcion}"?', 'Eliminar');
    if (ok) await ref.read(partidaRepositoryProvider).delete(p.id);
  }

  // ============ PAGOS ============
  Widget _pagosTab() {
    final pagosAsync = ref.watch(pagosProvider(_cotId));
    final movsAsync = ref.watch(movimientosDeCotizacionProvider(_cotId));
    return Scaffold(
      body: pagosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (pagos) {
          final entradas = (movsAsync.asData?.value ?? [])
              .where((m) => m.tipo == 'ENTRADA')
              .toList();
          // Lista unificada: pagos manuales + entradas de caja ligadas.
          final items = <_PagoUnificado>[
            ...pagos.map((p) => _PagoUnificado(
                id: p.id, fecha: p.fecha, monto: p.monto, concepto: p.concepto,
                metodo: p.metodo, esPagoManual: true)),
            ...entradas.map((m) => _PagoUnificado(
                id: m.id, fecha: m.fecha, monto: m.monto, concepto: m.concepto,
                metodo: m.metodoPago, esPagoManual: false)),
          ]..sort((a, b) => b.fecha.compareTo(a.fecha));
          final total = items.fold<double>(0, (a, p) => a + p.monto);

          return Column(children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total cobrado', style: TextStyle(fontWeight: FontWeight.bold)),
                  Text(Fmt.money(total),
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, color: Colors.green)),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: items.isEmpty
                  ? const Center(child: Text('Sin pagos registrados.'))
                  : ListView(
                      children: items
                          .map((p) => ListTile(
                                leading: Icon(
                                    p.esPagoManual ? Icons.payments : Icons.south_west,
                                    color: Colors.green),
                                title: Text(p.concepto),
                                subtitle: Text(
                                    '${Fmt.date(p.fecha)} · ${p.metodo} · ${p.esPagoManual ? 'Pago' : 'Caja'}'),
                                trailing: Text(Fmt.money(p.monto),
                                    style: const TextStyle(
                                        color: Colors.green,
                                        fontWeight: FontWeight.bold)),
                                onLongPress: p.esPagoManual
                                    ? () async {
                                        final ok = await _confirm(
                                            '¿Eliminar el pago de ${Fmt.money(p.monto)}?',
                                            'Eliminar');
                                        if (ok) {
                                          await ref
                                              .read(pagoRepositoryProvider)
                                              .delete(p.id);
                                        }
                                      }
                                    : null,
                              ))
                          .toList(),
                    ),
            ),
          ]);
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _pagoDialog,
        icon: const Icon(Icons.payments),
        label: const Text('Registrar pago'),
      ),
    );
  }

  Future<void> _pagoDialog() async {
    final conceptoCtrl = TextEditingController(text: 'Anticipo');
    final montoCtrl = TextEditingController();
    String metodo = 'Transferencia';
    final formKey = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          title: const Text('Registrar pago'),
          content: Form(
            key: formKey,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(
                controller: conceptoCtrl,
                decoration: const InputDecoration(labelText: 'Concepto'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Requerido' : null,
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
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: metodo,
                decoration: const InputDecoration(labelText: 'Método'),
                items: const [
                  DropdownMenuItem(value: 'Transferencia', child: Text('Transferencia')),
                  DropdownMenuItem(value: 'Efectivo', child: Text('Efectivo')),
                  DropdownMenuItem(value: 'Cheque', child: Text('Cheque')),
                ],
                onChanged: (v) => setS(() => metodo = v ?? 'Transferencia'),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!formKey.currentState!.validate()) return;
                await ref.read(pagoRepositoryProvider).add(
                      cotId: _cotId,
                      fecha: DateTime.now().millisecondsSinceEpoch,
                      monto: double.parse(montoCtrl.text.trim()),
                      metodo: metodo,
                      concepto: conceptoCtrl.text.trim(),
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

  // ============ ARCHIVOS ============
  Widget _archivosTab() {
    final archivosAsync = ref.watch(archivosProvider(_cotId));
    return Scaffold(
      body: archivosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (archivos) {
          if (archivos.isEmpty) {
            return const Center(
                child: Text('Sin archivos.\nAgrega fotos o planos PDF.',
                    textAlign: TextAlign.center));
          }
          return GridView.count(
            crossAxisCount: 3,
            padding: const EdgeInsets.all(8),
            children: archivos.map((a) {
              final esImagen = a.tipo == 'IMAGEN';
              return GestureDetector(
                onTap: () => _verArchivo(a),
                onLongPress: () => _eliminarArchivo(a),
                child: Card(
                  child: Column(
                    children: [
                      Expanded(
                        child: esImagen && File(a.uri).existsSync()
                            ? Image.file(File(a.uri), fit: BoxFit.cover, width: double.infinity)
                            : const Icon(Icons.picture_as_pdf, size: 48, color: Colors.red),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(4),
                        child: Text(a.nombre,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 11)),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _agregarArchivo,
        icon: const Icon(Icons.attach_file),
        label: const Text('Agregar'),
      ),
    );
  }

  Future<void> _agregarArchivo() async {
    final opcion = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.photo_camera),
            title: const Text('Foto (cámara)'),
            onTap: () => Navigator.pop(ctx, 'camara'),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library),
            title: const Text('Foto (galería)'),
            onTap: () => Navigator.pop(ctx, 'galeria'),
          ),
          ListTile(
            leading: const Icon(Icons.picture_as_pdf),
            title: const Text('Plano PDF'),
            onTap: () => Navigator.pop(ctx, 'pdf'),
          ),
        ]),
      ),
    );
    if (opcion == null) return;
    final dir = await getApplicationDocumentsDirectory();
    String? src;
    String tipo = 'IMAGEN';
    String nombre = '';
    if (opcion == 'pdf') {
      final res = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf']);
      src = res?.files.single.path;
      tipo = 'PDF';
      nombre = res?.files.single.name ?? 'plano.pdf';
    } else {
      final picked = await ImagePicker().pickImage(
          source: opcion == 'camara' ? ImageSource.camera : ImageSource.gallery);
      src = picked?.path;
      nombre = picked?.name ?? 'foto.jpg';
    }
    if (src == null) return;
    final dest = File(path.join(dir.path, '${DateTime.now().millisecondsSinceEpoch}${path.extension(src)}'));
    await File(src).copy(dest.path);
    await ref.read(archivoRepositoryProvider)
        .add(cotId: _cotId, tipo: tipo, nombre: nombre, uri: dest.path);
  }

  Future<void> _verArchivo(ArchivoCotizacion a) async {
    if (!File(a.uri).existsSync()) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('El archivo ya no existe.')));
      }
      return;
    }
    if (a.tipo == 'IMAGEN') {
      await showDialog<void>(
        context: context,
        builder: (ctx) => Dialog(
          child: InteractiveViewer(
            child: Image.file(File(a.uri)),
          ),
        ),
      );
    } else {
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(title: Text(a.nombre)),
          body: PdfViewPinch(controller: PdfControllerPinch(
              document: PdfDocument.openFile(a.uri))),
        ),
      ));
    }
  }

  Future<void> _eliminarArchivo(ArchivoCotizacion a) async {
    final ok = await _confirm('¿Eliminar "${a.nombre}"?', 'Eliminar');
    if (ok) {
      try {
        final f = File(a.uri);
        if (f.existsSync()) f.deleteSync();
      } catch (_) {}
      await ref.read(archivoRepositoryProvider).delete(a.id);
    }
  }

  // ============ Helpers ============
  Future<bool> _confirm(String msg, String accion) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Confirmar'),
          content: Text(msg),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(accion)),
          ],
        ),
      ) ??
      false;

  Future<bool> _inputDialog(String title, String label, TextEditingController ctrl) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: TextField(
              controller: ctrl,
              autofocus: true,
              decoration: InputDecoration(labelText: label)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Guardar')),
          ],
        ),
      ) ??
      false;
}

/// Renglón unificado de cobranza: pago manual o entrada de caja ligada.
class _PagoUnificado {
  final String id;
  final int fecha;
  final double monto;
  final String concepto;
  final String metodo;
  final bool esPagoManual;
  const _PagoUnificado({
    required this.id,
    required this.fecha,
    required this.monto,
    required this.concepto,
    required this.metodo,
    required this.esPagoManual,
  });
}
