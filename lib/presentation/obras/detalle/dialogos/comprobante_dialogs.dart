/// Todo lo que hace un renglón de la caja con su COMPROBANTE: la hoja de
/// opciones que se abre al tocarlo, adjuntar/reemplazar el archivo y verlo.
///
/// Los tres van en el mismo archivo porque son un solo flujo con una sola
/// puerta de entrada ([comprobanteSheet]): la hoja decide y llama a una de las
/// otras dos, que no se usan desde ningún otro lado. Además son las únicas
/// piezas del detalle de obra que tocan cámara, galería, `FilePicker` y
/// `ComprobanteStorage`; juntas mantienen esas dependencias fuera de la
/// pestaña Caja.
library;

import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pdfx/pdfx.dart';

import '../../../../core/db/app_database.dart';
import '../../../../core/storage/comprobante_storage.dart';
import '../../../../core/sync/cloud_providers.dart';
import '../../../../core/sync/supabase_config.dart';
import '../../../../data/providers.dart';
import '../../../common/app_snackbar.dart';

/// Hoja de acciones de comprobante de un movimiento: ver el adjunto (si ya
/// tiene) y adjuntar/reemplazar desde cámara, galería o PDF.
Future<void> comprobanteSheet(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
  required Movimiento movimiento,
}) async {
  final m = movimiento;
  final tiene = m.comprobanteUri != null;
  final opcion = await showModalBottomSheet<String>(
    useSafeArea: true,
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (tiene)
          ListTile(
            leading: const Icon(Icons.visibility_outlined),
            title: const Text('Ver comprobante'),
            onTap: () => Navigator.pop(ctx, 'ver'),
          ),
        ListTile(
          leading: const Icon(Icons.camera_alt_outlined),
          title: Text(tiene ? 'Reemplazar con cámara' : 'Adjuntar con cámara'),
          onTap: () => Navigator.pop(ctx, 'camara'),
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_outlined),
          title: Text(tiene ? 'Reemplazar con galería' : 'Adjuntar de galería'),
          onTap: () => Navigator.pop(ctx, 'galeria'),
        ),
        ListTile(
          leading: const Icon(Icons.picture_as_pdf_outlined),
          title: Text(tiene ? 'Reemplazar con PDF' : 'Adjuntar PDF'),
          onTap: () => Navigator.pop(ctx, 'pdf'),
        ),
      ]),
    ),
  );
  if (opcion == null) return;
  if (!context.mounted) return;
  if (opcion == 'ver') {
    await _verComprobante(context, m);
  } else {
    await _adjuntarComprobante(context, ref,
        obraId: obraId, movimiento: m, opcion: opcion);
  }
}

/// Adjunta (o reemplaza) el comprobante de un movimiento.
///
/// ALCANCE v1 (online-only, deliberado): la subida ocurre EN EL MOMENTO y
/// requiere red + sesión + empresa. No hay cola offline: si no se puede subir
/// se avisa y se aborta, no se guarda nada pendiente. La cola offline (subir en
/// diferido al recuperar la red) queda como mejora futura.
Future<void> _adjuntarComprobante(
  BuildContext context,
  WidgetRef ref, {
  required String obraId,
  required Movimiento movimiento,
  required String opcion,
}) async {
  final m = movimiento;
  // El comprobante vive en `<empresa>/<obra>/…` dentro del bucket privado; sin
  // empresa/sesión no hay ruta válida ni permiso, así que ni intentamos subir.
  final empresaId = ref.read(empresaIdProvider);
  final haySesion = SupabaseConfig.currentUser != null;
  if (empresaId == null || empresaId.isEmpty || !haySesion) {
    showAppSnack(
      context,
      'Necesitas conexión para adjuntar un comprobante.',
      tone: SnackTone.warning,
    );
    return;
  }

  // Selección del archivo (fuera del try: cancelar no es un error).
  String? src;
  if (opcion == 'pdf') {
    final res = await FilePicker.platform
        .pickFiles(type: FileType.custom, allowedExtensions: ['pdf']);
    src = res?.files.single.path;
  } else {
    final picked = await ImagePicker().pickImage(
      source: opcion == 'camara' ? ImageSource.camera : ImageSource.gallery,
    );
    src = picked?.path;
  }
  if (src == null) return; // el usuario canceló

  try {
    final ruta = await ComprobanteStorage.subir(
      empresaId: empresaId,
      obraId: obraId,
      archivo: File(src),
    );
    await ref.read(movimientoRepositoryProvider).setComprobanteUri(m.id, ruta);
    if (context.mounted) {
      showAppSnack(context, 'Comprobante adjuntado.', tone: SnackTone.success);
    }
  } catch (_) {
    // Red caída / sin permiso / bucket: nunca crasheamos, solo avisamos.
    if (context.mounted) {
      showAppSnack(
        context,
        'No se pudo adjuntar el comprobante. Revisa tu conexión.',
        tone: SnackTone.danger,
      );
    }
  }
}

/// Abre el comprobante de un movimiento. El bucket es privado, así que se pide
/// una URL firmada de vida corta; la imagen se muestra con `Image.network` y el
/// PDF con `pdfx` a partir de sus bytes descargados.
Future<void> _verComprobante(BuildContext context, Movimiento m) async {
  final ruta = m.comprobanteUri;
  if (ruta == null) return;
  final esPdf = ruta.toLowerCase().endsWith('.pdf');

  try {
    if (esPdf) {
      final bytes = await ComprobanteStorage.descargar(ruta);
      if (!context.mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Comprobante')),
          body: PdfViewPinch(
            controller: PdfControllerPinch(
              document: PdfDocument.openData(bytes),
            ),
          ),
        ),
      ));
    } else {
      final url = await ComprobanteStorage.urlFirmada(ruta);
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => Dialog(
          child: InteractiveViewer(child: Image.network(url)),
        ),
      );
    }
  } catch (_) {
    if (context.mounted) {
      showAppSnack(
        context,
        'No se pudo abrir el comprobante. Revisa tu conexión.',
        tone: SnackTone.danger,
      );
    }
  }
}
