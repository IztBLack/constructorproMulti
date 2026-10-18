import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/rol_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/providers.dart';
import '../../data/repositories_lista_material.dart';
import '../../domain/listas/listas_calculo.dart';
import '../../pdf/pdf_service.dart';
import '../common/app_badge.dart';
import '../common/app_snackbar.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import '../common/esqueleto.dart';
import '../common/lista_agrupada.dart';
import '../common/sync_status_action.dart';
import '../pdf_preview_screen.dart';
import 'hojas_lista.dart';

/// Una LISTA DE MATERIAL: el checklist por sección que se palomea en la obra
/// (docs/PLAN_LISTAS_MATERIAL.md §7). Tocar un renglón lo palomea; el lápiz lo
/// edita. Los metros y estribos se recalculan, no se guardan.
class ListaMaterialScreen extends ConsumerStatefulWidget {
  const ListaMaterialScreen({
    super.key,
    required this.listaId,
    required this.obraNombre,
    this.ofrecerPegar = false,
  });

  final String listaId;
  final String obraNombre;

  /// Recién creada: abre de una vez «Pegar nota».
  final bool ofrecerPegar;

  @override
  ConsumerState<ListaMaterialScreen> createState() =>
      _ListaMaterialScreenState();
}

class _ListaMaterialScreenState extends ConsumerState<ListaMaterialScreen> {
  ListaMaterialRepository get _repo => ref.read(listaMaterialRepositoryProvider);
  String get _empresaId => ref.read(empresaIdProvider) ?? '';

  @override
  void initState() {
    super.initState();
    if (widget.ofrecerPegar) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _pegarNota(const []);
      });
    }
  }

  // ── Acciones ──────────────────────────────────────────────────────────

  Future<void> _pegarNota(List<String> secciones) async {
    final leidos = await mostrarHojaPegarNota(context,
        seccionInicial: secciones.isEmpty ? '' : secciones.last);
    if (leidos == null || leidos.isEmpty) return;
    await _repo.agregarLeidos(
        listaId: widget.listaId, empresaId: _empresaId, leidos: leidos);
    if (!mounted) return;
    showAppSnack(context,
        '${leidos.length} ${leidos.length == 1 ? 'renglón agregado' : 'renglones agregados'}.',
        tone: SnackTone.success);
  }

  Future<void> _agregar(List<String> secciones) async {
    final r = await mostrarHojaRenglon(context,
        secciones: secciones,
        seccionInicial: secciones.isEmpty ? '' : secciones.last);
    if (r == null || r.borrar) return;
    await _repo.agregarRenglon(
      listaId: widget.listaId,
      empresaId: _empresaId,
      seccion: r.seccion,
      tipo: r.tipo,
      cantidad: r.cantidad,
      largo: r.largo,
      separacionCm: r.separacionCm,
      unidad: r.unidad,
      descripcion: r.descripcion,
      nota: r.nota,
    );
  }

  Future<void> _editar(
      ListaMaterialRenglonRow actual, List<String> secciones) async {
    final r = await mostrarHojaRenglon(context,
        actual: actual, secciones: secciones);
    if (r == null) return;
    if (r.borrar) {
      await _repo.eliminarRenglon(actual.id);
      if (!mounted) return;
      showAppSnack(
        context,
        'Renglón borrado.',
        undoLabel: 'Deshacer',
        duracion: const Duration(seconds: 8),
        onUndo: () => _repo.actualizarRenglon(ListaMaterialRenglonCompanion(
            id: Value(actual.id), deletedAt: const Value(null))),
      );
      return;
    }
    await _repo.actualizarRenglon(ListaMaterialRenglonCompanion(
      id: Value(actual.id),
      seccion: Value(r.seccion),
      tipo: Value(tipoRenglonListaACadena(r.tipo)),
      cantidad: Value(r.cantidad),
      largo: Value(r.largo),
      separacionCm: Value(r.separacionCm),
      unidad: Value(r.unidad),
      descripcion: Value(r.descripcion),
      nota: Value(r.nota),
    ));
  }

  Future<void> _marcar(ListaMaterialRenglonRow r) {
    final usuario = ref.read(currentUserProvider);
    return _repo.marcar(
      r.id,
      !r.marcado,
      usuarioId: usuario?.id,
      nombre: ref.read(cuentaNombreProvider) ?? '',
    );
  }

  Future<void> _datos(ListaMaterialRow l) async {
    final d = await mostrarHojaDatosLista(context, actual: l);
    if (d == null) return;
    await _repo.actualizar(ListaMaterialCompanion(
      id: Value(l.id),
      titulo: Value(d.titulo),
      plano: Value(d.plano),
      notas: Value(d.notas),
    ));
  }

  Future<void> _pdf(ListaConRenglones l, {required bool conMarcas}) async {
    final config = await ref.read(pdfConfigEfectivaProvider.future);
    final bytes = await PdfService.listaMaterial(
      lista: l,
      obraNombre: widget.obraNombre,
      conMarcas: conMarcas,
      config: config,
    );
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PdfPreviewScreen(
        bytes: bytes,
        titulo: 'Lista de material',
        filename: 'lista-material.pdf',
      ),
    ));
  }

  Future<void> _borrar(ListaMaterialRow l) async {
    final ok = await confirmDialog(
      context,
      title: 'Borrar lista',
      message: 'Se borra «${l.titulo.isEmpty ? 'Lista sin título' : l.titulo}» '
          'con todos sus renglones, aquí y en la nube cuando suba.',
      actionLabel: 'Borrar lista',
    );
    if (!ok) return;
    await _repo.eliminar(l.id);
    if (mounted) Navigator.of(context).pop();
  }

  // ── Pantalla ──────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(listaMaterialProvider(widget.listaId));
    final rol = ref.watch(rolUsuarioProvider).asData?.value;

    return async.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Lista de material')),
        body: const EsqueletoLista(filas: 5),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(title: const Text('Lista de material')),
        body: ErrorStateView(
          message: 'No se pudo mostrar la lista. Tus datos están a salvo en '
              'el teléfono.',
          onRetry: () => ref.invalidate(listaMaterialProvider(widget.listaId)),
        ),
      ),
      data: (l) {
        if (l == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Lista de material')),
            body: const EmptyStateView(
              icon: Icons.checklist_outlined,
              title: 'Esta lista ya no existe.',
              hint: 'Se borró en este teléfono o desde la oficina.',
            ),
          );
        }
        final cerrada =
            estadoListaDeCadena(l.lista.estado) == EstadoLista.cerrada;
        final edita = puedeEditarListas(rol) && !cerrada;
        final secciones = [for (final (s, _) in l.secciones) s];
        return Scaffold(
          appBar: AppBar(
            title: Text(
                l.lista.titulo.isEmpty ? 'Lista de material' : l.lista.titulo),
            actions: [
              const SyncStatusAction(),
              PopupMenuButton<bool>(
                icon: const Icon(Icons.picture_as_pdf_outlined),
                tooltip: 'PDF de la lista',
                onSelected: (conMarcas) => _pdf(l, conMarcas: conMarcas),
                itemBuilder: (_) => const [
                  PopupMenuItem(
                      value: true, child: Text('PDF con lo palomeado')),
                  PopupMenuItem(
                      value: false,
                      child: Text('PDF en blanco para palomear a mano')),
                ],
              ),
              if (puedeEditarListas(rol))
                PopupMenuButton<String>(
                  tooltip: 'Más acciones',
                  onSelected: (v) async {
                    switch (v) {
                      case 'pegar':
                        await _pegarNota(secciones);
                      case 'datos':
                        await _datos(l.lista);
                      case 'cerrar':
                        await _repo.cambiarEstado(l.lista.id,
                            cerrada ? EstadoLista.abierta : EstadoLista.cerrada);
                      case 'borrar':
                        await _borrar(l.lista);
                    }
                  },
                  itemBuilder: (_) => [
                    if (!cerrada)
                      const PopupMenuItem(
                          value: 'pegar', child: Text('Pegar nota')),
                    const PopupMenuItem(
                        value: 'datos', child: Text('Datos de la lista')),
                    PopupMenuItem(
                        value: 'cerrar',
                        child: Text(cerrada ? 'Reabrir lista' : 'Cerrar lista')),
                    const PopupMenuItem(
                        value: 'borrar', child: Text('Borrar lista')),
                  ],
                ),
            ],
          ),
          body: LayoutBuilder(
            builder: (context, c) => ListView(
              padding: margenesDeLista(context, c.maxWidth, arriba: 16)
                  .copyWith(bottom: 96),
              children: [
                _Cabecera(l, cerrada: cerrada),
                const SizedBox(height: 24),
                if (l.renglones.isEmpty)
                  EmptyStateView(
                    icon: Icons.content_paste_outlined,
                    title: 'La lista está vacía.',
                    hint: edita
                        ? 'Pega la nota de WhatsApp tal como la escribes, o '
                            'agrega los renglones uno por uno.'
                        : null,
                    action: edita
                        ? FilledButton.icon(
                            onPressed: () => _pegarNota(secciones),
                            icon: const Icon(Icons.content_paste),
                            label: const Text('Pegar nota'),
                          )
                        : null,
                  ),
                for (final (seccion, renglones) in l.secciones) ...[
                  GrupoLista(
                    titulo: _tituloSeccion(seccion, renglones),
                    children: [
                      for (final r in renglones)
                        _FilaRenglon(
                          r,
                          onMarcar: edita ? () => _marcar(r) : null,
                          onEditar: edita ? () => _editar(r, secciones) : null,
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),
                ],
              ],
            ),
          ),
          floatingActionButton: edita
              ? FloatingActionButton.extended(
                  heroTag: 'fabRenglon',
                  onPressed: () => _agregar(secciones),
                  icon: const Icon(Icons.add),
                  label: const Text('Agregar'),
                )
              : null,
        );
      },
    );
  }

  static String _tituloSeccion(
      String seccion, List<ListaMaterialRenglonRow> renglones) {
    final t = totalesDe(renglones.map(ListaConRenglones.calc));
    final resumen = [
      if (t.piezas > 0) '${numeroCorto(t.piezas)} pzas',
      if (t.metros > 0) '${metros2(t.metros)} m',
    ].join(' · ');
    final nombre = seccion.isEmpty ? 'Sin sección' : seccion;
    return resumen.isEmpty ? nombre : '$nombre · $resumen';
  }
}

/// Lo importante de la lista arriba: plano, fecha, totales y cuánto va
/// palomeado, en texto (no solo la barra).
class _Cabecera extends StatelessWidget {
  const _Cabecera(this.l, {required this.cerrada});

  final ListaConRenglones l;
  final bool cerrada;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final texto = Theme.of(context).textTheme;
    final t = l.totales;
    final datos = [
      if (l.lista.plano.isNotEmpty) 'Plano ${l.lista.plano}',
      Fmt.date(l.lista.fecha),
    ].join(' · ');
    final totales = [
      if (t.piezas > 0) '${numeroCorto(t.piezas)} piezas',
      if (t.metros > 0) '${metros2(t.metros)} m lineales',
      if (t.estribos > 0) '${t.estribos} estribos',
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.surface,
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(AppTheme.radiusXl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(datos,
                    style: texto.bodyMedium?.copyWith(color: c.textMuted)),
              ),
              if (cerrada)
                const AppBadge('Cerrada', tone: BadgeTone.neutral)
              else if (t.completa)
                const AppBadge('Completa', tone: BadgeTone.success),
            ],
          ),
          if (totales.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(totales,
                style: texto.titleMedium?.copyWith(
                  color: c.textStrong,
                  fontFeatures: const [FontFeature.tabularFigures()],
                )),
          ],
          if (t.renglones > 0) ...[
            const SizedBox(height: 12),
            ExcludeSemantics(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: t.marcados / t.renglones,
                  minHeight: 6,
                  color: c.success,
                  backgroundColor: c.neutralSoft,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text('${t.marcados} de ${t.renglones} palomeados',
                style: texto.bodySmall?.copyWith(color: c.textMuted)),
          ],
          if (l.lista.notas.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(l.lista.notas, style: texto.bodyMedium),
          ],
        ],
      ),
    );
  }
}

/// Un renglón del checklist. Tocarlo lo palomea (una fila, una acción); el
/// lápiz, aparte y con su propio nombre para TalkBack, lo edita.
class _FilaRenglon extends StatelessWidget {
  const _FilaRenglon(this.r, {this.onMarcar, this.onEditar});

  final ListaMaterialRenglonRow r;
  final VoidCallback? onMarcar;
  final VoidCallback? onEditar;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final texto = Theme.of(context).textTheme;
    final calc = ListaConRenglones.calc(r);
    final esPieza = calc.tipo == TipoRenglonLista.pieza;
    final metros = metrosLineales(calc);
    final porPieza = estribosPorPieza(r.largo, r.separacionCm);

    final titulo = esPieza
        ? '${numeroCorto(r.cantidad)} × ${r.largo != null ? '${metros2(r.largo!)} m' : '?'}'
        : [numeroCorto(r.cantidad), r.unidad, r.descripcion]
            .where((s) => s.isNotEmpty)
            .join(' ');
    final detalle = [
      if (r.separacionCm != null)
        'Estribo @${numeroCorto(r.separacionCm!)} cm'
            '${porPieza != null ? ' · $porPieza por pieza' : ''}',
      if (r.nota.isNotEmpty) r.nota,
      if (r.marcado && r.marcadoPorNombre.isNotEmpty)
        'Palomeó ${r.marcadoPorNombre}'
            '${r.marcadoAt != null ? ' · ${Fmt.date(r.marcadoAt!)}' : ''}',
    ].join('\n');
    final falta = esPieza && r.largo == null;

    return Row(
      children: [
        Expanded(
          child: MergeSemantics(
            child: InkWell(
              onTap: onMarcar,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 64),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(4, 8, 8, 8),
                  child: Row(
                    children: [
                      Checkbox(
                        value: r.marcado,
                        onChanged: onMarcar == null ? null : (_) => onMarcar!(),
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(titulo,
                                style: texto.bodyLarge?.copyWith(
                                  fontWeight: FontWeight.w500,
                                  color: c.textStrong,
                                  fontFeatures: const [
                                    FontFeature.tabularFigures()
                                  ],
                                )),
                            if (detalle.isNotEmpty)
                              Text(detalle,
                                  style: texto.bodySmall
                                      ?.copyWith(color: c.textMuted)),
                            if (falta)
                              const Padding(
                                padding: EdgeInsets.only(top: 4),
                                child: AppBadge('Falta el largo del plano',
                                    tone: BadgeTone.warning,
                                    icon: Icons.straighten),
                              ),
                          ],
                        ),
                      ),
                      if (metros != null)
                        Text('${metros2(metros)} m',
                            style: texto.bodyMedium?.copyWith(
                              color: c.textMuted,
                              fontFeatures: const [
                                FontFeature.tabularFigures()
                              ],
                            )),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        if (onEditar != null)
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Editar renglón',
            onPressed: onEditar,
          ),
      ],
    );
  }
}
