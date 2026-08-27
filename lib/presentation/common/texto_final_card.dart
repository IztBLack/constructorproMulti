import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/pdf/pdf_config.dart';
import '../../core/pdf/textos_finales.dart';
import '../../core/sync/rol_provider.dart';
import '../../data/providers.dart';

/// Tarjeta para leer y editar el PÁRRAFO FINAL de un documento imprimible.
///
/// Una sola para cotizaciones, notas de obra y estado de cuenta —igual que
/// `web/src/components/pdf/texto-final-card.tsx`, y por el mismo motivo: la
/// operación es idéntica en los tres, y tenerlas separadas garantizaría que con
/// el tiempo se comportaran distinto. Este archivo nació precisamente así, como
/// un método privado de la pantalla de cotización, y el estado de cuenta se
/// quedó dos versiones sin poder editar su párrafo.
///
/// Enseña el texto YA RESUELTO —el que se va a imprimir, con el nombre de la
/// empresa y la leyenda del IVA sustituidos— y no una plantilla con huecos: lo
/// que se lee aquí es literalmente lo que va a decir la hoja.
class TextoFinalCard extends ConsumerWidget {
  const TextoFinalCard({
    super.key,
    required this.tipo,
    required this.textoPropio,
    required this.ctx,
    required this.onGuardar,
    this.margin = const EdgeInsets.fromLTRB(12, 12, 12, 0),
  });

  /// Qué documento es. Decide qué texto general le toca y qué integrado se
  /// propone al editar.
  final TipoDocumento tipo;

  /// El párrafo propio de ESTE documento, o `null` si no tiene: la columna
  /// `texto_final` de su tabla.
  final String? textoPropio;

  /// Datos vivos con los que se arma el integrado. Lo construye la pantalla
  /// —solo ella sabe si su documento lleva IVA o a quién va dirigido— a partir
  /// de la [PdfConfig] que recibe.
  final ContextoTextoFinal Function(PdfConfig cfg) ctx;

  /// Guarda (o borra, con `null`) el párrafo propio. La pantalla decide en qué
  /// tabla escribe; aquí solo se sabe cuándo.
  final Future<void> Function(String? texto) onGuardar;

  final EdgeInsets margin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final generales = ref.watch(textosPdfProvider);
    // Mismo candado que la web (`puedeEditar`): el párrafo va en un documento
    // que sale de la empresa, no es una nota personal. Concede mientras el rol
    // carga, que es como se comporta el resto de la app.
    final puedeEditar = ref.watch(puedeEditarOperacionProvider);
    final origen = origenTextoFinal(
      tipo: tipo,
      documento: textoPropio,
      textosEmpresa: generales,
    );
    final propio = origen == OrigenTexto.documento;

    return FutureBuilder<PdfConfig>(
      future: ref.read(pdfConfigEfectivaProvider.future),
      builder: (context, snap) {
        // Mientras carga la config no se pinta un texto a medias: cambiaría de
        // contenido al llegar los datos, que se lee como un parpadeo raro.
        if (!snap.hasData) return const SizedBox.shrink();
        final cfg = snap.data!;
        final resuelto = resolverTextoFinal(
          tipo: tipo,
          documento: textoPropio,
          textosEmpresa: generales,
          ctx: ctx(cfg),
        );

        return Card(
          margin: margin,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text('Texto final del PDF',
                          style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                    Chip(
                      label: Text(
                          switch (origen) {
                            OrigenTexto.documento => 'Editado aquí',
                            OrigenTexto.empresa => 'Texto de tus ajustes',
                            OrigenTexto.integrado => 'Texto por defecto',
                          },
                          style: const TextStyle(fontSize: 11)),
                      visualDensity: VisualDensity.compact,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      backgroundColor:
                          propio ? cs.tertiaryContainer : cs.surfaceContainerHighest,
                      side: BorderSide.none,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.only(left: 10),
                  decoration: BoxDecoration(
                    border:
                        Border(left: BorderSide(color: cs.outlineVariant, width: 2)),
                  ),
                  child: Text(resuelto,
                      style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text('Se imprime al pie, arriba de tu pie de página.',
                          style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
                    ),
                    if (puedeEditar && propio)
                      TextButton(
                        onPressed: () => onGuardar(null),
                        child: const Text('Restaurar'),
                      ),
                    if (puedeEditar)
                      TextButton(
                        onPressed: () => _editar(context, ref, resuelto, cfg),
                        child: const Text('Editar'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _editar(
    BuildContext context,
    WidgetRef ref,
    String resuelto,
    PdfConfig cfg,
  ) async {
    final ctrl = TextEditingController(text: resuelto);
    // El punto de partida es el texto GENERAL de la empresa (o el integrado si
    // no hay ninguno), no el integrado a secas: si el dueño ya escribió sus
    // condiciones en Ajustes, volver "al de siempre" tiene que devolverlo ahí.
    final general = resolverTextoFinal(
      tipo: tipo,
      textosEmpresa: ref.read(textosPdfProvider),
      ctx: ctx(cfg),
    );

    final guardar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Texto final del PDF'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Cambia lo que necesites. Se guarda solo en ${_esteDocumento(tipo)}.',
                style: const TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: ctrl,
                maxLines: 6,
                minLines: 4,
                maxLength: largoMaximoTextoFinal,
                decoration: const InputDecoration(border: OutlineInputBorder()),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => ctrl.text = general,
                  child: const Text('Volver al texto general'),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Guardar')),
        ],
      ),
    );

    if (guardar != true) return;
    final texto = ctrl.text.trim();
    // Vacío = "sin texto propio", igual que la web: no se guarda cadena vacía,
    // se borra el propio y el documento vuelve a seguir el general.
    await onGuardar(texto.isEmpty ? null : texto);
  }

  /// Cómo se llama en voz alta el documento al que se le está escribiendo. Se
  /// lee en el diálogo, así que dice "esta obra" y no "estado de cuenta": el
  /// párrafo se guarda en la obra y sale en TODOS sus estados de cuenta, no en
  /// el que se acaba de generar.
  static String _esteDocumento(TipoDocumento t) => switch (t) {
        TipoDocumento.cotizacion => 'esta cotización',
        TipoDocumento.nota => 'esta nota',
        TipoDocumento.estadoCuenta => 'esta obra',
      };
}
