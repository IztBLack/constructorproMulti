import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/app_database.dart' as db;
import '../../core/format/format.dart';
import '../../core/sync/rol_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../../domain/logic/proyeccion_nomina.dart';
import '../../domain/models/models.dart' as dom;
import '../common/app_snackbar.dart';
import '../common/empty_state_view.dart';
import 'ajuste_sheet.dart';
import 'ficha_persona.dart';
import 'proyeccion_controller.dart';
import 'proyeccion_pdf.dart';
import 'proyeccion_tabla.dart';

/// Anchos de la tabla. Se declaran juntos porque el encabezado, el cuerpo y el
/// pie TIENEN que medir lo mismo: son tres filas independientes que solo se ven
/// como una tabla si sus columnas coinciden al pixel.
class _Col {
  static const nombre = 168.0;
  static const dia = 44.0;
  static const dias = 52.0;
  static const subtotal = 108.0;
  static const menu = 40.0;

  /// Ancho total de la mitad que se desplaza.
  static const desplazable = dia * 7 + dias + subtotal + menu;
}

const _altoRenglon = 52.0;
const _altoGrupo = 38.0;

const _nombresDia = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const _mesesCortos = [
  '', 'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/// Proyección de nómina: arma la raya ESPERADA de una semana.
///
/// Es un escenario, no una captura. Nada de lo que se toca aquí escribe en
/// `asistencias` ni en `destajos` — de ahí la franja azul permanente y el
/// punteado de las celdas estimadas.
class ProyeccionScreen extends ConsumerStatefulWidget {
  const ProyeccionScreen({super.key, this.obraId});

  /// Si viene, la pantalla abre filtrada a esa obra (entrada desde el detalle
  /// de obra). Null = todas las obras activas (entrada desde Resumen).
  final String? obraId;

  @override
  ConsumerState<ProyeccionScreen> createState() => _ProyeccionScreenState();
}

class _ProyeccionScreenState extends ConsumerState<ProyeccionScreen> {
  @override
  void initState() {
    super.initState();
    // El filtro de obra es un provider global (lo comparte el diálogo de
    // candidatos), así que se fija al entrar en vez de guardarse en el widget.
    if (widget.obraId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(obraFiltroProyeccionProvider.notifier).state = widget.obraId;
      });
    }
  }

  /// Siembra el escenario en cuanto hay datos, una sola vez por semana.
  ///
  /// Va en un post-frame y no dentro de `build` porque escribir en un provider
  /// mientras se construye el árbol es justo lo que Riverpod prohíbe.
  void _sembrarSiHaceFalta() {
    final notifier = ref.read(proyeccionEstadoProvider.notifier);
    if (!notifier.necesitaSiembra) return;

    final sugeridos = ref.read(participantesSugeridosProvider);
    if (sugeridos.isEmpty) return; // todavía no cargan los colaboradores

    final colabs =
        ref.read(colaboradoresProvider).asData?.value ?? const <db.Colaborador>[];
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      notifier.sembrar(
        participantes: sugeridos,
        diasPorColaborador: {for (final c in colabs) c.id: c.diasSemana},
        destajoCapturado: ref.read(destajoCapturadoSemanaProvider),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    // Puerta de rol. La navegación ya esconde la entrada, pero la pantalla se
    // defiende sola: un deep link o una ruta guardada no deben poder saltársela.
    if (!ref.watch(puedeVerProyeccionNominaProvider)) {
      return Scaffold(
        appBar: AppBar(title: const Text('Proyección de nómina')),
        body: const EmptyStateView(
          icon: Icons.lock_outline,
          title: 'No tienes acceso a la proyección de nómina.',
          hint: 'Solo los socios y los supervisores pueden verla.',
        ),
      );
    }

    _sembrarSiHaceFalta();

    final vista = ref.watch(proyeccionVistaProvider);
    final colores = context.colores;

    return Scaffold(
      backgroundColor: colores.page,
      appBar: _appBar(context),
      body: Column(
        children: [
          _BannerModo(),
          _CintaTotales(
              // La llave por semana descarta el total anterior al cambiar de
              // semana: si no, el delta anunciaría como «cambio» el salto entre
              // dos escenarios distintos.
              key: ValueKey(ref.watch(semanaProyeccionProvider)),
              resultado: vista.resultado,
              obraNombre: vista.nombreObraFiltro),
          _Controles(vista: vista),
          Expanded(child: _cuerpo(context, vista)),
        ],
      ),
      bottomNavigationBar: _BarraAcciones(vista: vista),
    );
  }

  // ── Barra superior ────────────────────────────────────────────────────────

  PreferredSizeWidget _appBar(BuildContext context) {
    final lunes = ref.watch(semanaProyeccionProvider);
    // Se observa el escenario (no solo se lee) para que el punto de «hay
    // cambios» aparezca en cuanto se mueve algo.
    ref.watch(proyeccionEstadoProvider);
    final tocado = ref.read(proyeccionEstadoProvider.notifier).tocado;

    return AppBar(
      title: const Text('Proyección de nómina'),
      actions: [
        IconButton(
          icon: const Icon(Icons.chevron_left),
          tooltip: 'Semana anterior',
          onPressed: () => _moverSemana(-1),
        ),
        Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_rangoSemana(lunes),
                  style: Theme.of(context).textTheme.labelLarge),
              // Avisa que ESTA semana tiene trabajo invertido, antes de que el
              // usuario toque un chevrón que lo borraría.
              if (tocado)
                Padding(
                  padding: const EdgeInsets.only(left: 5),
                  child: Tooltip(
                    message: 'Tienes cambios en esta semana',
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                          color: context.colores.chartPayroll,
                          shape: BoxShape.circle),
                    ),
                  ),
                ),
            ],
          ),
        ),
        IconButton(
          icon: const Icon(Icons.chevron_right),
          tooltip: 'Semana siguiente',
          onPressed: () => _moverSemana(1),
        ),
        PopupMenuButton<String>(
          onSelected: (v) async {
            // «Ir a la semana actual» tira el escenario igual que un chevrón:
            // pregunta lo mismo.
            if (v == 'hoy' && await _confirmarCambioDeSemana()) {
              ref.read(semanaProyeccionProvider.notifier).state =
                  lunesDeLaSemana(DateTime.now());
            }
            if (v == 'reiniciar') _confirmarReinicio();
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'hoy', child: Text('Ir a la semana actual')),
            PopupMenuItem(
                value: 'reiniciar', child: Text('Reiniciar la proyección')),
          ],
        ),
      ],
    );
  }

  /// Cambia de semana, preguntando si hay trabajo que se perdería.
  ///
  /// El escenario vive en memoria y cambiar de semana lo borra: los chevrones
  /// hacen el mismo daño que «Reiniciar», que sí confirmaba. Antes se llevaban
  /// entera la semana armada sin decir nada.
  Future<void> _moverSemana(int direccion) async {
    if (!await _confirmarCambioDeSemana()) return;

    final actual = ref.read(semanaProyeccionProvider);
    final lunes = DateTime.fromMillisecondsSinceEpoch(actual);
    ref.read(semanaProyeccionProvider.notifier).state =
        DateTime(lunes.year, lunes.month, lunes.day + 7 * direccion)
            .millisecondsSinceEpoch;
  }

  /// `true` si se puede tirar el escenario: o no había nada armado, o el
  /// usuario dijo que sí.
  Future<bool> _confirmarCambioDeSemana() async {
    if (!ref.read(proyeccionEstadoProvider.notifier).tocado) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cambiar de semana?'),
        content: const Text(
            'Se pierde lo que armaste en esta semana: los días, los salarios, '
            'los destajos y los ajustes. La proyección no se guarda.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Quedarme aquí')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Ir de todos modos')),
        ],
      ),
    );
    return ok == true && mounted;
  }

  Future<void> _confirmarReinicio() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Reiniciar la proyección?'),
        content: const Text(
            'Se vuelve a la propuesta inicial y se pierde lo que hayas movido: '
            'días, salarios, destajos y ajustes. No afecta al pase de lista.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Reiniciar')),
        ],
      ),
    );
    if (ok == true && mounted) {
      ref.read(proyeccionEstadoProvider.notifier).reiniciar();
    }
  }

  // ── Cuerpo ────────────────────────────────────────────────────────────────

  Widget _cuerpo(BuildContext context, ProyeccionVista vista) {
    if (vista.cargando && vista.resultado.renglones.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (vista.resultado.renglones.isEmpty) {
      return EmptyStateView(
        icon: Icons.table_chart_outlined,
        title: 'No hay nadie en la proyección.',
        hint: vista.candidatos.isEmpty
            ? 'Primero asigna colaboradores a una obra activa.'
            : 'Agrega colaboradores para empezar a proyectar la semana.',
      );
    }

    final colores = context.colores;
    return TablaCongelada(
      anchoColumnaFija: _Col.nombre,
      altoEncabezado: 46,
      altoPie: 54,
      colorBorde: colores.border,
      colorEncabezado: colores.surfaceMuted,
      encabezadoFijo: const _EncabezadoNombre(),
      encabezadoDesplazable: _EncabezadoDias(vista: vista),
      renglones: _renglones(context, vista),
      pieFijo: const _PieFijo(),
      pieDesplazable: _PieTotales(resultado: vista.resultado),
    );
  }

  /// Arma los renglones ya agrupados. Cada grupo mete una fila de encabezado con
  /// su subtotal, que es la cifra que de verdad se compara entre cuadrillas.
  List<RenglonTabla> _renglones(BuildContext context, ProyeccionVista vista) {
    final agrupar = ref.watch(agruparProyeccionProvider);
    final resultado = vista.resultado;
    final salida = <RenglonTabla>[];

    void agregarRenglon(ProyeccionRenglon r) {
      salida.add(RenglonTabla(
        alto: _altoRenglon,
        fijo: _CeldaNombre(renglon: r, vista: vista),
        desplazable: _CeldaDatos(renglon: r, vista: vista),
      ));
    }

    if (agrupar == AgruparPor.ninguno) {
      resultado.renglones.forEach(agregarRenglon);
    } else {
      final porGrupo = <String, List<ProyeccionRenglon>>{};
      final orden = <String>[];
      for (final r in resultado.renglones) {
        final clave = agrupar == AgruparPor.obra
            ? (vista.obraPorColaborador[r.colaborador.id] ?? '')
            : (r.cuadrillaId ?? '');
        if (!porGrupo.containsKey(clave)) {
          porGrupo[clave] = [];
          orden.add(clave);
        }
        porGrupo[clave]!.add(r);
      }

      for (final clave in orden) {
        final items = porGrupo[clave]!;
        final nombre = agrupar == AgruparPor.obra
            ? (vista.nombreObra[clave] ?? 'Sin obra')
            : (vista.nombreCuadrilla[clave] ?? 'Sin cuadrilla');
        final subtotal = items.fold<double>(0, (a, r) => a + r.total);

        salida.add(RenglonTabla(
          alto: _altoGrupo,
          esGrupo: true,
          fijo: _EtiquetaGrupo(nombre: nombre, cuantos: items.length),
          desplazable: _SubtotalGrupo(
            subtotal: subtotal,
            // Solo una cuadrilla real admite un ajuste dirigido a ella; un
            // grupo por obra o el cajón de «sin cuadrilla» no tienen a quién
            // cargárselo.
            cuadrillaId:
                agrupar == AgruparPor.cuadrilla && clave.isNotEmpty ? clave : null,
            nombreCuadrilla: nombre,
          ),
        ));
        items.forEach(agregarRenglon);
      }
    }

    // Ajustes de cuadrilla que NO se repartieron: son parte del total y tienen
    // que verse, o el gran total no cuadraría con la suma de los renglones.
    for (final linea in resultado.lineasCuadrilla.where((l) => !l.repartido)) {
      salida.add(RenglonTabla(
        alto: _altoRenglon,
        fijo: _LineaCuadrillaNombre(
          nombre: vista.nombreCuadrilla[linea.cuadrillaId] ?? 'Cuadrilla',
          ajuste: linea.ajuste,
        ),
        desplazable: _LineaCuadrillaMonto(linea: linea),
      ));
    }

    return salida;
  }
}

String _rangoSemana(int lunesMillis) {
  final lunes = DateTime.fromMillisecondsSinceEpoch(lunesMillis);
  final domingo = DateTime(lunes.year, lunes.month, lunes.day + 6);
  final mismoMes = lunes.month == domingo.month;
  return mismoMes
      ? '${lunes.day}–${domingo.day} ${_mesesCortos[lunes.month]}'
      : '${lunes.day} ${_mesesCortos[lunes.month]} – '
          '${domingo.day} ${_mesesCortos[domingo.month]}';
}

// ═══════════════════════════════════════════════════════════════════════════
// Franja de modo
// ═══════════════════════════════════════════════════════════════════════════

/// Aviso permanente de que esto NO es la nómina.
///
/// No se puede cerrar a propósito: el riesgo real de esta pantalla es que
/// alguien confunda un escenario con la raya y pague con él.
class _BannerModo extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final simulando = ref.watch(
        proyeccionEstadoProvider.select((e) => e.simularCompleta));

    return Container(
      width: double.infinity,
      color: simulando ? c.warningSoft : c.infoSoft,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          Icon(simulando ? Icons.science_outlined : Icons.info_outline,
              size: 17, color: simulando ? c.warning : c.info),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              simulando
                  ? 'Hipótesis: se ignora lo capturado y puedes mover toda la '
                      'semana. Nada de esto toca el pase de lista.'
                  : 'Estás proyectando. Las celdas con color ya están '
                      'capturadas; las punteadas son estimaciones tuyas.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: simulando ? c.warning : c.info,
                  fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cinta de totales
// ═══════════════════════════════════════════════════════════════════════════

/// Cinta de totales.
///
/// Es `Stateful` solo por el delta: para decir QUÉ cambió hay que recordar
/// cuánto valía el total antes del último toque, y eso no cabe en un valor
/// derivado.
class _CintaTotales extends StatefulWidget {
  const _CintaTotales(
      {super.key, required this.resultado, required this.obraNombre});
  final ProyeccionResultado resultado;

  /// Nombre de la obra que se está viendo, vacío si son todas.
  final String obraNombre;

  @override
  State<_CintaTotales> createState() => _CintaTotalesState();
}

class _CintaTotalesState extends State<_CintaTotales> {
  double? _delta;
  late double _totalPrevio = widget.resultado.total;
  int _generacion = 0;

  @override
  void didUpdateWidget(_CintaTotales viejo) {
    super.didUpdateWidget(viejo);
    final diferencia = widget.resultado.total - _totalPrevio;
    _totalPrevio = widget.resultado.total;
    if (diferencia.abs() < 0.005) return;

    // El aviso se borra solo. La generación evita que el temporizador de un
    // cambio viejo apague el delta de uno nuevo cuando se toca dos veces
    // seguidas.
    final gen = ++_generacion;
    setState(() => _delta = diferencia);
    Future.delayed(const Duration(milliseconds: 2600), () {
      if (mounted && gen == _generacion) setState(() => _delta = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final resultado = widget.resultado;
    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 3,
            child: _Metrica(
              // Con filtro el total NO es el global: es el de esa obra, con los
              // días prestados que llegaron y sin los que se fueron. Decirlo
              // evita leer una cifra parcial como si fuera la de la empresa.
              etiqueta: widget.obraNombre.isEmpty
                  ? 'Raya proyectada'
                  : 'Raya de ${widget.obraNombre}',
              valor: Fmt.money(resultado.total),
              grande: true,
              delta: _delta,
              detalle: '${Fmt.money(resultado.totalCapturado)} en firme + '
                  '${Fmt.money(resultado.totalProyectado)} estimado',
            ),
          ),
          Expanded(
            flex: 2,
            child: _Metrica(
              etiqueta: 'Días-hombre',
              valor: _sinCeros(resultado.diasHombre),
              detalle: '${resultado.personas} personas',
            ),
          ),
          if (resultado.totalAjustes != 0)
            Expanded(
              flex: 2,
              child: _Metrica(
                etiqueta: 'Ajustes',
                valor: Fmt.money(resultado.totalAjustes),
                color: resultado.totalAjustes < 0 ? c.danger : c.success,
                detalle: 'destajos, anticipos\ny descuentos',
              ),
            ),
        ],
      ),
    );
  }
}

String _sinCeros(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

class _Metrica extends StatelessWidget {
  const _Metrica({
    required this.etiqueta,
    required this.valor,
    this.detalle,
    this.grande = false,
    this.color,
    this.delta,
  });

  final String etiqueta;
  final String valor;
  final String? detalle;
  final bool grande;
  final Color? color;

  /// Cuánto se movió el total con el último toque. Se muestra unos segundos.
  final double? delta;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(etiqueta.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: t.labelSmall
                ?.copyWith(color: c.textMuted, letterSpacing: 0.8, fontSize: 10)),
        const SizedBox(height: 2),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Flexible(
              child: Text(valor,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: (grande ? t.headlineSmall : t.titleMedium)?.copyWith(
                      color: color ?? c.textStrong,
                      fontWeight: FontWeight.bold,
                      fontFeatures: const [FontFeature.tabularFigures()])),
            ),
            // Decir QUÉ cambió, no solo cambiar el número: sin esto, mover un
            // día repinta un total distinto y toca adivinar cuánto se movió.
            if (delta != null) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: delta! > 0 ? c.successSoft : c.dangerSoft,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(
                    '${delta! > 0 ? '+' : '−'}${Fmt.money(delta!.abs())}',
                    style: t.labelMedium?.copyWith(
                        color: delta! > 0 ? c.success : c.danger,
                        fontWeight: FontWeight.bold,
                        fontFeatures: const [FontFeature.tabularFigures()])),
              ),
            ],
          ],
        ),
        if (detalle != null)
          Text(detalle!,
              style: t.bodySmall?.copyWith(color: c.textMuted, fontSize: 11)),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Controles
// ═══════════════════════════════════════════════════════════════════════════

class _Controles extends ConsumerWidget {
  const _Controles({required this.vista});
  final ProyeccionVista vista;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final obraFiltro = ref.watch(obraFiltroProyeccionProvider);
    final agrupar = ref.watch(agruparProyeccionProvider);
    final simulando =
        ref.watch(proyeccionEstadoProvider.select((e) => e.simularCompleta));

    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(12, 0, 4, 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            DropdownButton<String?>(
              value: obraFiltro,
              underline: const SizedBox.shrink(),
              isDense: true,
              hint: const Text('Todas las obras'),
              items: [
                const DropdownMenuItem(value: null, child: Text('Todas las obras')),
                ...vista.nombreObra.entries.map((e) =>
                    DropdownMenuItem(value: e.key, child: Text(e.value))),
              ],
              onChanged: (v) =>
                  ref.read(obraFiltroProyeccionProvider.notifier).state = v,
            ),
            const SizedBox(width: 12),
            SegmentedButton<AgruparPor>(
              showSelectedIcon: false,
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
              segments: const [
                ButtonSegment(value: AgruparPor.cuadrilla, label: Text('Cuadrilla')),
                ButtonSegment(value: AgruparPor.obra, label: Text('Obra')),
                ButtonSegment(value: AgruparPor.ninguno, label: Text('Plano')),
              ],
              selected: {agrupar},
              onSelectionChanged: (s) =>
                  ref.read(agruparProyeccionProvider.notifier).state = s.first,
            ),
            const SizedBox(width: 12),
            FilterChip(
              label: const Text('Simular semana completa'),
              selected: simulando,
              onSelected: (v) => ref
                  .read(proyeccionEstadoProvider.notifier)
                  .setSimularCompleta(v),
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Encabezados de la tabla
// ═══════════════════════════════════════════════════════════════════════════

class _EncabezadoNombre extends StatelessWidget {
  const _EncabezadoNombre();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text('COLABORADOR',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: context.colores.textMuted,
                  fontSize: 10,
                  letterSpacing: 0.8)),
        ),
      );
}

/// Encabezado de los siete días. Cada día es un botón: prende o apaga la
/// columna completa para todos los que se puedan mover.
class _EncabezadoDias extends ConsumerWidget {
  const _EncabezadoDias({required this.vista});
  final ProyeccionVista vista;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final lunes = ref.watch(semanaProyeccionProvider);
    final hoy = indiceDiaSemana(lunes, Semana.inicioDia(DateTime.now()));

    return SizedBox(
      width: _Col.desplazable,
      child: Row(
        children: [
          for (var d = 0; d < 7; d++)
            SizedBox(
              width: _Col.dia,
              child: InkWell(
                onTap: () => _alternarColumna(ref, d),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(_nombresDia[d],
                        style: t.labelSmall?.copyWith(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: d == hoy
                                ? c.chartPayroll
                                : (d == 6 ? c.textFaint : c.textStrong))),
                    Text(
                        '${DateTime.fromMillisecondsSinceEpoch(fechaDelDia(lunes, d)).day}',
                        style: t.labelSmall
                            ?.copyWith(fontSize: 9, color: c.textMuted)),
                  ],
                ),
              ),
            ),
          _celdaTitulo('DÍAS', _Col.dias, context),
          _celdaTitulo('SUBTOTAL', _Col.subtotal, context),
          const SizedBox(width: _Col.menu),
        ],
      ),
    );
  }

  void _alternarColumna(WidgetRef ref, int dia) {
    final estado = ref.read(proyeccionEstadoProvider);
    // Los destajistas no tienen días: incluirlos aquí les prendería celdas que
    // el cálculo ignora, y el encabezado diría que «no pasó nada».
    final movibles = vista.resultado.renglones
        .where((r) => r.colaborador.tipoPago == dom.TipoPago.dia)
        .map((r) => r.colaborador.id)
        .toList();
    final bloqueados = {
      for (final id in movibles)
        if (!estado.simularCompleta &&
            (vista.diasBloqueados[id]?.contains(dia) ?? false))
          id,
    };
    ref
        .read(proyeccionEstadoProvider.notifier)
        .alternarColumna(dia, movibles, bloqueados: bloqueados);
  }

  Widget _celdaTitulo(String texto, double ancho, BuildContext context) =>
      SizedBox(
        width: ancho,
        child: Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(texto,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: context.colores.textMuted,
                    fontSize: 10,
                    letterSpacing: 0.6)),
          ),
        ),
      );
}

// ═══════════════════════════════════════════════════════════════════════════
// Renglones
// ═══════════════════════════════════════════════════════════════════════════

class _EtiquetaGrupo extends StatelessWidget {
  const _EtiquetaGrupo({required this.nombre, required this.cuantos});
  final String nombre;
  final int cuantos;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    return Container(
      color: c.surfaceMuted,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      alignment: Alignment.centerLeft,
      child: Row(
        children: [
          Flexible(
            child: Text(nombre,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .labelLarge
                    ?.copyWith(color: c.textStrong, fontSize: 12.5)),
          ),
          const SizedBox(width: 6),
          Text('$cuantos',
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: c.textMuted, fontSize: 10)),
        ],
      ),
    );
  }
}

class _SubtotalGrupo extends ConsumerWidget {
  const _SubtotalGrupo({
    required this.subtotal,
    required this.cuadrillaId,
    required this.nombreCuadrilla,
  });

  final double subtotal;
  final String? cuadrillaId;
  final String nombreCuadrilla;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    return Container(
      width: _Col.desplazable,
      color: c.surfaceMuted,
      child: Row(
        children: [
          const Spacer(),
          if (cuadrillaId != null)
            IconButton(
              iconSize: 17,
              visualDensity: VisualDensity.compact,
              tooltip: 'Ajuste a $nombreCuadrilla',
              icon: Icon(Icons.playlist_add, color: c.textMuted),
              onPressed: () => mostrarAjusteSheet(
                context,
                ref,
                destino: DestinoAjuste.cuadrilla,
                destinoId: cuadrillaId!,
                titulo: nombreCuadrilla,
              ),
            ),
          SizedBox(
            width: _Col.subtotal,
            child: Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Text(Fmt.money(subtotal),
                  textAlign: TextAlign.right,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: c.textStrong,
                      fontSize: 12.5,
                      fontFeatures: const [FontFeature.tabularFigures()])),
            ),
          ),
          const SizedBox(width: _Col.menu),
        ],
      ),
    );
  }
}

/// Mitad congelada de un renglón: nombre, puesto y la puerta a su ficha.
///
/// El nombre es lo único que SIEMPRE se ve —no se va con el scroll horizontal—,
/// así que de él cuelga todo lo de la persona: sus días, su $/día, sus ajustes y
/// su salida de la proyección.
class _CeldaNombre extends StatelessWidget {
  const _CeldaNombre({required this.renglon, required this.vista});
  final ProyeccionRenglon renglon;
  final ProyeccionVista vista;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final obra = vista.nombreObra[
            vista.obraPorColaborador[renglon.colaborador.id] ?? ''] ??
        '';
    // Quien llegó prestado a la obra que se está viendo: se dice de dónde es,
    // para que no parezca de la casa con menos días.
    final visitante = vista.obraFiltro != null &&
        vista.obraPorColaborador[renglon.colaborador.id] != vista.obraFiltro;

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: InkWell(
        onTap: () => mostrarFichaPersona(context, renglon.colaborador.id),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(renglon.colaborador.nombre,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: c.textStrong,
                            fontSize: 13.5)),
                    Text(
                        visitante
                            ? 'prestado de $obra'
                            : renglon.esDestajista
                                ? 'A destajo · $obra'
                                : '${renglon.puestoNombre} · ${Fmt.money(renglon.salarioDia)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.bodySmall?.copyWith(
                            color: visitante ? c.warning : c.textMuted,
                            fontWeight:
                                visitante ? FontWeight.w600 : FontWeight.normal,
                            fontSize: 11)),
                  ],
                ),
              ),
              // La pista de que el renglón se abre. Sin ella, el nombre se lee
              // como una etiqueta y nadie descubre la ficha.
              Icon(Icons.chevron_right, size: 16, color: c.textFaint),
            ],
          ),
        ),
      ),
    );
  }
}

/// Mitad desplazable de un renglón: las siete celdas, los días, el subtotal y
/// el menú.
class _CeldaDatos extends ConsumerWidget {
  const _CeldaDatos({required this.renglon, required this.vista});
  final ProyeccionRenglon renglon;
  final ProyeccionVista vista;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;

    return Container(
      width: _Col.desplazable,
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(
        children: [
          if (renglon.esDestajista)
            // Los siete días se colapsan en un solo campo: a destajo el pago no
            // lo mueve la asistencia.
            SizedBox(
              width: _Col.dia * 7,
              child: _CampoDestajo(renglon: renglon),
            )
          else
            for (final celda in renglon.celdas)
              SizedBox(
                width: _Col.dia,
                child: _Celda(
                  celda: celda,
                  colaboradorId: renglon.colaborador.id,
                  nombreObraDia: vista.nombreObra[celda.obraId] ?? '',
                ),
              ),
          SizedBox(
            width: _Col.dias,
            child: Text(
                renglon.esDestajista ? '—' : _sinCeros(renglon.diasTotales),
                textAlign: TextAlign.right,
                style: t.bodyMedium?.copyWith(
                    color: c.text,
                    fontFeatures: const [FontFeature.tabularFigures()])),
          ),
          SizedBox(
            width: _Col.subtotal,
            child: Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(Fmt.money(renglon.total),
                      style: t.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: c.textStrong,
                          fontFeatures: const [FontFeature.tabularFigures()])),
                  if (renglon.ajustes != 0)
                    Text(
                        '${renglon.ajustes > 0 ? '+' : ''}${Fmt.money(renglon.ajustes)}',
                        style: t.bodySmall?.copyWith(
                            fontSize: 10,
                            color:
                                renglon.ajustes < 0 ? c.danger : c.success)),
                ],
              ),
            ),
          ),
          SizedBox(
            width: _Col.menu,
            child: _MenuRenglon(renglon: renglon),
          ),
        ],
      ),
    );
  }
}

/// Una celda de día.
///
/// Los cuatro estados se distinguen por FORMA además de por color (relleno vs.
/// punteado, palomita vs. guion vs. punto): el color solo no comunica, y esta
/// tabla se lee a la intemperie con el sol pegando en la pantalla.
class _Celda extends ConsumerWidget {
  const _Celda({
    required this.celda,
    required this.colaboradorId,
    required this.nombreObraDia,
  });

  final CeldaDia celda;
  final String colaboradorId;

  /// Nombre de la obra de ESE día. Solo se usa cuando está prestado.
  final String nombreObraDia;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;

    late final Color fondo;
    late final Color tinta;
    late final IconData icono;
    late final BoxBorder? borde;

    // Un día prestado se ve pero no cuenta aquí: ámbar, con las iniciales de la
    // obra a la que se fue. Va PRIMERO porque manda sobre cualquier otro estado
    // —lo que hay que entender de esa celda es que está en otro lado.
    if (celda.prestado) {
      return _CeldaPrestada(celda: celda, nombreObra: nombreObraDia);
    }

    if (celda.origen == OrigenCelda.real) {
      final asistio = celda.fraccion > 0;
      fondo = asistio ? c.successSoft : c.dangerSoft;
      tinta = asistio ? c.success : c.danger;
      icono = asistio ? Icons.check : Icons.remove;
      borde = null;
    } else if (celda.origen == OrigenCelda.proyectada) {
      fondo = Colors.transparent;
      tinta = c.chartPayroll;
      icono = Icons.check;
      borde = Border.all(color: c.chartPayroll);
    } else {
      // Un «+» fantasma, no un punto: el punto se leía como «deshabilitado» y
      // nadie descubría que la tabla se edita. Vacío y «toca aquí» tienen que
      // verse distinto.
      fondo = Colors.transparent;
      tinta = c.textFaint;
      icono = Icons.add;
      borde = Border.all(color: c.border);
    }

    final bloqueada = celda.bloqueada;

    return Semantics(
      button: !bloqueada,
      label: '${_nombresDia[celda.indice]}: ${_descripcion(celda)}',
      child: InkWell(
        onTap: () => bloqueada
            ? _avisarBloqueada(context)
            : ref
                .read(proyeccionEstadoProvider.notifier)
                .alternarDia(colaboradorId, celda.indice),
        child: Center(
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: fondo,
              border: borde,
              borderRadius: BorderRadius.circular(9),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(icono, size: 18, color: tinta),
                // Marca de «esto ya está capturado»: un punto en la esquina.
                // Distingue lo real de lo proyectado sin depender del color de
                // fondo.
                if (bloqueada)
                  Positioned(
                    right: 3,
                    bottom: 3,
                    child: Container(
                      width: 4,
                      height: 4,
                      decoration: BoxDecoration(
                          color: tinta.withValues(alpha: 0.6),
                          shape: BoxShape.circle),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _descripcion(CeldaDia celda) => switch (celda.origen) {
        OrigenCelda.real when celda.fraccion > 0 =>
          'asistió (capturado, ${_sinCeros(celda.fraccion)})',
        OrigenCelda.real => 'faltó (capturado)',
        OrigenCelda.proyectada => 'se espera que asista',
        OrigenCelda.vacia => 'no cuenta',
      };

  void _avisarBloqueada(BuildContext context) => showAppSnack(
        context,
        'Ese día ya está en el pase de lista. Prende «Simular semana completa» '
        'para moverlo aquí sin afectar lo real.',
        tone: SnackTone.warning,
      );
}

/// Un día que se fue prestado a otra obra.
///
/// Se pinta con las INICIALES de la obra destino, no con un hueco: quien mira la
/// raya de Alfaro tiene que entender por qué esa persona trae menos días, y «se
/// fue a Boticaria» contesta la pregunta que sigue.
class _CeldaPrestada extends StatelessWidget {
  const _CeldaPrestada({required this.celda, required this.nombreObra});
  final CeldaDia celda;
  final String nombreObra;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final obra = nombreObra.isEmpty ? 'otra obra' : nombreObra;
    final iniciales = nombreObra.isEmpty
        ? '?'
        : nombreObra.substring(0, nombreObra.length < 2 ? 1 : 2).toUpperCase();

    return Semantics(
      label: '${_nombresDia[celda.indice]}: ese día se va a $obra',
      child: Tooltip(
        message: 'Ese día se va a $obra',
        child: Center(
          child: Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: c.warningSoft,
              border: Border.all(color: c.warning),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Text(iniciales,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: c.warning,
                    fontSize: 10.5,
                    fontWeight: FontWeight.bold)),
          ),
        ),
      ),
    );
  }
}

/// Campo de monto de un destajista.
class _CampoDestajo extends ConsumerWidget {
  const _CampoDestajo({required this.renglon});
  final ProyeccionRenglon renglon;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;

    return InkWell(
      onTap: () async {
        final monto = await pedirMonto(
          context,
          titulo: 'Destajo estimado de la semana',
          ayuda: '${renglon.colaborador.nombre} · es el TOTAL de la semana, '
              'no un extra sobre lo ya registrado.',
          inicial: renglon.destajo,
        );
        if (monto != null) {
          ref
              .read(proyeccionEstadoProvider.notifier)
              .setDestajo(renglon.colaborador.id, monto);
        }
      },
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          border: Border.all(color: c.accent),
          borderRadius: BorderRadius.circular(9),
        ),
        alignment: Alignment.centerLeft,
        child: Row(
          children: [
            Icon(Icons.edit_outlined, size: 14, color: c.accent),
            const SizedBox(width: 8),
            Text(Fmt.money(renglon.destajo),
                style: t.bodyMedium?.copyWith(
                    color: c.accent,
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()])),
            const SizedBox(width: 8),
            if (renglon.destajoIncongruente)
              Flexible(
                child: Text(
                    'menos que los ${Fmt.money(renglon.destajoCapturado)} ya registrados',
                    maxLines: 2,
                    style: t.bodySmall?.copyWith(color: c.danger, fontSize: 10)),
              )
            else
              Text('estimado de la semana',
                  style:
                      t.bodySmall?.copyWith(color: c.textMuted, fontSize: 10.5)),
          ],
        ),
      ),
    );
  }
}

class _MenuRenglon extends ConsumerWidget {
  const _MenuRenglon({required this.renglon});
  final ProyeccionRenglon renglon;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<String>(
      icon: Icon(Icons.more_vert, size: 18, color: context.colores.textFaint),
      tooltip: 'Opciones de ${renglon.colaborador.nombre}',
      onSelected: (v) async {
        final notifier = ref.read(proyeccionEstadoProvider.notifier);
        switch (v) {
          case 'ficha':
            await mostrarFichaPersona(context, renglon.colaborador.id);
          case 'ajuste':
            await mostrarAjusteSheet(
              context,
              ref,
              destino: DestinoAjuste.colaborador,
              destinoId: renglon.colaborador.id,
              titulo: renglon.colaborador.nombre,
            );
          case 'salario':
            final monto = await pedirMonto(
              context,
              titulo: 'Salario por día',
              ayuda: '${renglon.colaborador.nombre} · solo dentro de esta '
                  'proyección. No cambia su sueldo en el catálogo.',
              inicial: renglon.salarioDia,
            );
            if (monto != null) notifier.setSalario(renglon.colaborador.id, monto);
          case 'quitar':
            // Se guarda el escenario COMPLETO antes de quitar: deshacer tiene
            // que devolver también sus días, su salario y sus ajustes.
            final antes = ref.read(proyeccionEstadoProvider);
            notifier.quitar(renglon.colaborador.id);
            if (context.mounted) {
              showAppSnack(
                context,
                '${renglon.colaborador.nombre} salió de la proyección. '
                'Sigue dado de alta en la app.',
                onUndo: () => notifier.restaurar(antes),
              );
            }
        }
      },
      itemBuilder: (_) => [
        // La ficha también cuelga del nombre; aquí queda como atajo para quien
        // ya venía usando este menú.
        const PopupMenuItem(
            value: 'ficha', child: Text('Ver todo de esta persona…')),
        const PopupMenuItem(
            value: 'ajuste',
            child: Text('Agregar destajo, anticipo o descuento…')),
        if (!renglon.esDestajista)
          const PopupMenuItem(
              value: 'salario', child: Text(r'Cambiar $/día…')),
        const PopupMenuItem(
            value: 'quitar', child: Text('Quitar de la proyección')),
      ],
    );
  }
}

class _LineaCuadrillaNombre extends ConsumerWidget {
  const _LineaCuadrillaNombre({required this.nombre, required this.ajuste});
  final String nombre;
  final AjusteProyeccion ajuste;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: InkWell(
        // Un ajuste de cuadrilla también se corrige: se toca su renglón y se
        // abre la misma hoja con «Quitar» dentro.
        onTap: () => mostrarAjusteSheet(
          context,
          ref,
          destino: DestinoAjuste.cuadrilla,
          destinoId: ajuste.destinoId,
          titulo: nombre,
          existente: ajuste,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${ajuste.tipo.label} · $nombre',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.bodyMedium?.copyWith(
                      color: c.accent,
                      fontWeight: FontWeight.w600,
                      fontSize: 13)),
              Text(ajuste.nota.isEmpty ? 'a la cuadrilla' : ajuste.nota,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.bodySmall?.copyWith(color: c.textMuted, fontSize: 11)),
            ],
          ),
        ),
      ),
    );
  }
}

class _LineaCuadrillaMonto extends ConsumerWidget {
  const _LineaCuadrillaMonto({required this.linea});
  final LineaCuadrilla linea;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    return Container(
      width: _Col.desplazable,
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(
        children: [
          const Spacer(),
          SizedBox(
            width: _Col.subtotal,
            child: Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Text(Fmt.money(linea.montoConSigno),
                  textAlign: TextAlign.right,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: linea.montoConSigno < 0 ? c.danger : c.success,
                      fontFeatures: const [FontFeature.tabularFigures()])),
            ),
          ),
          SizedBox(
            width: _Col.menu,
            child: IconButton(
              iconSize: 17,
              icon: Icon(Icons.close, color: c.textFaint),
              tooltip: 'Quitar el ajuste',
              onPressed: () {
                final notifier = ref.read(proyeccionEstadoProvider.notifier);
                final antes = ref.read(proyeccionEstadoProvider);
                notifier.borrarAjuste(linea.ajuste.id);
                showAppSnack(
                  context,
                  '${linea.ajuste.tipo.label} de '
                  '${Fmt.money(linea.ajuste.monto)} quitado.',
                  onUndo: () => notifier.restaurar(antes),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Pie de totales
// ═══════════════════════════════════════════════════════════════════════════

class _PieFijo extends StatelessWidget {
  const _PieFijo();

  @override
  Widget build(BuildContext context) => Container(
        color: context.colores.surfaceMuted,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        alignment: Alignment.centerLeft,
        child: Text('TOTAL POR DÍA',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: context.colores.textMuted,
                fontSize: 10,
                letterSpacing: 0.6)),
      );
}

class _PieTotales extends StatelessWidget {
  const _PieTotales({required this.resultado});
  final ProyeccionResultado resultado;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;

    return Container(
      width: _Col.desplazable,
      color: c.surfaceMuted,
      child: Row(
        children: [
          for (var d = 0; d < 7; d++)
            SizedBox(
              width: _Col.dia,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                      resultado.personasPorDia[d] == 0
                          ? '—'
                          : _compacto(resultado.totalPorDia[d]),
                      style: t.labelSmall?.copyWith(
                          fontSize: 10.5,
                          fontWeight: FontWeight.bold,
                          color: c.textStrong,
                          fontFeatures: const [FontFeature.tabularFigures()])),
                  Text(
                      resultado.personasPorDia[d] == 0
                          ? ''
                          : '${resultado.personasPorDia[d]}p',
                      style:
                          t.labelSmall?.copyWith(fontSize: 9, color: c.textMuted)),
                ],
              ),
            ),
          SizedBox(
            width: _Col.dias,
            child: Text(_sinCeros(resultado.diasHombre),
                textAlign: TextAlign.right,
                style: t.labelMedium?.copyWith(
                    color: c.text,
                    fontFeatures: const [FontFeature.tabularFigures()])),
          ),
          SizedBox(
            width: _Col.subtotal,
            child: Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Text(Fmt.money(resultado.total),
                  textAlign: TextAlign.right,
                  style: t.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: c.textStrong,
                      fontFeatures: const [FontFeature.tabularFigures()])),
            ),
          ),
          const SizedBox(width: _Col.menu),
        ],
      ),
    );
  }

  /// Miles abreviados: en 44 px no cabe «$12,120».
  String _compacto(double v) {
    if (v.abs() >= 1000) return '${(v / 1000).toStringAsFixed(1)}k';
    return v.toStringAsFixed(0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Barra de acciones
// ═══════════════════════════════════════════════════════════════════════════

class _BarraAcciones extends ConsumerWidget {
  const _BarraAcciones({required this.vista});
  final ProyeccionVista vista;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    return SafeArea(
      child: Container(
        decoration: BoxDecoration(
          color: c.surface,
          border: Border(top: BorderSide(color: c.border)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          children: [
            Expanded(
              child: TextButton.icon(
                icon: const Icon(Icons.person_add_alt, size: 18),
                label: const Text('Agregar'),
                onPressed: vista.candidatos.isEmpty
                    ? null
                    : () => _agregar(context, ref),
              ),
            ),
            Expanded(
              child: PopupMenuButton<RellenoSemana>(
                tooltip: 'Rellenos rápidos',
                onSelected: (r) => _rellenar(ref, r),
                itemBuilder: (_) => const [
                  PopupMenuItem(
                      value: RellenoSemana.lunesASabado,
                      child: Text('Completa lunes a sábado')),
                  PopupMenuItem(
                      value: RellenoSemana.segunSuContrato,
                      child: Text('Según los días de cada quien')),
                  PopupMenuItem(
                      value: RellenoSemana.sinSabado, child: Text('Sin sábado')),
                  PopupMenuItem(
                      value: RellenoSemana.conDomingo,
                      child: Text('Con domingo')),
                  PopupMenuItem(
                      value: RellenoSemana.limpiar,
                      child: Text('Limpiar lo proyectado')),
                ],
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.auto_fix_high, size: 18),
                      SizedBox(width: 6),
                      Text('Rellenos'),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: TextButton.icon(
                icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                label: const Text('PDF'),
                onPressed: vista.resultado.renglones.isEmpty
                    ? null
                    : () => exportarProyeccionPdf(context, ref, vista),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _rellenar(WidgetRef ref, RellenoSemana relleno) {
    final estado = ref.read(proyeccionEstadoProvider);
    final ids = vista.resultado.renglones
        .where((r) => r.colaborador.tipoPago == dom.TipoPago.dia)
        .map((r) => r.colaborador.id)
        .toList();
    ref.read(proyeccionEstadoProvider.notifier).rellenar(
          relleno,
          ids,
          diasPorColaborador: vista.diasPorColaborador,
          bloqueadosPorDia:
              estado.simularCompleta ? const {} : vista.diasBloqueados,
        );
  }

  Future<void> _agregar(BuildContext context, WidgetRef ref) async {
    final lunes = ref.read(semanaProyeccionProvider);
    final hoy = indiceDiaSemana(lunes, Semana.inicioDia(DateTime.now()));

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (_, scroll) => ListView.builder(
          controller: scroll,
          itemCount: vista.candidatos.length + 1,
          itemBuilder: (_, i) {
            if (i == 0) {
              return Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: Text('Agregar a la proyección',
                    style: Theme.of(ctx).textTheme.titleMedium),
              );
            }
            final c = vista.candidatos[i - 1];
            return ListTile(
              title: Text(c.nombre),
              subtitle: Text(c.tipoPago == 'DESTAJO'
                  ? 'A destajo'
                  : '${c.diasSemana} días por semana'),
              trailing: const Icon(Icons.add),
              onTap: () {
                ref.read(proyeccionEstadoProvider.notifier).agregar(
                      c.id,
                      diasSemana: c.diasSemana,
                      // Quien entra a media semana arranca de hoy, no del lunes.
                      desdeDia: hoy ?? 0,
                    );
                Navigator.pop(ctx);
              },
            );
          },
        ),
      ),
    );
  }
}
