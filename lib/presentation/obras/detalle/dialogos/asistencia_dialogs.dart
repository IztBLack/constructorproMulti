/// Diálogos que leen o editan ASISTENCIAS de la obra.
///
/// Van juntos porque los cuatro hablan del mismo dato (la fracción de día que
/// alguien trabajó) aunque se abran desde dos pestañas distintas: la rejilla
/// semanal de Asistencia abre los tres primeros y el renglón de Nómina abre
/// [detalleAsistenciaDialog].
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/db/app_database.dart';
import '../../../../core/format/format.dart';
import '../../../../data/providers.dart';

/// Detalle de un día que el trabajador pasó en otra(s) obra(s).
Future<void> detalleCeldaOtraObraDialog(
  BuildContext context, {
  required String nombre,
  required DateTime dia,
  required List<Asistencia> otras,
  required Map<String, String> nombreObra,
}) async {
  String frac(double f) => f == 1.0
      ? 'Día completo'
      : (f == 0.75 ? '¾ día' : (f == 0.5 ? '½ día' : 'Falta'));
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

/// Editar la celda de un día de la rejilla semanal.
Future<void> editarCeldaSemanaDialog(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
  required String colabId,
  required String nombre,
  required DateTime dia,
  required int diaMillis,
}) async {
  final f = await showDialog<double>(
    context: context,
    builder: (ctx) => SimpleDialog(
      title: Text('$nombre — ${Fmt.dayName(dia)}'),
      children: [
        for (final opt in const [
          (0.0, 'Falta'),
          (0.5, '½ día'),
          (0.75, '¾ día'),
          (1.0, 'Día completo')
        ])
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, opt.$1),
            child: Text(opt.$2),
          ),
      ],
    ),
  );
  if (f != null) {
    await ref.read(asistenciaRepositoryProvider).setFraccion(
        obraId: obraId, colaboradorId: colabId, fecha: diaMillis, fraccion: f);
  }
}

/// Total de días trabajados por cada quien en la semana del día visible.
Future<void> resumenAsistenciasSemanaDialog(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
  required DateTime diaAsistencia,
}) async {
  final inicio = Semana.inicioSemana(diaAsistencia);
  final fin = Semana.finSemana(inicio);
  final rango = (obraId: obraId, start: inicio, end: fin);
  final asistencias = await ref.read(asistenciasRangoProvider(rango).future);
  final asignados =
      ref.read(colaboradoresPorObraProvider(obraId)).asData?.value ?? [];
  final totalPorColab = <String, double>{};
  for (final a in asistencias) {
    totalPorColab[a.colaboradorId] =
        (totalPorColab[a.colaboradorId] ?? 0) + a.fraccion;
  }
  if (!context.mounted) return;
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
        TextButton(
            onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
      ],
    ),
  );
}

/// Días que le cuentan a una persona en la semana de nómina activa.
void detalleAsistenciaDialog(
  BuildContext context, {
  required String nombre,
  required String colaboradorId,
  required List<Asistencia> asistencias,
}) {
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
        TextButton(
            onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
      ],
    ),
  );
}
