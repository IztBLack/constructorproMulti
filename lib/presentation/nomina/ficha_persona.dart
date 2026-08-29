import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:drift/drift.dart' show Value;

import '../../core/db/app_database.dart' as db;
import '../../core/format/format.dart';
import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../../domain/logic/proyeccion_nomina.dart';
import '../common/app_snackbar.dart';
import 'ajuste_sheet.dart';
import 'proyeccion_controller.dart';
import 'redondeo_sheet.dart';
import 'sueldo_editor.dart';

const _diasCortos = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const _diasLargos = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
];

/// Todo lo de una persona en un solo lugar, alcanzable desde lo único que
/// SIEMPRE está en pantalla: su nombre en la columna congelada.
///
/// Antes, sus días vivían a la derecha del scroll horizontal, su salario y sus
/// ajustes detrás de un menú de tres puntos, y los ajustes ya creados no se
/// podían ni ver ni quitar: un anticipo entraba y no salía. Aquí se ve y se
/// deshace todo.
Future<void> mostrarFichaPersona(BuildContext context, String colaboradorId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      builder: (_, scroll) =>
          _FichaPersona(colaboradorId: colaboradorId, scroll: scroll),
    ),
  );
}

class _FichaPersona extends ConsumerStatefulWidget {
  const _FichaPersona({required this.colaboradorId, required this.scroll});

  final String colaboradorId;
  final ScrollController scroll;

  @override
  ConsumerState<_FichaPersona> createState() => _FichaPersonaState();
}

class _FichaPersonaState extends ConsumerState<_FichaPersona> {
  /// Días capturados que el usuario intentó tocar. Dispara el aviso con la
  /// salida al lado, en vez de mandarlo a un control que vive en otra franja.
  List<int> _avisoBloqueado = const [];

  /// El desplegable de préstamos empieza abierto si ya hay días movidos.
  bool _prestamosAbierto = false;
  bool _prestamosInicializado = false;

  @override
  Widget build(BuildContext context) {
    // La hoja se suscribe a la vista en vez de recibir un renglón congelado: es
    // una ruta aparte del árbol de la tabla, así que sin esto los números de
    // adentro se quedarían con el valor que tenían al abrirla. (En la web el
    // modal vive dentro del mismo componente y se redibuja solo.)
    final vista = ref.watch(proyeccionVistaProvider);
    final estado = ref.watch(proyeccionEstadoProvider);
    final suyos = vista.resultado.renglones
        .where((r) => r.colaborador.id == widget.colaboradorId);

    // Puede desaparecer si lo quitaron desde aquí mismo: la hoja ya se está
    // cerrando, no hay nada que pintar.
    if (suyos.isEmpty) return const SizedBox.shrink();
    final renglon = suyos.first;

    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final id = renglon.colaborador.id;
    final obraBase = vista.obraPorColaborador[id] ?? '';
    final prestamos = estado.prestamosDe(id);

    if (!_prestamosInicializado) {
      _prestamosInicializado = true;
      _prestamosAbierto = prestamos.isNotEmpty;
    }

    final ajustes = estado.ajustesDeColaborador(id);
    final soloLectura = vista.soloLectura;
    final esUnaPlaza = estado.esPlazaDelEscenario(id);
    final plaza = estado.plazas[id];

    // Lo capturado en ESTA proyección y lo que tiene en su ficha del catálogo.
    // Se distinguen para poder decir en qué difieren y ofrecer propagarlo.
    final sueldoCapturado = estado.sueldoDe(id);
    final sueldoDeLaFicha = _sueldoDeLaFicha(id);
    final subtitulo = [
      renglon.esDestajista ? 'A destajo' : renglon.puestoNombre,
      vista.nombreObra[obraBase] ?? '',
      vista.nombreCuadrilla[renglon.cuadrillaId ?? ''] ?? '',
    ].where((s) => s.isNotEmpty).join(' · ');

    return ListView(
      controller: widget.scroll,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        Text(renglon.colaborador.nombre, style: t.titleLarge),
        Text(subtitulo, style: t.bodySmall?.copyWith(color: c.textMuted)),
        const SizedBox(height: 18),

        if (!renglon.esDestajista) ...[
          _Titulo('Días de la semana'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final celda in renglon.celdas)
                _ChipDia(
                  celda: celda,
                  nombre: renglon.colaborador.nombre,
                  nombreObra: vista.nombreObra[celda.obraId] ?? '',
                  onTap: () => _tocarDia(renglon, celda),
                ),
            ],
          ),
          if (_avisoBloqueado.isNotEmpty && !estado.simularCompleta) ...[
            const SizedBox(height: 10),
            _AvisoBloqueado(
              dias: _avisoBloqueado,
              onSimular: () {
                ref
                    .read(proyeccionEstadoProvider.notifier)
                    .setSimularCompleta(true);
                setState(() => _avisoBloqueado = const []);
              },
            ),
          ],
          const SizedBox(height: 10),
          Text.rich(
            TextSpan(children: [
              TextSpan(
                  text: _sinCeros(renglon.diasTotales),
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              TextSpan(text: renglon.diasTotales == 1 ? ' día × ' : ' días × '),
              TextSpan(text: Fmt.money(renglon.salarioDia)),
              const TextSpan(text: ' = '),
              TextSpan(
                  text: Fmt.money(
                      renglon.baseCapturada + renglon.baseProyectada),
                  style: const TextStyle(fontWeight: FontWeight.bold)),
            ]),
            style: t.bodyMedium?.copyWith(color: c.text),
          ),
          const SizedBox(height: 12),
          _Prestamos(
            colaboradorId: id,
            celdas: renglon.celdas,
            obraBaseId: obraBase,
            nombreObra: vista.nombreObra,
            prestamos: prestamos,
            abierto: _prestamosAbierto,
            onAlternarAbierto: () =>
                setState(() => _prestamosAbierto = !_prestamosAbierto),
          ),
          const SizedBox(height: 20),
        ],

        // ── Dinero ────────────────────────────────────────────────────────
        _Titulo(renglon.esDestajista
            ? 'Destajo estimado de la semana'
            : 'Sueldo'),
        const SizedBox(height: 8),
        if (renglon.esDestajista)
          _BotonMonto(
            valor: renglon.destajo,
            color: c.accent,
            onTap: soloLectura
                ? null
                : () async {
                    final monto = await pedirMonto(
                      context,
                      titulo: 'Destajo estimado de la semana',
                      ayuda: '${renglon.colaborador.nombre} · es el TOTAL de la '
                          'semana, no un extra sobre lo ya registrado.',
                      inicial: renglon.destajo,
                    );
                    if (monto != null) {
                      ref
                          .read(proyeccionEstadoProvider.notifier)
                          .setDestajo(id, monto);
                    }
                  },
          )
        else ...[
          // Se captura el sueldo del PERIODO y el diario se calcula al lado, que
          // es como ya se captura en el alta de colaboradores. Antes aquí se
          // tecleaba el diario y la división se hacía en la calculadora del
          // teléfono: dos formas distintas de decir lo mismo en la misma app.
          SueldoEditor(
            key: ValueKey('sueldo-$id-${sueldoCapturado?.monto}'),
            valor: sueldoCapturado ?? sueldoDeLaFicha,
            salarioDelPuesto: renglon.salarioDia,
            habilitado: !soloLectura,
            onCambio: (s) =>
                ref.read(proyeccionEstadoProvider.notifier).setSueldo(id, s),
          ),
          if (sueldoDeLaFicha != null &&
              sueldoCapturado != null &&
              !sueldoCapturado.mismoQue(sueldoDeLaFicha))
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'En su ficha tiene ${Fmt.money(sueldoDeLaFicha.monto)} '
                '${sueldoDeLaFicha.periodo.label.toLowerCase()}es '
                '(${Fmt.money(sueldoDeLaFicha.salarioDia ?? 0)}/día).',
                style: t.bodySmall?.copyWith(color: c.warning),
              ),
            ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 12,
            children: [
              // La vuelta atrás del override: `setSueldo(id, null)` existía
              // desde el principio y ninguna pantalla la ofrecía, así que un
              // salario cambiado por error solo se arreglaba a ojo.
              if (estado.salarioOverride.containsKey(id) && !soloLectura)
                TextButton(
                  onPressed: () {
                    ref.read(proyeccionEstadoProvider.notifier)
                      ..setSueldo(id, null)
                      ..setSalario(id, null);
                  },
                  child: const Text('Restablecer el del puesto'),
                ),
              // Cambiar los días/semana mueve el divisor del sueldo, NO las
              // palomitas de arriba: reacomodarlas solo sería correcto la mitad
              // de las veces. Se ofrece aparte, para quien sí lo quiera.
              if (!soloLectura &&
                  sueldoCapturado != null &&
                  renglon.diasTotales != sueldoCapturado.diasSemana)
                TextButton(
                  onPressed: () => _ajustarDias(id, sueldoCapturado.diasSemana),
                  child: Text('Ajustar días a ${sueldoCapturado.diasSemana}'),
                ),
              if (!soloLectura && esUnaPlaza == false && sueldoCapturado != null)
                TextButton(
                  onPressed: () =>
                      _ofrecerGuardarEnFicha(renglon, sueldoCapturado),
                  child: const Text('Guardar también en su ficha'),
                ),
            ],
          ),
        ],
        const SizedBox(height: 4),
        Text(
          renglon.esDestajista
              ? 'Es el TOTAL de la semana, no un extra sobre lo ya registrado. '
                  'La asistencia no lo mueve.'
              : 'Solo dentro de esta proyección mientras no lo guardes en su '
                  'ficha.',
          style: t.bodySmall?.copyWith(color: c.textMuted),
        ),
        if (renglon.destajoIncongruente)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Estimaste menos que los ${Fmt.money(renglon.destajoCapturado)} '
              'que ya están registrados esta semana.',
              style: t.bodySmall
                  ?.copyWith(color: c.danger, fontWeight: FontWeight.w600),
            ),
          ),
        const SizedBox(height: 20),

        // ── Ajustes ───────────────────────────────────────────────────────
        _Titulo('Ajustes'),
        const SizedBox(height: 8),
        if (ajustes.isEmpty)
          Text(
            'Sin ajustes. Aquí van los destajos extra, los anticipos que ya se '
            'entregaron y los descuentos.',
            style: t.bodySmall?.copyWith(color: c.textMuted),
          )
        else
          for (final a in ajustes)
            _RenglonAjuste(ajuste: a, nombre: renglon.colaborador.nombre),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Agregar destajo, anticipo o descuento'),
            onPressed: () => mostrarAjusteSheet(
              context,
              ref,
              destino: DestinoAjuste.colaborador,
              destinoId: id,
              titulo: renglon.colaborador.nombre,
            ),
          ),
        ),
        const SizedBox(height: 20),

        // ── Su raya ───────────────────────────────────────────────────────
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
          decoration: BoxDecoration(
            color: c.surfaceMuted,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Titulo('Su raya de la semana'),
              // Con redondeo activo se enseña la cifra redondeada en grande y
              // la exacta en chiquito debajo: nunca una sin la otra.
              MontoConRedondeo(
                monto: vista.redondeada.raya(renglon),
                estilo: t.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold, color: c.textStrong),
              ),
              if (renglon.ajustes != 0)
                Text('incluye ${Fmt.money(renglon.ajustes)} de ajustes',
                    style: t.bodySmall?.copyWith(color: c.textMuted)),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // ── Si es una plaza: su identidad y la puerta a la realidad ───────
        if (esUnaPlaza && plaza != null && !soloLectura) ...[
          Divider(color: c.border),
          const SizedBox(height: 8),
          _Titulo('Esta plaza'),
          const SizedBox(height: 8),
          TextFormField(
            key: ValueKey('etiqueta-${plaza.id}'),
            initialValue: plaza.etiqueta,
            decoration: const InputDecoration(
                labelText: 'Se anota como', isDense: true),
            onChanged: (v) => ref
                .read(proyeccionEstadoProvider.notifier)
                .actualizarPlaza(plaza.copyWith(etiqueta: v.trim())),
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.person_add_alt, size: 18),
              label: const Text('Darla de alta como colaborador…'),
              onPressed: () => _darDeAlta(plaza),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Crea a la persona con este puesto y este sueldo, la asigna a la '
            'obra y el renglón deja de ser hipótesis. Conserva sus días y sus '
            'ajustes.',
            style: t.bodySmall?.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: 16),
        ],

        // Destructivo, separado del resto y en color de peligro: sacar a
        // alguien mueve el total y no debe quedar a un dedo de «guardar».
        if (!soloLectura) ...[
          Divider(color: c.border),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              icon:
                  Icon(Icons.person_remove_outlined, size: 18, color: c.danger),
              label: Text(
                  esUnaPlaza ? 'Quitar la plaza' : 'Quitar de la proyección',
                  style: TextStyle(color: c.danger)),
              onPressed: () => _quitar(renglon),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Text(
                esUnaPlaza
                    ? 'La plaza no existe fuera de esta proyección: al quitarla '
                        'se va del todo.'
                    : 'Solo lo saca de esta cuenta. Sigue dado de alta en la app.',
                style: t.bodySmall?.copyWith(color: c.textMuted)),
          ),
        ] else
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            decoration: BoxDecoration(
              color: c.infoSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'Esta proyección está abierta solo para consultar. Para cambiar '
              'algo, ábrela con «Editar».',
              style: t.bodySmall?.copyWith(color: c.info),
            ),
          ),
      ],
    );
  }

  /// El sueldo que esta persona tiene REGISTRADO en su ficha del catálogo.
  ///
  /// `null` cuando no hay fila de sueldo (o cuando el dispositivo no tiene
  /// permiso de leer sueldos por la RLS: ahí el mapa llega vacío y todo cae al
  /// salario del puesto, que es justo lo que debe pasar).
  SueldoProyectado? _sueldoDeLaFicha(String colaboradorId) {
    if (esPlaza(colaboradorId)) return null;
    final sueldos = ref.read(sueldosPorColaboradorProvider).asData?.value ??
        const <String, db.ColaboradorSueldoRow>{};
    final fila = sueldos[colaboradorId];
    final monto = fila?.salarioPeriodo;
    if (fila == null || monto == null || monto <= 0) return null;
    return SueldoProyectado(
      periodo: periodoPagoFromCode(fila.periodoPago),
      monto: monto,
      diasSemana: fila.diasSemana,
    );
  }

  /// Pone los días proyectados en los que dice el contrato del sueldo.
  ///
  /// Va como acción aparte y no automática al cambiar «días/semana»: quien ya
  /// tiene tres días capturados no quiere que se los muevan por haber tocado el
  /// divisor del sueldo.
  void _ajustarDias(String colaboradorId, int dias) {
    final estado = ref.read(proyeccionEstadoProvider);
    final bloqueados = estado.simularCompleta
        ? const <int>{}
        : (ref.read(proyeccionVistaProvider).diasBloqueados[colaboradorId] ??
            const <int>{});
    final nuevos = {
      for (var d = 0; d < 7; d++)
        if (d < dias.clamp(1, 7) || bloqueados.contains(d)) d,
    };
    ref
        .read(proyeccionEstadoProvider.notifier)
        .restaurar(estado.copyWith(diasProyectados: {
          ...estado.diasProyectados,
          colaboradorId: nuevos,
        }));
  }

  /// Ofrece propagar el sueldo capturado a la ficha del colaborador.
  ///
  /// Es la pregunta que pidió el usuario: la proyección puede quedarse con el
  /// sueldo nuevo solo para esta cuenta, o actualizarlo también en el sistema.
  /// La opción que no escribe nada es la marcada por defecto, y la frase sobre
  /// las semanas capturadas es la que quita el miedo a tocar el botón.
  Future<void> _ofrecerGuardarEnFicha(
      ProyeccionRenglon renglon, SueldoProyectado sueldo) async {
    final actual = _sueldoDeLaFicha(renglon.colaborador.id);
    final diario = sueldo.salarioDia ?? 0;
    if (diario <= 0) return;

    final c = context.colores;
    final guardar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Este sueldo también está en su ficha'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              actual == null
                  ? '${renglon.colaborador.nombre} no tiene sueldo propio '
                      'registrado: usa el del puesto.'
                  : '${renglon.colaborador.nombre} tiene registrados '
                      '${Fmt.money(actual.monto)} '
                      '${actual.periodo.label.toLowerCase()}es '
                      '(${Fmt.money(actual.salarioDia ?? 0)}/día).',
            ),
            const SizedBox(height: 6),
            Text(
              'Aquí le pusiste ${Fmt.money(sueldo.monto)} '
              '${sueldo.periodo.label.toLowerCase()}es '
              '(${Fmt.money(diario)}/día).',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            Text(
              'Si lo guardas, su sueldo cambia en el sistema y la nómina y las '
              'proyecciones siguientes lo usarán. Las semanas ya capturadas no '
              'se mueven.',
              style: Theme.of(ctx)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: c.textMuted),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Solo en esta proyección')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Actualizar su ficha')),
        ],
      ),
    );
    if (guardar != true || !mounted) return;

    await ref.read(colaboradorRepositoryProvider).upsertSueldo(
          db.ColaboradorSueldoCompanion(
            colaboradorId: Value(renglon.colaborador.id),
            salarioPersonalizado: Value(diario),
            periodoPago: Value(sueldo.periodo.code),
            salarioPeriodo: Value(sueldo.monto),
            diasSemana: Value(sueldo.diasSemana),
          ),
        );
    if (mounted) {
      showAppSnack(context,
          'Sueldo actualizado en la ficha de ${renglon.colaborador.nombre}.');
    }
  }

  /// Convierte una plaza en una persona de verdad.
  ///
  /// Es la única puerta entre la hipótesis y el catálogo, y hay que tocarla a
  /// propósito. El escenario conserva los días y los ajustes: se sustituye el
  /// id de la plaza por el del colaborador nuevo en todo el escenario, en vez de
  /// quitar la plaza y agregar a alguien desde cero.
  Future<void> _darDeAlta(PlazaProyectada plaza) async {
    final nombre = await _pedirNombreReal(plaza.etiqueta);
    if (nombre == null || !mounted) return;

    final repo = ref.read(colaboradorRepositoryProvider);
    final nuevoId = await repo.crearDesdePlaza(
      nombre: nombre,
      puestoId: plaza.puestoId,
      salarioDia: plaza.salarioDia,
      periodo: plaza.sueldo.periodo,
      montoPeriodo: plaza.sueldo.monto,
      diasSemana: plaza.sueldo.diasSemana,
      obraId: plaza.obraId,
    );

    if (!mounted) return;
    final notifier = ref.read(proyeccionEstadoProvider.notifier);
    notifier.sustituirPlazaPorColaborador(plaza.id, nuevoId);
    Navigator.pop(context);
    showAppSnack(context, '$nombre quedó dado de alta y sigue en la proyección.');
  }

  Future<String?> _pedirNombreReal(String sugerido) async {
    final ctrl = TextEditingController();
    final nombre = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Dar de alta al colaborador'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('«$sugerido» pasa a ser una persona del equipo. ¿Cómo se llama?',
                style: Theme.of(ctx).textTheme.bodySmall),
            const SizedBox(height: 10),
            TextField(
              controller: ctrl,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Nombre completo'),
              onSubmitted: (v) => Navigator.pop(ctx, v),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text),
              child: const Text('Dar de alta')),
        ],
      ),
    );
    ctrl.dispose();
    final limpio = nombre?.trim();
    return (limpio == null || limpio.isEmpty) ? null : limpio;
  }

    void _tocarDia(ProyeccionRenglon renglon, CeldaDia celda) {
    if (celda.prestado) {
      // Se abre el desplegable de préstamos en vez de avisar con un snack: un
      // snack aparece DEBAJO de esta hoja y no se vería. Además lleva a la
      // única forma de deshacerlo, que es justo lo que se está intentando.
      setState(() => _prestamosAbierto = true);
      return;
    }
    if (celda.bloqueada) {
      setState(() => _avisoBloqueado = renglon.celdas
          .where((x) => x.origen == OrigenCelda.real)
          .map((x) => x.indice)
          .toList());
      return;
    }
    ref
        .read(proyeccionEstadoProvider.notifier)
        .alternarDia(renglon.colaborador.id, celda.indice);
  }

  void _quitar(ProyeccionRenglon renglon) {
    // Se guarda el escenario COMPLETO antes de quitar: deshacer tiene que
    // devolver también sus días, su salario y sus ajustes.
    final notifier = ref.read(proyeccionEstadoProvider.notifier);
    final antes = ref.read(proyeccionEstadoProvider);
    // El contexto del Navigator sobrevive al cierre de la hoja; el de este
    // widget no. Sin esto, el aviso con «Deshacer» —la red de seguridad de una
    // acción destructiva— reventaría justo al usarla.
    final anfitrion = Navigator.of(context).context;
    notifier.quitar(renglon.colaborador.id);
    Navigator.pop(context);
    showAppSnack(
      anfitrion,
      '${renglon.colaborador.nombre} salió de la proyección. Sigue dado de '
      'alta en la app.',
      onUndo: () => notifier.restaurar(antes),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Piezas
// ═══════════════════════════════════════════════════════════════════════════

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

/// Un día, grande y tocable. Los cinco estados se distinguen por FORMA además
/// de por color (relleno vs. contorno, palomita vs. guion vs. «+» vs. las
/// iniciales de la obra destino): el color solo no comunica.
class _ChipDia extends StatelessWidget {
  const _ChipDia({
    required this.celda,
    required this.nombre,
    required this.nombreObra,
    required this.onTap,
  });

  final CeldaDia celda;
  final String nombre;
  final String nombreObra;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final capturado = celda.origen == OrigenCelda.real;

    Color fondo = Colors.transparent;
    Color tinta = c.textFaint;
    Color borde = c.border;
    IconData? icono;
    String? texto = '+';
    String descripcion = 'no cuenta, toca para prenderlo';

    if (celda.prestado) {
      // Ámbar es el «ojo con esto» del sistema: ese día existe pero cuenta en
      // otro lado. Las iniciales dicen a DÓNDE se fue, que es la pregunta que
      // sigue a «¿por qué trae menos días?».
      fondo = c.warningSoft;
      tinta = c.warning;
      borde = c.warning;
      texto = nombreObra.isEmpty
          ? '?'
          : nombreObra.substring(0, nombreObra.length < 2 ? 1 : 2).toUpperCase();
      descripcion =
          'ese día se va a ${nombreObra.isEmpty ? 'otra obra' : nombreObra}';
    } else if (capturado && celda.fraccion > 0) {
      fondo = c.successSoft;
      tinta = c.success;
      borde = c.successSoft;
      icono = Icons.check;
      texto = null;
      descripcion = 'asistió, ya capturado';
    } else if (capturado) {
      fondo = c.dangerSoft;
      tinta = c.danger;
      borde = c.dangerSoft;
      icono = Icons.remove;
      texto = null;
      descripcion = 'faltó, ya capturado';
    } else if (celda.origen == OrigenCelda.proyectada) {
      tinta = c.chartPayroll;
      borde = c.chartPayroll;
      icono = Icons.check;
      texto = null;
      descripcion = 'se espera que asista';
    }

    return Semantics(
      button: true,
      label: '$nombre, ${_diasLargos[celda.indice]}: $descripcion',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 54,
          height: 56,
          decoration: BoxDecoration(
            color: fondo,
            border: Border.all(color: borde, width: 1.4),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Stack(
            children: [
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(_diasCortos[celda.indice],
                        style: t.labelSmall?.copyWith(
                            fontSize: 9.5,
                            color: tinta,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 1),
                    if (icono != null)
                      Icon(icono, size: 20, color: tinta)
                    else
                      Text(texto!,
                          style: t.titleMedium?.copyWith(
                              color: tinta, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              // Candado: «esto ya está en el pase de lista». Va además del
              // color, para que se entienda sin distinguir verde de rojo.
              if (capturado && !celda.prestado)
                Positioned(
                  right: 3,
                  top: 3,
                  child: Icon(Icons.lock_outline, size: 11, color: tinta),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// El aviso de «ese día ya está capturado» con su salida AL LADO: el botón de
/// simular vivía en una barra con scroll horizontal, fuera de la pantalla justo
/// cuando se necesitaba.
class _AvisoBloqueado extends StatelessWidget {
  const _AvisoBloqueado({required this.dias, required this.onSimular});
  final List<int> dias;
  final VoidCallback onSimular;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: BoxDecoration(
        color: c.warningSoft,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${dias.map((d) => _diasCortos[d]).join(', ')} '
              '${dias.length == 1 ? 'ya está' : 'ya están'} en el pase de lista.',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: c.warning, fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: onSimular,
            child: const Text('Simular la semana'),
          ),
        ],
      ),
    );
  }
}

/// Préstamos por día: «el jueves me lo llevo a Alfaro».
///
/// Un renglón por día en vez de un selector global porque el préstamo es de
/// DÍAS SUELTOS, no de la semana: en la obra se presta gente un jueves, no un
/// mes. Los días que siguen en la obra base se ven atenuados para que el ojo
/// encuentre rápido los que sí se movieron.
class _Prestamos extends ConsumerWidget {
  const _Prestamos({
    required this.colaboradorId,
    required this.celdas,
    required this.obraBaseId,
    required this.nombreObra,
    required this.prestamos,
    required this.abierto,
    required this.onAlternarAbierto,
  });

  final String colaboradorId;
  final List<CeldaDia> celdas;
  final String obraBaseId;
  final Map<String, String> nombreObra;
  final Map<int, String> prestamos;
  final bool abierto;
  final VoidCallback onAlternarAbierto;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;

    // Sin obra base no hay de dónde prestar: es el caso de quien todavía no
    // está asignado a ninguna. (Y si se colara, el desplegable reventaría por
    // no encontrar su valor entre las opciones.)
    if (!nombreObra.containsKey(obraBaseId)) return const SizedBox.shrink();

    // Con una sola obra no hay a dónde mover a nadie.
    final otras =
        nombreObra.entries.where((e) => e.key != obraBaseId).toList();
    if (otras.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: onAlternarAbierto,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
              child: Row(
                children: [
                  Expanded(
                    child: Text('¿Se va a otra obra algún día?',
                        style: t.bodyMedium?.copyWith(
                            color: c.text, fontWeight: FontWeight.w600)),
                  ),
                  if (prestamos.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: c.warningSoft,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                          '${prestamos.length} '
                          '${prestamos.length == 1 ? 'día movido' : 'días movidos'}',
                          style: t.labelSmall?.copyWith(
                              color: c.warning, fontWeight: FontWeight.w700)),
                    ),
                  Icon(abierto ? Icons.expand_less : Icons.expand_more,
                      color: c.textMuted),
                ],
              ),
            ),
          ),
          if (abierto) ...[
            Divider(height: 1, color: c.border),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Column(
                children: [
                  Text(
                    'El día que muevas se marca como asistido en la obra '
                    'destino y suma a la raya de ESA obra, junto con la gente '
                    'que ya está asignada ahí.',
                    style: t.bodySmall?.copyWith(color: c.textMuted),
                  ),
                  const SizedBox(height: 6),
                  for (final celda in celdas)
                    _RenglonPrestamo(
                      colaboradorId: colaboradorId,
                      celda: celda,
                      obraBaseId: obraBaseId,
                      nombreObra: nombreObra,
                      destino: prestamos[celda.indice],
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RenglonPrestamo extends ConsumerWidget {
  const _RenglonPrestamo({
    required this.colaboradorId,
    required this.celda,
    required this.obraBaseId,
    required this.nombreObra,
    required this.destino,
  });

  final String colaboradorId;
  final CeldaDia celda;
  final String obraBaseId;
  final Map<String, String> nombreObra;
  final String? destino;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    // Un día ya capturado pertenece a la obra donde se pasó lista: moverlo aquí
    // sería reescribir algo que ya pasó.
    final bloqueado = celda.origen == OrigenCelda.real && !celda.prestado;
    // Si la obra del préstamo ya no existe en el catálogo, el renglón cae a la
    // base en vez de tumbar el desplegable con un valor sin opción.
    final movido = destino != null && nombreObra.containsKey(destino);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 34,
            child: Text(_diasCortos[celda.indice],
                style: t.labelMedium?.copyWith(
                    color: movido ? c.warning : c.textMuted,
                    fontWeight: FontWeight.w700)),
          ),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                color: movido ? c.warningSoft : Colors.transparent,
                border: Border.all(color: movido ? c.warning : c.border),
                borderRadius: BorderRadius.circular(9),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  isDense: true,
                  isExpanded: true,
                  value: movido ? destino : obraBaseId,
                  style: t.bodyMedium?.copyWith(
                      color: movido ? c.warning : c.textMuted,
                      fontWeight: movido ? FontWeight.w600 : FontWeight.normal),
                  items: [
                    for (final e in nombreObra.entries)
                      DropdownMenuItem(
                        value: e.key,
                        child: Text(e.value, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: bloqueado
                      ? null
                      : (v) => ref
                          .read(proyeccionEstadoProvider.notifier)
                          .moverDia(colaboradorId, celda.indice,
                              v == obraBaseId ? null : v),
                ),
              ),
            ),
          ),
          if (bloqueado)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Text('ya capturado',
                  style: t.bodySmall?.copyWith(color: c.textFaint)),
            ),
        ],
      ),
    );
  }
}

/// Un ajuste de la lista: se toca para editarlo y trae su propia salida.
class _RenglonAjuste extends ConsumerWidget {
  const _RenglonAjuste({required this.ajuste, required this.nombre});
  final AjusteProyeccion ajuste;
  final String nombre;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colores;
    final t = Theme.of(context).textTheme;
    final suma = ajuste.signo > 0;

    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(ajuste.tipo.label,
          style: t.bodyMedium?.copyWith(
              color: c.textStrong, fontWeight: FontWeight.w600)),
      subtitle: ajuste.nota.isEmpty
          ? null
          : Text(ajuste.nota,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: t.bodySmall?.copyWith(color: c.textMuted)),
      onTap: () => mostrarAjusteSheet(
        context,
        ref,
        destino: DestinoAjuste.colaborador,
        destinoId: ajuste.destinoId,
        titulo: nombre,
        existente: ajuste,
      ),
      // El renglón entero abre la hoja de edición, que es donde vive «Quitar».
      // No se pone aquí una X que borre de golpe porque su red de seguridad
      // —el aviso con «Deshacer»— se dibujaría DEBAJO de esta hoja modal, o sea
      // que no se vería: un borrado sin vuelta atrás visible.
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('${suma ? '+' : '−'}${Fmt.money(ajuste.monto)}',
              style: t.bodyMedium?.copyWith(
                  color: suma ? c.success : c.danger,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()])),
          const SizedBox(width: 6),
          Icon(Icons.edit_outlined, size: 16, color: c.textMuted),
        ],
      ),
    );
  }
}

/// Un monto que se toca para cambiarlo. Es un botón y no un `TextField` a
/// propósito: en la web el salario se guardaba en cada tecla y al teclear
/// encima quedaba en 0 un instante, desplomando el gran total a media captura.
/// Aquí el valor se compromete al aceptar el diálogo, así que ese estado
/// intermedio no existe.
class _BotonMonto extends StatelessWidget {
  const _BotonMonto({
    required this.valor,
    required this.color,
    required this.onTap,
  });

  final double valor;
  final Color color;

  /// `null` deja el botón inerte: es lo que hace una proyección abierta solo
  /// para consultar.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colores;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          border: Border.all(color: c.borderStrong),
          borderRadius: BorderRadius.circular(9),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.edit_outlined, size: 15, color: c.textMuted),
            const SizedBox(width: 8),
            Text(Fmt.money(valor),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: color,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()])),
          ],
        ),
      ),
    );
  }
}

String _sinCeros(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);
