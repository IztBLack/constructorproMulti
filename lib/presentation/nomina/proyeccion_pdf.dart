import 'package:flutter/material.dart';
import '../../data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../pdf/pdf_service.dart';
import '../common/app_snackbar.dart';
import '../pdf_pre_dialog.dart';
import '../pdf_preview_screen.dart';
import 'proyeccion_controller.dart';

/// Genera y muestra el PDF de la proyección.
///
/// Pasa por el mismo diálogo previo que los demás reportes (empresa, color,
/// logo), pero el documento IGNORA la marca de agua configurada y estampa
/// «PROYECCIÓN» de todos modos: ver `PdfService._pageThemeProyeccion`.
Future<void> exportarProyeccionPdf(
  BuildContext context,
  WidgetRef ref,
  ProyeccionVista vista,
) async {
  final base = await ref.read(pdfConfigEfectivaProvider.future);
  if (!context.mounted) return;

  final cfg = await showPdfPreDialog(context, base);
  if (cfg == null || !context.mounted) return;

  final obraFiltro = ref.read(obraFiltroProyeccionProvider);
  final alcance = obraFiltro == null
      ? 'Todas las obras activas'
      : 'Obra: ${vista.nombreObra[obraFiltro] ?? ''}';
  final rango = _rango(ref.read(semanaProyeccionProvider));

  try {
    final bytes = await PdfService.proyeccionNomina(
      alcance: alcance,
      rango: rango,
      resultado: vista.resultado,
      nombreCuadrilla: vista.nombreCuadrilla,
      config: cfg,
    );
    if (!context.mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PdfPreviewScreen(
        bytes: bytes,
        titulo: 'Proyección de nómina',
        filename: 'proyeccion_nomina.pdf',
      ),
    ));
  } catch (e) {
    if (!context.mounted) return;
    showAppSnack(context, 'No se pudo generar el PDF: $e',
        tone: SnackTone.danger);
  }
}

/// Rango de la semana en texto. Sin raya larga: la Helvetica base del PDF no
/// tiene Unicode y la dibujaría como un hueco (ver `PdfService.proyeccionNomina`).
String _rango(int lunesMillis) {
  final lunes = DateTime.fromMillisecondsSinceEpoch(lunesMillis);
  final domingo = DateTime(lunes.year, lunes.month, lunes.day + 6);
  String d(DateTime x) =>
      '${x.day.toString().padLeft(2, '0')}/${x.month.toString().padLeft(2, '0')}/${x.year}';
  return '${d(lunes)} al ${d(domingo)}';
}
