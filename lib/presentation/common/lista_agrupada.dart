import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import 'app_badge.dart';

/// Listas agrupadas: la forma estándar de cualquier lista de opciones en el
/// móvil (Ajustes es el modelo). Ver `docs/DISENO_MOVIL.md` §3 y §4.
///
/// Tres piezas que se arman así:
///
/// ```dart
/// GrupoLista(titulo: 'Tu empresa', children: [
///   FilaLista(icono: Icons.percent, titulo: 'IVA por defecto', valor: '16 %',
///       onTap: …),
/// ])
/// ```

/// Ícono de 20 dp en un cuadro de 36 dp con el fondo suave de su tono.
///
/// Identifica la fila de un vistazo (lo azul son documentos, lo verde gente…)
/// sin cargar significado: el significado lo dice el texto de la fila, así que
/// el ícono se excluye del lector de pantalla.
class MosaicoIcono extends StatelessWidget {
  const MosaicoIcono(this.icono, {super.key, this.tono = BadgeTone.neutral});

  final IconData icono;
  final BadgeTone tono;

  /// Lado del cuadro. Lo usa [GrupoLista] para sangrar los divisores.
  static const double lado = 36;

  @override
  Widget build(BuildContext context) {
    final paleta = paletaDeTono(context.colores, tono);
    return ExcludeSemantics(
      child: Container(
        width: lado,
        height: lado,
        decoration: BoxDecoration(
          color: paleta.fondo,
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        ),
        child: Icon(icono, size: 20, color: paleta.texto),
      ),
    );
  }
}

/// Una fila de una [GrupoLista]: ícono, título, subtítulo, **el valor a la
/// vista** (IVA 16 %, 9 puestos) y el chevron si lleva a otra pantalla.
///
/// - [trailing] reemplaza al chevron (p. ej. un `Switch` o un `AppBadge`).
///   Con un `Switch`, [onTap] debe hacer LO MISMO que el switch (alternarlo,
///   como `SwitchListTile`): dos destinos de toque en una fila se funden en
///   uno para TalkBack y uno se vuelve inalcanzable. Si hace falta otra
///   acción (cambiar el día del recordatorio), va en su propia fila.
/// - [debajo] va bajo el título, a todo lo ancho del texto (p. ej. unas
///   fichas). Un control con varias opciones (un `SegmentedButton`) NO va
///   aquí: necesita todo el ancho de la tarjeta y su propia semántica.
/// - [peligro] la pinta en rojo: SOLO para borrar.
/// - [etiquetaValor] es como lo lee TalkBack ("9 puestos" y no "9").
///
/// Mide al menos 64 dp, y con texto grande crece en vez de cortar.
/// Usa `InkWell`: vive dentro de un `Material` (lo pone [GrupoLista]).
class FilaLista extends StatelessWidget {
  const FilaLista({
    super.key,
    required this.titulo,
    this.subtitulo,
    this.icono,
    this.tono = BadgeTone.neutral,
    this.valor,
    this.trailing,
    this.debajo,
    this.onTap,
    this.peligro = false,
    this.etiquetaValor,
  });

  final String titulo;
  final String? subtitulo;
  final IconData? icono;
  final BadgeTone tono;
  final String? valor;
  final Widget? trailing;
  final Widget? debajo;
  final VoidCallback? onTap;
  final bool peligro;
  final String? etiquetaValor;

  /// El valor nunca pasa de este ancho: si es más largo se parte en renglones
  /// en vez de aplastar el título (con texto grande o un valor largo).
  static const double _anchoMaxValor = 120;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final texto = Theme.of(context).textTheme;
    final conChevron = onTap != null && trailing == null;

    final cuerpo = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 64),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          // Con algo debajo, el ícono se queda arriba junto al título.
          crossAxisAlignment: debajo != null
              ? CrossAxisAlignment.start
              : CrossAxisAlignment.center,
          children: [
            if (icono != null) ...[
              MosaicoIcono(icono!, tono: peligro ? BadgeTone.danger : tono),
              const SizedBox(width: 14),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    titulo,
                    style: texto.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w500,
                      color: peligro ? c.danger : c.textStrong,
                    ),
                  ),
                  if (subtitulo != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitulo!,
                      style: texto.bodySmall?.copyWith(color: c.textMuted),
                    ),
                  ],
                  if (debajo != null) ...[const SizedBox(height: 12), debajo!],
                ],
              ),
            ),
            if (valor != null) ...[
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: _anchoMaxValor),
                child: Text(
                  valor!,
                  textAlign: TextAlign.end,
                  semanticsLabel: etiquetaValor,
                  style: texto.bodyMedium?.copyWith(
                    color: c.textMuted,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            if (conChevron) ...[
              const SizedBox(width: 4),
              ExcludeSemantics(
                child: Icon(Icons.chevron_right, size: 20, color: c.textMuted),
              ),
            ],
          ],
        ),
      ),
    );

    // Con algo debajo (fichas) no se funde: cada cosa conserva su nodo.
    if (debajo != null) {
      return onTap == null ? cuerpo : InkWell(onTap: onTap, child: cuerpo);
    }
    if (onTap == null) return MergeSemantics(child: cuerpo);
    return MergeSemantics(
      child: Semantics(
        button: true,
        child: InkWell(onTap: onTap, child: cuerpo),
      ),
    );
  }
}

/// Márgenes de una pantalla de listas: 16 dp en el teléfono y, en la tableta,
/// lo necesario para que el contenido no pase de 720 dp — sin achicar la zona
/// de scroll (que con un `Center` + `ConstrainedBox` solo respondería dentro
/// de la franja). Abajo deja libre la barra de navegación del sistema.
EdgeInsets margenesDeLista(
  BuildContext context,
  double ancho, {
  double arriba = 8,
}) {
  final lado = ancho > 720 + 32 ? (ancho - 720) / 2 : 16.0;
  return EdgeInsets.fromLTRB(
    lado,
    arriba,
    lado,
    32 + MediaQuery.paddingOf(context).bottom,
  );
}

/// Un grupo de filas: título en oración ("Tu empresa") y una tarjeta con las
/// filas separadas por divisores sangrados a la altura del texto.
///
/// Sin [titulo] sirve para dejar sola una fila (la de borrar, al final).
class GrupoLista extends StatelessWidget {
  const GrupoLista({super.key, this.titulo, required this.children});

  final String? titulo;
  final List<Widget> children;

  /// Sangría del divisor: a la altura del texto de la fila de abajo
  /// (margen + mosaico + separación, o solo el margen si no lleva ícono).
  static double _sangria(Widget fila) => fila is FilaLista && fila.icono == null
      ? 16
      : 16 + MosaicoIcono.lado + 14;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final filas = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) {
        filas.add(
          Divider(
            height: 1,
            thickness: 1,
            indent: _sangria(children[i]),
            color: c.border,
          ),
        );
      }
      filas.add(children[i]);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (titulo != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
            child: Semantics(
              header: true,
              child: Text(
                titulo!,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: c.textMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        Material(
          color: c.surface,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusXl),
            side: BorderSide(color: c.border),
          ),
          child: Column(children: filas),
        ),
      ],
    );
  }
}
