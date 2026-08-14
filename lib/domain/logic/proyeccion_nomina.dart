import 'models_proyeccion.dart';
import '../models/models.dart';
import 'nomina_calculator.dart';

export 'models_proyeccion.dart';

/// Arma la raya ESPERADA de una semana a partir de un escenario editable.
///
/// La regla que gobierna todo el archivo: **aquí no se calcula nómina**. El
/// escenario se traduce a `Asistencia` y `Destajo` sintéticas y el cálculo lo
/// hace [NominaCalculator], el mismo que produce la nómina real. Eso garantiza
/// que una proyección sin ajustes dé EXACTAMENTE el mismo número que la nómina
/// de verdad si la semana sale como se proyectó — no hay dos fórmulas que puedan
/// divergir con el tiempo (`test/logic/proyeccion_nomina_test.dart` lo fija).
///
/// Lo único que esta capa suma por su cuenta son los [AjusteProyeccion]
/// (destajo extra, anticipo, descuento), porque el cálculo de nómina no tiene
/// dónde ponerlos. Van encima del resultado del calculador, nunca mezclados
/// dentro de él.
///
/// Dos conceptos que conviene no confundir al leer el código:
///   · **real / capturado**: lo que ya existe en `asistencias` y `destajos`.
///     Manda sobre la proyección y normalmente está bloqueado en la UI.
///   · **proyectado**: lo que el usuario espera. Siempre día COMPLETO
///     (`fraccion: 1.0`): las fracciones de ½ y ¾ sirven para capturar la
///     realidad, no para adivinarla.
class ProyeccionCalculator {
  const ProyeccionCalculator();

  /// [colaboradores] es el catálogo; solo se usan los que estén en
  /// `estado.participantes`, en ese orden.
  ///
  /// [asistenciasReales] y [destajosReales] pueden venir de un rango más ancho
  /// que la semana: se filtran aquí para que el llamador no tenga que hacerlo.
  ///
  /// [cuadrillaPorColaborador] y [obraPorColaborador] son mapas
  /// `colaboradorId → id`. El primero reparte los ajustes dirigidos a una
  /// cuadrilla; el segundo solo sella las asistencias sintéticas (el cálculo de
  /// nómina ignora la obra, pero «Aplicar al pase de lista» la necesita).
  ProyeccionResultado calcular({
    required ProyeccionEstado estado,
    required List<Colaborador> colaboradores,
    required List<Puesto> puestos,
    List<Asistencia> asistenciasReales = const [],
    List<Destajo> destajosReales = const [],
    Map<String, String> cuadrillaPorColaborador = const {},
    Map<String, String> obraPorColaborador = const {},
  }) {
    final porId = {for (final c in colaboradores) c.id: c};
    final puestoPorId = {for (final p in puestos) p.id: p};

    // Participantes que existen de verdad, en el orden que puso el usuario.
    final activos = <Colaborador>[];
    for (final id in estado.participantes) {
      final c = porId[id];
      if (c != null) activos.add(c);
    }

    // ── 1. Lo capturado, indexado por (colaborador, día) ────────────────────
    // Se recorta a la semana del escenario: el llamador puede pasar un rango
    // más ancho sin que se cuele el pago de otra semana.
    final realPorDia = <String, Map<int, double>>{};
    for (final a in asistenciasReales) {
      final d = indiceDiaSemana(estado.lunesMillis, a.fecha);
      if (d == null) continue;
      if (!porId.containsKey(a.colaboradorId)) continue;
      final m = realPorDia.putIfAbsent(a.colaboradorId, () => {});
      m[d] = (m[d] ?? 0) + a.fraccion;
    }

    final destajoRealPorColab = <String, double>{};
    for (final dj in destajosReales) {
      if (indiceDiaSemana(estado.lunesMillis, dj.fecha) == null) continue;
      destajoRealPorColab[dj.colaboradorId] =
          (destajoRealPorColab[dj.colaboradorId] ?? 0) + dj.monto;
    }

    // ── 2. El escenario, traducido a lo que el calculador entiende ──────────
    // El salario que el usuario mueve en la tabla se inyecta como
    // `salarioPersonalizado`, que es justo el override que el calculador ya
    // respeta. Así no hay que tocar `NominaCalculator` para soportarlo.
    final paraCalculo = activos
        .map((c) => estado.salarioOverride.containsKey(c.id)
            ? Colaborador(
                id: c.id,
                nombre: c.nombre,
                puestoId: c.puestoId,
                tipoPago: c.tipoPago,
                salarioPersonalizado: estado.salarioOverride[c.id],
              )
            : c)
        .toList();

    final asistenciasSinteticas = <Asistencia>[];
    final destajosSinteticos = <Destajo>[];

    for (final c in activos) {
      final obraId = obraPorColaborador[c.id] ?? '';
      final reales = realPorDia[c.id] ?? const <int, double>{};

      if (c.tipoPago == TipoPago.dia) {
        // Lo capturado entra tal cual (con su fracción de ½ o ¾ si la trae),
        // salvo que el usuario haya pedido tratar la semana entera como
        // hipótesis limpia.
        if (!estado.simularCompleta) {
          reales.forEach((d, frac) {
            if (frac <= 0) return; // falta capturada: no paga, pero sí bloquea
            asistenciasSinteticas.add(Asistencia(
              colaboradorId: c.id,
              obraId: obraId,
              fecha: fechaDelDia(estado.lunesMillis, d),
              fraccion: frac,
            ));
          });
        }
        // Los días proyectados rellenan SOLO lo que no está capturado: una
        // palomita no puede pisar un día que ya se pasó a lista.
        for (final d in estado.diasDe(c.id)) {
          if (!estado.simularCompleta && reales.containsKey(d)) continue;
          asistenciasSinteticas.add(Asistencia(
            colaboradorId: c.id,
            obraId: obraId,
            fecha: fechaDelDia(estado.lunesMillis, d),
            fraccion: 1.0,
          ));
        }
      } else {
        // A destajo la asistencia no mueve el pago. El monto del escenario es
        // el TOTAL esperado de la semana, no un extra sobre lo capturado; si el
        // usuario estima menos de lo ya registrado, el renglón lo expone en
        // [ProyeccionRenglon.destajoCapturado] para que la UI lo advierta en
        // vez de que el cálculo lo corrija a escondidas.
        final monto = estado.destajoEstimado[c.id] ??
            destajoRealPorColab[c.id] ??
            0.0;
        if (monto != 0) {
          destajosSinteticos.add(Destajo(
            colaboradorId: c.id,
            obraId: obraId,
            fecha: estado.lunesMillis,
            monto: monto,
          ));
        }
      }
    }

    // ── 3. El cálculo de siempre ────────────────────────────────────────────
    final resumen = const NominaCalculator().calcular(
      colaboradores: paraCalculo,
      asistencias: asistenciasSinteticas,
      destajos: destajosSinteticos,
      puestos: puestos,
    );
    final itemPorId = {for (final i in resumen.items) i.colaborador.id: i};

    // ── 4. Los ajustes, repartidos ──────────────────────────────────────────
    final (ajustePorColab, lineasCuadrilla, ignorados) = _repartirAjustes(
      estado: estado,
      participantes: activos.map((c) => c.id).toSet(),
      cuadrillaPorColaborador: cuadrillaPorColaborador,
    );

    // ── 5. Armado de renglones ──────────────────────────────────────────────
    final renglones = <ProyeccionRenglon>[];
    for (final c in activos) {
      final item = itemPorId[c.id];
      final reales = realPorDia[c.id] ?? const <int, double>{};
      final proyectados = estado.diasDe(c.id);
      final puesto = puestoPorId[c.puestoId];
      final salarioDia = estado.salarioOverride[c.id] ??
          c.salarioPersonalizado ??
          puesto?.salarioDiaDefault ??
          0.0;

      final esDia = c.tipoPago == TipoPago.dia;
      final celdas = <CeldaDia>[];
      var fraccionReal = 0.0;
      var diasProyectados = 0;

      // A destajo no hay celdas de día: su pago no lo mueve la asistencia, y es
      // exactamente lo que hace [NominaCalculator] (la rama de destajo ni mira
      // las asistencias). Si el escenario trae días palomeados de cuando esa
      // persona cobraba por día, se ignoran en vez de inflar los días-hombre.
      for (var d = 0; esDia && d < 7; d++) {
        final real = reales[d];
        final tieneReal = real != null && !estado.simularCompleta;
        if (tieneReal) {
          fraccionReal += real;
          celdas.add(CeldaDia(
              indice: d, origen: OrigenCelda.real, fraccion: real));
        } else if (proyectados.contains(d)) {
          diasProyectados++;
          celdas.add(CeldaDia(
              indice: d, origen: OrigenCelda.proyectada, fraccion: 1.0));
        } else {
          // Incluye el caso de `simularCompleta` con un día capturado que el
          // usuario dejó apagado en la hipótesis: no cuenta y no se bloquea.
          celdas.add(
              CeldaDia(indice: d, origen: OrigenCelda.vacia, fraccion: 0));
        }
      }

      // Un destajista queda con 7 celdas vacías: la tabla colapsa su renglón en
      // un solo campo de monto, pero el resultado mantiene las 7 posiciones para
      // que la UI no tenga que preguntar por el largo de la lista.
      if (!esDia) {
        for (var d = 0; d < 7; d++) {
          celdas.add(CeldaDia(indice: d, origen: OrigenCelda.vacia, fraccion: 0));
        }
      }

      final baseCapturada = esDia ? fraccionReal * salarioDia : 0.0;
      final baseProyectada = esDia ? diasProyectados * salarioDia : 0.0;
      final destajo = esDia ? 0.0 : (item?.totalPagar ?? 0.0);
      final ajuste = ajustePorColab[c.id] ?? 0.0;

      renglones.add(ProyeccionRenglon(
        colaborador: c,
        puestoNombre: item?.puestoNombre ?? puesto?.nombre ?? 'Sin Puesto',
        cuadrillaId: cuadrillaPorColaborador[c.id],
        salarioDia: salarioDia,
        celdas: celdas,
        fraccionCapturada: fraccionReal,
        diasProyectados: diasProyectados,
        baseCapturada: baseCapturada,
        baseProyectada: baseProyectada,
        destajo: destajo,
        destajoCapturado: esDia ? 0.0 : (destajoRealPorColab[c.id] ?? 0.0),
        ajustes: ajuste,
      ));
    }

    // ── 6. Totales ──────────────────────────────────────────────────────────
    // Los de columna cuentan solo el pago por día: un destajo no pertenece a un
    // día de la semana, y sumarlo al martes sería inventar información.
    final totalPorDia = List<double>.filled(7, 0);
    final personasPorDia = List<int>.filled(7, 0);
    for (final r in renglones) {
      if (r.colaborador.tipoPago != TipoPago.dia) continue;
      for (final celda in r.celdas) {
        if (celda.fraccion <= 0) continue;
        totalPorDia[celda.indice] += celda.fraccion * r.salarioDia;
        personasPorDia[celda.indice]++;
      }
    }

    var totalCapturado = 0.0;
    var totalProyectado = 0.0;
    var totalDia = 0.0;
    var totalDestajo = 0.0;
    var diasHombre = 0.0;
    for (final r in renglones) {
      totalDia += r.baseCapturada + r.baseProyectada;
      totalDestajo += r.destajo;
      diasHombre += r.fraccionCapturada + r.diasProyectados;

      // Del destajo, la parte «en firme» es la que ya está registrada; el resto
      // es estimación. El `min` cubre el caso de que el usuario estime MENOS de
      // lo ya capturado: ahí no hay nada proyectado, solo un número
      // incongruente que el renglón marca con [destajoIncongruente].
      final destajoFirme =
          r.destajoCapturado < r.destajo ? r.destajoCapturado : r.destajo;
      totalCapturado += r.baseCapturada + destajoFirme;
      totalProyectado += r.baseProyectada + (r.destajo - destajoFirme);
    }

    // Los ajustes son estimación por definición: nadie «captura» un anticipo
    // desde esta pantalla.
    final totalAjustes = ajustePorColab.values.fold<double>(0, (a, b) => a + b) +
        lineasCuadrilla.fold<double>(0, (a, l) => a + l.montoConSigno);

    return ProyeccionResultado(
      renglones: renglones,
      lineasCuadrilla: lineasCuadrilla,
      ajustesIgnorados: ignorados,
      totalPorDia: totalPorDia,
      personasPorDia: personasPorDia,
      totalDia: totalDia,
      totalDestajo: totalDestajo,
      totalAjustes: totalAjustes,
      totalCapturado: totalCapturado,
      totalProyectado: totalProyectado + totalAjustes,
      diasHombre: diasHombre,
      resumenNomina: resumen,
    );
  }

  /// Reparte cada ajuste a quien le toca.
  ///
  /// Un ajuste dirigido a una cuadrilla con reparto [RepartoAjuste.partesIguales]
  /// se divide entre los miembros de esa cuadrilla que **están en el escenario**
  /// (no entre todos los de la cuadrilla: si sacaste a alguien de la
  /// proyección, no le toca). Los centavos que sobran de la división se le
  /// cargan al primero, para que la suma de las partes dé exactamente el monto
  /// capturado — si no, el total de la pantalla no cuadraría con lo que el
  /// usuario escribió.
  (Map<String, double>, List<LineaCuadrilla>, List<AjusteProyeccion>)
      _repartirAjustes({
    required ProyeccionEstado estado,
    required Set<String> participantes,
    required Map<String, String> cuadrillaPorColaborador,
  }) {
    final porColab = <String, double>{};
    final lineas = <LineaCuadrilla>[];
    final ignorados = <AjusteProyeccion>[];

    for (final aj in estado.ajustes) {
      if (aj.monto == 0) continue;

      if (aj.destino == DestinoAjuste.colaborador) {
        if (!participantes.contains(aj.destinoId)) {
          ignorados.add(aj);
          continue;
        }
        porColab[aj.destinoId] =
            (porColab[aj.destinoId] ?? 0) + aj.montoConSigno;
        continue;
      }

      // Destino cuadrilla.
      final miembros = participantes
          .where((id) => cuadrillaPorColaborador[id] == aj.destinoId)
          .toList()
        ..sort((a, b) => estado.participantes
            .indexOf(a)
            .compareTo(estado.participantes.indexOf(b)));

      if (aj.reparto == RepartoAjuste.aLaCuadrilla || miembros.isEmpty) {
        // Sin miembros en el escenario no hay entre quién repartir: se queda
        // como renglón de cuadrilla en vez de desaparecer del total.
        lineas.add(LineaCuadrilla(
          cuadrillaId: aj.destinoId,
          ajuste: aj,
          montoConSigno: aj.montoConSigno,
          repartidoEntre: const [],
        ));
        continue;
      }

      final centavos = (aj.monto * 100).round();
      final base = centavos ~/ miembros.length;
      final sobra = centavos - base * miembros.length;
      for (var i = 0; i < miembros.length; i++) {
        final parte = (base + (i == 0 ? sobra : 0)) / 100 * aj.signo;
        porColab[miembros[i]] = (porColab[miembros[i]] ?? 0) + parte;
      }
      lineas.add(LineaCuadrilla(
        cuadrillaId: aj.destinoId,
        ajuste: aj,
        montoConSigno: 0, // ya está dentro de los renglones
        repartidoEntre: miembros,
      ));
    }

    return (porColab, lineas, ignorados);
  }
}
