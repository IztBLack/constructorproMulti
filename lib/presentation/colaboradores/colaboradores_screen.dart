import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/sync/cloud_providers.dart';
import '../../domain/logic/salario_periodo.dart';
import '../../core/theme/app_colors.dart';
import '../../data/orden_personalizado.dart';
import '../../data/providers.dart';
import '../common/async_action_button.dart';
import '../common/sync_status_action.dart';
import '../common/confirm_dialog.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import '../common/orden_modo_toggle.dart';
import '../cuadrillas/cuadrillas_screen.dart';

enum _Sort { nombreAsc, nombreDesc, puesto, obra }

class ColaboradoresScreen extends ConsumerStatefulWidget {
  const ColaboradoresScreen({super.key});

  @override
  ConsumerState<ColaboradoresScreen> createState() => _ColaboradoresScreenState();
}

class _ColaboradoresScreenState extends ConsumerState<ColaboradoresScreen> {
  static const _uuid = Uuid();
  String _query = '';
  _Sort _sort = _Sort.nombreAsc;
  bool _mostrarInactivos = true;

  /// Obra por la que se está filtrando (null = todas). Filtra en DURO: muestra
  /// solo a los asignados a esa obra, igual que un filtro por género. Se eligió
  /// sobre "priorizar y luego el resto" porque una lista mezclada no deja ver
  /// dónde termina la obra. Para asignar a alguien nuevo se quita el filtro.
  String? _obraId;

  /// Con un filtro de obra puesto, muestra ADEMÁS al resto del equipo en una
  /// segunda sección. Apagado por defecto: el filtro debe seguir respondiendo
  /// "quién está en esta obra" de un vistazo; esto es para cuando hace falta
  /// jalar a alguien de fuera sin perder el filtro.
  bool _verResto = false;

  @override
  Widget build(BuildContext context) {
    final colaboradoresAsync = ref.watch(colaboradoresProvider);
    final puestos = ref.watch(puestosProvider).asData?.value ?? const <Puesto>[];
    final puestoNombre = {for (final p in puestos) p.id: p.nombre};
    final obrasPorColab =
        ref.watch(colaboradorObrasProvider).asData?.value ??
            const <String, List<Obra>>{};

    return Scaffold(
      appBar: AppBar(
        title: const Text('Colaboradores'),
        actions: [
          const SyncStatusAction(),
          IconButton(
            tooltip: 'Cuadrillas',
            icon: const Icon(Icons.groups),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => const CuadrillasScreen(),
            )),
          ),
          PopupMenuButton<_Sort>(
            icon: const Icon(Icons.sort),
            onSelected: (s) => setState(() => _sort = s),
            itemBuilder: (_) => const [
              PopupMenuItem(value: _Sort.nombreAsc, child: Text('Nombre (A-Z)')),
              PopupMenuItem(value: _Sort.nombreDesc, child: Text('Nombre (Z-A)')),
              PopupMenuItem(value: _Sort.puesto, child: Text('Por puesto')),
              PopupMenuItem(value: _Sort.obra, child: Text('Por obra asignada')),
            ],
          ),
          IconButton(
            tooltip: _mostrarInactivos ? 'Ocultar inactivos' : 'Mostrar inactivos',
            icon: Icon(_mostrarInactivos ? Icons.visibility : Icons.visibility_off),
            onPressed: () => setState(() => _mostrarInactivos = !_mostrarInactivos),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(150),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  decoration: const InputDecoration(
                    hintText: 'Buscar colaborador…',
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (v) => setState(() => _query = v.toLowerCase()),
                ),
                const SizedBox(height: 6),
                // Filtro por obra: una fila de chips desplazable (como el filtro
                // de estado de cotizaciones). Va FUERA del menú de orden a
                // propósito: filtrar y ordenar son cosas distintas y mezclarlas
                // haría que elegir una obra pareciera un criterio de orden.
                _FiltroObra(
                  seleccionada: _obraId,
                  obrasPorColab: obrasPorColab,
                  onSeleccionar: (id) => setState(() => _obraId = id),
                ),
                const SizedBox(height: 6),
                // "Orden" (sincronizado) manda sobre el menú local de arriba: al
                // elegirlo se ignora el sort por nombre/puesto/obra y se puede
                // arrastrar.
                const Align(
                  alignment: Alignment.centerRight,
                  child: OrdenModoToggle(listKey: OrdenLista.colaboradores),
                ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(syncServiceProvider).syncAll();
        },
        child: colaboradoresAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron cargar los colaboradores.',
          onRetry: () => ref.invalidate(colaboradoresProvider),
        ),
        data: (todos) {
          final modo = ref.watch(ordenModoProvider)[OrdenLista.colaboradores] ??
              modoNombre;
          final personalizado = esModoPersonalizado(modo);
          var lista = todos
              .where((c) => _mostrarInactivos || c.activo)
              .where((c) => c.nombre.toLowerCase().contains(_query))
              .toList();
          bool enObra(Colaborador c) => (obrasPorColab[c.id] ?? const <Obra>[])
              .any((o) => o.id == _obraId);
          // Filtro por obra: la lista principal son los asignados; el resto
          // queda aparte para la sección opcional "ver los demás".
          final resto = _obraId == null
              ? const <Colaborador>[]
              : lista.where((c) => !enObra(c)).toList();
          if (_obraId != null) lista = lista.where(enObra).toList();
          // El botón de orden manda: solo si está "por nombre" se respeta el
          // menú local (nombre/puesto/obra); los demás modos ordenan aquí.
          if (modo != modoNombre) {
            lista = ordenarPorModo(
              items: lista,
              modo: modo,
              nombreDe: (c) => c.nombre,
              creadoDe: (c) => c.createdAt,
              modificadoDe: (c) => c.updatedAt,
            );
          }
          if (modo == modoNombre) {
          switch (_sort) {
            case _Sort.nombreAsc:
              lista.sort((a, b) => a.nombre.compareTo(b.nombre));
            case _Sort.nombreDesc:
              lista.sort((a, b) => b.nombre.compareTo(a.nombre));
            case _Sort.puesto:
              lista.sort((a, b) => (puestoNombre[a.puestoId] ?? '')
                  .compareTo(puestoNombre[b.puestoId] ?? ''));
            case _Sort.obra:
              String obraKey(Colaborador c) {
                final obras = obrasPorColab[c.id] ?? const <Obra>[];
                if (obras.isEmpty) return 'zzz';
                return obras
                    .map((o) => o.nombre.toLowerCase())
                    .reduce((a, b) => a.compareTo(b) <= 0 ? a : b);
              }

              lista.sort((a, b) {
                final cmp = obraKey(a).compareTo(obraKey(b));
                return cmp != 0 ? cmp : a.nombre.compareTo(b.nombre);
              });
          }
          }
          if (lista.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                if (_obraId != null)
                  EmptyStateView(
                    icon: Icons.engineering_outlined,
                    title: 'Nadie asignado a esta obra.',
                    hint: 'Quita el filtro para ver a todo el equipo y asignar.',
                    action: TextButton.icon(
                      onPressed: () => setState(() => _obraId = null),
                      icon: const Icon(Icons.filter_alt_off),
                      label: const Text('Ver todas las obras'),
                    ),
                  )
                else
                  const EmptyStateView(
                    icon: Icons.groups_outlined,
                    title: 'No hay colaboradores.',
                    hint: 'Toca “Nuevo” para agregar uno.',
                  ),
              ],
            );
          }
          // Arrastrar solo sobre la lista completa (sin búsqueda ni filtro de
          // obra y con inactivos visibles): reordenar un subconjunto mezclaría
          // las posiciones del resto.
          final puedeArrastrar = personalizado &&
              _query.isEmpty &&
              _mostrarInactivos &&
              _obraId == null;
          Widget itemAt(BuildContext context, int i) {
              final c = lista[i];
              final tipo = c.tipoPago == 'DIA' ? 'Por día' : 'Por destajo';
              final obras = obrasPorColab[c.id] ?? const <Obra>[];
              return ListTile(
                key: ValueKey(c.id),
                isThreeLine: true,
                leading: CircleAvatar(
                  backgroundColor: c.activo ? null : context.colores.neutralSoft,
                  child: Text(c.nombre.isNotEmpty ? c.nombre[0].toUpperCase() : '?'),
                ),
                title: Text(c.nombre,
                    style: TextStyle(
                        decoration: c.activo ? null : TextDecoration.lineThrough)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        '${puestoNombre[c.puestoId] ?? 'Sin puesto'} · $tipo${c.activo ? '' : ' · INACTIVO'}'),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        ...obras.map((o) => Chip(
                              label: Text(o.nombre),
                              visualDensity: VisualDensity.compact,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              avatar: const Icon(Icons.check, size: 16),
                            )),
                        ActionChip(
                          label: const Text('Asignar'),
                          avatar: const Icon(Icons.add, size: 16),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          onPressed: () => _asignarObraSheet(c),
                        ),
                      ],
                    ),
                  ],
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (v) async {
                    final repo = ref.read(colaboradorRepositoryProvider);
                    switch (v) {
                      case 'editar':
                        _showDialog(c, puestos);
                      case 'asignar':
                        _asignarObraSheet(c);
                      case 'toggle':
                        await repo.setActivo(c.id, !c.activo);
                      case 'historial':
                        _showHistorial(c);
                      case 'eliminar':
                        _confirmDelete(c);
                    }
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'editar', child: Text('Editar')),
                    const PopupMenuItem(
                        value: 'asignar', child: Text('Asignar a obra')),
                    PopupMenuItem(
                        value: 'toggle',
                        child: Text(c.activo ? 'Marcar inactivo' : 'Marcar activo')),
                    const PopupMenuItem(value: 'historial', child: Text('Historial de obras')),
                    const PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
                  ],
                ),
                onTap: () => _showDialog(c, puestos),
              );
          }
          if (puedeArrastrar) {
            return ReorderableListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: lista.length,
              onReorder: (oldIndex, newIndex) {
                if (newIndex > oldIndex) newIndex -= 1;
                final ids = lista.map((c) => c.id).toList();
                final movido = ids.removeAt(oldIndex);
                ids.insert(newIndex, movido);
                ref.read(ordenRepositoryProvider).reordenarPorId(
                      'colaboradores',
                      esInvertido(modo)
                          ? ids.reversed.toList()
                          : ids,
                    );
              },
              itemBuilder: itemAt,
            );
          }
          // Sin filtro de obra: lista simple. Con filtro: se añade el pie que
          // deja ver (u ocultar) al resto del equipo sin perder el filtro.
          final hayResto = _obraId != null && resto.isNotEmpty;
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: lista.length +
                (hayResto ? 1 + (_verResto ? resto.length : 0) : 0),
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              if (i < lista.length) return itemAt(context, i);
              if (i == lista.length) {
                return _PieVerResto(
                  cantidad: resto.length,
                  abierto: _verResto,
                  onToggle: () => setState(() => _verResto = !_verResto),
                );
              }
              // Filas del resto: se pintan atenuadas para que se lean como "no
              // son de esta obra" aunque estén en la misma lista.
              final c = resto[i - lista.length - 1];
              return Opacity(
                opacity: 0.75,
                child: ListTile(
                  key: ValueKey('resto_${c.id}'),
                  leading: CircleAvatar(
                    backgroundColor: context.colores.neutralSoft,
                    child: Text(
                        c.nombre.isNotEmpty ? c.nombre[0].toUpperCase() : '?'),
                  ),
                  title: Text(c.nombre),
                  subtitle: Text(puestoNombre[c.puestoId] ?? 'Sin puesto'),
                  trailing: TextButton.icon(
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Asignar'),
                    onPressed: () => _asignarObraSheet(c),
                  ),
                  onTap: () => _showDialog(c, puestos),
                ),
              );
            },
          );
        },
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (puestos.isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Primero crea un puesto en Configuración.'),
            ));
            return;
          }
          _showDialog(null, puestos);
        },
        icon: const Icon(Icons.person_add),
        label: const Text('Nuevo'),
      ),
    );
  }

  /// Bottom sheet para asignar/desvincular el colaborador a varias obras
  /// activas (espejo del bottom sheet de Kotlin). Tocar una obra asignada la
  /// desvincula (con confirmación); tocar una libre la asigna.
  Future<void> _asignarObraSheet(Colaborador c) async {
    final obras = (ref.read(obrasProvider).asData?.value ?? const <Obra>[])
        .where((o) => o.activa)
        .toList();
    if (obras.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No hay obras activas.')));
      return;
    }
    await showModalBottomSheet<void>(
      useSafeArea: true,
      context: context,
      builder: (ctx) {
        return Consumer(builder: (ctx, ref2, _) {
          final asignadas = ref2.watch(colaboradorObrasProvider).asData?.value ??
              const <String, List<Obra>>{};
          final asignadasIds =
              (asignadas[c.id] ?? const <Obra>[]).map((o) => o.id).toSet();
          final repo = ref2.read(colaboradorRepositoryProvider);
          return ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Obras de ${c.nombre}',
                    style: Theme.of(ctx).textTheme.titleMedium),
              ),
              const Divider(height: 1),
              ...obras.map((o) {
                final asignada = asignadasIds.contains(o.id);
                return ListTile(
                  leading: Icon(
                      asignada ? Icons.check_circle : Icons.circle_outlined,
                      color: asignada
                          ? Theme.of(ctx).colorScheme.primary
                          : null),
                  title: Text(o.nombre),
                  subtitle: o.cliente.isEmpty ? null : Text(o.cliente),
                  trailing: asignada
                      ? const Text('Asignado',
                          style: TextStyle(fontWeight: FontWeight.bold))
                      : null,
                  onTap: () async {
                    if (asignada) {
                      final ok = await confirmDialog(
                        ctx,
                        title: 'Desvincular obra',
                        message:
                            '¿Desvincular a "${c.nombre}" de "${o.nombre}"?',
                        actionLabel: 'Desvincular',
                        destructive: false,
                      );
                      if (ok) await repo.desvincular(o.id, c.id);
                    } else {
                      await repo.asignarObra(obraId: o.id, colaboradorId: c.id);
                    }
                  },
                );
              }),
              const SizedBox(height: 8),
            ],
          );
        });
      },
    );
  }

  Future<void> _showHistorial(Colaborador c) async {
    final historial = await ref.read(colaboradorRepositoryProvider).historial(c.id);
    if (!mounted) return;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Historial — ${c.nombre}'),
        content: SizedBox(
          width: double.maxFinite,
          child: historial.isEmpty
              ? const Text('Sin asignaciones registradas.')
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: historial
                      .map((h) => ListTile(
                            dense: true,
                            title: Text(h.obra.nombre),
                            subtitle: Text(
                                'Ingreso: ${Fmt.date(h.rel.fechaIngreso)}'
                                '${h.rel.fechaSalida != null ? ' · Salida: ${Fmt.date(h.rel.fechaSalida!)}' : ' · Activo'}'),
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

  Future<void> _showDialog(Colaborador? colaborador, List<Puesto> puestos) async {
    final nombreCtrl = TextEditingController(text: colaborador?.nombre ?? '');
    final montoCtrl = TextEditingController(
        text: colaborador?.salarioPeriodo?.toString() ?? '');
    final telCtrl = TextEditingController(text: colaborador?.telefono ?? '');
    final emNombreCtrl = TextEditingController(text: colaborador?.contactoNombre ?? '');
    final emTelCtrl = TextEditingController(text: colaborador?.contactoTelefono ?? '');
    final emParCtrl = TextEditingController(text: colaborador?.contactoParentesco ?? '');
    String? puestoId = colaborador?.puestoId ??
        (puestos.isNotEmpty ? puestos.first.id : null);
    String tipoPago = colaborador?.tipoPago ?? 'DIA';
    PeriodoPago periodo = periodoPagoFromCode(colaborador?.periodoPago);
    int diasSemana = colaborador?.diasSemana ?? 6;
    bool activo = colaborador?.activo ?? true;
    // Solo al DAR DE ALTA: obra opcional para crear y asignar en un paso.
    // Vacía = "asignar después".
    String? obraDestinoId;
    final obrasActivas = (ref.read(obrasProvider).asData?.value ?? const <Obra>[])
        .where((o) => o.activa)
        .toList()
      ..sort((a, b) => a.nombre.compareTo(b.nombre));
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(colaborador == null ? 'Nuevo colaborador' : 'Editar colaborador'),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: nombreCtrl,
                    decoration: const InputDecoration(labelText: 'Nombre'),
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'El nombre es obligatorio'
                        : null,
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: puestoId,
                    decoration: const InputDecoration(labelText: 'Puesto'),
                    items: puestos
                        .map((p) => DropdownMenuItem(value: p.id, child: Text(p.nombre)))
                        .toList(),
                    onChanged: (v) => setLocal(() => puestoId = v),
                    validator: (v) => v == null ? 'Selecciona un puesto' : null,
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: tipoPago,
                    decoration: const InputDecoration(labelText: 'Tipo de pago'),
                    items: const [
                      DropdownMenuItem(value: 'DIA', child: Text('Por día')),
                      DropdownMenuItem(value: 'DESTAJO', child: Text('Por destajo')),
                    ],
                    onChanged: (v) => setLocal(() => tipoPago = v ?? 'DIA'),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<PeriodoPago>(
                    initialValue: periodo,
                    decoration: const InputDecoration(labelText: 'Esquema de pago'),
                    items: PeriodoPago.values
                        .map((p) =>
                            DropdownMenuItem(value: p, child: Text(p.label)))
                        .toList(),
                    onChanged: (v) =>
                        setLocal(() => periodo = v ?? PeriodoPago.mensual),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<int>(
                    initialValue: diasSemana,
                    decoration: const InputDecoration(
                        labelText: 'Días de trabajo por semana'),
                    items: diasSemanaOpciones
                        .map((d) =>
                            DropdownMenuItem(value: d, child: Text('$d días')))
                        .toList(),
                    onChanged: (v) => setLocal(() => diasSemana = v ?? 6),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: montoCtrl,
                    decoration: InputDecoration(
                      labelText: '${periodo.sueldoLabel} (opcional)',
                      helperText: 'Si se deja vacío, usa el del puesto',
                    ),
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setLocal(() {}),
                  ),
                  const SizedBox(height: 8),
                  Builder(builder: (_) {
                    final diario = salarioDiarioDesdePeriodo(
                        double.tryParse(montoCtrl.text.trim()),
                        periodo,
                        diasSemana);
                    return Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        diario != null
                            ? 'Salario diario (calculado): ${Fmt.money(diario)} / día'
                            : 'Salario diario (calculado): —',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    );
                  }),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: telCtrl,
                    decoration: const InputDecoration(labelText: 'Teléfono'),
                    keyboardType: TextInputType.phone,
                  ),
                  const Divider(height: 24),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Contacto de emergencia',
                        style: Theme.of(context).textTheme.labelMedium),
                  ),
                  TextFormField(
                    controller: emNombreCtrl,
                    decoration: const InputDecoration(labelText: 'Nombre'),
                  ),
                  TextFormField(
                    controller: emTelCtrl,
                    decoration: const InputDecoration(labelText: 'Teléfono'),
                    keyboardType: TextInputType.phone,
                  ),
                  TextFormField(
                    controller: emParCtrl,
                    decoration: const InputDecoration(labelText: 'Parentesco'),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Activo'),
                    value: activo,
                    onChanged: (v) => setLocal(() => activo = v),
                  ),
                  // El alta normal es "entra alguien porque ya va a una obra":
                  // pedirlo aquí evita el segundo paso que se olvidaba.
                  if (colaborador == null && obrasActivas.isNotEmpty) ...[
                    const Divider(height: 24),
                    DropdownButtonFormField<String?>(
                      initialValue: obraDestinoId,
                      decoration: const InputDecoration(
                        labelText: 'Asignar a obra',
                        helperText: 'Opcional: puedes asignarlo después',
                      ),
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('Asignar después'),
                        ),
                        ...obrasActivas.map((o) => DropdownMenuItem<String?>(
                            value: o.id, child: Text(o.nombre))),
                      ],
                      onChanged: (v) => setLocal(() => obraDestinoId = v),
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            AsyncActionButton(
              onPressed: () async {
                if (!formKey.currentState!.validate()) return;
                final nuevoId = colaborador?.id ?? _uuid.v4();
                final montoText = montoCtrl.text.trim();
                final montoPeriodo =
                    montoText.isEmpty ? null : double.tryParse(montoText);
                // El diario NO se captura: se deriva del sueldo del periodo.
                final salarioDiario = salarioDiarioDesdePeriodo(
                    montoPeriodo, periodo, diasSemana);
                await ref.read(colaboradorRepositoryProvider).upsert(
                      ColaboradoresCompanion(
                        id: Value(nuevoId),
                        nombre: Value(nombreCtrl.text.trim()),
                        puestoId: Value(puestoId!),
                        tipoPago: Value(tipoPago),
                        salarioPersonalizado: Value(salarioDiario),
                        periodoPago: Value(periodo.code),
                        salarioPeriodo: Value(montoPeriodo),
                        diasSemana: Value(diasSemana),
                        telefono: Value(telCtrl.text.trim()),
                        contactoNombre: Value(emNombreCtrl.text.trim()),
                        contactoTelefono: Value(emTelCtrl.text.trim()),
                        contactoParentesco: Value(emParCtrl.text.trim()),
                        activo: Value(activo),
                      ),
                    );
                // Alta + asignación en un solo gesto (si se eligió obra).
                if (colaborador == null && obraDestinoId != null) {
                  await ref.read(colaboradorRepositoryProvider).asignarObra(
                        obraId: obraDestinoId!,
                        colaboradorId: nuevoId,
                      );
                }
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmDelete(Colaborador c) async {
    final ok = await confirmDialog(
      context,
      title: 'Eliminar colaborador',
      message:
          '¿Eliminar a "${c.nombre}"? Si tiene asistencias o pagos, mejor márcalo como inactivo.',
      actionLabel: 'Eliminar',
    );
    if (ok) await ref.read(colaboradorRepositoryProvider).delete(c.id);
  }
}

/// Fila de chips para filtrar el equipo POR OBRA (metáfora de "género": elegir
/// una obra deja ver solo a quienes están asignados a ella).
///
/// Las obras salen del mapa colaborador→obras vigentes, no del catálogo
/// completo: una obra sin nadie asignado no aporta un chip que solo llevaría a
/// una lista vacía. Se desplaza en horizontal porque en un teléfono no caben
/// varias obras en una fila (mismo criterio que el filtro de cotizaciones).
class _FiltroObra extends StatelessWidget {
  const _FiltroObra({
    required this.seleccionada,
    required this.obrasPorColab,
    required this.onSeleccionar,
  });

  final String? seleccionada;
  final Map<String, List<Obra>> obrasPorColab;
  final ValueChanged<String?> onSeleccionar;

  @override
  Widget build(BuildContext context) {
    // obraId → (nombre, nº de colaboradores asignados).
    final conteo = <String, int>{};
    final nombre = <String, String>{};
    for (final obras in obrasPorColab.values) {
      for (final o in obras) {
        conteo[o.id] = (conteo[o.id] ?? 0) + 1;
        nombre[o.id] = o.nombre;
      }
    }
    if (conteo.isEmpty) return const SizedBox.shrink();

    final ids = conteo.keys.toList()
      ..sort((a, b) => (nombre[a] ?? '').compareTo(nombre[b] ?? ''));

    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: FilterChip(
              label: const Text('Todas'),
              selected: seleccionada == null,
              showCheckmark: false,
              visualDensity: VisualDensity.compact,
              tooltip: 'Ver a todo el equipo',
              onSelected: (_) => onSeleccionar(null),
            ),
          ),
          for (final id in ids)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                // El conteo va en la etiqueta: dice cuánta gente hay ANTES de
                // tocar el chip.
                label: Text('${nombre[id]} (${conteo[id]})'),
                selected: seleccionada == id,
                showCheckmark: false,
                visualDensity: VisualDensity.compact,
                tooltip: 'Solo el equipo de ${nombre[id]}',
                // Volver a tocar el chip activo regresa a "Todas": se filtra y
                // desfiltra con el mismo pulgar, sin viajar al inicio de la fila.
                onSelected: (_) =>
                    onSeleccionar(seleccionada == id ? null : id),
              ),
            ),
        ],
      ),
    );
  }
}

/// Pie de la lista filtrada por obra: despliega (u oculta) a los colaboradores
/// que NO están en esa obra, para poder jalar a alguien de fuera sin perder el
/// filtro. Va apagado por defecto para que el filtro siga respondiendo "quién
/// está en esta obra" de un vistazo.
class _PieVerResto extends StatelessWidget {
  const _PieVerResto({
    required this.cantidad,
    required this.abierto,
    required this.onToggle,
  });

  final int cantidad;
  final bool abierto;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OutlinedButton.icon(
            onPressed: onToggle,
            icon: Icon(abierto ? Icons.expand_less : Icons.expand_more),
            label: Text(abierto
                ? 'Ocultar los demás colaboradores'
                : 'Ver los demás colaboradores ($cantidad)'),
          ),
          if (abierto)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'No asignados a esta obra. Toca “Asignar” para agregarlos.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}
