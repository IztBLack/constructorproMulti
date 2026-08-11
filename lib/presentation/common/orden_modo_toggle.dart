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
class OrdenModoToggle extends ConsumerWidget {
  const OrdenModoToggle({super.key, required this.listKey, this.dense = true});

  /// Clave de la lista (ver [OrdenLista]).
  final String listKey;
  final bool dense;

  IconData _icono(String base) => switch (base) {
        modoRecientes => Icons.schedule,
        modoModificados => Icons.edit_calendar_outlined,
        modoPersonalizado => Icons.drag_indicator,
        _ => Icons.sort_by_alpha,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Observa el mapa para reconstruir al cambiar/refrescar el modo.
    ref.watch(ordenModoProvider);
    final notifier = ref.read(ordenModoProvider.notifier);
    final modo = notifier.modoDe(listKey);
    final activa = baseDe(modo);
    final invertido = esInvertido(modo);
    final scheme = Theme.of(context).colorScheme;

    return PopupMenuButton<String>(
      tooltip: 'Cambiar el orden de la lista',
      // Se envía el CRITERIO; alternarModo decide si entra en su sentido natural
      // o invierte el que ya estaba activo (como Spotify).
      onSelected: (base) =>
          notifier.setModo(listKey, alternarModo(modo, base)),
      itemBuilder: (_) => [
        for (final b in ordenBases)
          PopupMenuItem(
            value: b,
            child: Builder(builder: (_) {
              final esActiva = b == activa;
              final dirs = direccionesDe(b);
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
                          etiquetaBase(b),
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
            Text(etiquetaModo(modo),
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
