import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';
import '../../domain/logic/redondeo_proyeccion.dart';
import 'proyeccion_controller.dart';

/// Elegir si las cifras se redondean, a qué múltiplo, hacia dónde y **cuáles**.
///
/// Es una hoja y no un simple interruptor porque redondear no significa lo
/// mismo en cada cifra: la raya de cada quien es lo que se entrega en la mano,
/// el salario por día es una tarifa que multiplica y el total es la cifra de
/// portada. Quien pidió esto puede querer una sin las otras.
///
/// La hoja enseña el efecto sobre la proyección que se está viendo (cuánto
/// cambia el total) antes de cerrarse. Un ajuste de presentación que mueve una
/// cifra de dinero tiene que decir cuánto la mueve.
Future<void> mostrarRedondeoSheet(BuildContext context) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        builder: (_, scroll) => _RedondeoSheet(scroll: scroll),
      ),
    );

class _RedondeoSheet extends ConsumerWidget {
  const _RedondeoSheet({required this.scroll});
  final ScrollController scroll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final estado = ref.watch(proyeccionEstadoProvider);
    final vista = ref.watch(proyeccionVistaProvider);
    final cfg = estado.redondeo;
    final notifier = ref.read(proyeccionEstadoProvider.notifier);

    // La vista con la configuración de ESTA hoja, para poder enseñar el antes y
    // el después sin aplicar nada todavía.
    final conRedondeo = ProyeccionRedondeada(vista.resultado, cfg);
    final diferencia = conRedondeo.diferenciaTotal;

    return ListView(
      controller: scroll,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
      children: [
        Text('Redondear cifras', style: t.titleLarge),
        Text(
          'Solo cambia cómo se ven y cómo se imprimen. El cálculo sigue siendo '
          'el exacto, y la app enseña el original en chiquito debajo.',
          style: t.bodySmall?.copyWith(color: c.textMuted),
        ),
        const SizedBox(height: 16),

        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Redondear'),
          subtitle: Text(cfg.activo ? cfg.resumenCorto : 'Las cifras van al centavo',
              style: t.bodySmall?.copyWith(color: c.textMuted)),
          value: cfg.activo,
          onChanged: (v) => notifier.setRedondeo(cfg.copyWith(
            activo: v,
            // Prender con cero ámbitos dejaría la pantalla igual y parecería
            // que el interruptor no sirve.
            campos: v && cfg.campos.isEmpty
                ? const {CampoRedondeo.rayaPersona, CampoRedondeo.totalSemana}
                : cfg.campos,
          )),
        ),

        if (cfg.activo) ...[
          const SizedBox(height: 8),
          _Titulo('Múltiplo'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final paso in pasosRedondeo)
                ChoiceChip(
                  label: Text('\$${paso.toStringAsFixed(0)}'),
                  selected: cfg.paso == paso,
                  onSelected: (_) =>
                      notifier.setRedondeo(cfg.copyWith(paso: paso)),
                ),
            ],
          ),
          const SizedBox(height: 18),

          _Titulo('Hacia dónde'),
          const SizedBox(height: 4),
          RadioGroup<ModoRedondeo>(
            groupValue: cfg.modo,
            onChanged: (v) =>
                v == null ? null : notifier.setRedondeo(cfg.copyWith(modo: v)),
            child: Column(
              children: [
                for (final modo in ModoRedondeo.values)
                  RadioListTile<ModoRedondeo>(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    value: modo,
                    title: Text(modo.label),
                    subtitle: Text(modo.ayuda,
                        style: t.bodySmall?.copyWith(color: c.textMuted)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          _Titulo('Qué cifras'),
          const SizedBox(height: 4),
          for (final campo in CampoRedondeo.values)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: cfg.campos.contains(campo),
              title: Text(campo.label),
              subtitle: Text(campo.ayuda,
                  style: t.bodySmall?.copyWith(color: c.textMuted)),
              onChanged: (_) =>
                  notifier.setRedondeo(cfg.alternarCampo(campo)),
            ),
          const SizedBox(height: 16),

          // ── Qué le hace a ESTA proyección ────────────────────────────────
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            decoration: BoxDecoration(
              color: c.surfaceMuted,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Titulo('En esta proyección'),
                const SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(Fmt.money(conRedondeo.total.mostrado),
                        style: t.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: c.textStrong,
                            fontFeatures: const [
                              FontFeature.tabularFigures()
                            ])),
                    const SizedBox(width: 10),
                    if (conRedondeo.total.redondeado)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          'antes ${Fmt.money(conRedondeo.total.exacto)}',
                          style: t.bodySmall?.copyWith(color: c.textMuted),
                        ),
                      ),
                  ],
                ),
                if (diferencia.abs() >= 0.005)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      diferencia > 0
                          ? '${Fmt.money(diferencia)} más que la cifra exacta.'
                          : '${Fmt.money(-diferencia)} menos que la cifra exacta.',
                      style: t.bodySmall?.copyWith(
                          color: diferencia > 0 ? c.warning : c.info,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                if (!conRedondeo.totalCuadraConLosRenglones)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'Ojo: el total redondeado no es exactamente la suma de '
                      'los renglones redondeados.',
                      style: t.bodySmall?.copyWith(color: c.warning),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Se guarda con esta proyección y se usará también en proyecciones '
            'nuevas.',
            style: t.bodySmall?.copyWith(color: c.textMuted),
          ),
        ],
      ],
    );
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) => Text(
        texto.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: context.colores.textMuted,
            fontSize: 10.5,
            letterSpacing: 0.8,
            fontWeight: FontWeight.w700),
      );
}

/// Una cifra de dinero con su redondeo a la vista: el número que manda en
/// grande y, si se redondeó, el exacto en chiquito debajo.
///
/// Es el widget que cumple lo que pidió el usuario —«que muestre el total antes
/// de redondear en chiquito»— y el que mantiene honesta a la pantalla: nunca se
/// enseña una cifra redondeada sin decir de dónde salió.
class MontoConRedondeo extends StatelessWidget {
  const MontoConRedondeo({
    super.key,
    required this.monto,
    this.estilo,
    this.estiloOriginal,
    this.alineacion = CrossAxisAlignment.start,
    this.enLinea = false,
  });

  final MontoMostrado monto;
  final TextStyle? estilo;
  final TextStyle? estiloOriginal;
  final CrossAxisAlignment alineacion;

  /// En una tabla apretada el original va al lado y no debajo.
  final bool enLinea;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final principal = Text(
      Fmt.money(monto.mostrado),
      style: (estilo ?? t.bodyMedium)?.copyWith(
          fontFeatures: const [FontFeature.tabularFigures()]),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );

    if (!monto.redondeado) return principal;

    final original = Text(
      Fmt.money(monto.exacto),
      style: (estiloOriginal ?? t.bodySmall)?.copyWith(
        color: c.textMuted,
        fontSize: 10,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );

    return enLinea
        ? Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              principal,
              const SizedBox(width: 6),
              original,
            ],
          )
        : Column(
            crossAxisAlignment: alineacion,
            mainAxisSize: MainAxisSize.min,
            children: [principal, original],
          );
  }
}
