import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';
import '../../data/orden_personalizado.dart';
import '../../data/providers.dart';
import '../common/app_snackbar.dart';
import '../common/app_spacing.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
import '../common/orden_modo_toggle.dart';
import '../cuadrillas/cuadrillas_screen.dart' show especialidadLabel;

/// Pase de lista UNIFICADO: pasa lista de todas las obras activas en un día.
class PaseListaScreen extends ConsumerStatefulWidget {
  const PaseListaScreen({super.key});

  @override
  ConsumerState<PaseListaScreen> createState() => _PaseListaScreenState();
}

class _PaseListaScreenState extends ConsumerState<PaseListaScreen> {
  DateTime _dia = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final obrasAsync = ref.watch(obrasProvider);
    final diaMillis = Semana.inicioDia(_dia);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pase de lista'),
        actions: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Día anterior',
            onPressed: () => setState(() => _dia = _dia.subtract(const Duration(days: 1))),
          ),
          Center(child: Text(Fmt.dayName(_dia))),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Día siguiente',
            onPressed: () => setState(() => _dia = _dia.add(const Duration(days: 1))),
          ),
          IconButton(
            icon: const Icon(Icons.calendar_today),
            tooltip: 'Elegir fecha',
            onPressed: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: _dia,
                firstDate: DateTime(2020),
                lastDate: DateTime(2100),
              );
              if (d != null) setState(() => _dia = d);
            },
          ),
        ],
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(44),
          child: Padding(
            padding: EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Align(
              alignment: Alignment.centerRight,
              // Mismo modo que el orden dentro de cada cuadrilla: al elegir
              // "Orden" el pase de lista respeta las posiciones fijadas a mano
              // (grupos y miembros); "Nombre" lo muestra alfabético.
              child: OrdenModoToggle(listKey: OrdenLista.cuadrillaMiembro),
            ),
          ),
        ),
      ),
      body: obrasAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: 'No se pudieron cargar las obras.',
          onRetry: () => ref.invalidate(obrasProvider),
        ),
        data: (obras) {
          final activas = obras.where((o) => o.activa).toList();
          if (activas.isEmpty) {
            return const EmptyStateView(
              icon: Icons.event_busy,
              title: 'No hay obras activas.',
              hint: 'Activa una obra para pasar lista.',
            );
          }
          return ListView(
            children: activas
                .map((o) => _ObraPaseLista(obraId: o.id, obraNombre: o.nombre, diaMillis: diaMillis))
                .toList(),
          );
        },
      ),
    );
  }
}

class _ObraPaseLista extends ConsumerWidget {
  final String obraId;
  final String obraNombre;
  final int diaMillis;
  const _ObraPaseLista({required this.obraId, required this.obraNombre, required this.diaMillis});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workers = ref.watch(colaboradoresPorObraProvider(obraId)).asData?.value ?? [];
    final asistencias = ref
            .watch(asistenciasRangoProvider((obraId: obraId, start: diaMillis, end: diaMillis)))
            .asData
            ?.value ??
        [];
    // Cada colaborador se muestra SOLO bajo su última obra asignada, para no
    // duplicarlo cuando está en varias obras a la vez.
    final ultimaObra = ref.watch(ultimaObraPorColaboradorProvider).asData?.value ?? {};
    // Cuadrilla vigente por colaborador (para agrupar y etiquetar la asistencia).
    final cuadrillaPorColab =
        ref.watch(cuadrillaPorColaboradorProvider).asData?.value ??
            const <String, Cuadrilla>{};
    // Modo de orden sincronizado (mismo que el de miembros de cuadrilla).
    final modo =
        ref.watch(ordenModoProvider)[OrdenLista.cuadrillaMiembro] ?? modoNombre;
    final personalizado = esModoPersonalizado(modo);
    final invertido = esInvertido(modo);
    // orden de la membresía por colaborador (solo relevante en personalizado).
    final ordenMiembro = personalizado
        ? (ref.watch(ordenMiembroPorColaboradorProvider).asData?.value ??
            const <String, int>{})
        : const <String, int>{};
    final dia = workers
        .where((c) => c.tipoPago == 'DIA')
        .where((c) => ultimaObra[c.id]?.id == obraId)
        .toList();
    if (dia.isEmpty) return const SizedBox.shrink();
    final frac = {for (final a in asistencias) a.colaboradorId: a.fraccion};

    // Agrupa por cuadrilla vigente. Los que no tienen cuadrilla caen bajo la
    // clave null ("Sin cuadrilla").
    final grupos = <String?, List<Colaborador>>{};
    for (final c in dia) {
      final cid = cuadrillaPorColab[c.id]?.id;
      (grupos[cid] ??= []).add(c);
    }
    // Orden de miembros DENTRO de cada grupo: por `orden` de membresía en modo
    // personalizado (desempata nombre); alfabético en modo nombre.
    int ordenDe(Colaborador c) => ordenMiembro[c.id] ?? 0;
    for (final lista in grupos.values) {
      lista.sort((a, b) {
        if (personalizado) {
          final byOrden = ordenDe(a).compareTo(ordenDe(b));
          if (byOrden != 0) return invertido ? -byOrden : byOrden;
        }
        return a.nombre.compareTo(b.nombre);
      });
    }
    // Orden de los GRUPOS: cuadrillas primero, "Sin cuadrilla" al final. Entre
    // cuadrillas: por `orden` de la cuadrilla en personalizado, por nombre si no.
    Cuadrilla? cuadrillaDe(String? id) =>
        id == null ? null : cuadrillaPorColab.values.firstWhere((q) => q.id == id);
    final claves = grupos.keys.toList()
      ..sort((a, b) {
        if (a == null) return 1;
        if (b == null) return -1;
        final qa = cuadrillaDe(a)!;
        final qb = cuadrillaDe(b)!;
        if (personalizado) {
          final byOrden = qa.orden.compareTo(qb.orden);
          if (byOrden != 0) return invertido ? -byOrden : byOrden;
        }
        return qa.nombre.compareTo(qb.nombre);
      });

    final children = <Widget>[];
    for (final cid in claves) {
      final miembros = grupos[cid]!;
      final cuadrilla = cid == null
          ? null
          : cuadrillaPorColab.values.firstWhere((q) => q.id == cid);
      // Encabezado de grupo (solo si hay cuadrilla) con acción "marcar todos".
      if (cuadrilla != null) {
        children.add(_CuadrillaHeader(
          nombre: cuadrilla.nombre,
          especialidad: especialidadLabel(cuadrilla.especialidad),
          count: miembros.length,
          onMarcarTodos: () async {
            final repo = ref.read(asistenciaRepositoryProvider);
            // Se captura antes de los await: las escrituras de setFraccion hacen
            // rebuild de la lista y dejarían este context inválido después.
            final messenger = ScaffoldMessenger.of(context);
            final warn = context.colores.warning;
            // T0: espeja el trigger 0016. A cada miembro se le omite si marcar
            // día completo aquí lo pasaría de 1 jornada ese día sumando todas las
            // obras; así "marcar todos" no crea filas que la nube rechazaría.
            final omitidos = <String>[];
            for (final c in miembros) {
              final otras = await repo.fraccionOtrasObras(c.id, diaMillis, obraId);
              if (1.0 + otras > 1.0 + 1e-9) {
                omitidos.add(c.nombre);
                continue;
              }
              await repo.setFraccion(
                obraId: obraId,
                colaboradorId: c.id,
                fecha: diaMillis,
                fraccion: 1.0,
                cuadrillaId: cid,
              );
            }
            if (omitidos.isNotEmpty) {
              messenger.hideCurrentSnackBar();
              messenger.showSnackBar(SnackBar(
                behavior: SnackBarBehavior.floating,
                content: Row(children: [
                  Icon(Icons.warning_amber_outlined, size: 20, color: warn),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'No se marcaron ${omitidos.length}: ya tienen jornada ese '
                      'día en otra obra (${omitidos.join(', ')}).',
                    ),
                  ),
                ]),
              ));
            }
          },
        ));
      }
      for (final c in miembros) {
        children.add(_PaseListaRow(
          key: ValueKey('${obraId}_${c.id}_$diaMillis'),
          obraId: obraId,
          colaboradorId: c.id,
          nombre: c.nombre,
          diaMillis: diaMillis,
          fraccionInicial: frac[c.id] ?? 0.0,
          cuadrillaId: cid,
        ));
      }
    }

    return ExpansionTile(
      initiallyExpanded: true,
      title: Text(obraNombre, style: const TextStyle(fontWeight: FontWeight.bold)),
      subtitle: Text('${dia.length} trabajador(es)'),
      children: children,
    );
  }
}

/// Encabezado de un grupo de cuadrilla dentro del pase de lista, con acción
/// rápida para marcar a todos los miembros como presentes (día completo).
class _CuadrillaHeader extends StatelessWidget {
  const _CuadrillaHeader({
    required this.nombre,
    required this.especialidad,
    required this.count,
    required this.onMarcarTodos,
  });

  final String nombre;
  final String especialidad;
  final int count;
  final Future<void> Function() onMarcarTodos;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      color: scheme.surfaceContainerHighest,
      padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
      child: Row(
        children: [
          Icon(Icons.groups, size: 18, color: scheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text('$nombre · $especialidad',
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
          TextButton.icon(
            icon: const Icon(Icons.done_all, size: 18),
            label: const Text('Todos ✓'),
            onPressed: onMarcarTodos,
          ),
        ],
      ),
    );
  }
}

enum _SaveState { idle, saving, saved, error }

/// Fila individual de pase de lista con feedback de guardado y targets táctiles
/// grandes para uso en campo (guantes/sol). Mantiene su propio estado de
/// guardado por fila en vez de depender solo de un SnackBar global.
class _PaseListaRow extends ConsumerStatefulWidget {
  const _PaseListaRow({
    super.key,
    required this.obraId,
    required this.colaboradorId,
    required this.nombre,
    required this.diaMillis,
    required this.fraccionInicial,
    this.cuadrillaId,
  });

  final String obraId;
  final String colaboradorId;
  final String nombre;
  final int diaMillis;
  final double fraccionInicial;
  final String? cuadrillaId;

  @override
  ConsumerState<_PaseListaRow> createState() => _PaseListaRowState();
}

class _PaseListaRowState extends ConsumerState<_PaseListaRow> {
  late double _fraccion = widget.fraccionInicial;
  _SaveState _save = _SaveState.idle;

  Future<void> _guardar(double nueva) async {
    final previa = _fraccion;
    // Guarda de jornada: el servidor (trigger de la migración 0016) RECHAZA que
    // un colaborador acumule más de 1 jornada (suma de `fraccion`) en una misma
    // fecha contando TODAS las obras. Espejamos esa regla aquí, ANTES de
    // escribir: si no, la fila se guardaría local y el push a la nube la
    // rechazaría, dejándola en `sync_status='error'`. Excluimos la obra en curso
    // porque su fracción se reemplaza por [nueva], no se suma sobre la previa.
    final otras = await ref
        .read(asistenciaRepositoryProvider)
        .fraccionOtrasObras(widget.colaboradorId, widget.diaMillis, widget.obraId);
    // Tolerancia pequeña para no rechazar por ruido de punto flotante.
    if (nueva + otras > 1.0 + 1e-9) {
      if (mounted) {
        showAppSnack(
          context,
          '${widget.nombre} ya tiene jornada registrada ese día en otra(s) '
          'obra(s). El total del día no puede pasar de 1.',
          tone: SnackTone.warning,
        );
        // Revierte el control visual a su valor previo: no dejamos el segmento
        // marcado en la fracción rechazada.
        setState(() => _fraccion = previa);
      }
      return;
    }
    setState(() {
      _fraccion = nueva;
      _save = _SaveState.saving;
    });
    try {
      await ref.read(asistenciaRepositoryProvider).setFraccion(
            obraId: widget.obraId,
            colaboradorId: widget.colaboradorId,
            fecha: widget.diaMillis,
            fraccion: nueva,
            cuadrillaId: widget.cuadrillaId,
          );
      if (mounted) setState(() => _save = _SaveState.saved);
    } catch (_) {
      if (mounted) {
        setState(() {
          _fraccion = previa; // revertir selección visual
          _save = _SaveState.error;
        });
      }
    }
  }

  /// Reasignación no destructiva: mueve al colaborador a otra obra activa
  /// (esa pasa a ser su última obra) y registra la asistencia de hoy ahí.
  /// Sigue perteneciendo a la obra anterior (historial).
  Future<void> _moverAObra() async {
    final obras = (ref.read(obrasProvider).asData?.value ?? [])
        .where((o) => o.activa && o.id != widget.obraId)
        .toList();
    if (obras.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No hay otra obra activa a la cual mover.')));
      return;
    }
    final destino = await showModalBottomSheet<String>(
      useSafeArea: true,
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: AppSpacing.allLg,
              child: Text('Mover a ${widget.nombre} a:',
                  style: Theme.of(ctx).textTheme.titleMedium),
            ),
            const Divider(height: 1),
            ...obras.map((o) => ListTile(
                  leading: const Icon(Icons.swap_horiz),
                  title: Text(o.nombre),
                  subtitle: o.cliente.isEmpty ? null : Text(o.cliente),
                  onTap: () => Navigator.pop(ctx, o.id),
                )),
          ],
        ),
      ),
    );
    if (destino == null) return;
    if (!mounted) return;

    // Antes de ejecutar el movimiento, si la obra DESTINO tiene cuadrilla(s)
    // asignada(s), ofrece además meter al colaborador en una de ellas. Leemos la
    // lista vigente una sola vez (no necesitamos el stream aquí).
    final cuadrillas = await ref
        .read(cuadrillaRepositoryProvider)
        .watchCuadrillasPorObra(destino)
        .first;
    if (!mounted) return;

    Cuadrilla? cuadrillaElegida;
    if (cuadrillas.isNotEmpty) {
      cuadrillaElegida = await showModalBottomSheet<Cuadrilla>(
        useSafeArea: true,
        context: context,
        builder: (ctx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: AppSpacing.allLg,
                child: Text(
                    '¿Agregar a ${widget.nombre} a una cuadrilla de esta obra?',
                    style: Theme.of(ctx).textTheme.titleMedium),
              ),
              const Divider(height: 1),
              ...cuadrillas.map((q) => ListTile(
                    leading: const Icon(Icons.groups),
                    title: Text(q.nombre),
                    subtitle: Text(especialidadLabel(q.especialidad)),
                    onTap: () => Navigator.pop(ctx, q),
                  )),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.arrow_forward),
                title: const Text('No, solo mover'),
                onTap: () => Navigator.pop(ctx),
              ),
            ],
          ),
        ),
      );
      if (!mounted) return;
    }

    try {
      await ref.read(movimientoColaboradorServiceProvider).moverAObra(
            obraDestinoId: destino,
            colaboradorId: widget.colaboradorId,
            fechaHoy: widget.diaMillis,
            fraccionHoy: _fraccion == 0.0 ? 1.0 : _fraccion,
          );
      // Si el usuario eligió una cuadrilla, agrégalo también (reactiva la
      // membresía si ya existía).
      if (cuadrillaElegida != null) {
        await ref.read(cuadrillaRepositoryProvider).agregarMiembro(
              cuadrillaId: cuadrillaElegida.id,
              colaboradorId: widget.colaboradorId,
            );
      }
      if (mounted) {
        final extra = cuadrillaElegida != null
            ? ' y se unió a la cuadrilla ${cuadrillaElegida.nombre}'
            : '';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('${widget.nombre} movido a la otra obra$extra.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('No se pudo mover: $e')));
      }
    }
  }

  Widget _statusIcon() {
    switch (_save) {
      case _SaveState.saving:
        return const SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        );
      case _SaveState.saved:
        return Icon(Icons.check_circle,
            size: 18, color: context.colores.success);
      case _SaveState.error:
        return Tooltip(
          message: 'No se guardó. Toca de nuevo para reintentar.',
          child: Icon(Icons.error_outline,
              size: 18, color: Theme.of(context).colorScheme.error),
        );
      case _SaveState.idle:
        return const SizedBox(width: 16);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: AppSpacing.rowLg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(widget.nombre)),
              _statusIcon(),
              IconButton(
                icon: const Icon(Icons.swap_horiz),
                tooltip: 'Mover a otra obra',
                visualDensity: VisualDensity.compact,
                onPressed: _moverAObra,
              ),
            ],
          ),
          AppSpacing.gapXs,
          SegmentedButton<double>(
            showSelectedIcon: false,
            style: const ButtonStyle(
              // Target táctil amplio para dedos con guantes / pantalla sucia.
              minimumSize: WidgetStatePropertyAll(Size(48, 48)),
              tapTargetSize: MaterialTapTargetSize.padded,
            ),
            segments: const [
              ButtonSegment(value: 0.0, label: Text('F')),
              ButtonSegment(value: 0.5, label: Text('½')),
              ButtonSegment(value: 0.75, label: Text('¾')),
              ButtonSegment(value: 1.0, label: Text('✓')),
            ],
            selected: {_fraccion},
            onSelectionChanged: (s) => _guardar(s.first),
          ),
        ],
      ),
    );
  }
}
