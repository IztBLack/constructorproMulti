import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../../domain/logic/presupuesto_calculator.dart';
import '../../domain/mappers.dart';
import '../../pdf/pdf_service.dart';

class CotizacionDetailScreen extends ConsumerStatefulWidget {
  final Cotizacion cotizacion;
  const CotizacionDetailScreen({super.key, required this.cotizacion});

  @override
  ConsumerState<CotizacionDetailScreen> createState() => _State();
}

class _State extends ConsumerState<CotizacionDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);
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
              if (v == 'iva') {
                setState(() => _ivaEnabled = !_ivaEnabled);
                await ref.read(cotizacionRepositoryProvider).upsert(
                    CotizacionesCompanion(
                        id: Value(_cotId), ivaEnabled: Value(_ivaEnabled)));
              } else if (v == 'convertir') {
                await _convertir();
              }
            },
            itemBuilder: (_) => [
              CheckedPopupMenuItem(
                  value: 'iva', checked: _ivaEnabled, child: const Text('Aplicar IVA 16%')),
              const PopupMenuItem(value: 'convertir', child: Text('Convertir en obra')),
            ],
          ),
        ],
        bottom: TabBar(controller: _tab, tabs: const [
          Tab(text: 'Presupuesto'),
          Tab(text: 'Pagos'),
        ]),
      ),
      body: TabBarView(controller: _tab, children: [
        _presupuestoTab(),
        _pagosTab(),
      ]),
    );
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
    final totalPagado = pagos.fold<double>(0, (a, p) => a + p.monto);
    final totales = const PresupuestoCalculator().calcular(
      partidas: partidas.map(partidaToDomain).toList(),
      ivaEnabled: _ivaEnabled,
      totalPagado: totalPagado,
    );
    final bytes = await PdfService.presupuesto(
      cot: widget.cotizacion,
      secciones: secciones,
      partidas: partidas,
      totales: totales,
      iva: _ivaEnabled,
    );
    await Printing.sharePdf(bytes: bytes, filename: 'presupuesto.pdf');
  }

  // ============ PRESUPUESTO ============
  Widget _presupuestoTab() {
    final seccionesAsync = ref.watch(seccionesProvider(_cotId));
    final partidasAsync = ref.watch(partidasDeCotizacionProvider(_cotId));
    final pagosAsync = ref.watch(pagosProvider(_cotId));

    return Scaffold(
      body: seccionesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (secciones) {
          final partidas = partidasAsync.asData?.value ?? [];
          final pagos = pagosAsync.asData?.value ?? [];
          final totalPagado = pagos.fold<double>(0, (a, p) => a + p.monto);

          final totales = const PresupuestoCalculator().calcular(
            partidas: partidas.map(partidaToDomain).toList(),
            ivaEnabled: _ivaEnabled,
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
                          return ExpansionTile(
                            title: Text(s.nombre,
                                style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text(Fmt.money(subtotal)),
                            childrenPadding: const EdgeInsets.only(bottom: 8),
                            children: [
                              ...pts.map((p) => ListTile(
                                    dense: true,
                                    title: Text(p.descripcion),
                                    subtitle: Text(
                                        '${p.cantidad} ${p.unidad} × ${Fmt.money(p.precioUnitario)}'),
                                    trailing: Text(Fmt.money(p.cantidad * p.precioUnitario)),
                                    onTap: () => _partidaDialog(s.id, p),
                                    onLongPress: () => _eliminarPartida(p),
                                  )),
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
        if (_ivaEnabled) row('IVA 16%', t.iva),
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

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(partida == null ? 'Nueva partida' : 'Editar partida'),
        content: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(controller: claveCtrl, decoration: const InputDecoration(labelText: 'Clave')),
              TextFormField(
                controller: descCtrl,
                decoration: const InputDecoration(labelText: 'Descripción'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Requerido' : null,
              ),
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
    );
  }

  Future<void> _eliminarPartida(Partida p) async {
    final ok = await _confirm('¿Eliminar la partida "${p.descripcion}"?', 'Eliminar');
    if (ok) await ref.read(partidaRepositoryProvider).delete(p.id);
  }

  // ============ PAGOS ============
  Widget _pagosTab() {
    final pagosAsync = ref.watch(pagosProvider(_cotId));
    return Scaffold(
      body: pagosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (pagos) {
          final total = pagos.fold<double>(0, (a, p) => a + p.monto);
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
              child: pagos.isEmpty
                  ? const Center(child: Text('Sin pagos registrados.'))
                  : ListView(
                      children: pagos
                          .map((p) => ListTile(
                                title: Text(p.concepto),
                                subtitle: Text('${Fmt.date(p.fecha)} · ${p.metodo}'),
                                trailing: Text(Fmt.money(p.monto),
                                    style: const TextStyle(
                                        color: Colors.green,
                                        fontWeight: FontWeight.bold)),
                                onLongPress: () async {
                                  final ok = await _confirm(
                                      '¿Eliminar el pago de ${Fmt.money(p.monto)}?',
                                      'Eliminar');
                                  if (ok) {
                                    await ref
                                        .read(pagoRepositoryProvider)
                                        .delete(p.id);
                                  }
                                },
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
