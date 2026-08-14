import 'package:flutter/material.dart';

/// Tabla de dos ejes con la primera columna CONGELADA.
///
/// Existe porque `DataTable` no congela columnas, y sin eso la tabla de
/// proyección es inusable: en cuanto se desliza a la derecha para ver el sábado,
/// se pierde de vista de quién es el renglón. Se resolvió a mano en vez de meter
/// `two_dimensional_scrollables` porque son doce columnas — no justifican una
/// dependencia nueva cuyo `TableView` todavía mueve su API.
///
/// La mecánica: dos columnas lado a lado que comparten un ÚNICO scroll vertical.
/// La izquierda (nombres) no scrollea horizontalmente; la derecha sí. Las alturas
/// de renglón se pasan explícitamente para que ambas columnas queden alineadas
/// sin depender de que dos árboles de widgets midan igual.
class TablaCongelada extends StatefulWidget {
  const TablaCongelada({
    super.key,
    required this.anchoColumnaFija,
    required this.altoEncabezado,
    required this.encabezadoFijo,
    required this.encabezadoDesplazable,
    required this.renglones,
    required this.pieFijo,
    required this.pieDesplazable,
    required this.altoPie,
    this.colorBorde,
    this.colorEncabezado,
  });

  final double anchoColumnaFija;
  final double altoEncabezado;
  final double altoPie;

  /// Celda de encabezado de la columna congelada.
  final Widget encabezadoFijo;

  /// Encabezado de las columnas que se desplazan. Debe medir lo mismo de ancho
  /// que el cuerpo desplazable de cada renglón.
  final Widget encabezadoDesplazable;

  final List<RenglonTabla> renglones;

  /// Totales. Se quedan pegados al fondo del área visible.
  final Widget pieFijo;
  final Widget pieDesplazable;

  final Color? colorBorde;
  final Color? colorEncabezado;

  @override
  State<TablaCongelada> createState() => _TablaCongeladaState();
}

/// Un renglón: su parte fija, su parte desplazable y su altura.
///
/// La altura es obligatoria y no se infiere: si las dos mitades midieran por su
/// cuenta, un nombre que envuelve a dos líneas desalinearía todas las celdas de
/// abajo, y el bug se vería como «la palomita del jueves es de otra persona» —
/// el peor error posible en una pantalla de nómina.
class RenglonTabla {
  final Widget fijo;
  final Widget desplazable;
  final double alto;

  /// Renglón de agrupación (cuadrilla u obra). Se parte en dos mitades como
  /// cualquier otro: la etiqueta va en la columna congelada —así sigue visible
  /// al desplazarse— y el subtotal en la mitad desplazable, alineado bajo la
  /// columna de subtotales, que es donde el ojo lo busca.
  final bool esGrupo;

  const RenglonTabla({
    required this.fijo,
    required this.desplazable,
    required this.alto,
    this.esGrupo = false,
  });
}

class _TablaCongeladaState extends State<TablaCongelada> {
  /// El horizontal que el usuario arrastra: el del CUERPO. Es el único con
  /// physics activas; el encabezado y el pie lo siguen.
  final _horizontal = ScrollController();

  /// Encabezado y pie llevan controlador PROPIO. Un solo `ScrollController`
  /// compartido por tres `ScrollView` no los sincroniza: cada vista crea su
  /// propia `ScrollPosition` y mover una no mueve a las otras (además, con
  /// varias posiciones adjuntas, `controller.offset` revienta el assert). El
  /// síntoma sería que los nombres de los días se quedan quietos mientras las
  /// celdas se deslizan debajo — en una pantalla de nómina, leer la palomita
  /// del jueves bajo el encabezado del martes.
  final _hEncabezado = ScrollController();
  final _hPie = ScrollController();

  /// Un solo scroll vertical para las dos mitades: la columna congelada y la
  /// desplazable viven dentro del MISMO `SingleChildScrollView`, así que aquí no
  /// hay nada que sincronizar.
  final _vertical = ScrollController();

  @override
  void initState() {
    super.initState();
    _horizontal.addListener(_seguirAlCuerpo);
  }

  /// Copia el desplazamiento del cuerpo al encabezado y al pie.
  ///
  /// La sincronía es de UNA sola dirección y por eso no hace falta guardarse de
  /// la reentrada: los otros dos tienen [NeverScrollableScrollPhysics], así que
  /// nunca originan un movimiento que regrese hasta acá.
  void _seguirAlCuerpo() {
    if (!_horizontal.hasClients) return;
    final offset = _horizontal.offset;
    for (final c in [_hEncabezado, _hPie]) {
      // `hasClients` puede ser falso en el primer frame, y el clamp evita
      // pedirle al encabezado un offset que su propio contenido no alcanza
      // (pasa mientras el ancho de las dos mitades todavía no coincide).
      if (!c.hasClients) continue;
      final max = c.position.maxScrollExtent;
      final destino = offset.clamp(0.0, max < 0 ? 0.0 : max);
      if (c.offset != destino) c.jumpTo(destino);
    }
  }

  @override
  void dispose() {
    _horizontal.removeListener(_seguirAlCuerpo);
    _horizontal.dispose();
    _hEncabezado.dispose();
    _hPie.dispose();
    _vertical.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final borde = widget.colorBorde ?? Theme.of(context).dividerColor;
    final fondoEncabezado =
        widget.colorEncabezado ?? Theme.of(context).colorScheme.surface;

    return Column(
      children: [
        // ── Encabezado ────────────────────────────────────────────────────
        Container(
          height: widget.altoEncabezado,
          decoration: BoxDecoration(
            color: fondoEncabezado,
            border: Border(bottom: BorderSide(color: borde)),
          ),
          child: Row(
            children: [
              SizedBox(
                width: widget.anchoColumnaFija,
                child: widget.encabezadoFijo,
              ),
              VerticalDivider(width: 1, thickness: 1, color: borde),
              Expanded(
                child: SingleChildScrollView(
                  controller: _hEncabezado,
                  scrollDirection: Axis.horizontal,
                  // El encabezado no se arrastra con el dedo: se mueve porque
                  // el cuerpo se movió. Dejarlo arrastrable daría dos maneras
                  // de hacer lo mismo con distinto tacto.
                  physics: const NeverScrollableScrollPhysics(),
                  child: widget.encabezadoDesplazable,
                ),
              ),
            ],
          ),
        ),

        // ── Cuerpo ────────────────────────────────────────────────────────
        Expanded(
          child: SingleChildScrollView(
            controller: _vertical,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Columna congelada.
                SizedBox(
                  width: widget.anchoColumnaFija,
                  child: Column(
                    children: [
                      for (final r in widget.renglones)
                        SizedBox(height: r.alto, child: r.fijo),
                    ],
                  ),
                ),
                VerticalDivider(width: 1, thickness: 1, color: borde),
                // Columnas desplazables. El scroll horizontal envuelve TODO el
                // bloque (no cada renglón) para que arrastrar en cualquier
                // renglón mueva la tabla completa.
                Expanded(
                  child: SingleChildScrollView(
                    controller: _horizontal,
                    scrollDirection: Axis.horizontal,
                    child: Column(
                      children: [
                        for (final r in widget.renglones)
                          SizedBox(height: r.alto, child: r.desplazable),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        // ── Pie de totales ────────────────────────────────────────────────
        Container(
          height: widget.altoPie,
          decoration: BoxDecoration(
            color: fondoEncabezado,
            border: Border(top: BorderSide(color: borde)),
          ),
          child: Row(
            children: [
              SizedBox(width: widget.anchoColumnaFija, child: widget.pieFijo),
              VerticalDivider(width: 1, thickness: 1, color: borde),
              Expanded(
                child: SingleChildScrollView(
                  controller: _hPie,
                  scrollDirection: Axis.horizontal,
                  physics: const NeverScrollableScrollPhysics(),
                  child: widget.pieDesplazable,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
