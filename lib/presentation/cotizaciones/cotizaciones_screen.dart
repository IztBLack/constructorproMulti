import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../data/providers.dart';
import '../common/app_spacing.dart';
import '../common/async_action_button.dart';
import '../common/sync_status_action.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import 'cotizacion_detail_screen.dart';
import 'estado_cotizacion_badge.dart';

class CotizacionesScreen extends ConsumerStatefulWidget {
  const CotizacionesScreen({super.key});

  @override
  ConsumerState<CotizacionesScreen> createState() => _CotizacionesScreenState();
}

class _CotizacionesScreenState extends ConsumerState<CotizacionesScreen> {
  static const _uuid = Uuid();

  final _buscadorCtrl = TextEditingController();

  /// Texto tal cual lo escribió el usuario. Se guarda sin normalizar porque el
  /// estado vacío lo repite entre comillas: mostrarle "no encontré CASAS" a
  /// quien escribió "Casas" se lee como si la app le hubiera cambiado la
  /// búsqueda.
  String _query = '';

  /// `null` es el "Todos" de la web. Un `null` explícito evita inventar un
  /// sexto valor de estado que luego habría que excluir en cada comparación.
  String? _estado;

  @override
  void dispose() {
    _buscadorCtrl.dispose();
    super.dispose();
  }

  void _limpiarFiltros() {
    _buscadorCtrl.clear();
    setState(() {
      _query = '';
      _estado = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cotsAsync = ref.watch(cotizacionesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cotizaciones'),
        actions: const [SyncStatusAction()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              controller: _buscadorCtrl,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Buscar proyecto o cliente…',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: const OutlineInputBorder(),
                // Borrar la búsqueda a mano en un teclado de teléfono es
                // tedioso; el botón la deja vacía de un toque.
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Borrar búsqueda',
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _buscadorCtrl.clear();
                          setState(() => _query = '');
                        },
                      ),
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
        ),
      ),
      body: cotsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron cargar las cotizaciones.',
          onRetry: () => ref.invalidate(cotizacionesProvider),
        ),
        data: (cots) {
          final visibles = _filtrar(cots);
          return Column(
            children: [
              // Los chips solo aparecen cuando hay algo que filtrar: una fila de
              // seis contadores en cero, sobre una lista vacía, es ruido.
              if (cots.isNotEmpty) ...[
                _FiltroEstado(
                  cotizaciones: cots,
                  seleccionado: _estado,
                  onSeleccionar: (e) => setState(() => _estado = e),
                ),
                const Divider(height: 1),
              ],
              Expanded(
                child: visibles.isEmpty
                    ? _vacio(cots.isEmpty)
                    : ListView.separated(
                        itemCount: visibles.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, i) => _fila(visibles[i]),
                      ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _dialog(null),
        icon: const Icon(Icons.add),
        label: const Text('Nueva'),
      ),
    );
  }

  List<Cotizacion> _filtrar(List<Cotizacion> cots) {
    final q = _query.trim().toLowerCase();
    return cots.where((c) {
      if (_estado != null && c.estado != _estado) return false;
      if (q.isEmpty) return true;
      // Proyecto y cliente son los dos nombres con los que la gente se refiere
      // a una cotización; buscar solo por uno obliga a recordar cuál se usó.
      return c.nombreProyecto.toLowerCase().contains(q) ||
          c.cliente.toLowerCase().contains(q);
    }).toList();
  }

  /// Dos vacíos distintos porque son dos problemas distintos: "todavía no
  /// creaste nada" se resuelve creando, y "tu filtro no encontró nada" se
  /// resuelve quitando el filtro. Ofrecer la salida equivocada deja al usuario
  /// atorado creyendo que borró sus cotizaciones.
  Widget _vacio(bool sinCotizaciones) {
    if (sinCotizaciones) {
      return const EmptyStateView(
        icon: Icons.description_outlined,
        title: 'Aún no hay cotizaciones.',
        hint: 'Toca “Nueva” para crear la primera.',
      );
    }
    return EmptyStateView(
      icon: Icons.search_off,
      title: 'Ninguna cotización coincide.',
      hint: _pistaSinResultados(),
      action: FilledButton.tonalIcon(
        onPressed: _limpiarFiltros,
        icon: const Icon(Icons.filter_alt_off),
        label: const Text('Quitar filtros'),
      ),
    );
  }

  String _pistaSinResultados() {
    final texto = _query.trim();
    final etiqueta =
        _estado == null ? null : etiquetaEstadoCotizacion(_estado!);
    if (etiqueta != null && texto.isNotEmpty) {
      return 'Ninguna cotización en “$etiqueta” coincide con “$texto”.';
    }
    if (etiqueta != null) return 'No hay cotizaciones en “$etiqueta”.';
    return 'Ningún proyecto ni cliente coincide con “$texto”.';
  }

  Widget _fila(Cotizacion c) {
    return ListTile(
      title: Text(c.nombreProyecto),
      // El estado dejó de ser un círculo de color a la izquierda —que
      // obligaba a memorizar qué significaba cada tono— y pasó a ser
      // una etiqueta que lo dice con palabras, igual que en la web.
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
          children: [
            EstadoCotizacionBadge(c.estado),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                '${c.cliente} · ${Fmt.date(c.fecha)}',
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
      trailing: PopupMenuButton<String>(
        tooltip: 'Acciones de la cotización',
        onSelected: (v) {
          if (v == 'editar') _dialog(c);
          if (v == 'eliminar') _confirmDelete(c);
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'editar', child: Text('Editar')),
          PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
        ],
      ),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => CotizacionDetailScreen(cotizacion: c),
      )),
    );
  }

  Future<void> _dialog(Cotizacion? cot) async {
    final nombreCtrl = TextEditingController(text: cot?.nombreProyecto ?? '');
    final clienteCtrl = TextEditingController(text: cot?.cliente ?? '');
    final ubicacionCtrl = TextEditingController(text: cot?.ubicacion ?? '');
    final descuentoCtrl = TextEditingController(
        text: (cot?.descuento ?? 0) > 0 ? cot!.descuento.toString() : '');
    final formKey = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(cot == null ? 'Nueva cotización' : 'Editar cotización'),
        content: Form(
          key: formKey,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(
              controller: nombreCtrl,
              decoration: const InputDecoration(labelText: 'Nombre del proyecto'),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Requerido' : null,
            ),
            TextFormField(
              controller: clienteCtrl,
              decoration: const InputDecoration(labelText: 'Cliente'),
            ),
            TextFormField(
              controller: ubicacionCtrl,
              decoration: const InputDecoration(labelText: 'Ubicación'),
            ),
            TextFormField(
              controller: descuentoCtrl,
              decoration: const InputDecoration(
                  labelText: 'Descuento (%)', suffixText: '%'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          AsyncActionButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              await ref.read(cotizacionRepositoryProvider).upsert(
                    CotizacionesCompanion(
                      id: Value(cot?.id ?? _uuid.v4()),
                      nombreProyecto: Value(nombreCtrl.text.trim()),
                      cliente: Value(clienteCtrl.text.trim()),
                      ubicacion: Value(ubicacionCtrl.text.trim()),
                      fecha: Value(cot?.fecha ?? DateTime.now().millisecondsSinceEpoch),
                      estado: Value(cot?.estado ?? 'BORRADOR'),
                      ivaEnabled: Value(cot?.ivaEnabled ?? true),
                      // Solo una cotización NUEVA toma la foto del IVA global
                      // vigente; al editar se conserva la tasa ya congelada
                      // (Value.absent no toca la columna en el upsert).
                      ivaPorcentaje: cot == null
                          ? Value(ref.read(ivaPorcentajeProvider))
                          : const Value.absent(),
                      descuento: Value(double.tryParse(descuentoCtrl.text.trim()) ?? 0),
                    ),
                  );
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(Cotizacion c) async {
    final ok = await confirmDialog(
      context,
      title: 'Eliminar cotización',
      message:
          '¿Eliminar la cotización "${c.nombreProyecto}"? Se borran sus secciones, partidas y pagos. '
          'Esta acción no se puede deshacer.',
      actionLabel: 'Eliminar',
    );
    if (ok) await ref.read(cotizacionRepositoryProvider).delete(c.id);
  }
}

/// Fila de chips de estado, gemela del filtro de
/// `web/src/app/admin/cotizaciones/filtro-estado.tsx`.
///
/// La web puede permitirse seis botones en una fila; un teléfono no, así que la
/// fila se desplaza en horizontal en vez de partirse en dos renglones o de
/// encogerse a un `SegmentedButton` ilegible.
class _FiltroEstado extends StatelessWidget {
  const _FiltroEstado({
    required this.cotizaciones,
    required this.seleccionado,
    required this.onSeleccionar,
  });

  final List<Cotizacion> cotizaciones;
  final String? seleccionado;
  final ValueChanged<String?> onSeleccionar;

  @override
  Widget build(BuildContext context) {
    final conteos = <String, int>{};
    for (final c in cotizaciones) {
      conteos[c.estado] = (conteos[c.estado] ?? 0) + 1;
    }

    // Sin alto fijo a propósito: el chip crece con el escalado de texto del
    // sistema y una caja de altura cerrada lo recortaría.
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      child: Row(
        children: [
          _chip(
            etiqueta: 'Todos',
            conteo: cotizaciones.length,
            activo: seleccionado == null,
            tooltip: 'Mostrar todas las cotizaciones',
            onTap: () => onSeleccionar(null),
          ),
          // Se listan los cinco estados aunque alguno vaya en cero: si los
          // chips aparecieran y desaparecieran según los datos, el filtro
          // cambiaría de forma bajo el dedo del usuario.
          for (final e in estadosCotizacion)
            _chip(
              etiqueta: etiquetaEstadoCotizacion(e),
              conteo: conteos[e] ?? 0,
              activo: seleccionado == e,
              tooltip:
                  'Mostrar solo cotizaciones en ${etiquetaEstadoCotizacion(e).toLowerCase()}',
              // Volver a tocar el chip activo regresa a "Todos": en un
              // teléfono se filtra y se desfiltra con el mismo pulgar, y
              // obligar a viajar hasta el extremo izquierdo de la fila para
              // limpiar es un viaje de más.
              onTap: () => onSeleccionar(seleccionado == e ? null : e),
            ),
        ],
      ),
    );
  }

  Widget _chip({
    required String etiqueta,
    required int conteo,
    required bool activo,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: AppSpacing.sm),
      child: FilterChip(
        // El contador va dentro de la etiqueta y no en un badge aparte: dice
        // cuánto hay ANTES de tocar, que es lo que evita el filtro que no
        // devuelve nada.
        label: Text('$etiqueta ($conteo)'),
        selected: activo,
        tooltip: tooltip,
        showCheckmark: false,
        onSelected: (_) => onTap(),
      ),
    );
  }
}
