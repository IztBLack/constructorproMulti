import 'package:flutter/material.dart';

import '../core/pdf/pdf_config.dart';

/// Diálogo previo a generar un PDF: permite ajustar por reporte (modo compacto,
/// mayúsculas, marca de agua) partiendo de la config global guardada.
Future<PdfConfig?> showPdfPreDialog(BuildContext context, PdfConfig base) {
  bool compacto = base.modoCompacto;
  bool mayus = base.mayusculas;
  final watermarkCtrl = TextEditingController(text: base.watermark);

  return showDialog<PdfConfig>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setS) => AlertDialog(
        title: const Text('Opciones del PDF'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Modo compacto'),
            value: compacto,
            onChanged: (v) => setS(() => compacto = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('MAYÚSCULAS'),
            value: mayus,
            onChanged: (v) => setS(() => mayus = v),
          ),
          TextField(
            controller: watermarkCtrl,
            decoration: const InputDecoration(
                labelText: 'Marca de agua', hintText: 'Ej: COTIZACIÓN'),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () => Navigator.pop(
                ctx,
                base.copyWith(
                  modoCompacto: compacto,
                  mayusculas: mayus,
                  watermark: watermarkCtrl.text.trim(),
                )),
            child: const Text('Generar'),
          ),
        ],
      ),
    ),
  );
}
