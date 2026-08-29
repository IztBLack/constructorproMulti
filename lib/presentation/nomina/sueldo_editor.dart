import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';
import '../../domain/logic/proyeccion_nomina.dart';

/// El trío con el que se captura un sueldo en toda la app: **esquema de pago**,
/// **días por semana** y **monto del periodo**, con el salario por día
/// calculado al lado y **no editable**.
///
/// Existe para que la proyección deje de pedir el salario POR DÍA a mano. El
/// alta de colaboradores (`colaboradores_screen.dart`) ya pedía el sueldo del
/// periodo y derivaba el diario; la proyección pedía el diario y obligaba a
/// hacer la división en la calculadora del teléfono. Eran dos formas distintas
/// de decir lo mismo dentro de la misma app.
///
/// La fórmula no se reimplementa: es `salarioDiarioDesdePeriodo`, la única del
/// proyecto, espejo de `web/src/lib/data/salario.ts`.
///
/// Se usa en tres lugares —la ficha de una persona, la ficha de una plaza y el
/// sueldo en bloque de la hoja de alta masiva— y por eso vive suelto en vez de
/// dentro de una de las tres pantallas.
class SueldoEditor extends StatefulWidget {
  const SueldoEditor({
    super.key,
    required this.valor,
    required this.onCambio,
    this.salarioDelPuesto,
    this.compacto = false,
    this.habilitado = true,
    this.ayuda,
  });

  /// Lo capturado hoy. `null` = no hay sueldo propio; se usa el del puesto.
  final SueldoProyectado? valor;

  /// Se llama en cada cambio con el sueldo completo, o `null` si el monto se
  /// vació (que significa «vuelve al del puesto»).
  final ValueChanged<SueldoProyectado?> onCambio;

  /// Para poder decir a cuánto se caería si se deja vacío.
  final double? salarioDelPuesto;

  /// En la hoja de alta masiva el espacio es menor y el bloque va sin ayuda.
  final bool compacto;

  final bool habilitado;

  /// Texto bajo el cálculo. Si es `null`, se arma uno con la división.
  final String? ayuda;

  @override
  State<SueldoEditor> createState() => _SueldoEditorState();
}

class _SueldoEditorState extends State<SueldoEditor> {
  late final TextEditingController _monto;
  late PeriodoPago _periodo;
  late int _diasSemana;

  @override
  void initState() {
    super.initState();
    final v = widget.valor;
    _periodo = v?.periodo ?? PeriodoPago.semanal;
    _diasSemana = v?.diasSemana ?? 6;
    _monto = TextEditingController(
        text: v == null || v.monto <= 0 ? '' : _sinCerosDeMas(v.monto));
  }

  @override
  void dispose() {
    _monto.dispose();
    super.dispose();
  }

  /// `3600.0` se escribe «3600» y `3599.5` se queda como está: un campo que
  /// arranca con «3600.0» invita a borrar el «.0» antes de teclear.
  static String _sinCerosDeMas(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

  double? get _montoTecleado {
    final texto = _monto.text.trim().replaceAll(',', '');
    if (texto.isEmpty) return null;
    final v = double.tryParse(texto);
    return (v != null && v > 0) ? v : null;
  }

  double? get _diario =>
      salarioDiarioDesdePeriodo(_montoTecleado, _periodo, _diasSemana);

  void _avisar() {
    final monto = _montoTecleado;
    widget.onCambio(monto == null
        ? null
        : SueldoProyectado(
            periodo: _periodo, monto: monto, diasSemana: _diasSemana));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final diario = _diario;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<PeriodoPago>(
                initialValue: _periodo,
                isExpanded: true,
                decoration: const InputDecoration(
                    labelText: 'Esquema de pago', isDense: true),
                items: PeriodoPago.values
                    .map((p) =>
                        DropdownMenuItem(value: p, child: Text(p.label)))
                    .toList(),
                onChanged: widget.habilitado
                    ? (v) {
                        setState(() => _periodo = v ?? PeriodoPago.semanal);
                        _avisar();
                      }
                    : null,
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 116,
              child: DropdownButtonFormField<int>(
                initialValue: _diasSemana,
                isExpanded: true,
                decoration: const InputDecoration(
                    labelText: 'Días/semana', isDense: true),
                items: diasSemanaOpciones
                    .map((d) =>
                        DropdownMenuItem(value: d, child: Text('$d días')))
                    .toList(),
                onChanged: widget.habilitado
                    ? (v) {
                        setState(() => _diasSemana = v ?? 6);
                        _avisar();
                      }
                    : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _monto,
                enabled: widget.habilitado,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                ],
                decoration: InputDecoration(
                  labelText: _periodo.sueldoLabel,
                  prefixText: '\$ ',
                  isDense: true,
                ),
                onChanged: (_) {
                  setState(() {});
                  _avisar();
                },
              ),
            ),
            const SizedBox(width: 10),
            // El diario, calculado y en gris: es la respuesta a «¿y eso a
            // cuánto sale por día?», que es la cuenta que hoy se hace en la
            // calculadora del teléfono. No se puede teclear a propósito — si se
            // pudiera, habría dos verdades sobre el mismo sueldo.
            Container(
              constraints: const BoxConstraints(minWidth: 112),
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: BoxDecoration(
                color: c.surfaceMuted,
                border: Border.all(color: c.border),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('POR DÍA',
                      style: t.labelSmall?.copyWith(
                          color: c.textMuted,
                          fontSize: 9.5,
                          letterSpacing: 0.7,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(
                    diario == null ? '—' : Fmt.money(diario),
                    style: t.titleMedium?.copyWith(
                        color: diario == null ? c.textFaint : c.textStrong,
                        fontWeight: FontWeight.w600,
                        fontFeatures: const [FontFeature.tabularFigures()]),
                  ),
                  Text('calculado',
                      style: t.bodySmall
                          ?.copyWith(color: c.textMuted, fontSize: 10)),
                ],
              ),
            ),
          ],
        ),
        if (!widget.compacto) ...[
          const SizedBox(height: 6),
          Text(
            widget.ayuda ?? _ayudaAutomatica(),
            style: t.bodySmall?.copyWith(color: c.textMuted),
          ),
        ],
      ],
    );
  }

  String _ayudaAutomatica() {
    final monto = _montoTecleado;
    final diario = _diario;
    if (monto == null || diario == null) {
      final delPuesto = widget.salarioDelPuesto;
      return delPuesto == null || delPuesto <= 0
          ? 'Sin sueldo propio: usa el del puesto.'
          : 'Vacío usa el del puesto: ${Fmt.money(delPuesto)} / día.';
    }
    final dias = _periodo.diasDelPeriodo(_diasSemana);
    final diasTexto =
        dias == dias.roundToDouble() ? dias.toStringAsFixed(0) : dias.toStringAsFixed(2);
    return '${Fmt.money(monto)} ÷ $diasTexto días = ${Fmt.money(diario)}.';
  }
}
