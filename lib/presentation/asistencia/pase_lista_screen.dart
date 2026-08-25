import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';
import '../../core/sync/cloud_providers.dart';
import '../../core/sync/rol_provider.dart';
import '../../data/providers.dart';
import '../../domain/logic/salario_periodo.dart';
import '../common/app_snackbar.dart';
import '../common/confirm_dialog.dart';
import '../common/app_spacing.dart';
import '../common/empty_state_view.dart';
import '../common/error_state_view.dart';
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
    // Orden personalizado del pase de lista: SIEMPRE activo (no hay botón de
    // modo). Cada colaborador se puede arrastrar dentro de su grupo; la posición
    // se guarda en `cuadrilla_miembro.orden` (o `colaboradores.orden` para los
    // que no traen cuadrilla) y se sincroniza como el resto de la app.
    final ordenMiembro =
        ref.watch(ordenMiembroPorColaboradorProvider).asData?.value ??
            const <String, int>{};
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
    // Orden de miembros DENTRO de cada grupo: por su posición manual. Los que
    // pertenecen a una cuadrilla usan `cuadrilla_miembro.orden`; los "sin
    // cuadrilla" usan `colaboradores.orden`. Desempata el nombre.
    for (final entry in grupos.entries) {
      final enCuadrilla = entry.key != null;
      entry.value.sort((a, b) {
        final oa = enCuadrilla ? (ordenMiembro[a.id] ?? 0) : a.orden;
        final ob = enCuadrilla ? (ordenMiembro[b.id] ?? 0) : b.orden;
        final byOrden = oa.compareTo(ob);
        return byOrden != 0 ? byOrden : a.nombre.compareTo(b.nombre);
      });
    }
    // Orden de los GRUPOS: cuadrillas primero (por su `orden`), "Sin cuadrilla"
    // al final; desempata el nombre.
    Cuadrilla? cuadrillaDe(String? id) =>
        id == null ? null : cuadrillaPorColab.values.firstWhere((q) => q.id == id);
    final claves = grupos.keys.toList()
      ..sort((a, b) {
        if (a == null) return 1;
        if (b == null) return -1;
        final qa = cuadrillaDe(a)!;
        final qb = cuadrillaDe(b)!;
        final byOrden = qa.orden.compareTo(qb.orden);
        return byOrden != 0 ? byOrden : qa.nombre.compareTo(qb.nombre);
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
      // Miembros ARRASTRABLES: mantén presionado un colaborador y suéltalo donde
      // quieras. Reordena SOLO dentro de su grupo (arrastrar entre cuadrillas
      // sería cambiar de cuadrilla, que se hace en otra pantalla). El arrastre
      // solo escribe la columna `orden`; nunca toca la asistencia.
      children.add(ReorderableListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        // Evita el "handle" de escritorio; en móvil el arrastre es por
        // mantener presionado, que es justo lo que se pidió.
        buildDefaultDragHandles: true,
        itemCount: miembros.length,
        onReorder: (oldIndex, newIndex) {
          if (newIndex > oldIndex) newIndex -= 1;
          final ids = miembros.map((m) => m.id).toList();
          final movido = ids.removeAt(oldIndex);
          ids.insert(newIndex, movido);
          final repo = ref.read(ordenRepositoryProvider);
          if (cid != null) {
            repo.reordenar(
              tabla: 'cuadrilla_miembro',
              pkCols: const ['cuadrilla_id', 'colaborador_id'],
              pksEnOrden: ids.map((id) => [cid, id]).toList(),
            );
          } else {
            repo.reordenarPorId('colaboradores', ids);
          }
        },
        itemBuilder: (context, i) {
          final c = miembros[i];
          return _PaseListaRow(
            key: ValueKey('${obraId}_${c.id}_$diaMillis'),
            obraId: obraId,
            colaboradorId: c.id,
            nombre: c.nombre,
            diaMillis: diaMillis,
            fraccionInicial: frac[c.id] ?? 0.0,
            cuadrillaId: cid,
          );
        },
      ));
    }

    // Alta rápida al pie de la obra: en campo aparece gente que no está dada de
    // alta y el pase de lista se detiene ahí. Solo para admin/supervisor porque
    // es lo que permite la RLS (0014 y 0027): si se la enseñáramos a un
    // colaborador, crearía la persona en su teléfono y el servidor la
    // rechazaría al subir — una pérdida silenciosa.
    if (ref.watch(puedeEditarOperacionProvider)) {
      children.add(Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.only(left: 12, top: 4, bottom: 4),
          child: TextButton.icon(
            icon: const Icon(Icons.person_add_alt),
            label: const Text('Agregar persona'),
            onPressed: () => _altaRapida(context, ref),
          ),
        ),
      ));
    }

    return ExpansionTile(
      initiallyExpanded: true,
      title: Text(obraNombre, style: const TextStyle(fontWeight: FontWeight.bold)),
      subtitle: Text('${dia.length} trabajador(es)'),
      children: children,
    );
  }

  /// Da de alta a alguien y lo asigna a ESTA obra, sin salir del pase de lista.
  ///
  /// Pide lo mínimo para que la nómina salga bien: nombre, puesto y —si se
  /// sabe— el sueldo por día. Todo lo demás (teléfono, contacto de emergencia)
  /// se completa después en Equipo; pedirlo aquí convertiría "apuntar al que
  /// llegó" en un formulario de alta, que es justo lo que hace que la gente lo
  /// anote en un papel.
  Future<void> _altaRapida(BuildContext context, WidgetRef ref) async {
    final puestos = ref.read(puestosProvider).asData?.value ?? [];
    if (puestos.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Primero crea un puesto en Configuración.')));
      return;
    }

    final datos = await showModalBottomSheet<_AltaRapida>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _HojaAltaRapida(puestos: puestos, obraNombre: obraNombre),
    );
    if (datos == null) return;

    final id = const Uuid().v4();
    final ahora = DateTime.now().millisecondsSinceEpoch;
    final repo = ref.read(colaboradorRepositoryProvider);

    await repo.upsert(ColaboradoresCompanion.insert(
      id: id,
      nombre: datos.nombre,
      puestoId: datos.puestoId,
      tipoPago: datos.tipoPago,
      empresaId: Value(ref.read(empresaIdProvider) ?? ''),
      createdAt: Value(ahora),
      updatedAt: Value(ahora),
    ));

    // Sin sueldo capturado NO se crea fila: "sin fila = sin sueldo" es el
    // contrato de `colaborador_sueldo`, y una fila vacía se subiría al servidor
    // para no decir nada.
    if (datos.salarioDia != null) {
      // `salarioPersonalizado` es DERIVADO: la pantalla de Equipo lo recalcula
      // desde el periodo. Si aquí solo se escribiera el diario, la fila quedaría
      // incoherente y el primer que abriera Equipo lo pisaría con la cuenta de
      // un periodo vacío. Se guarda el juego completo —semanal a 6 días— que
      // devuelve exactamente el diario capturado.
      const dias = 6;
      final semanal = datos.salarioDia! * dias;
      await repo.upsertSueldo(ColaboradorSueldoCompanion.insert(
        colaboradorId: id,
        periodoPago: const Value('SEMANAL'),
        salarioPeriodo: Value(semanal),
        diasSemana: const Value(dias),
        salarioPersonalizado: Value(
          salarioDiarioDesdePeriodo(semanal, PeriodoPago.semanal, dias),
        ),
        empresaId: Value(ref.read(empresaIdProvider) ?? ''),
        createdAt: Value(ahora),
        updatedAt: Value(ahora),
      ));
    }

    await repo.asignarObra(obraId: obraId, colaboradorId: id);

    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${datos.nombre} agregado a $obraNombre.')));
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
  /// Quita a la persona de ESTA obra. No la borra del sistema: marca
  /// `fechaSalida` en la asignación, que es baja lógica.
  ///
  /// La diferencia importa: eliminar al colaborador dejaría huérfanas sus
  /// asistencias y sus destajos, y la nómina de las semanas ya pagadas perdería
  /// a su sujeto. "Ya no viene a esta obra" no es "nunca existió". Para dar de
  /// baja a alguien de verdad está la pantalla de Equipo, donde se ven las
  /// consecuencias. Y si vuelve, `asignarObra` revive la misma relación.
  Future<void> _quitarDeObra() async {
    final ok = await confirmDialog(
      context,
      title: 'Quitar de la obra',
      message: '¿Quitar a ${widget.nombre} de esta obra? '
          'Se conserva su historial y su asistencia ya registrada. '
          'Sigue dado de alta en Equipo y puedes volver a asignarlo cuando '
          'regrese.',
      actionLabel: 'Quitar',
    );
    if (!ok || !mounted) return;

    await ref
        .read(colaboradorRepositoryProvider)
        .desvincular(widget.obraId, widget.colaboradorId);

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${widget.nombre} ya no aparece en esta obra.')));
  }

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
              // Un solo control para las dos acciones de la persona. Con dos
              // iconos sueltos la fila se apretaba y el objetivo táctil bajaba
              // de los 48 px que pide el trabajo con guantes.
              PopupMenuButton<String>(
                tooltip: 'Acciones',
                onSelected: (v) {
                  if (v == 'mover') _moverAObra();
                  if (v == 'quitar') _quitarDeObra();
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'mover',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.swap_horiz),
                      title: Text('Mover a otra obra'),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'quitar',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.person_remove_outlined),
                      title: Text('Quitar de esta obra'),
                    ),
                  ),
                ],
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

// ── Alta rápida desde el pase de lista ──────────────────────────────────────

class _AltaRapida {
  const _AltaRapida({
    required this.nombre,
    required this.puestoId,
    required this.tipoPago,
    this.salarioDia,
  });

  final String nombre;
  final String puestoId;
  final String tipoPago;

  /// `null` = sin sueldo capturado: la nómina cae al salario del puesto, que es
  /// lo correcto cuando en campo nadie sabe cuánto se le acordó.
  final double? salarioDia;
}

class _HojaAltaRapida extends StatefulWidget {
  const _HojaAltaRapida({required this.puestos, required this.obraNombre});

  final List<Puesto> puestos;
  final String obraNombre;

  @override
  State<_HojaAltaRapida> createState() => _HojaAltaRapidaState();
}

class _HojaAltaRapidaState extends State<_HojaAltaRapida> {
  final _nombre = TextEditingController();
  final _salario = TextEditingController();
  late String _puestoId = widget.puestos.first.id;
  String _tipoPago = 'DIA';

  @override
  void dispose() {
    _nombre.dispose();
    _salario.dispose();
    super.dispose();
  }

  /// Sugerencia por puesto: el salario que ya tiene configurado. Se enseña como
  /// marcador, no como valor, para que dejarlo vacío siga significando "el del
  /// puesto" en vez de clavarle una copia del número de hoy.
  String get _sugerencia {
    final p = widget.puestos.firstWhere((x) => x.id == _puestoId);
    return p.salarioDiaDefault > 0 ? Fmt.money(p.salarioDiaDefault) : '';
  }

  @override
  Widget build(BuildContext context) {
    final valido = _nombre.text.trim().isNotEmpty;

    return Padding(
      // El teclado no debe tapar los campos: se captura de pie, en la obra.
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Agregar a ${widget.obraNombre}',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _nombre,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
                labelText: 'Nombre *', hintText: 'Ej. Camilo Martínez'),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _puestoId,
            decoration: const InputDecoration(labelText: 'Puesto *'),
            items: widget.puestos
                .map((p) => DropdownMenuItem(value: p.id, child: Text(p.nombre)))
                .toList(),
            onChanged: (v) => setState(() => _puestoId = v ?? _puestoId),
          ),
          const SizedBox(height: 10),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: 'DIA', label: Text('Por día')),
              ButtonSegment(value: 'DESTAJO', label: Text('Destajo')),
            ],
            selected: {_tipoPago},
            onSelectionChanged: (v) => setState(() => _tipoPago = v.first),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _salario,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Sueldo por día',
              hintText: _sugerencia,
              helperText: 'Opcional. Vacío = el del puesto.',
            ),
          ),
          const SizedBox(height: 16),
          Row(children: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancelar')),
            const Spacer(),
            FilledButton.icon(
              icon: const Icon(Icons.person_add_alt),
              onPressed: valido
                  ? () => Navigator.pop(
                        context,
                        _AltaRapida(
                          nombre: _nombre.text.trim(),
                          puestoId: _puestoId,
                          tipoPago: _tipoPago,
                          salarioDia:
                              double.tryParse(_salario.text.trim().replaceAll(',', '')),
                        ),
                      )
                  : null,
              label: const Text('Agregar'),
            ),
          ]),
        ]),
      ),
    );
  }
}
