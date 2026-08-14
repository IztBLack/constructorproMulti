import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:constructorpro/presentation/nomina/proyeccion_tabla.dart';

/// Lo que se prueba aquí es UNA sola cosa, y es la que puede hacer que alguien
/// pague mal: que el encabezado de los días y el pie de totales se muevan
/// EXACTAMENTE lo mismo que el cuerpo al desplazarse a la derecha.
///
/// Si se desincronizan, la tabla no se ve rota — se ve perfecta y miente: la
/// palomita del jueves queda debajo del encabezado del martes.
void main() {
  const anchoFija = 120.0;
  const anchoDesplazable = 700.0;

  Widget montar() => MaterialApp(
        home: Scaffold(
          body: SizedBox(
            // Más angosto que la columna fija + la desplazable, para que haya
            // algo que desplazar de verdad.
            width: 400,
            height: 400,
            child: TablaCongelada(
              anchoColumnaFija: anchoFija,
              altoEncabezado: 40,
              altoPie: 40,
              encabezadoFijo: const Text('Colaborador'),
              encabezadoDesplazable: const SizedBox(
                width: anchoDesplazable,
                child: Text('encabezado'),
              ),
              pieFijo: const Text('Total'),
              pieDesplazable: const SizedBox(
                width: anchoDesplazable,
                child: Text('pie'),
              ),
              renglones: [
                for (var i = 0; i < 12; i++)
                  RenglonTabla(
                    alto: 44,
                    fijo: Text('nombre $i'),
                    desplazable: SizedBox(
                      width: anchoDesplazable,
                      child: Text('celdas $i'),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );

  /// Offset de la vista desplazable más cercana que envuelve a [texto].
  double offsetDe(WidgetTester tester, String texto) {
    final elemento = find
        .ancestor(of: find.text(texto), matching: find.byType(Scrollable))
        .evaluate()
        .first as StatefulElement;
    return (elemento.state as ScrollableState).position.pixels;
  }

  /// Un punto DENTRO de la ventana visible, sobre el cuerpo desplazable.
  ///
  /// No se puede usar `tester.drag(find.text('celdas 0'))`: ese renglón mide 700
  /// de ancho, así que su centro cae en x≈471, fuera de la caja de 400 — el
  /// gesto arrancaría fuera de la tabla y no movería nada.
  const puntoEnElCuerpo = Offset(250, 120);

  testWidgets('el encabezado y el pie siguen al cuerpo al desplazarse',
      (tester) async {
    await tester.pumpWidget(montar());
    await tester.pumpAndSettle();

    expect(offsetDe(tester, 'encabezado'), 0);

    // Arrastrar el CUERPO hacia la izquierda (ver columnas de la derecha).
    await tester.dragFrom(puntoEnElCuerpo, const Offset(-150, 0));
    await tester.pumpAndSettle();

    final cuerpo = offsetDe(tester, 'celdas 0');
    expect(cuerpo, greaterThan(0), reason: 'el cuerpo debió desplazarse');
    expect(offsetDe(tester, 'encabezado'), cuerpo,
        reason: 'el encabezado debe quedar alineado con el cuerpo');
    expect(offsetDe(tester, 'pie'), cuerpo,
        reason: 'el pie de totales debe quedar alineado con el cuerpo');
  });

  testWidgets('la columna congelada NO se mueve en horizontal', (tester) async {
    await tester.pumpWidget(montar());
    await tester.pumpAndSettle();

    final antes = tester.getTopLeft(find.text('nombre 0'));
    await tester.dragFrom(puntoEnElCuerpo, const Offset(-150, 0));
    await tester.pumpAndSettle();

    expect(tester.getTopLeft(find.text('nombre 0')).dx, antes.dx,
        reason: 'el nombre debe seguir visible en el mismo lugar');
  });

  testWidgets('el scroll vertical mueve nombres y celdas juntos',
      (tester) async {
    await tester.pumpWidget(montar());
    await tester.pumpAndSettle();

    final nombreAntes = tester.getTopLeft(find.text('nombre 0')).dy;
    final celdaAntes = tester.getTopLeft(find.text('celdas 0')).dy;

    await tester.dragFrom(puntoEnElCuerpo, const Offset(0, -120));
    await tester.pumpAndSettle();

    final nombreDespues = tester.getTopLeft(find.text('nombre 0')).dy;
    final celdaDespues = tester.getTopLeft(find.text('celdas 0')).dy;

    expect(nombreDespues, lessThan(nombreAntes));
    expect(nombreAntes - nombreDespues, celdaAntes - celdaDespues,
        reason: 'las dos mitades comparten un solo scroll vertical');
  });
}
