import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/rol_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../common/app_badge.dart';
import '../common/app_snackbar.dart';
import '../common/app_spacing.dart';
import '../common/cuenta_empresa_subtitulo.dart';
import '../common/async_action_button.dart';
import '../common/sync_status_action.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import 'obra_detail_screen.dart';

/// Filtro por estado de obra. En la BD el campo es `activa` (bool), pero en
/// pantalla lo contrario de "activa" se nombra **archivada** y no "inactiva":
/// una obra terminada no está apagada, está guardada, y ese es el vocabulario
/// con el que el usuario habla de ella. (La web todavía dice "Inactiva" en su
/// badge; si allá se unifica, este es el término al que hay que llegar.)
enum _Filtro {
  activas('Activas'),
  archivadas('Archivadas'),
  todas('Todas');

  const _Filtro(this.etiqueta);
  final String etiqueta;
}

/// Minúsculas y sin acentos. En campo nadie teclea las tildes: una búsqueda que
/// no encuentra "Álvarez" cuando se escribe "alvarez" se siente rota, y el
/// costo de evitarlo son siete reemplazos.
String _normalizar(String s) {
  var t = s.toLowerCase();
  const acentos = {
    'á': 'a',
    'é': 'e',
    'í': 'i',
    'ó': 'o',
    'ú': 'u',
    'ü': 'u',
    'ñ': 'n',
  };
  acentos.forEach((k, v) => t = t.replaceAll(k, v));
  return t;
}

class ObrasScreen extends ConsumerStatefulWidget {
  const ObrasScreen({super.key});

  @override
  ConsumerState<ObrasScreen> createState() => _ObrasScreenState();
}

class _ObrasScreenState extends ConsumerState<ObrasScreen> {
  static const _uuid = Uuid();

  /// Texto tal como se tecleó. Se guarda sin normalizar porque el estado vacío
  /// se lo devuelve al usuario entre comillas: verlo distinto de lo que escribió
  /// haría dudar de si la app buscó lo que él pidió.
  final _buscarCtrl = TextEditingController();
  String _query = '';

  /// Arranca en "Todas" a propósito: esconder de entrada obras que el usuario
  /// sí registró se lee como pérdida de datos, no como filtro. Es el mismo
  /// comportamiento de la web y el de Colaboradores en el móvil.
  _Filtro _filtro = _Filtro.todas;

  @override
  void dispose() {
    _buscarCtrl.dispose();
    super.dispose();
  }

  bool get _hayBusqueda => _query.trim().isNotEmpty;
  bool get _hayFiltro => _hayBusqueda || _filtro != _Filtro.todas;

  void _limpiarBusqueda() {
    _buscarCtrl.clear();
    setState(() => _query = '');
  }

  /// Filtra por estado y por texto en nombre, cliente y ubicación —los mismos
  /// tres campos que busca `buscador-obras.tsx` en la web—, campo por campo y
  /// no sobre su concatenación, para no producir coincidencias que cruzan el
  /// límite entre dos columnas.
  List<Obra> _filtrar(List<Obra> obras) {
    final q = _normalizar(_query.trim());
    return obras.where((o) {
      final pasaEstado = switch (_filtro) {
        _Filtro.activas => o.activa,
        _Filtro.archivadas => !o.activa,
        _Filtro.todas => true,
      };
      if (!pasaEstado) return false;
      if (q.isEmpty) return true;
      return _normalizar(o.nombre).contains(q) ||
          _normalizar(o.cliente).contains(q) ||
          _normalizar(o.ubicacion).contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final obrasAsync = ref.watch(obrasProvider);
    final catalogoAsync = ref.watch(catalogoCountProvider);
    // Gate de rol: un contador (o colaborador) no puede crear/editar/archivar/
    // borrar obras (solo lectura). Conservador: desconocido/carga → puede editar.
    final puedeEditar = ref.watch(puedeEditarOperacionProvider);

    return Scaffold(
      appBar: AppBar(
        title: const TituloConCuenta('Mis Obras'),
        actions: [
          const SyncStatusAction(),
          Center(
            child: Padding(
              padding: const EdgeInsets.only(right: AppSpacing.md),
              child: catalogoAsync.when(
                data: (n) => Text('Catálogo: $n',
                    style: Theme.of(context).textTheme.labelSmall),
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),
            ),
          ),
          PopupMenuButton<_Filtro>(
            // El ícono relleno avisa a distancia que hay un filtro puesto; sin
            // esa señal, una lista corta se confunde con "no hay obras".
            icon: Icon(_filtro == _Filtro.todas
                ? Icons.filter_alt_outlined
                : Icons.filter_alt),
            tooltip: 'Filtrar obras (${_filtro.etiqueta.toLowerCase()})',
            onSelected: (f) => setState(() => _filtro = f),
            itemBuilder: (_) => _Filtro.values
                .map((f) => CheckedPopupMenuItem(
                      value: f,
                      checked: f == _filtro,
                      child: Text(f.etiqueta),
                    ))
                .toList(),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.md, 0, AppSpacing.md, AppSpacing.sm),
            child: TextField(
              controller: _buscarCtrl,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Buscar por nombre, cliente o ubicación…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _hayBusqueda
                    ? IconButton(
                        tooltip: 'Limpiar búsqueda',
                        icon: const Icon(Icons.close),
                        onPressed: _limpiarBusqueda,
                      )
                    : null,
                isDense: true,
                border: const OutlineInputBorder(),
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(syncServiceProvider).syncAll();
        },
        child: obrasAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorStateView(
            message: 'No se pudieron cargar las obras.',
            onRetry: () => ref.invalidate(obrasProvider),
          ),
          data: (obras) {
            final visibles = _filtrar(obras);
            if (visibles.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [_vacio(obras.isEmpty, puedeEditar)],
              );
            }
            return Column(
              children: [
                // Cuenta visible solo cuando algo está recortando la lista: es
                // la confirmación de que la app sí encontró (y de cuánto se
                // está ocultando).
                if (_hayFiltro)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                        AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, 0),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        '${visibles.length} de ${obras.length} obras',
                        style: Theme.of(context)
                            .textTheme
                            .labelMedium
                            ?.copyWith(color: context.colores.textMuted),
                      ),
                    ),
                  ),
                Expanded(
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: visibles.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) => _tile(visibles[i], puedeEditar),
                  ),
                ),
              ],
            );
          },
        ),
      ),
      // Sin permiso de edición (contador/colaborador) no se ofrece crear obra.
      floatingActionButton: puedeEditar
          ? FloatingActionButton.extended(
              onPressed: () => _showObraDialog(null),
              icon: const Icon(Icons.add),
              label: const Text('Nueva obra'),
            )
          : null,
    );
  }

  /// Tres vacíos distintos porque son tres problemas distintos y cada uno tiene
  /// su propia salida: no hay nada que ver (crear), la búsqueda no pegó
  /// (limpiarla) o el filtro dejó fuera todo (quitarlo). Un solo mensaje
  /// genérico obligaría al usuario a adivinar cuál de los tres le tocó.
  Widget _vacio(bool sinObras, bool puedeEditar) {
    if (sinObras) {
      return EmptyStateView(
        icon: Icons.foundation,
        title: 'No hay obras registradas.',
        hint: puedeEditar
            ? 'Crea la primera obra para empezar a llevar su gasto.'
            : 'Aún no hay obras que consultar.',
        // Sin permiso de edición no se ofrece crear (sería un botón muerto).
        action: puedeEditar
            ? FilledButton.icon(
                onPressed: () => _showObraDialog(null),
                icon: const Icon(Icons.add),
                label: const Text('Nueva obra'),
              )
            : null,
      );
    }

    if (_hayBusqueda) {
      return EmptyStateView(
        icon: Icons.search_off,
        title: 'Ninguna obra coincide con «${_query.trim()}»',
        hint: _filtro == _Filtro.todas
            ? 'Revisa el nombre, el cliente o la ubicación.'
            : 'Solo se está buscando entre las obras '
                '${_filtro.etiqueta.toLowerCase()}.',
        action: TextButton.icon(
          onPressed: _limpiarBusqueda,
          icon: const Icon(Icons.close),
          label: const Text('Limpiar búsqueda'),
        ),
      );
    }

    final soloActivas = _filtro == _Filtro.activas;
    return EmptyStateView(
      icon: soloActivas ? Icons.engineering : Icons.archive_outlined,
      title: soloActivas ? 'No hay obras activas.' : 'No hay obras archivadas.',
      hint: 'Todas las obras registradas quedaron fuera de este filtro.',
      action: TextButton.icon(
        onPressed: () => setState(() => _filtro = _Filtro.todas),
        icon: const Icon(Icons.filter_alt_off),
        label: const Text('Ver todas'),
      ),
    );
  }

  Widget _tile(Obra obra, bool puedeEditar) {
    final detalle = [obra.cliente, obra.ubicacion]
        .where((s) => s.isNotEmpty)
        .join(' · ');

    return ListTile(
      leading: CircleAvatar(
        backgroundColor: obra.activa ? null : context.colores.neutralSoft,
        child: Icon(obra.activa ? Icons.engineering : Icons.archive),
      ),
      title: Text(obra.nombre),
      // El badge va en el subtítulo y no en el trailing porque ahí ya vive el
      // menú de acciones; además así el estado se lee junto al nombre.
      subtitle: (obra.activa && detalle.isEmpty)
          ? null
          : Row(
              children: [
                if (!obra.activa) ...[
                  const AppBadge('Archivada'),
                  const SizedBox(width: AppSpacing.sm),
                ],
                if (detalle.isNotEmpty)
                  Expanded(
                    child: Text(detalle, overflow: TextOverflow.ellipsis),
                  ),
              ],
            ),
      // Sin permiso de edición se oculta el menú entero: la fila queda de solo
      // lectura (se puede abrir la obra, pero no editarla/archivarla/borrarla).
      trailing: !puedeEditar
          ? null
          : PopupMenuButton<String>(
        onSelected: (v) {
          if (v == 'editar') _showObraDialog(obra);
          if (v == 'archivar') _setArchivada(obra, true);
          if (v == 'desarchivar') _setArchivada(obra, false);
          if (v == 'eliminar') _confirmDelete(obra);
        },
        // No es `const` porque el ítem de archivar depende del estado de la obra.
        itemBuilder: (_) => [
          const PopupMenuItem(value: 'editar', child: Text('Editar')),
          // Archivar/desarchivar es el MISMO acto reversible visto desde los dos
          // lados: si está activa se ofrece guardarla, si ya está guardada se
          // ofrece reactivarla. Va antes de "Eliminar" para separar lo
          // reversible de lo irreversible.
          if (obra.activa)
            const PopupMenuItem(
              value: 'archivar',
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.archive_outlined),
                title: Text('Archivar'),
              ),
            )
          else
            const PopupMenuItem(
              value: 'desarchivar',
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.unarchive_outlined),
                title: Text('Desarchivar'),
              ),
            ),
          const PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
        ],
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ObraDetailScreen(obra: obra),
        ),
      ),
    );
  }

  Future<void> _showObraDialog(Obra? obra) async {
    final nombreCtrl = TextEditingController(text: obra?.nombre ?? '');
    final clienteCtrl = TextEditingController(text: obra?.cliente ?? '');
    final ubicacionCtrl = TextEditingController(text: obra?.ubicacion ?? '');
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(obra == null ? 'Nueva obra' : 'Editar obra'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: nombreCtrl,
                decoration: const InputDecoration(labelText: 'Nombre de la obra'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'El nombre es obligatorio' : null,
              ),
              TextFormField(
                controller: clienteCtrl,
                decoration: const InputDecoration(labelText: 'Cliente'),
              ),
              TextFormField(
                controller: ubicacionCtrl,
                decoration: const InputDecoration(labelText: 'Ubicación'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          AsyncActionButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              final repo = ref.read(obraRepositoryProvider);
              await repo.upsert(ObrasCompanion(
                id: Value(obra?.id ?? _uuid.v4()),
                nombre: Value(nombreCtrl.text.trim()),
                cliente: Value(clienteCtrl.text.trim()),
                ubicacion: Value(ubicacionCtrl.text.trim()),
                fechaInicio:
                    Value(obra?.fechaInicio ?? DateTime.now().millisecondsSinceEpoch),
                activa: Value(obra?.activa ?? true),
              ));
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  /// Archiva o reactiva una obra. A diferencia de [_confirmDelete], NO pide
  /// confirmación: archivar es reversible (solo cambia `activa`, no borra nada),
  /// así que la acción directa + un aviso que la confirma basta; el diálogo
  /// destructivo se reserva para eliminar, que sí arrastra el historial y no
  /// tiene vuelta atrás.
  Future<void> _setArchivada(Obra obra, bool archivada) async {
    await ref.read(obraRepositoryProvider).setArchivada(obra.id, archivada);
    if (!mounted) return;
    showAppSnack(
      context,
      archivada ? 'Obra archivada.' : 'Obra reactivada.',
      tone: SnackTone.success,
    );
  }

  Future<void> _confirmDelete(Obra obra) async {
    // Eliminar una obra completa es irreversible y arrastra su historial:
    // confirmación destructiva (botón en color de error) con mensaje fuerte.
    final ok = await confirmDialog(
      context,
      title: 'Eliminar obra',
      message:
          'Se eliminará la obra "${obra.nombre}" y todo su historial relacionado. '
          'Esta acción no se puede deshacer.',
      actionLabel: 'Eliminar obra',
    );
    if (ok) {
      await ref.read(obraRepositoryProvider).delete(obra.id);
    }
  }
}
