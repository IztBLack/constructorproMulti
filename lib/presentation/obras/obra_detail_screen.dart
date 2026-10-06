/// El "marco" del detalle de obra: el Scaffold con su AppBar, el menú y las
/// cuatro pestañas.
///
/// Aquí ya no se dibuja ninguna pestaña: cada una vive en
/// `presentation/obras/detalle/` y esta pantalla solo las monta. Lo que se
/// queda es lo que es de NIVEL PANTALLA —lo que necesita la obra completa o el
/// TabController, no una sola pestaña—: cambiar de obra, exportar el PDF de la
/// pestaña activa, importar movimientos y guardar el párrafo final del estado
/// de cuenta.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/sync/rol_provider.dart';
import '../../data/providers.dart';
import '../../domain/logic/estado_cuenta_calculator.dart';
import '../../domain/logic/flujo_calculator.dart';
import '../../domain/logic/nomina_calculator.dart';
import '../../domain/mappers.dart';
import '../../pdf/pdf_service.dart';
import '../common/app_snackbar.dart';
import '../nomina/proyeccion_screen.dart';
import '../notas/notas_obra_screen.dart';
import '../pdf_pre_dialog.dart';
import '../pdf_preview_screen.dart';
import 'detalle/tab_asistencia.dart';
import 'detalle/tab_caja.dart';
import 'detalle/tab_equipo.dart';
import 'detalle/tab_nomina.dart';
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

  /// Lunes de la semana visible en Nómina. Vive aquí y no en la pestaña porque
  /// el botón de exportar PDF del AppBar exporta ESA semana.
  int _inicioSemana = Semana.inicioSemana(DateTime.now());

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
          TabEquipo(obraId: _obraId),
          TabAsistencia(obraId: _obraId),
          TabNomina(
            obraId: _obraId,
            inicioSemana: _inicioSemana,
            onSemanaChanged: (ms) => setState(() => _inicioSemana = ms),
          ),
          TabCaja(
            obraId: _obraId,
            textoFinal: _textoFinal,
            onGuardarTextoFinal: _guardarTextoFinal,
            onExportarEstadoCuenta: _exportarEstadoCuentaCliente,
          ),
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

  void _snack(String msg) => showAppSnack(context, msg);
}
