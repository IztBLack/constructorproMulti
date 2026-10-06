/// Las tarjetas de RESUMEN que encabezan la pestaña Caja: el presupuesto de la
/// obra (costo/recibido/pendiente + avance + totales por sección) y las dos
/// tablitas de «Pagado por persona» / «Recibido por tipo», más el KPI que las
/// tres comparten.
///
/// Salen de `tab_caja.dart` porque son puro dibujo derivado del
/// [EstadoCuentaSummary]: no leen providers ni escriben nada, así que sacarlas
/// deja la pestaña con solo su lista y sus acciones.
///
/// Son funciones y no widgets a propósito: así el árbol que construyen es
/// EXACTAMENTE el mismo que antes, sin un nivel extra de elemento en medio.
library;

import 'package:flutter/material.dart';

import '../../../core/db/app_database.dart';
import '../../../core/format/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../domain/logic/estado_cuenta_calculator.dart';
import '../../common/money_text.dart';

/// Cifra grande con su etiqueta. Se usa en la fila de arriba de la caja y
/// dentro de la tarjeta de presupuesto.
Widget kpiCaja(
        BuildContext context, String label, double value, Color color) =>
    Column(
      children: [
        Text(label, style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(height: 2),
        MoneyText(
          value,
          color: color,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );

Widget presupuestoCard(BuildContext context, EstadoCuentaSummary e,
    List<ObraPresupuestoRow> partidas) {
  final costo = e.costoTotal;
  final progreso = costo > 0 ? (e.recibido / costo).clamp(0.0, 1.0) : 0.0;
  final cs = Theme.of(context).colorScheme;
  final c = context.colores;
  // Totales por sección (solo si la obra vino de una cotización con secciones).
  final porSeccion = <String, double>{};
  for (final p in partidas) {
    final sec = p.seccion.trim();
    if (sec.isEmpty) continue;
    porSeccion[sec] = (porSeccion[sec] ?? 0) + p.cantidad * p.precioUnitario;
  }
  return Card(
    margin: const EdgeInsets.fromLTRB(12, 4, 12, 8),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Presupuesto de obra',
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              kpiCaja(context, 'Costo total', costo, cs.onSurface),
              kpiCaja(context, 'Recibido', e.recibido, c.success),
              kpiCaja(context, 'Pendiente', e.pendiente,
                  e.pendiente > 0 ? c.danger : c.success),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: progreso.toDouble(),
              minHeight: 8,
              backgroundColor: c.surfaceMuted,
              valueColor: AlwaysStoppedAnimation(c.success),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            e.pendiente > 0
                ? '${(progreso * 100).toStringAsFixed(0)}% cobrado · por cobrar ${Fmt.money(e.pendiente)}'
                : 'Al corriente',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (porSeccion.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 8),
            Text('Por sección', style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 2),
            ...porSeccion.entries.map((s) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                          child: Text(s.key,
                              maxLines: 1, overflow: TextOverflow.ellipsis)),
                      Text(Fmt.money(s.value),
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                )),
          ],
        ],
      ),
    ),
  );
}

Widget resumenCard(
  BuildContext context, {
  required String titulo,
  required List<MapEntry<String, double>> entradas,
  required double total,
  required Color color,
}) {
  return Card(
    margin: const EdgeInsets.fromLTRB(12, 4, 12, 8),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titulo, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          ...entradas.map((e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                        child: Text(e.key,
                            maxLines: 1, overflow: TextOverflow.ellipsis)),
                    Text(Fmt.money(e.value),
                        style: TextStyle(
                            color: color, fontWeight: FontWeight.w600)),
                  ],
                ),
              )),
          const Divider(),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Total',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              Text(Fmt.money(total),
                  style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    ),
  );
}
