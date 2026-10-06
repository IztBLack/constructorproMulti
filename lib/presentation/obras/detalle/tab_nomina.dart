/// Pestaña «Nómina» del detalle de obra: la raya de la semana activa, calculada
/// con [NominaCalculator], con el botón para volcarla a la caja.
///
/// La semana activa NO vive aquí: la pantalla padre también la necesita para
/// exportar el PDF de nómina desde el AppBar, así que llega por [inicioSemana]
/// y las flechas la mueven llamando a [onSemanaChanged]. Los diálogos de
/// detalle viven en `dialogos/asistencia_dialogs.dart` y
/// `dialogos/destajo_dialogs.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/format.dart';
import '../../../core/sync/rol_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import '../../../domain/logic/nomina_calculator.dart';
import '../../../domain/mappers.dart';
import '../../common/app_snackbar.dart';
import '../../common/empty_state_view.dart';
import '../../common/money_text.dart';
import 'detalle_comunes.dart';
import 'dialogos/asistencia_dialogs.dart';
import 'dialogos/destajo_dialogs.dart';

class TabNomina extends ConsumerWidget {
  final String obraId;

  /// Lunes (en millis) de la semana visible. Lo dueña la pantalla padre.
  final int inicioSemana;

  /// Aviso al padre de que hay que mover la semana visible.
  final ValueChanged<int> onSemanaChanged;

  const TabNomina({
    super.key,
    required this.obraId,
    required this.inicioSemana,
    required this.onSemanaChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Misma puerta que la proyección: esta pestaña enseña el sueldo de cada
    // persona junto a su nombre. La pestaña se deja visible —quitarla cambiaría
    // el largo del TabController y correría los índices— pero no muestra nada.
    if (!ref.watch(puedeVerSueldosProvider)) {
      return const EmptyStateView(
        icon: Icons.lock_outline,
        title: 'No tienes acceso a la nómina.',
        hint: 'Solo los socios, los supervisores y el contador pueden verla.',
      );
    }

    final fin = Semana.finSemana(inicioSemana);
    final rango = (obraId: obraId, start: inicioSemana, end: fin);
    final workersAsync = ref.watch(colaboradoresPorObraProvider(obraId));
    final puestosAsync = ref.watch(puestosProvider);
    final asisAsync = ref.watch(asistenciasRangoProvider(rango));
    final destAsync = ref.watch(destajosRangoProvider(rango));

    final lunes = DateTime.fromMillisecondsSinceEpoch(inicioSemana);
    final domingo = lunes.add(const Duration(days: 6));

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: () => onSemanaChanged(
                  lunes.subtract(const Duration(days: 7)).millisecondsSinceEpoch),
            ),
            Text(
                '${Fmt.date(inicioSemana)} – ${Fmt.date(domingo.millisecondsSinceEpoch)}',
                style: Theme.of(context).textTheme.titleSmall),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: () => onSemanaChanged(
                  lunes.add(const Duration(days: 7)).millisecondsSinceEpoch),
            ),
          ],
        ),
        const Divider(height: 1),
        Expanded(
          child: Builder(builder: (context) {
            if (workersAsync.isLoading || puestosAsync.isLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            final workers = workersAsync.asData?.value ?? [];
            final puestos = puestosAsync.asData?.value ?? [];
            final asistencias = asisAsync.asData?.value ?? [];
            final destajos = destAsync.asData?.value ?? [];

            final summary = const NominaCalculator().calcular(
              colaboradores: workers.map(colaboradorToDomain).toList(),
              asistencias: asistencias.map(asistenciaToDomain).toList(),
              destajos: destajos.map(destajoToDomain).toList(),
              puestos: puestos.map(puestoToDomain).toList(),
            );

            if (summary.items.isEmpty) {
              return const Center(child: Text('Sin equipo asignado.'));
            }
            return Column(
              children: [
                Expanded(
                  child: ListView(
                    children: summary.items.map((it) {
                      final esDia = it.colaborador.tipoPago.name == 'dia';
                      final detalle = esDia
                          ? '${it.totalDias.toStringAsFixed(2)} días × ${Fmt.money(it.salarioBaseCalculado)}'
                          : '${destajos.where((d) => d.colaboradorId == it.colaborador.id).length} destajo(s)';
                      return ListTile(
                        title: Text(it.colaborador.nombre),
                        subtitle: Text(detalle),
                        trailing: Text(Fmt.money(it.totalPagar),
                            style:
                                const TextStyle(fontWeight: FontWeight.bold)),
                        onTap: esDia
                            ? () => detalleAsistenciaDialog(context,
                                nombre: it.colaborador.nombre,
                                colaboradorId: it.colaborador.id,
                                asistencias: asistencias)
                            : () => destajosDialog(context, ref,
                                obraId: obraId,
                                inicioSemana: inicioSemana,
                                colaboradorId: it.colaborador.id,
                                nombre: it.colaborador.nombre,
                                destajos: destajos),
                      );
                    }).toList(),
                  ),
                ),
                if (summary.totalNomina > 0)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        icon: const Icon(
                            Icons.account_balance_wallet_outlined),
                        label: const Text('Registrar nómina en caja'),
                        onPressed: () => _registrarNominaEnCaja(context, ref,
                            summary.totalNomina, inicioSemana, domingo),
                      ),
                    ),
                  ),
                _totalBar(context, 'TOTAL NÓMINA', summary.totalNomina),
              ],
            );
          }),
        ),
      ],
    );
  }

  Future<void> _registrarNominaEnCaja(BuildContext context, WidgetRef ref,
      double total, int lunes, DateTime domingo) async {
    final ok = await confirmarAccion(
        context,
        '¿Registrar la nómina de ${Fmt.money(total)} como salida en la caja de la obra?',
        'Registrar');
    if (!ok) return;
    await ref.read(movimientoRepositoryProvider).add(
          obraId: obraId,
          fecha: DateTime.now().millisecondsSinceEpoch,
          tipo: 'SALIDA',
          categoria: 'NOMINA',
          concepto:
              'Nómina ${Fmt.date(lunes)} – ${Fmt.date(domingo.millisecondsSinceEpoch)}',
          monto: total,
          metodoPago: 'Efectivo',
          nominaId: 'nom_${lunes}_$obraId',
        );
    if (context.mounted) showAppSnack(context, 'Nómina registrada en caja.');
  }

  Widget _totalBar(BuildContext context, String label, double value) =>
      Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: context.colores.surfaceMuted,
          border: Border(top: BorderSide(color: context.colores.border)),
        ),
        // Suma el inset inferior del sistema al padding: el fondo de la barra
        // llega hasta el borde (se ve anclada) pero el texto queda POR ENCIMA de
        // la barra de navegación de Android, no debajo. Esta pantalla se abre
        // sobre el shell (sin el bottomNavigationBar que ya reservaba ese hueco).
        padding: EdgeInsets.fromLTRB(
            16, 16, 16, 16 + MediaQuery.viewPaddingOf(context).bottom),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: Theme.of(context).textTheme.titleSmall),
            MoneyText(value, style: Theme.of(context).textTheme.titleLarge),
          ],
        ),
      );
}
