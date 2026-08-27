import 'dart:io';

import 'package:collection/collection.dart';
import 'package:drift/drift.dart' show Value;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pdfx/pdfx.dart';
import 'package:uuid/uuid.dart';

import '../pdf_preview_screen.dart';
import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/pdf/textos_finales.dart';
import '../../core/storage/comprobante_storage.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/rol_provider.dart';
import '../common/empty_state_view.dart';
import '../../core/sync/supabase_config.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../nomina/proyeccion_screen.dart';
import '../../domain/logic/estado_cuenta_calculator.dart';
import '../../domain/logic/flujo_calculator.dart';
import '../../domain/logic/nomina_calculator.dart';
import '../../domain/mappers.dart';
import '../../pdf/pdf_service.dart';
import '../common/app_card.dart';
import '../common/app_snackbar.dart';
import '../common/confirm_dialog.dart';
import '../common/money_text.dart';
import '../common/section_header.dart';
import '../common/texto_final_card.dart';
import '../notas/notas_obra_screen.dart';
import '../pdf_pre_dialog.dart';
import 'importar_movimientos_screen.dart';

class ObraDetailScreen extends ConsumerStatefulWidget {
  final Obra obra;
  const ObraDetailScreen({super.key, required this.obra});

  @override
  ConsumerState<ObraDetailScreen> createState() => _ObraDetailScreenState();
}

class _ObraDetailScreenState extends ConsumerState<ObraDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 4, vsync: this);

  DateTime _diaAsistencia = DateTime.now();
  int _inicioSemana = Semana.inicioSemana(DateTime.now());
  bool _asistVistaSemana = false;

  /// El párrafo propio del estado de cuenta de esta obra. En estado local y no
  /// leído de `widget.obra` porque esta pantalla recibe la obra ya cargada:
  /// tras editarlo, el objeto de la ruta seguiría trayendo el valor viejo.
  late String? _textoFinal = widget.obra.textoFinal;

  String get _obraId => widget.obra.id;

  /// Guarda (o borra, con `null`) el párrafo propio del estado de cuenta.
  Future<void> _guardarTextoFinal(String? texto) async {
    await ref.read(obraRepositoryProvider).setTextoFinal(_obraId, texto);
    if (!mounted) return;
    setState(() => _textoFinal = texto);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.obra.nombre),
        actions: [
          IconButton(
            icon: const Icon(Icons.swap_horiz),
            tooltip: 'Cambiar a obra',
            onPressed: _cambiarObra,
          ),
          IconButton(
            icon: const Icon(Icons.picture_as_pdf),
            tooltip: 'Exportar PDF (Nómina/Caja)',
            onPressed: _exportarPdf,
          ),
          PopupMenuButton<String>(
            tooltip: 'Más acciones',
            onSelected: (v) {
              if (v == 'importar') _importarMovimientos();
              if (v == 'proyeccion') {
                Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => ProyeccionScreen(obraId: widget.obra.id)));
              }
              if (v == 'notas') {
                Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => NotasObraScreen(
                        obraId: widget.obra.id,
                        obraNombre: widget.obra.nombre)));
              }
            },
            itemBuilder: (ctx) => [
              const PopupMenuItem(
                value: 'importar',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.upload_file),
                  title: Text('Importar movimientos'),
                ),
              ),
              // Va en el menú y no en una quinta pestaña: la TabBar es fija y
              // con cuatro títulos cortos ya reparte justo el ancho.
              const PopupMenuItem(
                value: 'notas',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.handshake_outlined),
                  title: Text('Notas de trato'),
                ),
              ),
              // Entra ya filtrada a esta obra. Solo para quien puede ver
              // salarios (ver `puedeVerSueldosSegunRol`).
              if (ref.watch(puedeVerSueldosProvider))
                const PopupMenuItem(
                  value: 'proyeccion',
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.calculate_outlined),
                    title: Text('Proyectar la nómina'),
                  ),
                ),
            ],
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          // Fijo, no desplazable: con `isScrollable` los cuatro títulos cortos
          // se amontonaban a la izquierda dejando media barra vacía, y no había
          // nada que desplazar. Repartidos ocupan el ancho y crecen sus áreas
          // tocables.
          isScrollable: false,
          tabs: const [
            Tab(text: 'Equipo'),
            Tab(text: 'Asistencia'),
            Tab(text: 'Nómina'),
            Tab(text: 'Caja'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _equipoTab(),
          _asistenciaTab(),
          _nominaTab(),
          _cajaTab(),
        ],
      ),
    );
  }

  Future<void> _cambiarObra() async {
    final obras = ref.read(obrasProvider).asData?.value ?? [];
    final otras = obras.where((o) => o.id != _obraId).toList();
    if (otras.isEmpty) {
      _snack('No hay otras obras.');
      return;
    }
    final sel = await showDialog<Obra>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Cambiar a obra'),
        children: otras
            .map((o) => SimpleDialogOption(
                  onPressed: () => Navigator.pop(ctx, o),
                  child: Text(o.nombre),
                ))
            .toList(),
      ),
    );
    if (sel != null && mounted) {
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => ObraDetailScreen(obra: sel)));
    }
  }

  Future<void> _importarMovimientos() async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ImportarMovimientosScreen(obra: widget.obra),
      ),
    );
    // La caja es stream-backed (movimientosPorObraProvider /
    // partidasPresupuestoPorObraProvider): se refresca sola tras el insert.
  }

  Future<void> _exportarPdf() async {
    final base = await ref.read(pdfConfigEfectivaProvider.future);
    if (!mounted) return;
    final config = await showPdfPreDialog(context, base);
    if (config == null) return;
    final idx = _tab.index;
    if (idx == 2) {
      // La pestaña ya no se dibuja sin permiso, pero el export se defiende solo.
      if (!ref.read(puedeVerSueldosProvider)) return;
      // Nómina de la semana activa
      final fin = Semana.finSemana(_inicioSemana);
      final rango = (obraId: _obraId, start: _inicioSemana, end: fin);
      final workers = ref.read(colaboradoresPorObraProvider(_obraId)).asData?.value ?? [];
      final puestos = ref.read(puestosProvider).asData?.value ?? [];
      final asis = ref.read(asistenciasRangoProvider(rango)).asData?.value ?? [];
      final dest = ref.read(destajosRangoProvider(rango)).asData?.value ?? [];
      final summary = const NominaCalculator().calcular(
        colaboradores: workers.map(colaboradorToDomain).toList(),
        asistencias: asis.map(asistenciaToDomain).toList(),
        destajos: dest.map(destajoToDomain).toList(),
        puestos: puestos.map(puestoToDomain).toList(),
      );
      final domingo = DateTime.fromMillisecondsSinceEpoch(_inicioSemana)
          .add(const Duration(days: 6));
      final bytes = await PdfService.nomina(
        obraNombre: widget.obra.nombre,
        rango: '${Fmt.date(_inicioSemana)} – ${Fmt.date(domingo.millisecondsSinceEpoch)}',
        summary: summary,
        config: config,
      );
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => PdfPreviewScreen(
              bytes: bytes, titulo: 'Nómina', filename: 'nomina.pdf')));
    } else if (idx == 3) {
      // Flujo de caja
      final movs = ref.read(movimientosPorObraProvider(_obraId)).asData?.value ?? [];
      final resumen =
          const FlujoCalculator().resumen(movs.map(movimientoToDomain).toList());
      final bytes = await PdfService.flujoCaja(
          obraNombre: widget.obra.nombre, movimientos: movs, resumen: resumen, config: config);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => PdfPreviewScreen(
              bytes: bytes, titulo: 'Flujo de caja', filename: 'flujo_caja.pdf')));
    } else {
      _snack('Cambia a la pestaña Nómina o Caja para exportar su PDF.');
    }
  }

  /// Genera y comparte el PDF "Estado de cuenta del cliente": SOLO entradas
  /// (pagos recibidos) + total del contrato + saldo por cobrar. Es el documento
  /// que la oficina manda al cliente por WhatsApp/correo.
  ///
  /// El filtrado a `tipo == 'ENTRADA'` sucede AQUÍ, antes de mapear a la lista
  /// que recibe `PdfService.estadoCuentaCliente`. Ese método nunca ve las
  /// salidas: se le pasan los totales del [EstadoCuentaSummary] (cuyo `recibido`
  /// / `pendiente` ya vienen calculados) y solo los renglones de entrada. Así un
  /// error futuro no puede colar un gasto al cliente.
  Future<void> _exportarEstadoCuentaCliente(
      EstadoCuentaSummary estado, List<Movimiento> movs) async {
    final base = await ref.read(pdfConfigEfectivaProvider.future);
    if (!mounted) return;
    final config = await showPdfPreDialog(context, base);
    if (config == null) return;
    // Filtro explícito: solo entradas, y solo los campos que el cliente debe
    // ver (fecha · concepto · monto). No se pasa `tipo` ni nada de salidas.
    final pagos = movs
        .where((m) => m.tipo == 'ENTRADA')
        .map((m) => (fecha: m.fecha, concepto: m.concepto, monto: m.monto))
        .toList();
    final bytes = await PdfService.estadoCuentaCliente(
      obraNombre: widget.obra.nombre,
      cliente: widget.obra.cliente,
      costoTotal: estado.costoTotal,
      recibido: estado.recibido,
      pendiente: estado.pendiente,
      pagos: pagos,
      config: config,
      textoFinalObra: _textoFinal,
      textosEmpresa: ref.read(textosPdfProvider),
    );
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PdfPreviewScreen(
            bytes: bytes, titulo: 'Estado de cuenta del cliente', filename: 'estado_cuenta_cliente.pdf')));
  }

  // ============ EQUIPO ============
  Widget _equipoTab() {
    final asignadosAsync = ref.watch(colaboradoresPorObraProvider(_obraId));
    return Scaffold(
      body: asignadosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (asignados) {
          if (asignados.isEmpty) {
            return const Center(
                child: Text('Sin equipo asignado.\nToca + para asignar.',
                    textAlign: TextAlign.center));
          }
          return ListView(
            children: asignados
                .map((c) => ListTile(
                      leading: CircleAvatar(child: Text(_ini(c.nombre))),
                      title: Text(c.nombre),
                      subtitle: Text(c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo'),
                      trailing: IconButton(
                        icon: const Icon(Icons.person_remove_outlined),
                        onPressed: () => _desvincular(c),
                      ),
                    ))
                .toList(),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'fabAsignar',
        onPressed: _asignarDialog,
        icon: const Icon(Icons.group_add),
        label: const Text('Asignar'),
      ),
    );
  }

  Future<void> _asignar(String colaboradorId) =>
      ref.read(colaboradorRepositoryProvider).asignarObra(
            obraId: _obraId,
            colaboradorId: colaboradorId,
          );

  Future<void> _asignarDialog() async {
    final todos = ref.read(colaboradoresProvider).asData?.value ?? [];
    final asignados = ref.read(colaboradoresPorObraProvider(_obraId)).asData?.value ?? [];
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
              _crearColaboradorInline();
            },
          ),
          const Divider(),
          if (disponibles.isEmpty)
            const ListTile(title: Text('No hay colaboradores disponibles.'))
          else
            ...disponibles.map((c) => ListTile(
                  leading: CircleAvatar(child: Text(_ini(c.nombre))),
                  title: Text(c.nombre),
                  subtitle: Text(c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo'),
                  onTap: () async {
                    await _asignar(c.id);
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                )),
        ],
      ),
    );
  }

  Future<void> _crearColaboradorInline() async {
    final puestos = ref.read(puestosProvider).asData?.value ?? [];
    if (puestos.isEmpty) {
      _snack('Primero crea un puesto en Configuración.');
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
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Requerido' : null,
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: puestoId,
                decoration: const InputDecoration(labelText: 'Puesto'),
                items: puestos.map((p) => DropdownMenuItem(value: p.id, child: Text(p.nombre))).toList(),
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
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!formKey.currentState!.validate()) return;
                await ref.read(colaboradorRepositoryProvider).upsert(ColaboradoresCompanion(
                      id: Value(id),
                      nombre: Value(nombreCtrl.text.trim()),
                      puestoId: Value(puestoId),
                      tipoPago: Value(tipoPago),
                      activo: const Value(true),
                    ));
                await _asignar(id);
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Crear y asignar'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _desvincular(Colaborador c) async {
    final ok = await _confirm('¿Desvincular a "${c.nombre}" de esta obra?', 'Desvincular');
    if (ok) {
      await ref.read(colaboradorRepositoryProvider).desvincular(_obraId, c.id);
    }
  }

  // ============ ASISTENCIA ============
  Widget _asistenciaTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Row(children: [
            Expanded(
              child: SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Día'), icon: Icon(Icons.today)),
                  ButtonSegment(value: true, label: Text('Semana'), icon: Icon(Icons.grid_view)),
                ],
                selected: {_asistVistaSemana},
                onSelectionChanged: (s) => setState(() => _asistVistaSemana = s.first),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.summarize_outlined),
              tooltip: 'Resumen semanal',
              onPressed: _resumenAsistenciasSemana,
            ),
          ]),
        ),
        Expanded(child: _asistVistaSemana ? _asistenciaSemana() : _asistenciaDia()),
      ],
    );
  }

  Widget _asistenciaDia() {
    final diaMillis = Semana.inicioDia(_diaAsistencia);
    final rango = (obraId: _obraId, start: diaMillis, end: diaMillis);
    final asignadosAsync = ref.watch(colaboradoresPorObraProvider(_obraId));
    final asistenciasAsync = ref.watch(asistenciasRangoProvider(rango));
    return Column(
      children: [
        ListTile(
          leading: const Icon(Icons.event),
          title: Text('Día: ${Fmt.dayName(_diaAsistencia)}'),
          trailing: const Icon(Icons.edit_calendar),
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: _diaAsistencia,
              firstDate: DateTime(2020),
              lastDate: DateTime(2100),
            );
            if (d != null) setState(() => _diaAsistencia = d);
          },
        ),
        const Divider(height: 1),
        Expanded(
          child: asignadosAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (asignados) {
              final dia = asignados.where((c) => c.tipoPago == 'DIA').toList();
              if (dia.isEmpty) {
                return const Center(child: Text('Sin trabajadores por día asignados.'));
              }
              final asistencias = asistenciasAsync.asData?.value ?? [];
              final fracPorColab = {for (final a in asistencias) a.colaboradorId: a.fraccion};
              return ListView(
                children: dia.map((c) {
                  final frac = fracPorColab[c.id] ?? 0.0;
                  return Card(
                    margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.nombre, style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          SegmentedButton<double>(
                            segments: const [
                              ButtonSegment(value: 0.0, label: Text('Falta')),
                              ButtonSegment(value: 0.5, label: Text('½')),
                              ButtonSegment(value: 0.75, label: Text('¾')),
                              ButtonSegment(value: 1.0, label: Text('Completo')),
                            ],
                            selected: {frac},
                            onSelectionChanged: (s) async {
                              await ref.read(asistenciaRepositoryProvider).setFraccion(
                                    obraId: _obraId,
                                    colaboradorId: c.id,
                                    fecha: diaMillis,
                                    fraccion: s.first,
                                  );
                            },
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _asistenciaSemana() {
    final inicio = Semana.inicioSemana(_diaAsistencia);
    final fin = Semana.finSemana(inicio);
    final dias = List.generate(7, (i) =>
        DateTime.fromMillisecondsSinceEpoch(inicio).add(Duration(days: i)));
    final rango = (obraId: _obraId, start: inicio, end: fin);
    final asignados = ref.watch(colaboradoresPorObraProvider(_obraId)).asData?.value ?? [];
    final asistencias = ref.watch(asistenciasRangoProvider(rango)).asData?.value ?? [];
    final trabajadores = asignados.where((c) => c.tipoPago == 'DIA').toList();

    if (trabajadores.isEmpty) {
      return const Center(child: Text('Sin trabajadores por día asignados.'));
    }

    // mapa colaboradorId|fechaDia -> fraccion (asistencia en ESTA obra)
    final mapa = <String, double>{};
    for (final a in asistencias) {
      mapa['${a.colaboradorId}|${a.fecha}'] = a.fraccion;
    }

    // Overlay multi-obra: asistencias de estos trabajadores en la semana en
    // CUALQUIER obra, para marcar los días que fueron en otra obra.
    final idsClave = (trabajadores.map((c) => c.id).toList()..sort()).join(',');
    final todasObras = ref.watch(obrasProvider).asData?.value ?? [];
    final nombreObra = {for (final o in todasObras) o.id: o.nombre};
    final todasAsist = ref
            .watch(asistenciasSemanaTodasObrasProvider(
                (colaboradorIds: idsClave, start: inicio, end: fin)))
            .asData
            ?.value ??
        [];
    // clave -> asistencias en OTRAS obras (obraId != esta)
    final otrasPorCelda = <String, List<Asistencia>>{};
    for (final a in todasAsist) {
      if (a.obraId == _obraId) continue;
      (otrasPorCelda['${a.colaboradorId}|${a.fecha}'] ??= []).add(a);
    }

    String etiqueta(double f) =>
        f == 0 ? '—' : (f == 1.0 ? '1' : (f == 0.75 ? '¾' : '½'));
    String inicial(String obraId) {
      final n = nombreObra[obraId] ?? '?';
      return n.isEmpty ? '?' : n[0].toUpperCase();
    }

    final cs = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SingleChildScrollView(
        child: DataTable(
          columnSpacing: 16,
          columns: [
            const DataColumn(label: Text('Trabajador')),
            ...dias.map((d) => DataColumn(
                label: Text(Fmt.dayName(d).split(' ').take(2).join('\n'),
                    style: Theme.of(context).textTheme.labelSmall))),
          ],
          rows: trabajadores.map((c) {
            return DataRow(cells: [
              DataCell(Text(c.nombre, overflow: TextOverflow.ellipsis)),
              ...dias.map((d) {
                final diaMillis = Semana.inicioDia(d);
                final key = '${c.id}|$diaMillis';
                final otras = otrasPorCelda[key];
                if (otras != null && otras.isNotEmpty) {
                  // Día trabajado en otra obra: chip con inicial de la obra de
                  // mayor fracción. Tap -> detalle de todas las obras del día.
                  final principal = otras
                      .reduce((a, b) => a.fraccion >= b.fraccion ? a : b);
                  return DataCell(
                    Center(
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 24),
                        padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 6),
                        decoration: BoxDecoration(
                          color: cs.tertiaryContainer,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(inicial(principal.obraId),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: cs.onTertiaryContainer)),
                      ),
                    ),
                    onTap: () => _detalleCeldaOtraObra(
                        c.nombre, d, otras, nombreObra),
                  );
                }
                final f = mapa[key] ?? 0.0;
                return DataCell(
                  Center(child: Text(etiqueta(f),
                      style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: f > 0
                              ? context.colores.success
                              : context.colores.textFaint))),
                  onTap: () => _editarCeldaSemana(c.id, c.nombre, d, diaMillis),
                );
              }),
            ]);
          }).toList(),
        ),
      ),
    );
  }

  /// Detalle de un día que el trabajador pasó en otra(s) obra(s).
  Future<void> _detalleCeldaOtraObra(String nombre, DateTime dia,
      List<Asistencia> otras, Map<String, String> nombreObra) async {
    String frac(double f) =>
        f == 1.0 ? 'Día completo' : (f == 0.75 ? '¾ día' : (f == 0.5 ? '½ día' : 'Falta'));
    await showDialog<void>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text('$nombre — ${Fmt.dayName(dia)}'),
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(24, 0, 24, 8),
            child: Text('Este día asistió en otra obra:',
                style: TextStyle(fontStyle: FontStyle.italic)),
          ),
          ...otras.map((a) => ListTile(
                leading: const Icon(Icons.engineering),
                title: Text(nombreObra[a.obraId] ?? 'Obra desconocida'),
                trailing: Text(frac(a.fraccion)),
              )),
        ],
      ),
    );
  }

  Future<void> _editarCeldaSemana(
      String colabId, String nombre, DateTime dia, int diaMillis) async {
    final f = await showDialog<double>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text('$nombre — ${Fmt.dayName(dia)}'),
        children: [
          for (final opt in const [(0.0, 'Falta'), (0.5, '½ día'), (0.75, '¾ día'), (1.0, 'Día completo')])
            SimpleDialogOption(
              onPressed: () => Navigator.pop(ctx, opt.$1),
              child: Text(opt.$2),
            ),
        ],
      ),
    );
    if (f != null) {
      await ref.read(asistenciaRepositoryProvider).setFraccion(
            obraId: _obraId, colaboradorId: colabId, fecha: diaMillis, fraccion: f);
    }
  }

  // ============ NÓMINA ============
  Widget _nominaTab() {
    // Misma puerta que la proyección: esta pestaña enseña el sueldo de cada
    // persona junto a su nombre. La pestaña se deja visible —quitarla cambiaría
    // el largo del TabController y correría los índices— pero no muestra nada.
    if (!ref.watch(puedeVerSueldosProvider)) {
      return const EmptyStateView(
        icon: Icons.lock_outline,
        title: 'No tienes acceso a la nómina.',
        hint: 'Solo los socios, los supervisores y el contador pueden verla.',
      );
    }

    final fin = Semana.finSemana(_inicioSemana);
    final rango = (obraId: _obraId, start: _inicioSemana, end: fin);
    final workersAsync = ref.watch(colaboradoresPorObraProvider(_obraId));
    final puestosAsync = ref.watch(puestosProvider);
    final asisAsync = ref.watch(asistenciasRangoProvider(rango));
    final destAsync = ref.watch(destajosRangoProvider(rango));

    final lunes = DateTime.fromMillisecondsSinceEpoch(_inicioSemana);
    final domingo = lunes.add(const Duration(days: 6));

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: () => setState(() => _inicioSemana =
                  lunes.subtract(const Duration(days: 7)).millisecondsSinceEpoch),
            ),
            Text('${Fmt.date(_inicioSemana)} – ${Fmt.date(domingo.millisecondsSinceEpoch)}',
                style: Theme.of(context).textTheme.titleSmall),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: () => setState(() => _inicioSemana =
                  lunes.add(const Duration(days: 7)).millisecondsSinceEpoch),
            ),
          ],
        ),
        const Divider(height: 1),
        Expanded(
          child: Builder(builder: (context) {
            if (workersAsync.isLoading || puestosAsync.isLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            final workers = workersAsync.asData?.value ?? [];
            final puestos = puestosAsync.asData?.value ?? [];
            final asistencias = asisAsync.asData?.value ?? [];
            final destajos = destAsync.asData?.value ?? [];

            final summary = const NominaCalculator().calcular(
              colaboradores: workers.map(colaboradorToDomain).toList(),
              asistencias: asistencias.map(asistenciaToDomain).toList(),
              destajos: destajos.map(destajoToDomain).toList(),
              puestos: puestos.map(puestoToDomain).toList(),
            );

            if (summary.items.isEmpty) {
              return const Center(child: Text('Sin equipo asignado.'));
            }
            return Column(
              children: [
                Expanded(
                  child: ListView(
                    children: summary.items.map((it) {
                      final esDia = it.colaborador.tipoPago.name == 'dia';
                      final detalle = esDia
                          ? '${it.totalDias.toStringAsFixed(2)} días × ${Fmt.money(it.salarioBaseCalculado)}'
                          : '${destajos.where((d) => d.colaboradorId == it.colaborador.id).length} destajo(s)';
                      return ListTile(
                        title: Text(it.colaborador.nombre),
                        subtitle: Text(detalle),
                        trailing: Text(Fmt.money(it.totalPagar),
                            style: const TextStyle(fontWeight: FontWeight.bold)),
                        onTap: esDia
                            ? () => _detalleAsistenciaDialog(it.colaborador.nombre,
                                it.colaborador.id, asistencias)
                            : () => _destajosDialog(it.colaborador.id,
                                it.colaborador.nombre, destajos),
                      );
                    }).toList(),
                  ),
                ),
                if (summary.totalNomina > 0)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.account_balance_wallet_outlined),
                        label: const Text('Registrar nómina en caja'),
                        onPressed: () => _registrarNominaEnCaja(summary.totalNomina, _inicioSemana, domingo),
                      ),
                    ),
                  ),
                _totalBar('TOTAL NÓMINA', summary.totalNomina),
              ],
            );
          }),
        ),
      ],
    );
  }

  Future<void> _resumenAsistenciasSemana() async {
    final inicio = Semana.inicioSemana(_diaAsistencia);
    final fin = Semana.finSemana(inicio);
    final rango = (obraId: _obraId, start: inicio, end: fin);
    final asistencias = await ref.read(asistenciasRangoProvider(rango).future);
    final asignados = ref.read(colaboradoresPorObraProvider(_obraId)).asData?.value ?? [];
    final totalPorColab = <String, double>{};
    for (final a in asistencias) {
      totalPorColab[a.colaboradorId] = (totalPorColab[a.colaboradorId] ?? 0) + a.fraccion;
    }
    if (!mounted) return;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Asistencias ${Fmt.date(inicio)} – ${Fmt.date(fin)}'),
        content: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: asignados
                .where((c) => c.tipoPago == 'DIA')
                .map((c) => ListTile(
                      dense: true,
                      title: Text(c.nombre),
                      trailing: Text(
                          '${(totalPorColab[c.id] ?? 0).toStringAsFixed(2)} días'),
                    ))
                .toList(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
        ],
      ),
    );
  }

  void _detalleAsistenciaDialog(
      String nombre, String colaboradorId, List<Asistencia> asistencias) {
    final dias = asistencias
        .where((a) => a.colaboradorId == colaboradorId && a.fraccion > 0)
        .toList()
      ..sort((a, b) => a.fecha.compareTo(b.fecha));
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Asistencia — $nombre'),
        content: SizedBox(
          width: double.maxFinite,
          child: dias.isEmpty
              ? const Text('Sin días registrados esta semana.')
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: dias
                      .map((a) => ListTile(
                            dense: true,
                            title: Text(Fmt.dayName(
                                DateTime.fromMillisecondsSinceEpoch(a.fecha))),
                            trailing: Text('${a.fraccion}'),
                          ))
                      .toList(),
                ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
        ],
      ),
    );
  }

  Future<void> _registrarNominaEnCaja(double total, int lunes, DateTime domingo) async {
    final ok = await _confirm(
        '¿Registrar la nómina de ${Fmt.money(total)} como salida en la caja de la obra?',
        'Registrar');
    if (!ok) return;
    await ref.read(movimientoRepositoryProvider).add(
          obraId: _obraId,
          fecha: DateTime.now().millisecondsSinceEpoch,
          tipo: 'SALIDA',
          categoria: 'NOMINA',
          concepto:
              'Nómina ${Fmt.date(lunes)} – ${Fmt.date(domingo.millisecondsSinceEpoch)}',
          monto: total,
          metodoPago: 'Efectivo',
          nominaId: 'nom_${lunes}_$_obraId',
        );
    if (mounted) _snack('Nómina registrada en caja.');
  }

  void _destajosDialog(String colaboradorId, String nombre, List<Destajo> destajos) {
    final propios = destajos.where((d) => d.colaboradorId == colaboradorId).toList();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Destajos — $nombre'),
        content: SizedBox(
          width: double.maxFinite,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (propios.isEmpty)
              const Padding(padding: EdgeInsets.all(8), child: Text('Sin destajos esta semana.'))
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
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
          FilledButton.icon(
            onPressed: () {
              Navigator.pop(ctx);
              _agregarDestajoDialog(colaboradorId);
            },
            icon: const Icon(Icons.add),
            label: const Text('Agregar'),
          ),
        ],
      ),
    );
  }

  Future<void> _agregarDestajoDialog(String colaboradorId) async {
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
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              await ref.read(destajoRepositoryProvider).insert(
                    obraId: _obraId,
                    colaboradorId: colaboradorId,
                    fecha: _inicioSemana, // se registra en el lunes de la semana activa
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

  // ============ CAJA ============
  Widget _cajaTab() {
    final movsAsync = ref.watch(movimientosPorObraProvider(_obraId));
    final partidas =
        ref.watch(partidasPresupuestoPorObraProvider(_obraId)).asData?.value ??
            const [];
    return Scaffold(
      body: movsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (movs) {
          final c = context.colores;
          final resumen = const FlujoCalculator()
              .resumen(movs.map(movimientoToDomain).toList());
          final estado = const EstadoCuentaCalculator()
              .calcular(movimientos: movs, partidas: partidas);
          return ListView(
            // +inset inferior del sistema (barra de navegación) para que el
            // último movimiento y "Borrar todos" no queden bajo la barra.
            padding: EdgeInsets.only(
                bottom: 96 + MediaQuery.viewPaddingOf(context).bottom),
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _kpi('Entradas', resumen.totalEntradas, c.success),
                    _kpi('Salidas', resumen.totalSalidas, c.danger),
                    _kpi('Saldo', resumen.saldo, c.montoTone(resumen.saldo)),
                  ],
                ),
              ),
              // Acción para generar el PDF que se manda AL CLIENTE (solo
              // entradas + saldo). Distinto del PDF de caja interno del AppBar,
              // que sí incluye salidas. Va aquí arriba, junto al presupuesto, no
              // entre los FABs de captura, para no confundirlo con registrar un
              // movimiento.
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                child: OutlinedButton.icon(
                  onPressed: () => _exportarEstadoCuentaCliente(estado, movs),
                  icon: const Icon(Icons.receipt_long),
                  label: const Text('Estado de cuenta del cliente (PDF)'),
                ),
              ),
              if (partidas.isNotEmpty) _presupuestoCard(estado, partidas),
              if (estado.porPersona.isNotEmpty)
                _resumenCard(
                  titulo: 'Pagado por persona',
                  entradas: estado.porPersona,
                  total: estado.totalSalidas,
                  color: c.danger,
                ),
              if (estado.porTipo.isNotEmpty)
                _resumenCard(
                  titulo: 'Recibido por tipo',
                  entradas: estado.porTipo,
                  total: estado.recibido,
                  color: c.success,
                ),
              // Nota libre para explicar el saldo (conciliación manual). Vive en
              // su propio widget con State para dueñar el ciclo de vida del
              // controller sin reconstruirlo en cada rebuild de la caja.
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                child: _NotaConciliacionCard(obraId: _obraId),
              ),
              // El párrafo final del ESTADO DE CUENTA DEL CLIENTE de esta obra,
              // junto a la nota de conciliación y no en Ajustes, igual que en la
              // web: es lo que se imprime en ESE documento —el que se manda al
              // cliente—, no en el PDF de caja interno.
              TextoFinalCard(
                tipo: TipoDocumento.estadoCuenta,
                textoPropio: _textoFinal,
                margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                ctx: (cfg) =>
                    ContextoTextoFinal(nombreEmpresa: cfg.empresaNombre),
                onGuardar: _guardarTextoFinal,
              ),
              const Divider(height: 1),
              if (movs.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: Text('Sin movimientos.')),
                )
              else
                ...movs.map((m) {
                  final entrada = m.tipo == 'ENTRADA';
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ListTile(
                        leading: Icon(
                          entrada ? Icons.south_west : Icons.north_east,
                          color: entrada ? c.success : c.danger,
                        ),
                        title: Row(
                          children: [
                            Expanded(child: Text(m.concepto)),
                            // Indicador visible de que la fila trae comprobante
                            // adjunto; también es la pista de que se puede tocar
                            // para verlo.
                            if (m.comprobanteUri != null)
                              Icon(Icons.attach_file,
                                  size: 16, color: c.textMuted),
                          ],
                        ),
                        subtitle: Text(
                          '${Fmt.date(m.fecha)} · ${m.metodoPago}'
                          '${m.nombre.trim().isEmpty ? '' : ' · ${m.nombre}'}',
                        ),
                        // El signo va en el texto además del color: quien no
                        // distingue verde de rojo necesita el «+»/«−» para leer
                        // la lista (regla `color-not-only`).
                        trailing: MoneyText(
                          entrada ? m.monto : -m.monto,
                          colorearPorSigno: true,
                          mostrarSigno: true,
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        // Tocar la fila abre las acciones de comprobante
                        // (adjuntar / ver); el borrado sigue en pulsación larga.
                        onTap: () => _comprobanteSheet(m),
                        onLongPress: () => _eliminarMov(m),
                      ),
                      const Divider(height: 1),
                    ],
                  );
                }),
              // Acción destructiva al pie de la lista: descubrible pero lejos de
              // los FABs de captura, así no se toca por accidente. Solo aparece
              // si hay algo que borrar. El color `danger` (texto + borde) y el
              // ícono de bote dejan claro que es peligrosa.
              if (movs.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
                  child: OutlinedButton.icon(
                    onPressed: () => _borrarTodosMovs(movs.length),
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Borrar todos los movimientos'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.danger,
                      side: BorderSide(color: c.danger),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
      // Los dos botones usan el par (fondo suave + texto fuerte) en vez de un
      // relleno verde/rojo saturado. El relleno saturado se veía más "botón",
      // pero su texto blanco daba 2.8:1 sobre el verde de Material —reprueba
      // AA— y en tema oscuro empeoraba. Con el par, el código de color se
      // conserva y el texto es legible en ambos temas.
      floatingActionButton: Builder(
        builder: (context) {
          final c = context.colores;
          return Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FloatingActionButton.extended(
                heroTag: 'ent',
                onPressed: () => _movDialog('ENTRADA'),
                backgroundColor: c.successSoft,
                foregroundColor: c.success,
                icon: const Icon(Icons.add),
                label: const Text('Entrada'),
              ),
              const SizedBox(width: 12),
              FloatingActionButton.extended(
                heroTag: 'sal',
                onPressed: () => _movDialog('SALIDA'),
                backgroundColor: c.dangerSoft,
                foregroundColor: c.danger,
                icon: const Icon(Icons.remove),
                label: const Text('Salida'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _movDialog(String tipo) async {
    final conceptoCtrl = TextEditingController();
    final conceptoFocus = FocusNode();
    final nombreCtrl = TextEditingController();
    final nombreFocus = FocusNode();
    final montoCtrl = TextEditingController();
    String metodo = 'Transferencia';
    final formKey = GlobalKey<FormState>();

    // Sugerencias de autocompletado: valores DISTINTOS ya usados en esta obra.
    final movs =
        ref.read(movimientosPorObraProvider(_obraId)).asData?.value ?? const [];
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
      cot = await ref.read(cotizacionDeObraProvider(_obraId).future);
      if (cot != null) {
        partidasObra = await ref.read(partidasDeCotizacionProvider(cot.id).future);
      }
    }
    if (!mounted) return;

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
                    DropdownMenuItem(value: 'Transferencia', child: Text('Transferencia')),
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
                      const DropdownMenuItem(value: null, child: Text('Sin ligar')),
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
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
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
                      obraId: _obraId,
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
  Future<void> _eliminarMov(Movimiento m) async {
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
    if (mounted) showAppSnack(context, 'Movimiento eliminado.');
  }

  /// Hoja de acciones de comprobante de un movimiento: ver el adjunto (si ya
  /// tiene) y adjuntar/reemplazar desde cámara, galería o PDF.
  Future<void> _comprobanteSheet(Movimiento m) async {
    final tiene = m.comprobanteUri != null;
    final opcion = await showModalBottomSheet<String>(
      useSafeArea: true,
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (tiene)
            ListTile(
              leading: const Icon(Icons.visibility_outlined),
              title: const Text('Ver comprobante'),
              onTap: () => Navigator.pop(ctx, 'ver'),
            ),
          ListTile(
            leading: const Icon(Icons.camera_alt_outlined),
            title: Text(tiene ? 'Reemplazar con cámara' : 'Adjuntar con cámara'),
            onTap: () => Navigator.pop(ctx, 'camara'),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(tiene ? 'Reemplazar con galería' : 'Adjuntar de galería'),
            onTap: () => Navigator.pop(ctx, 'galeria'),
          ),
          ListTile(
            leading: const Icon(Icons.picture_as_pdf_outlined),
            title: Text(tiene ? 'Reemplazar con PDF' : 'Adjuntar PDF'),
            onTap: () => Navigator.pop(ctx, 'pdf'),
          ),
        ]),
      ),
    );
    if (opcion == null) return;
    if (opcion == 'ver') {
      await _verComprobante(m);
    } else {
      await _adjuntarComprobante(m, opcion);
    }
  }

  /// Adjunta (o reemplaza) el comprobante de un movimiento.
  ///
  /// ALCANCE v1 (online-only, deliberado): la subida ocurre EN EL MOMENTO y
  /// requiere red + sesión + empresa. No hay cola offline: si no se puede subir
  /// se avisa y se aborta, no se guarda nada pendiente. La cola offline (subir en
  /// diferido al recuperar la red) queda como mejora futura.
  Future<void> _adjuntarComprobante(Movimiento m, String opcion) async {
    // El comprobante vive en `<empresa>/<obra>/…` dentro del bucket privado; sin
    // empresa/sesión no hay ruta válida ni permiso, así que ni intentamos subir.
    final empresaId = ref.read(empresaIdProvider);
    final haySesion = SupabaseConfig.currentUser != null;
    if (empresaId == null || empresaId.isEmpty || !haySesion) {
      showAppSnack(
        context,
        'Necesitas conexión para adjuntar un comprobante.',
        tone: SnackTone.warning,
      );
      return;
    }

    // Selección del archivo (fuera del try: cancelar no es un error).
    String? src;
    if (opcion == 'pdf') {
      final res = await FilePicker.platform
          .pickFiles(type: FileType.custom, allowedExtensions: ['pdf']);
      src = res?.files.single.path;
    } else {
      final picked = await ImagePicker().pickImage(
        source: opcion == 'camara' ? ImageSource.camera : ImageSource.gallery,
      );
      src = picked?.path;
    }
    if (src == null) return; // el usuario canceló

    try {
      final ruta = await ComprobanteStorage.subir(
        empresaId: empresaId,
        obraId: _obraId,
        archivo: File(src),
      );
      await ref.read(movimientoRepositoryProvider).setComprobanteUri(m.id, ruta);
      if (mounted) {
        showAppSnack(context, 'Comprobante adjuntado.',
            tone: SnackTone.success);
      }
    } catch (_) {
      // Red caída / sin permiso / bucket: nunca crasheamos, solo avisamos.
      if (mounted) {
        showAppSnack(
          context,
          'No se pudo adjuntar el comprobante. Revisa tu conexión.',
          tone: SnackTone.danger,
        );
      }
    }
  }

  /// Abre el comprobante de un movimiento. El bucket es privado, así que se pide
  /// una URL firmada de vida corta; la imagen se muestra con `Image.network` y el
  /// PDF con `pdfx` a partir de sus bytes descargados.
  Future<void> _verComprobante(Movimiento m) async {
    final ruta = m.comprobanteUri;
    if (ruta == null) return;
    final esPdf = ruta.toLowerCase().endsWith('.pdf');

    try {
      if (esPdf) {
        final bytes = await ComprobanteStorage.descargar(ruta);
        if (!mounted) return;
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: const Text('Comprobante')),
            body: PdfViewPinch(
              controller: PdfControllerPinch(
                document: PdfDocument.openData(bytes),
              ),
            ),
          ),
        ));
      } else {
        final url = await ComprobanteStorage.urlFirmada(ruta);
        if (!mounted) return;
        await showDialog<void>(
          context: context,
          builder: (ctx) => Dialog(
            child: InteractiveViewer(child: Image.network(url)),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          'No se pudo abrir el comprobante. Revisa tu conexión.',
          tone: SnackTone.danger,
        );
      }
    }
  }

  /// Borra TODOS los movimientos de la obra. Es mucho más destructivo que borrar
  /// uno, así que además del aviso de irreversibilidad exige un paso extra:
  /// escribir la palabra "BORRAR". Es el mismo patrón de la "Zona de peligro" de
  /// Configuración, replicado aquí a propósito porque aquel helper (`_dangerConfirm`)
  /// es privado de esa pantalla.
  Future<void> _borrarTodosMovs(int cantidad) async {
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
      if (mounted) showAppSnack(context, 'La palabra no coincide. Cancelado.');
      return;
    }
    final n =
        await ref.read(movimientoRepositoryProvider).deleteAllByObra(_obraId);
    if (mounted) showAppSnack(context, '$n movimiento(s) eliminados.');
  }

  // ============ ESTADO DE CUENTA (Caja) ============
  Widget _presupuestoCard(
      EstadoCuentaSummary e, List<ObraPresupuestoRow> partidas) {
    final costo = e.costoTotal;
    final progreso = costo > 0 ? (e.recibido / costo).clamp(0.0, 1.0) : 0.0;
    final cs = Theme.of(context).colorScheme;
    final c = context.colores;
    // Totales por sección (solo si la obra vino de una cotización con secciones).
    final porSeccion = <String, double>{};
    for (final p in partidas) {
      final sec = p.seccion.trim();
      if (sec.isEmpty) continue;
      porSeccion[sec] = (porSeccion[sec] ?? 0) + p.cantidad * p.precioUnitario;
    }
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Presupuesto de obra',
                style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _kpi('Costo total', costo, cs.onSurface),
                _kpi('Recibido', e.recibido, c.success),
                _kpi('Pendiente', e.pendiente,
                    e.pendiente > 0 ? c.danger : c.success),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: progreso.toDouble(),
                minHeight: 8,
                backgroundColor: c.surfaceMuted,
                valueColor: AlwaysStoppedAnimation(c.success),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              e.pendiente > 0
                  ? '${(progreso * 100).toStringAsFixed(0)}% cobrado · por cobrar ${Fmt.money(e.pendiente)}'
                  : 'Al corriente',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (porSeccion.isNotEmpty) ...[
              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 8),
              Text('Por sección',
                  style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 2),
              ...porSeccion.entries.map((s) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                            child: Text(s.key,
                                maxLines: 1, overflow: TextOverflow.ellipsis)),
                        Text(Fmt.money(s.value),
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                  )),
            ],
          ],
        ),
      ),
    );
  }

  Widget _resumenCard({
    required String titulo,
    required List<MapEntry<String, double>> entradas,
    required double total,
    required Color color,
  }) {
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(titulo, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 4),
            ...entradas.map((e) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                          child: Text(e.key,
                              maxLines: 1, overflow: TextOverflow.ellipsis)),
                      Text(Fmt.money(e.value),
                          style: TextStyle(
                              color: color, fontWeight: FontWeight.w600)),
                    ],
                  ),
                )),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total',
                    style: TextStyle(fontWeight: FontWeight.bold)),
                Text(Fmt.money(total),
                    style: const TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ============ Helpers UI ============
  Widget _kpi(String label, double value, Color color) => Column(
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: 2),
          MoneyText(
            value,
            color: color,
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      );

  Widget _totalBar(String label, double value) => Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: context.colores.surfaceMuted,
          border: Border(top: BorderSide(color: context.colores.border)),
        ),
        // Suma el inset inferior del sistema al padding: el fondo de la barra
        // llega hasta el borde (se ve anclada) pero el texto queda POR ENCIMA de
        // la barra de navegación de Android, no debajo. Esta pantalla se abre
        // sobre el shell (sin el bottomNavigationBar que ya reservaba ese hueco).
        padding: EdgeInsets.fromLTRB(
            16, 16, 16, 16 + MediaQuery.viewPaddingOf(context).bottom),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: Theme.of(context).textTheme.titleSmall),
            MoneyText(value, style: Theme.of(context).textTheme.titleLarge),
          ],
        ),
      );

  String _ini(String n) => n.isNotEmpty ? n[0].toUpperCase() : '?';

  void _snack(String msg) => showAppSnack(context, msg);

  Future<bool> _confirm(String msg, String accion) async {
    return await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Confirmar'),
            content: Text(msg),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancelar')),
              FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: Text(accion)),
            ],
          ),
        ) ??
        false;
  }
}

/// Tarjeta editable de la nota de conciliación de caja de una obra.
///
/// Se aísla en su propio widget con State por el ciclo de vida del
/// [TextEditingController]: el detalle de obra se reconstruye seguido (streams
/// de caja), y crear el controller en cada rebuild perdería el cursor y el
/// texto a medio escribir. Aquí el controller se crea UNA vez y se libera en
/// [dispose]. Guarda al perder el foco: escribir en cada tecla dispararía un
/// `pending` de sync por pulsación.
class _NotaConciliacionCard extends ConsumerStatefulWidget {
  final String obraId;
  const _NotaConciliacionCard({required this.obraId});

  @override
  ConsumerState<_NotaConciliacionCard> createState() =>
      _NotaConciliacionCardState();
}

class _NotaConciliacionCardState extends ConsumerState<_NotaConciliacionCard> {
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
