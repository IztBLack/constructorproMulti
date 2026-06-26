import 'package:flutter/material.dart';

/// Botón que ejecuta un callback async y se deshabilita mostrando un spinner
/// mientras la operación está en curso. Previene el doble-tap que podría
/// duplicar escrituras críticas (pagos, partidas) cuando hay latencia de IO.
class AsyncActionButton extends StatefulWidget {
  const AsyncActionButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.style,
  });

  /// Callback async. El botón queda deshabilitado hasta que resuelva.
  final Future<void> Function()? onPressed;
  final Widget child;
  final ButtonStyle? style;

  @override
  State<AsyncActionButton> createState() => _AsyncActionButtonState();
}

class _AsyncActionButtonState extends State<AsyncActionButton> {
  bool _busy = false;

  Future<void> _run() async {
    if (_busy || widget.onPressed == null) return;
    setState(() => _busy = true);
    try {
      await widget.onPressed!();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      style: widget.style,
      onPressed: (_busy || widget.onPressed == null) ? null : _run,
      child: _busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : widget.child,
    );
  }
}
