/// Mantiene al día los widgets de la pantalla de inicio de Android.
///
/// Cómo funciona: cada vez que cambia la base local (una captura, o lo que baja
/// el sync), se espera un par de segundos, se arma una foto pequeña con
/// [llavesWidgets] y se guarda donde la lee Kotlin (`HomeWidget`). Los widgets
/// nunca consultan la base: leen esa foto. Por eso funcionan sin señal y sin
/// abrir la app, y por eso dicen a qué hora se actualizaron.
///
/// Solo Android. En iOS, en la web y en las pruebas no hace nada.
library;

import 'dart:async';
import 'dart:io' show Platform;

import 'package:drift/drift.dart' show TableUpdateQuery;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleListener;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:home_widget/home_widget.dart';

import '../../data/providers.dart';
import '../../domain/import/mx_time.dart' show claveDiaMx;
import '../db/app_database.dart' show Cuadrilla;
import '../format/format.dart';
import '../modulos/modulos.dart';
import '../modulos/modulos_provider.dart';
import '../settings/settings_provider.dart';
import '../sync/cloud_providers.dart';
import '../sync/rol_provider.dart';
import '../sync/sync_status.dart' show syncEnCursoProvider;
import 'datos_oficina.dart';
import 'resumen_widgets.dart';

/// Las clases Kotlin (AppWidgetProvider) de cada widget.
const _paqueteWidgets = 'com.mario.constructorpro.widgets';
const proveedoresWidgets = [
  'PaseListaWidget',
  'AvisosWidget',
  'AccionesWidget',
  'ObrasHoyWidget',
  // Etapa 2
  'MaterialWidget',
  'ProgramaWidget',
  'PorAprobarWidget',
];

class WidgetsInicioController {
  WidgetsInicioController(this._ref);

  final Ref _ref;
  Timer? _espera;
  StreamSubscription<void>? _cambiosBase;
  AppLifecycleListener? _ciclo;
  bool _activo = false;

  /// Hasta cuándo ya se vieron los avisos (epoch ms). Lo posterior es «nuevo».
  static const kAvisosVistos = 'widgets_avisos_vistos_hasta';

  static bool get soportado => !kIsWeb && Platform.isAndroid;

  void iniciar() {
    if (!soportado || _activo) return;
    _activo = true;
    final db = _ref.read(databaseProvider);
    _cambiosBase = db
        .tableUpdates(const TableUpdateQuery.any())
        .listen((_) => programar());
    // Al volver a la app pudo cambiar el día: lo de ayer ya no es «hoy».
    _ciclo = AppLifecycleListener(onResume: () {
      programar();
      unawaited(refrescarOficina());
    });
    programar(inmediato: true);
    unawaited(refrescarOficina());
  }

  late final DatosOficinaService _oficina =
      DatosOficinaService(_ref.read(sharedPreferencesProvider));

  /// Baja de nuevo compras, programa y aprobaciones (etapa 2) si a esta cuenta
  /// le toca alguno de esos widgets. Sin red se queda lo guardado.
  Future<void> refrescarOficina({bool forzar = false}) async {
    if (!_activo) return;
    final usuario = _ref.read(currentUserProvider);
    final p = permisosWidgets(
      rol: _ref.read(rolUsuarioProvider).asData?.value,
      usa: _ref.read(modulosProvider).usa,
    );
    if (usuario == null || !(p.material || p.programa || p.porAprobar)) return;
    final nuevo = await _oficina.refrescar(
      empresaId: _ref.read(empresaIdProvider),
      usuarioId: usuario.id,
      forzar: forzar,
    );
    if (nuevo) programar();
  }

  /// Junta varios cambios seguidos (un pase de lista son decenas de filas) en
  /// una sola actualización.
  void programar({bool inmediato = false}) {
    if (!_activo) return;
    _espera?.cancel();
    _espera = Timer(
      inmediato ? Duration.zero : const Duration(seconds: 2),
      _actualizar,
    );
  }

  /// Se llama al abrir la bitácora o las notas: lo que ya se vio deja de ser
  /// «nuevo» en el widget de avisos.
  Future<void> marcarAvisosVistos() async {
    if (!soportado) return;
    await _ref
        .read(sharedPreferencesProvider)
        .setInt(kAvisosVistos, DateTime.now().millisecondsSinceEpoch);
    programar();
  }

  void dispose() {
    _espera?.cancel();
    _cambiosBase?.cancel();
    _ciclo?.dispose();
    _activo = false;
  }

  Future<void> _actualizar() async {
    try {
      final llaves = await armarLlaves();
      for (final e in llaves.entries) {
        await HomeWidget.saveWidgetData<Object>(e.key, e.value);
      }
      for (final nombre in proveedoresWidgets) {
        await HomeWidget.updateWidget(
          qualifiedAndroidName: '$_paqueteWidgets.$nombre',
        );
      }
    } catch (e, st) {
      // Un widget que no se actualiza no debe tumbar la app.
      debugPrint('[widgets_inicio] no se pudo actualizar: $e\n$st');
    }
  }

  /// Lee la base local y arma las llaves. Público para poder probarlo.
  Future<Map<String, Object>> armarLlaves() async {
    final ahora = DateTime.now();
    final usuario = _ref.read(currentUserProvider);

    // Cerró sesión y los datos son de una cuenta: el widget no los enseña.
    // (Sin cuenta nunca —el dueño que usa la app solo en su teléfono— sí.)
    if (usuario == null && _ref.read(cuentaLocalProvider).dueno != null) {
      return llavesWidgetsVacias(ahora);
    }

    final rol = _ref.read(rolUsuarioProvider).asData?.value;
    final modulos = _ref.read(modulosProvider);
    final permisos = permisosWidgets(rol: rol, usa: modulos.usa);
    final miUid = usuario?.id;
    final dia = Semana.inicioDia(ahora);
    final hoyMx = claveDiaMx(ahora.millisecondsSinceEpoch);

    final obras = (await _ref.read(obraRepositoryProvider).watchAll().first)
        .where((o) => o.activa)
        .toList();
    final colaboradores = _ref.read(colaboradorRepositoryProvider);
    final ultimaObra =
        await colaboradores.watchUltimaObraActivaPorColaborador().first;
    final cuadrillas = modulos.usa(ClaveModulo.cuadrillas)
        ? await _ref
            .read(cuadrillaRepositoryProvider)
            .watchCuadrillaPorColaborador()
            .first
        : const <String, Cuadrilla>{};

    final roster = <String, List<String>>{};
    final asistencias = <AsistenciaWidget>[];
    final entradasHoy = <String, int>{};
    final incidenciasHoy = <String, int>{};
    final avisos = <AvisoCandidato>[];
    final leerBitacora = permisos.avisosBitacora || permisos.obrasHoy;

    for (final o in obras) {
      final cols = await colaboradores.watchActivosPorObra(o.id).first;
      // Mismo criterio que la pantalla de pase de lista.
      roster[o.id] = [
        for (final c in cols)
          if (c.tipoPago == 'DIA' && ultimaObra[c.id]?.id == o.id) c.id,
      ];

      final asis = await _ref
          .read(asistenciaRepositoryProvider)
          .watchRango(o.id, dia, dia)
          .first;
      for (final a in asis) {
        asistencias.add(AsistenciaWidget(
          obraId: o.id,
          colaboradorId: a.colaboradorId,
          fraccion: a.fraccion,
          pendiente: a.syncStatus == 'pending' || a.syncStatus == 'error',
          capturadaEn: a.createdAt > 0 ? a.createdAt : a.updatedAt,
        ));
      }

      if (leerBitacora && modulos.usa(ClaveModulo.bitacora)) {
        final entradas =
            await _ref.read(bitacoraRepositoryProvider).watchDeObra(o.id).first;
        for (final d in entradas) {
          final en = d.entrada;
          // La bitácora fecha con la medianoche de México, no la del teléfono.
          if (claveDiaMx(en.fecha) == hoyMx) {
            entradasHoy[o.id] = (entradasHoy[o.id] ?? 0) + 1;
            if (en.tipo == 'INCIDENCIA') {
              incidenciasHoy[o.id] = (incidenciasHoy[o.id] ?? 0) + 1;
            }
          }
          if (en.tipo == 'INSTRUCCION') {
            avisos.add(AvisoCandidato(
              tipo: TipoAviso.instruccion,
              obraId: o.id,
              obraNombre: o.nombre,
              autor: en.autorNombre,
              texto: en.texto,
              momento: en.registradaEn > 0 ? en.registradaEn : en.createdAt,
              propio: _esPropio(en.autorId, miUid, en.serverUpdatedAt),
            ));
          }
          for (final ac in d.aclaraciones) {
            avisos.add(AvisoCandidato(
              tipo: TipoAviso.aclaracion,
              obraId: o.id,
              obraNombre: o.nombre,
              autor: ac.autorNombre,
              texto: ac.texto,
              momento: ac.registradaEn > 0 ? ac.registradaEn : ac.createdAt,
              propio: _esPropio(ac.autorId, miUid, ac.serverUpdatedAt),
            ));
          }
        }
      }

      if (permisos.avisosNotas) {
        final notas =
            await _ref.read(notaObraRepositoryProvider).watchDeObra(o.id).first;
        for (final n in notas) {
          final nota = n.nota;
          final para = nota.destinatario.trim();
          final titulo = nota.titulo.trim();
          avisos.add(AvisoCandidato(
            tipo: TipoAviso.nota,
            obraId: o.id,
            obraNombre: o.nombre,
            autor: '',
            // Solo de qué es y para quién: los montos de un trato son dinero.
            texto: [
              if (titulo.isNotEmpty) titulo,
              if (para.isNotEmpty) 'para $para',
            ].join(' · '),
            momento: nota.createdAt,
            // La nota no guarda autor: solo se sabe que es de aquí mientras
            // no ha subido.
            propio: nota.serverUpdatedAt == null,
          ));
        }
      }
    }

    return llavesWidgets(EntradaWidgets(
      ahora: ahora,
      permisos: permisos,
      obras: [for (final o in obras) ObraWidget(id: o.id, nombre: o.nombre)],
      roster: roster,
      cuadrillaDe: {
        for (final e in cuadrillas.entries)
          e.key: CuadrillaWidget(
            id: e.value.id,
            nombre: e.value.nombre,
            orden: e.value.orden,
          ),
      },
      asistenciasHoy: asistencias,
      entradasBitacoraHoy: entradasHoy,
      incidenciasHoy: incidenciasHoy,
      avisos: avisos,
      avisosVistosHasta:
          _ref.read(sharedPreferencesProvider).getInt(kAvisosVistos) ?? 0,
      rol: rol,
      oficina: _oficina.leerCache(
        empresaId: _ref.read(empresaIdProvider),
        usuarioId: miUid,
      ),
    ));
  }

  /// Lo escribió quien usa el teléfono: o el servidor dice que el autor soy yo,
  /// o nunca ha subido (se capturó aquí).
  static bool _esPropio(String? autorId, String? miUid, int? serverUpdatedAt) {
    if (serverUpdatedAt == null) return true;
    return miUid != null && autorId != null && autorId == miUid;
  }
}

/// Se observa desde la raíz de la app para que arranque con ella.
final widgetsInicioProvider = Provider<WidgetsInicioController>((ref) {
  final c = WidgetsInicioController(ref);
  ref.onDispose(c.dispose);
  // Fuera de Android (y en las pruebas) no se escucha nada: las pantallas que
  // marcan avisos como vistos pueden leer este provider sin arrastrar Supabase.
  if (!WidgetsInicioController.soportado) return c;
  // Lo que no es una tabla de Drift pero cambia lo que se enseña.
  ref.listen(rolUsuarioProvider, (_, _) => c.programar());
  ref.listen(modulosProvider, (_, _) => c.programar());
  ref.listen(currentUserProvider, (_, _) => c.programar());
  // Al terminar una sincronización, también lo de la oficina puede haber
  // cambiado (una compra aprobada, material recibido).
  ref.listen<bool>(syncEnCursoProvider, (antes, ahora) {
    if (antes == true && !ahora) unawaited(c.refrescarOficina());
  });
  c.iniciar();
  return c;
});
