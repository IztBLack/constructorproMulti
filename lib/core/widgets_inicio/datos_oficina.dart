/// LECTURA de lo que la oficina mueve, solo para los widgets (etapa 2).
///
/// Mismo patrón que `ModulosService`: el móvil lee DIRECTO de Supabase —no por
/// el motor Drift— y lo guarda en SharedPreferences. No hace falta migrar la
/// base del teléfono ni el sync para algo que el móvil solo enseña: compras,
/// programa y aprobaciones se capturan en la web.
///
/// La RLS del servidor decide qué filas ve cada rol (un residente, solo sus
/// obras; las aprobaciones, solo admin o el rol que aprueba). Lo guardado lleva
/// la empresa Y el usuario: lo de otra cuenta nunca se enseña.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../sync/supabase_config.dart';
import 'oficina_widgets.dart';

/// Lee del servidor. Se puede sustituir en pruebas.
typedef LectorOficina = Future<DatosOficina> Function(DateTime ahora);

Future<DatosOficina> _leerDeSupabase(DateTime ahora) async {
  final db = SupabaseConfig.client;
  final hace21 = ahora.subtract(const Duration(days: 21)).millisecondsSinceEpoch;
  final ayer = ahora.subtract(const Duration(days: 1)).millisecondsSinceEpoch;
  // Con dos semanas de margen alcanza para «empieza esta semana».
  final finSemana = ahora.add(const Duration(days: 14)).millisecondsSinceEpoch;

  final reqs = await db
      .from('requisiciones')
      .select('obra_id, folio, estado, created_at, motivo_rechazo, '
          'requisicion_renglon(descripcion, cantidad, unidad, orden, deleted_at)')
      .isFilter('deleted_at', null)
      .or('created_at.gte.$hace21,estado.in.(PENDIENTE,APROBADA,PARCIAL)')
      .order('created_at', ascending: false)
      .limit(40);
  final recs = await db
      .from('recepciones')
      .select('obra_id, fecha')
      .isFilter('deleted_at', null)
      .gte('fecha', ayer)
      .limit(100);
  final partidas = await db
      .from('programa_partida')
      .select('obra_id, concepto, fecha_inicio, fecha_fin, terminada')
      .isFilter('deleted_at', null)
      .eq('terminada', false)
      .lte('fecha_inicio', finSemana)
      .limit(300);
  final aprob = await db
      .from('aprobacion')
      .select('tipo')
      .eq('estado', 'PENDIENTE')
      .isFilter('deleted_at', null)
      .limit(300);

  // --- Etapa 3. Cada lectura por separado: si una falla (un rol sin permiso
  // que el servidor rechaza en vez de filtrar), las demás siguen. Si no hay
  // red, ya falló lo de arriba y se conservó lo guardado.
  Future<List<Map<String, dynamic>>> opcional(
      Future<List<Map<String, dynamic>>> Function() leer, String que) async {
    try {
      return await leer();
    } catch (e) {
      debugPrint('[datos_oficina] $que: $e');
      return const [];
    }
  }

  final hace2 = ahora.subtract(const Duration(days: 2)).millisecondsSinceEpoch;
  final hace8 = ahora.subtract(const Duration(days: 8)).millisecondsSinceEpoch;
  final revisiones = await opcional(
      () => db
          .from('seguridad_checklist')
          .select('obra_id, fecha')
          .isFilter('deleted_at', null)
          .gte('fecha', hace2)
          .limit(300),
      'seguridad');
  // Del incidente SOLO obra, fecha y tipo: ni quién ni qué pasó.
  final incidentes = await opcional(
      () => db
          .from('incidente')
          .select('obra_id, fecha, tipo')
          .isFilter('deleted_at', null)
          .gte('fecha', hace8)
          .limit(300),
      'incidentes');
  final garantias = await opcional(
      () => db
          .from('garantia_reporte')
          .select('obra_id, descripcion, ubicacion, estado, programado_para, reportado_en, '
              'obras(nombre)')
          .isFilter('deleted_at', null)
          .inFilter('estado', ['ABIERTO', 'EN_REVISION', 'PROGRAMADO'])
          .limit(100),
      'garantías');
  // Del préstamo, sin costo de la herramienta.
  final prestamos = await opcional(
      () => db
          .from('herramienta_asignacion')
          .select('obra_id, desde, devolver_antes, recibio_nombre, herramienta(nombre, deleted_at)')
          .isFilter('deleted_at', null)
          .isFilter('hasta', null)
          .limit(300),
      'herramienta');

  final porTipo = <String, int>{};
  for (final a in aprob) {
    final t = a['tipo'] as String? ?? '';
    porTipo[t] = (porTipo[t] ?? 0) + 1;
  }

  List<RenglonPedido> renglones(Object? crudo) {
    final filas = [
      for (final x in (crudo as List? ?? const []))
        if ((x as Map)['deleted_at'] == null) x,
    ]..sort((a, b) =>
        ((a['orden'] as num?) ?? 0).compareTo((b['orden'] as num?) ?? 0));
    return [
      for (final x in filas)
        RenglonPedido(
          descripcion: x['descripcion'] as String? ?? '',
          cantidad: (x['cantidad'] as num?)?.toDouble() ?? 0,
          unidad: x['unidad'] as String? ?? '',
        ),
    ];
  }

  return DatosOficina(
    leidoEn: ahora.millisecondsSinceEpoch,
    pedidos: [
      for (final r in reqs)
        PedidoMaterial(
          obraId: r['obra_id'] as String,
          folio: (r['folio'] as num?)?.toInt() ?? 0,
          estado: r['estado'] as String? ?? 'PENDIENTE',
          creadoEn: (r['created_at'] as num?)?.toInt() ?? 0,
          motivoRechazo: r['motivo_rechazo'] as String?,
          renglones: renglones(r['requisicion_renglon']),
        ),
    ],
    recepciones: [
      for (final r in recs)
        (obraId: r['obra_id'] as String, fecha: (r['fecha'] as num).toInt()),
    ],
    partidas: [
      for (final p in partidas)
        PartidaPrograma(
          obraId: p['obra_id'] as String,
          concepto: p['concepto'] as String? ?? '',
          inicio: (p['fecha_inicio'] as num).toInt(),
          fin: (p['fecha_fin'] as num).toInt(),
          terminada: p['terminada'] as bool? ?? false,
        ),
    ],
    aprobaciones: porTipo,
    revisiones: [
      for (final r in revisiones)
        (obraId: r['obra_id'] as String, fecha: (r['fecha'] as num).toInt()),
    ],
    incidentes: [
      for (final i in incidentes)
        (
          obraId: i['obra_id'] as String,
          fecha: (i['fecha'] as num).toInt(),
          tipo: i['tipo'] as String? ?? '',
        ),
    ],
    garantias: [
      for (final g in garantias)
        GarantiaAbierta(
          obraId: g['obra_id'] as String,
          descripcion: g['descripcion'] as String? ?? '',
          ubicacion: g['ubicacion'] as String? ?? '',
          estado: g['estado'] as String? ?? 'ABIERTO',
          programadoPara: (g['programado_para'] as num?)?.toInt(),
          reportadoEn: (g['reportado_en'] as num?)?.toInt() ?? 0,
          obraNombre: (g['obras'] is Map ? (g['obras'] as Map)['nombre'] as String? : null) ?? '',
        ),
    ],
    herramientas: [
      for (final h in prestamos)
        if (h['herramienta'] is Map && (h['herramienta'] as Map)['deleted_at'] == null)
          HerramientaPrestada(
            nombre: (h['herramienta'] as Map)['nombre'] as String? ?? '',
            obraId: h['obra_id'] as String?,
            quien: h['recibio_nombre'] as String? ?? '',
            desde: (h['desde'] as num?)?.toInt() ?? 0,
            devolverAntes: (h['devolver_antes'] as num?)?.toInt(),
          ),
    ],
  );
}

class DatosOficinaService {
  DatosOficinaService(this.prefs, {LectorOficina? lector})
      : _lector = lector ?? _leerDeSupabase;

  final SharedPreferences prefs;
  final LectorOficina _lector;

  static const cacheKey = 'widgets_oficina_cache';

  /// No se vuelve a leer antes de esto (cada sync y cada regreso a la app
  /// pedirían otra lectura).
  static const espera = Duration(minutes: 3);

  /// Lo guardado para esta empresa y este usuario, o null.
  DatosOficina? leerCache({required String? empresaId, required String? usuarioId}) {
    if (empresaId == null || usuarioId == null) return null;
    final raw = prefs.getString(cacheKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      final m = json.decode(raw) as Map<String, dynamic>;
      if (m['empresa'] != empresaId || m['usuario'] != usuarioId) return null;
      return DatosOficina.fromJson((m['datos'] as Map).cast<String, dynamic>());
    } catch (_) {
      return null;
    }
  }

  /// Relee del servidor si toca. Silencioso sin red: se queda lo guardado.
  /// Devuelve true si hubo datos nuevos.
  Future<bool> refrescar({
    required String? empresaId,
    required String? usuarioId,
    bool forzar = false,
    DateTime? ahora,
  }) async {
    if (empresaId == null || usuarioId == null) return false;
    final ya = ahora ?? DateTime.now();
    final previo = leerCache(empresaId: empresaId, usuarioId: usuarioId);
    if (!forzar &&
        previo != null &&
        ya.millisecondsSinceEpoch - previo.leidoEn < espera.inMilliseconds) {
      return false;
    }
    try {
      final datos = await _lector(ya);
      await prefs.setString(
        cacheKey,
        json.encode({'empresa': empresaId, 'usuario': usuarioId, 'datos': datos.toJson()}),
      );
      return true;
    } catch (e) {
      debugPrint('[datos_oficina] no se pudo leer (se queda lo guardado): $e');
      return false;
    }
  }
}
