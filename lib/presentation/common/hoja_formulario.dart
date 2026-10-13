import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import 'app_spacing.dart';

/// La forma ÚNICA de capturar de 2 a 5 campos (ver `docs/DISENO_MOVIL.md` §4,
/// «Formularios»).
///
/// Sube desde abajo, se acomoda al teclado y lleva el botón principal a todo
/// lo ancho («Guardar salida», no «Guardar»): se toca con guantes y no queda
/// escondido detrás del teclado como en un diálogo centrado.
///
/// - Un solo valor (el IVA, un nombre): diálogo, como en Ajustes.
/// - Formularios largos o con secciones: pantalla completa (como la bitácora).
///
/// Los campos van dentro de un [Form]: [onGuardar] solo corre si validan, y el
/// botón se bloquea mientras guarda (un doble toque no duplica el registro).
/// Si [onGuardar] devuelve `false`, la hoja se queda abierta (p. ej. el
/// servidor rechazó algo y el aviso ya se mostró).
class HojaFormulario extends StatefulWidget {
  const HojaFormulario({
    super.key,
    required this.titulo,
    this.subtitulo,
    required this.campos,
    required this.textoGuardar,
    required this.onGuardar,
    this.textoQuitar,
    this.onQuitar,
  });

  final String titulo;

  /// De qué se trata: la obra, el colaborador… («Los Encinos Etapa 2»).
  final String? subtitulo;
  final List<Widget> campos;

  /// Lo que hace el botón: «Guardar salida», «Agregar colaborador».
  final String textoGuardar;
  final FutureOr<bool> Function() onGuardar;

  /// Acción secundaria de peligro (p. ej. «Quitar ajuste») al pie, en rojo.
  final String? textoQuitar;
  final FutureOr<void> Function()? onQuitar;

  @override
  State<HojaFormulario> createState() => _HojaFormularioState();
}

class _HojaFormularioState extends State<HojaFormulario> {
  final _form = GlobalKey<FormState>();
  bool _guardando = false;

  Future<void> _guardar() async {
    if (_guardando) return;
    if (!(_form.currentState?.validate() ?? true)) return;
    setState(() => _guardando = true);
    try {
      final cerrar = await widget.onGuardar();
      if (cerrar && mounted) Navigator.of(context).pop(true);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final c = context.colores;
    return Padding(
      // El teclado empuja la hoja hacia arriba en vez de tapar los campos.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          0,
          AppSpacing.lg,
          AppSpacing.lg,
        ),
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Semantics(
                header: true,
                child: Text(
                  widget.titulo,
                  style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              if (widget.subtitulo != null && widget.subtitulo!.isNotEmpty) ...[
                AppSpacing.gapXs,
                Text(
                  widget.subtitulo!,
                  style: t.bodyMedium?.copyWith(color: c.textMuted),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              for (var i = 0; i < widget.campos.length; i++) ...[
                if (i > 0) AppSpacing.gapMd,
                widget.campos[i],
              ],
              const SizedBox(height: AppSpacing.xl),
              FilledButton(
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(AppTheme.touchTarget),
                ),
                onPressed: _guardando ? null : _guardar,
                child: _guardando
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      )
                    : Text(widget.textoGuardar),
              ),
              AppSpacing.gapSm,
              TextButton(
                style: TextButton.styleFrom(
                  minimumSize: const Size.fromHeight(AppTheme.touchTarget),
                ),
                onPressed: _guardando
                    ? null
                    : () => Navigator.of(context).pop(),
                child: const Text('Cancelar'),
              ),
              if (widget.textoQuitar != null && widget.onQuitar != null) ...[
                AppSpacing.gapSm,
                TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor: c.danger,
                    minimumSize: const Size.fromHeight(AppTheme.touchTarget),
                  ),
                  onPressed: _guardando
                      ? null
                      : () async {
                          await widget.onQuitar!();
                          if (context.mounted) Navigator.of(context).pop(true);
                        },
                  child: Text(widget.textoQuitar!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Abre una [HojaFormulario]. Devuelve `true` si se guardó (o quitó).
///
/// En tableta la hoja no se estira a todo lo ancho (máx. 640 dp).
Future<bool> mostrarHojaFormulario(
  BuildContext context, {
  required WidgetBuilder builder,
}) async {
  final r = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    constraints: const BoxConstraints(maxWidth: 640),
    builder: builder,
  );
  return r == true;
}
