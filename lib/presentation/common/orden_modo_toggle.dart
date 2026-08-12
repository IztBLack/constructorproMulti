import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/orden_personalizado.dart';
import '../../data/providers.dart';

/// Botón de ORDEN estilo Spotify: muestra el modo activo y, al tocarlo, despliega
/// las opciones. El modo se guarda sincronizado (`empresa_config.ui_orden`), así
/// que tiene memoria en todos los dispositivos y espeja lo que se elija en la web.
///
/// Modos: por nombre · agregados recientes · últimos modificados · orden
/// personalizado (arriba→abajo) · orden personalizado invertido.
/// Criterio de orden ESPECÍFICO de una lista (no global), para agregarlo al menú
/// junto a los cuatro criterios base. Ej.: "Por puesto" solo en Colaboradores.
/// El sentido invertido (`${modo}_desc`) lo maneja la misma lógica genérica; la
/// pantalla es la que aplica el orden real de este criterio.
class OrdenCriterioExtra {
  const OrdenCriterioExtra({
    required this.modo,
    required this.etiqueta,
    required this.icono,
    this.direcciones = const ['A → Z', 'Z → A'],
  });

  final String modo; // p. ej. 'puesto'
  final String etiqueta; // 'Por puesto'
  final IconData icono;
  final List<String> direcciones; // [natural, invertido]
}

class OrdenModoToggle extends ConsumerWidget {
  const OrdenModoToggle({
    super.key,
    required this.listKey,
    this.dense = true,
    this.extras = const [],
  });

  /// Clave de la lista (ver [OrdenLista]).
  final String listKey;
  final bool dense;

  /// Criterios extra propios de esta lista (además de los cuatro base).
  final List<OrdenCriterioExtra> extras;

  IconData _icono(String base) {
    for (final e in extras) {
      if (e.modo == base) return e.icono;
    }
    return switch (base) {
      modoRecientes => Icons.schedule,
      modoModificados => Icons.edit_calendar_outlined,
      modoPersonalizado => Icons.drag_indicator,
      _ => Icons.sort_by_alpha,
    };
  }

  String _etiquetaBase(String base) {
    for (final e in extras) {
      if (e.modo == base) return e.etiqueta;
    }
    return etiquetaBase(base);
  }

  List<String> _direcciones(String base) {
    for (final e in extras) {
      if (e.modo == base) return e.direcciones;
    }
    return direccionesDe(base);
  }

  String _etiquetaModo(String modo) {
    final b = baseDe(modo);
    final dirs = _direcciones(b);
    return '${_etiquetaBase(b)} · ${esInvertido(modo) ? dirs[1] : dirs[0]}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Observa el mapa para reconstruir al cambiar/refrescar el modo.
    ref.watch(ordenModoProvider);
    final notifier = ref.read(ordenModoProvider.notifier);
    final modo = notifier.modoDe(listKey);
    final activa = baseDe(modo);
    final invertido = esInvertido(modo);
    final scheme = Theme.of(context).colorScheme;
    final criterios = [...ordenBases, ...extras.map((e) => e.modo)];

    return PopupMenuButton<String>(
      tooltip: 'Cambiar el orden de la lista',
      // Se envía el CRITERIO; alternarModo decide si entra en su sentido natural
      // o invierte el que ya estaba activo (como Spotify).
      onSelected: (base) =>
          notifier.setModo(listKey, alternarModo(modo, base)),
      itemBuilder: (_) => [
        for (final b in criterios)
          PopupMenuItem(
            value: b,
            child: Builder(builder: (_) {
              final esActiva = b == activa;
              final dirs = _direcciones(b);
              // La activa anuncia su sentido actual; las demás, con el que
              // entrarían.
              final detalle =
                  esActiva ? (invertido ? dirs[1] : dirs[0]) : dirs[0];
              return Row(
                children: [
                  Icon(_icono(b),
                      size: 18,
                      color:
                          esActiva ? scheme.primary : scheme.onSurfaceVariant),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _etiquetaBase(b),
                          style: TextStyle(
                            fontWeight: esActiva
                                ? FontWeight.bold
                                : FontWeight.normal,
                            color: esActiva ? scheme.primary : null,
                          ),
                        ),
                        Text(detalle,
                            style: TextStyle(
                                fontSize: 11,
                                color: scheme.onSurfaceVariant)),
                      ],
                    ),
                  ),
                  if (esActiva)
                    Icon(invertido ? Icons.arrow_upward : Icons.arrow_downward,
                        size: 16, color: scheme.primary),
                ],
              );
            }),
          ),
      ],
      // El botón dice el modo ACTIVO (no un ícono mudo): así se sabe cómo está
      // ordenada la lista sin abrir el menú.
      child: Container(
        padding: EdgeInsets.symmetric(
            horizontal: dense ? 10 : 14, vertical: dense ? 6 : 10),
        decoration: BoxDecoration(
          border: Border.all(color: scheme.outlineVariant),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_icono(activa), size: 18, color: scheme.primary),
            const SizedBox(width: 6),
            Text(_etiquetaModo(modo),
                style: TextStyle(
                    fontSize: dense ? 13 : 14,
                    fontWeight: FontWeight.w500,
                    color: scheme.onSurface)),
            const SizedBox(width: 2),
            Icon(Icons.arrow_drop_down, size: 20, color: scheme.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

/// Ordena [items] según el modo activo.
///
/// El repo ya entrega por (`orden`, natural), así que en modo personalizado basta
/// respetar (o invertir) lo que llega; los demás modos reordenan en memoria con
/// las marcas de tiempo que ya trae cada fila.
List<T> ordenarPorModo<T>({
  required List<T> items,
  required String modo,
  required String Function(T) nombreDe,
  int Function(T)? creadoDe,
  int Function(T)? modificadoDe,
}) {
  // Cada criterio se resuelve en su sentido NATURAL y, si el modo está
  // invertido (`…_desc`), se voltea al final: así "invertir" significa siempre
  // lo mismo y no se duplica la lógica de cada criterio.
  final List<T> base;
  switch (baseDe(modo)) {
    case modoPersonalizado:
      base = items;
    case modoRecientes:
      base = creadoDe == null
          ? items
          : ([...items]..sort((a, b) => creadoDe(b).compareTo(creadoDe(a))));
    case modoModificados:
      base = modificadoDe == null
          ? items
          : ([...items]
            ..sort((a, b) => modificadoDe(b).compareTo(modificadoDe(a))));
    default:
      base = [...items]..sort((a, b) => nombreDe(a).compareTo(nombreDe(b)));
  }
  return esInvertido(modo) ? base.reversed.toList() : base;
}

/// Compatibilidad con las pantallas ya cableadas (nombre ⇄ personalizado).
List<T> aplicarModoOrden<T>({
  required List<T> items,
  required bool personalizado,
  required String Function(T) nombreDe,
}) =>
    ordenarPorModo(
      items: items,
      modo: personalizado ? modoPersonalizado : modoNombre,
      nombreDe: nombreDe,
    );
