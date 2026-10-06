/// Pestaña «Asistencia» del detalle de obra, con sus dos vistas: la del DÍA
/// (una tarjeta por trabajador con Falta/½/¾/Completo) y la de la SEMANA (una
/// rejilla de 7 columnas que además marca los días que la persona trabajó en
/// otra obra).
///
/// El día visible y cuál de las dos vistas está activa son estado SOLO de esta
/// pestaña —nadie más los lee—, así que viven aquí y no en la pantalla padre.
/// Los diálogos que abre están en `dialogos/asistencia_dialogs.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/app_database.dart';
import '../../../core/format/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import 'dialogos/asistencia_dialogs.dart';

class TabAsistencia extends ConsumerStatefulWidget {
  final String obraId;
  const TabAsistencia({super.key, required this.obraId});

  @override
  ConsumerState<TabAsistencia> createState() => _TabAsistenciaState();
}

class _TabAsistenciaState extends ConsumerState<TabAsistencia> {
  DateTime _diaAsistencia = DateTime.now();
  bool _asistVistaSemana = false;

  String get _obraId => widget.obraId;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Row(children: [
            Expanded(
              child: SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(
                      value: false, label: Text('Día'), icon: Icon(Icons.today)),
                  ButtonSegment(
                      value: true,
                      label: Text('Semana'),
                      icon: Icon(Icons.grid_view)),
                ],
                selected: {_asistVistaSemana},
                onSelectionChanged: (s) =>
                    setState(() => _asistVistaSemana = s.first),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.summarize_outlined),
              tooltip: 'Resumen semanal',
              onPressed: () => resumenAsistenciasSemanaDialog(context, ref,
                  obraId: _obraId, diaAsistencia: _diaAsistencia),
            ),
          ]),
        ),
        Expanded(
            child: _asistVistaSemana ? _asistenciaSemana() : _asistenciaDia()),
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
                return const Center(
                    child: Text('Sin trabajadores por día asignados.'));
              }
              final asistencias = asistenciasAsync.asData?.value ?? [];
              final fracPorColab = {
                for (final a in asistencias) a.colaboradorId: a.fraccion
              };
              return ListView(
                children: dia.map((c) {
                  final frac = fracPorColab[c.id] ?? 0.0;
                  return Card(
                    margin:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.nombre,
                              style: Theme.of(context).textTheme.titleMedium),
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
                              await ref
                                  .read(asistenciaRepositoryProvider)
                                  .setFraccion(
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
    final dias = List.generate(7,
        (i) => DateTime.fromMillisecondsSinceEpoch(inicio).add(Duration(days: i)));
    final rango = (obraId: _obraId, start: inicio, end: fin);
    final asignados =
        ref.watch(colaboradoresPorObraProvider(_obraId)).asData?.value ?? [];
    final asistencias =
        ref.watch(asistenciasRangoProvider(rango)).asData?.value ?? [];
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
                  final principal =
                      otras.reduce((a, b) => a.fraccion >= b.fraccion ? a : b);
                  return DataCell(
                    Center(
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 24),
                        padding: const EdgeInsets.symmetric(
                            vertical: 2, horizontal: 6),
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
                    onTap: () => detalleCeldaOtraObraDialog(context,
                        nombre: c.nombre,
                        dia: d,
                        otras: otras,
                        nombreObra: nombreObra),
                  );
                }
                final f = mapa[key] ?? 0.0;
                return DataCell(
                  Center(
                      child: Text(etiqueta(f),
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: f > 0
                                  ? context.colores.success
                                  : context.colores.textFaint))),
                  onTap: () => editarCeldaSemanaDialog(context, ref,
                      obraId: _obraId,
                      colabId: c.id,
                      nombre: c.nombre,
                      dia: d,
                      diaMillis: diaMillis),
                );
              }),
            ]);
          }).toList(),
        ),
      ),
    );
  }
}
