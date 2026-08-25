import 'package:flutter/material.dart';

import 'movimiento.dart';

// Esqueletos de carga. Gemelos de los `loading.tsx` de la web, que ya usan este
// patrón desde hace tiempo — el móvil se había quedado con giradores.
//
// POR QUÉ NO UN GIRADOR: un `CircularProgressIndicator` centrado no dice qué va
// a llegar ni cuánto ocupa, así que al entrar los datos la pantalla da un
// brinco. El esqueleto reserva el sitio con la forma real, y la lista aparece
// donde ya estaba mirando el ojo.
//
// El brillo se apaga solo si el sistema pide menos movimiento: queda el bloque
// gris, que sigue cumpliendo su trabajo de reservar el espacio.

/// Un bloque gris con brillo, del tamaño de lo que va a llegar.
class Hueso extends StatefulWidget {
  const Hueso({super.key, this.ancho, this.alto = 12, this.radio = 6});

  /// `null` = todo el ancho disponible.
  final double? ancho;
  final double alto;
  final double radio;

  @override
  State<Hueso> createState() => _HuesoState();
}

class _HuesoState extends State<Hueso> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void initState() {
    super.initState();
    // El `repeat` arranca en `didChangeDependencies`, cuando ya hay MediaQuery
    // para saber si el sistema quiere movimiento.
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (sinMovimiento(context)) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final base = cs.surfaceContainerHighest;
    final brillo = Color.alphaBlend(cs.surface.withValues(alpha: 0.55), base);

    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final t = _c.value;
        return Container(
          width: widget.ancho,
          height: widget.alto,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radio),
            gradient: sinMovimiento(context)
                ? null
                : LinearGradient(
                    colors: [base, brillo, base],
                    stops: [
                      (t - 0.3).clamp(0.0, 1.0),
                      t.clamp(0.0, 1.0),
                      (t + 0.3).clamp(0.0, 1.0),
                    ],
                  ),
            color: sinMovimiento(context) ? base : null,
          ),
        );
      },
    );
  }
}

/// Lista de tarjetas fantasma, para las pantallas que muestran listas.
///
/// Los anchos van variados a propósito: todos iguales se leen como una tabla
/// vacía en vez de como contenido en camino.
class EsqueletoLista extends StatelessWidget {
  const EsqueletoLista({super.key, this.filas = 4, this.conSubtitulo = true});

  final int filas;
  final bool conSubtitulo;

  static const _anchos = [0.45, 0.62, 0.38, 0.55, 0.48, 0.6];

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: filas,
      itemBuilder: (context, i) {
        final ancho = MediaQuery.sizeOf(context).width;
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Hueso(ancho: ancho * _anchos[i % _anchos.length], alto: 13),
              if (conSubtitulo) ...[
                const SizedBox(height: 9),
                Hueso(ancho: ancho * _anchos[(i + 2) % _anchos.length] * 0.9, alto: 10),
              ],
            ]),
          ),
        );
      },
    );
  }
}
