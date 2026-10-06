/// Pestaña «Caja» del detalle de obra: los KPI del flujo, las tarjetas de
/// resumen, la nota de conciliación, el texto final del estado de cuenta y la
/// lista de movimientos con sus dos FAB de captura.
///
/// Es un [ConsumerWidget] sin estado propio: todo lo que dibuja sale de dos
/// streams (`movimientosPorObraProvider` y
/// `partidasPresupuestoPorObraProvider`). Lo único que NO le pertenece es el
/// párrafo final del estado de cuenta y el PDF que lo usa: los dueña la
/// pantalla padre (que recibió la obra completa), así que llegan por
/// [textoFinal] / [onGuardarTextoFinal] y por [onExportarEstadoCuenta] en vez
/// de duplicar aquí el objeto `Obra`.
///
/// Las tarjetas de resumen viven en `caja_resumen_cards.dart` y los diálogos
/// en `dialogos/movimiento_dialogs.dart` y `dialogos/comprobante_dialogs.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/app_database.dart';
import '../../../core/format/format.dart';
import '../../../core/pdf/textos_finales.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import '../../../domain/logic/estado_cuenta_calculator.dart';
import '../../../domain/logic/flujo_calculator.dart';
import '../../../domain/mappers.dart';
import '../../common/money_text.dart';
import '../../common/texto_final_card.dart';
import 'caja_resumen_cards.dart';
import 'dialogos/comprobante_dialogs.dart';
import 'dialogos/movimiento_dialogs.dart';
import 'nota_conciliacion_card.dart';

/// Aviso al padre de que hay que generar el PDF del estado de cuenta del
/// cliente. Se le pasan los datos YA calculados aquí para no recalcularlos:
/// el padre solo pone el nombre de la obra, el cliente y el texto final.
typedef ExportarEstadoCuenta = void Function(
    EstadoCuentaSummary estado, List<Movimiento> movimientos);

class TabCaja extends ConsumerWidget {
  final String obraId;

  /// Párrafo propio del estado de cuenta de esta obra. Lo dueña el padre.
  final String? textoFinal;
  final Future<void> Function(String? texto) onGuardarTextoFinal;
  final ExportarEstadoCuenta onExportarEstadoCuenta;

  const TabCaja({
    super.key,
    required this.obraId,
    required this.textoFinal,
    required this.onGuardarTextoFinal,
    required this.onExportarEstadoCuenta,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final movsAsync = ref.watch(movimientosPorObraProvider(obraId));
    final partidas =
        ref.watch(partidasPresupuestoPorObraProvider(obraId)).asData?.value ??
            const [];
    return Scaffold(
      body: movsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (movs) {
          final c = context.colores;
          final resumen = const FlujoCalculator()
              .resumen(movs.map(movimientoToDomain).toList());
          final estado = const EstadoCuentaCalculator()
              .calcular(movimientos: movs, partidas: partidas);
          return ListView(
            // +inset inferior del sistema (barra de navegación) para que el
            // último movimiento y "Borrar todos" no queden bajo la barra.
            padding: EdgeInsets.only(
                bottom: 96 + MediaQuery.viewPaddingOf(context).bottom),
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    kpiCaja(context, 'Entradas', resumen.totalEntradas,
                        c.success),
                    kpiCaja(context, 'Salidas', resumen.totalSalidas, c.danger),
                    kpiCaja(context, 'Saldo', resumen.saldo,
                        c.montoTone(resumen.saldo)),
                  ],
                ),
              ),
              // Acción para generar el PDF que se manda AL CLIENTE (solo
              // entradas + saldo). Distinto del PDF de caja interno del AppBar,
              // que sí incluye salidas. Va aquí arriba, junto al presupuesto, no
              // entre los FABs de captura, para no confundirlo con registrar un
              // movimiento.
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                child: OutlinedButton.icon(
                  onPressed: () => onExportarEstadoCuenta(estado, movs),
                  icon: const Icon(Icons.receipt_long),
                  label: const Text('Estado de cuenta del cliente (PDF)'),
                ),
              ),
              if (partidas.isNotEmpty) presupuestoCard(context, estado, partidas),
              if (estado.porPersona.isNotEmpty)
                resumenCard(
                  context,
                  titulo: 'Pagado por persona',
                  entradas: estado.porPersona,
                  total: estado.totalSalidas,
                  color: c.danger,
                ),
              if (estado.porTipo.isNotEmpty)
                resumenCard(
                  context,
                  titulo: 'Recibido por tipo',
                  entradas: estado.porTipo,
                  total: estado.recibido,
                  color: c.success,
                ),
              // Nota libre para explicar el saldo (conciliación manual). Vive en
              // su propio widget con State para dueñar el ciclo de vida del
              // controller sin reconstruirlo en cada rebuild de la caja.
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                child: NotaConciliacionCard(obraId: obraId),
              ),
              // El párrafo final del ESTADO DE CUENTA DEL CLIENTE de esta obra,
              // junto a la nota de conciliación y no en Ajustes, igual que en la
              // web: es lo que se imprime en ESE documento —el que se manda al
              // cliente—, no en el PDF de caja interno.
              TextoFinalCard(
                tipo: TipoDocumento.estadoCuenta,
                textoPropio: textoFinal,
                margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                ctx: (cfg) =>
                    ContextoTextoFinal(nombreEmpresa: cfg.empresaNombre),
                onGuardar: onGuardarTextoFinal,
              ),
              const Divider(height: 1),
              if (movs.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: Text('Sin movimientos.')),
                )
              else
                ...movs.map((m) => _movimientoTile(context, ref, m, c)),
              // Acción destructiva al pie de la lista: descubrible pero lejos de
              // los FABs de captura, así no se toca por accidente. Solo aparece
              // si hay algo que borrar. El color `danger` (texto + borde) y el
              // ícono de bote dejan claro que es peligrosa.
              if (movs.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
                  child: OutlinedButton.icon(
                    onPressed: () => borrarTodosMovsDialog(context, ref,
                        obraId: obraId, cantidad: movs.length),
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Borrar todos los movimientos'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.danger,
                      side: BorderSide(color: c.danger),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
      // Los dos botones usan el par (fondo suave + texto fuerte) en vez de un
      // relleno verde/rojo saturado. El relleno saturado se veía más "botón",
      // pero su texto blanco daba 2.8:1 sobre el verde de Material —reprueba
      // AA— y en tema oscuro empeoraba. Con el par, el código de color se
      // conserva y el texto es legible en ambos temas.
      floatingActionButton: Builder(
        builder: (context) {
          final c = context.colores;
          return Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FloatingActionButton.extended(
                heroTag: 'ent',
                onPressed: () => nuevoMovimientoDialog(context, ref,
                    obraId: obraId, tipo: 'ENTRADA'),
                backgroundColor: c.successSoft,
                foregroundColor: c.success,
                icon: const Icon(Icons.add),
                label: const Text('Entrada'),
              ),
              const SizedBox(width: 12),
              FloatingActionButton.extended(
                heroTag: 'sal',
                onPressed: () => nuevoMovimientoDialog(context, ref,
                    obraId: obraId, tipo: 'SALIDA'),
                backgroundColor: c.dangerSoft,
                foregroundColor: c.danger,
                icon: const Icon(Icons.remove),
                label: const Text('Salida'),
              ),
            ],
          );
        },
      ),
    );
  }

  /// Un renglón de la lista de movimientos, con su separador.
  Widget _movimientoTile(
      BuildContext context, WidgetRef ref, Movimiento m, AppColors c) {
    final entrada = m.tipo == 'ENTRADA';
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          leading: Icon(
            entrada ? Icons.south_west : Icons.north_east,
            color: entrada ? c.success : c.danger,
          ),
          title: Row(
            children: [
              Expanded(child: Text(m.concepto)),
              // Indicador visible de que la fila trae comprobante
              // adjunto; también es la pista de que se puede tocar
              // para verlo.
              if (m.comprobanteUri != null)
                Icon(Icons.attach_file, size: 16, color: c.textMuted),
            ],
          ),
          subtitle: Text(
            '${Fmt.date(m.fecha)} · ${m.metodoPago}'
            '${m.nombre.trim().isEmpty ? '' : ' · ${m.nombre}'}',
          ),
          // El signo va en el texto además del color: quien no
          // distingue verde de rojo necesita el «+»/«−» para leer
          // la lista (regla `color-not-only`).
          trailing: MoneyText(
            entrada ? m.monto : -m.monto,
            colorearPorSigno: true,
            mostrarSigno: true,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          // Tocar la fila abre las acciones de comprobante
          // (adjuntar / ver); el borrado sigue en pulsación larga.
          onTap: () =>
              comprobanteSheet(context, ref, obraId: obraId, movimiento: m),
          onLongPress: () => eliminarMovimientoDialog(context, ref, m),
        ),
        const Divider(height: 1),
      ],
    );
  }
}
