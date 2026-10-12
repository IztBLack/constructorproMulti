/// Widgets de la etapa 2: lo que la oficina mueve y la obra necesita saber
/// (material pedido, lo que toca del programa, lo que espera visto bueno).
///
/// El móvil NO tiene estas tablas en Drift: [DatosOficina] se lee de Supabase
/// solo para los widgets (`datos_oficina.dart`) y se guarda en el teléfono por
/// cuenta, así que también se ven sin señal. Aquí, PURO, se decide qué enseñar.
///
/// Igual que en la etapa 1: nunca dinero. De las compras se dice qué y cuánto
/// material, jamás su precio; de las aprobaciones, cuántas, jamás el monto.
library;

import 'package:intl/intl.dart';

import '../../domain/import/mx_time.dart' show claveDiaMx;
import 'resumen_widgets.dart' show PermisosWidgets, cuandoCorto;

/// La web, a donde llevan estos widgets: el móvil todavía no tiene pantallas
/// de compras, programa ni aprobaciones.
const urlPortal = 'https://constructorpro-tawny.vercel.app';

class RenglonPedido {
  const RenglonPedido({required this.descripcion, required this.cantidad, required this.unidad});
  final String descripcion;
  final double cantidad;
  final String unidad;

  Map<String, Object?> toJson() => {'d': descripcion, 'c': cantidad, 'u': unidad};
  static RenglonPedido fromJson(Map<String, dynamic> j) => RenglonPedido(
        descripcion: (j['d'] as String?) ?? '',
        cantidad: (j['c'] as num?)?.toDouble() ?? 0,
        unidad: (j['u'] as String?) ?? '',
      );
}

/// Una requisición (pedido de material desde la obra).
class PedidoMaterial {
  const PedidoMaterial({
    required this.obraId,
    required this.folio,
    required this.estado,
    required this.creadoEn,
    this.motivoRechazo,
    this.renglones = const [],
  });
  final String obraId;
  final int folio;

  /// PENDIENTE | APROBADA | RECHAZADA | COMPRADA | PARCIAL
  final String estado;
  final int creadoEn;
  final String? motivoRechazo;
  final List<RenglonPedido> renglones;

  bool get abierto => estado == 'PENDIENTE' || estado == 'APROBADA' || estado == 'PARCIAL';

  Map<String, Object?> toJson() => {
        'o': obraId,
        'f': folio,
        'e': estado,
        't': creadoEn,
        'm': motivoRechazo,
        'r': [for (final r in renglones) r.toJson()],
      };
  static PedidoMaterial fromJson(Map<String, dynamic> j) => PedidoMaterial(
        obraId: j['o'] as String,
        folio: (j['f'] as num?)?.toInt() ?? 0,
        estado: (j['e'] as String?) ?? 'PENDIENTE',
        creadoEn: (j['t'] as num?)?.toInt() ?? 0,
        motivoRechazo: j['m'] as String?,
        renglones: [
          for (final r in (j['r'] as List? ?? const []))
            RenglonPedido.fromJson((r as Map).cast<String, dynamic>()),
        ],
      );
}

/// Una partida del programa de obra. Las fechas son medianoche de México.
class PartidaPrograma {
  const PartidaPrograma({
    required this.obraId,
    required this.concepto,
    required this.inicio,
    required this.fin,
    this.terminada = false,
  });
  final String obraId;
  final String concepto;
  final int inicio;
  final int fin;
  final bool terminada;

  Map<String, Object?> toJson() =>
      {'o': obraId, 'c': concepto, 'i': inicio, 'f': fin, 't': terminada};
  static PartidaPrograma fromJson(Map<String, dynamic> j) => PartidaPrograma(
        obraId: j['o'] as String,
        concepto: (j['c'] as String?) ?? '',
        inicio: (j['i'] as num?)?.toInt() ?? 0,
        fin: (j['f'] as num?)?.toInt() ?? 0,
        terminada: (j['t'] as bool?) ?? false,
      );
}

/// Un reporte de garantía sin cerrar (etapa 3).
class GarantiaAbierta {
  const GarantiaAbierta({
    required this.obraId,
    required this.descripcion,
    required this.estado,
    required this.reportadoEn,
    this.ubicacion = '',
    this.programadoPara,
  });
  final String obraId;
  final String descripcion;
  final String ubicacion;

  /// ABIERTO | EN_REVISION | PROGRAMADO
  final String estado;
  final int? programadoPara;
  final int reportadoEn;

  Map<String, Object?> toJson() => {
        'o': obraId,
        'd': descripcion,
        'u': ubicacion,
        'e': estado,
        'p': programadoPara,
        'r': reportadoEn,
      };
  static GarantiaAbierta fromJson(Map<String, dynamic> j) => GarantiaAbierta(
        obraId: j['o'] as String,
        descripcion: (j['d'] as String?) ?? '',
        ubicacion: (j['u'] as String?) ?? '',
        estado: (j['e'] as String?) ?? 'ABIERTO',
        programadoPara: (j['p'] as num?)?.toInt(),
        reportadoEn: (j['r'] as num?)?.toInt() ?? 0,
      );
}

/// Una herramienta prestada que no ha regresado (etapa 3). Sin costo, nunca.
class HerramientaPrestada {
  const HerramientaPrestada({
    required this.nombre,
    required this.desde,
    this.obraId,
    this.quien = '',
    this.devolverAntes,
  });
  final String nombre;
  final String? obraId;
  final String quien;
  final int desde;
  final int? devolverAntes;

  Map<String, Object?> toJson() =>
      {'n': nombre, 'o': obraId, 'q': quien, 'd': desde, 'v': devolverAntes};
  static HerramientaPrestada fromJson(Map<String, dynamic> j) => HerramientaPrestada(
        nombre: (j['n'] as String?) ?? '',
        obraId: j['o'] as String?,
        quien: (j['q'] as String?) ?? '',
        desde: (j['d'] as num?)?.toInt() ?? 0,
        devolverAntes: (j['v'] as num?)?.toInt(),
      );
}

/// Lo que se bajó de la oficina en la última lectura.
class DatosOficina {
  const DatosOficina({
    required this.leidoEn,
    this.pedidos = const [],
    this.recepciones = const [],
    this.partidas = const [],
    this.aprobaciones = const {},
    this.revisiones = const [],
    this.incidentes = const [],
    this.garantias = const [],
    this.herramientas = const [],
  });

  // --- Etapa 3 ---
  /// Revisiones diarias de seguridad recientes: (obraId, fecha).
  final List<({String obraId, int fecha})> revisiones;

  /// Incidentes de la última semana: SOLO obra, fecha y tipo. Ni nombres ni
  /// nada de salud: eso no sale nunca a la pantalla de inicio.
  final List<({String obraId, int fecha, String tipo})> incidentes;
  final List<GarantiaAbierta> garantias;
  final List<HerramientaPrestada> herramientas;

  /// Cuándo se leyó del servidor (epoch ms): lo que el widget llama
  /// «Actualizado».
  final int leidoEn;
  final List<PedidoMaterial> pedidos;

  /// Material recibido: (obraId, fecha de la recepción).
  final List<({String obraId, int fecha})> recepciones;
  final List<PartidaPrograma> partidas;

  /// Solicitudes de visto bueno PENDIENTES por tipo (COMPRA, EXTRA,
  /// ESTIMACION, PAGO_SUBCONTRATO). Solo cuántas: nunca el monto.
  final Map<String, int> aprobaciones;

  Map<String, Object?> toJson() => {
        'l': leidoEn,
        'p': [for (final p in pedidos) p.toJson()],
        'r': [for (final r in recepciones) {'o': r.obraId, 'f': r.fecha}],
        'g': [for (final g in partidas) g.toJson()],
        'a': aprobaciones,
        'sv': [for (final r in revisiones) {'o': r.obraId, 'f': r.fecha}],
        'in': [for (final i in incidentes) {'o': i.obraId, 'f': i.fecha, 't': i.tipo}],
        'ga': [for (final g in garantias) g.toJson()],
        'he': [for (final h in herramientas) h.toJson()],
      };

  static DatosOficina fromJson(Map<String, dynamic> j) => DatosOficina(
        leidoEn: (j['l'] as num?)?.toInt() ?? 0,
        pedidos: [
          for (final p in (j['p'] as List? ?? const []))
            PedidoMaterial.fromJson((p as Map).cast<String, dynamic>()),
        ],
        recepciones: [
          for (final r in (j['r'] as List? ?? const []))
            (obraId: (r as Map)['o'] as String, fecha: (r['f'] as num).toInt()),
        ],
        partidas: [
          for (final g in (j['g'] as List? ?? const []))
            PartidaPrograma.fromJson((g as Map).cast<String, dynamic>()),
        ],
        aprobaciones: {
          for (final e in ((j['a'] as Map?) ?? const {}).entries)
            e.key as String: (e.value as num).toInt(),
        },
        revisiones: [
          for (final r in (j['sv'] as List? ?? const []))
            (obraId: (r as Map)['o'] as String, fecha: (r['f'] as num).toInt()),
        ],
        incidentes: [
          for (final i in (j['in'] as List? ?? const []))
            (
              obraId: (i as Map)['o'] as String,
              fecha: (i['f'] as num).toInt(),
              tipo: (i['t'] as String?) ?? '',
            ),
        ],
        garantias: [
          for (final g in (j['ga'] as List? ?? const []))
            GarantiaAbierta.fromJson((g as Map).cast<String, dynamic>()),
        ],
        herramientas: [
          for (final h in (j['he'] as List? ?? const []))
            HerramientaPrestada.fromJson((h as Map).cast<String, dynamic>()),
        ],
      );
}

const maxPedidos = 3;
const maxPartidas = 3;

final _cantidad = NumberFormat('#,##0.##', 'es_MX');
final _diaMes = DateFormat("EEE d 'de' MMM", 'es_MX');

String _texto(DateTime d) => _diaMes.format(d).replaceAll('.', '');

/// `yyyy-mm-dd` → la fecha (para escribir «el jue 8 de oct»).
DateTime _deClave(String clave) {
  final p = clave.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

String _claveLocal(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

({String etiqueta, String tono}) estadoPedido(String estado) => switch (estado) {
      'PENDIENTE' => (etiqueta: 'Por aprobar', tono: 'ambar'),
      'APROBADA' => (etiqueta: 'Aprobado', tono: 'azul'),
      'PARCIAL' => (etiqueta: 'Comprado en parte', tono: 'azul'),
      'COMPRADA' => (etiqueta: 'Comprado', tono: 'verde'),
      'RECHAZADA' => (etiqueta: 'Rechazado', tono: 'rojo'),
      _ => (etiqueta: estado, tono: 'neutro'),
    };

/// "Cemento, 40 bultos (+2 más)". Sin precio, nunca.
String queSePidio(PedidoMaterial p) {
  if (p.renglones.isEmpty) return 'Pedido ${p.folio}';
  final r = p.renglones.first;
  final cuanto = r.cantidad > 0 ? ', ${_cantidad.format(r.cantidad)} ${r.unidad}'.trimRight() : '';
  final mas = p.renglones.length > 1 ? ' (+${p.renglones.length - 1} más)' : '';
  return '${r.descripcion.trim()}$cuanto$mas';
}

/// Los pedidos que se enseñan: de obras activas, abiertos o de las últimas dos
/// semanas, del más nuevo al más viejo.
List<PedidoMaterial> pedidosVisibles(
  DatosOficina d,
  DateTime ahora,
  Map<String, String> obrasActivas,
) {
  final desde = ahora.subtract(const Duration(days: 14)).millisecondsSinceEpoch;
  return d.pedidos
      .where((p) => obrasActivas.containsKey(p.obraId))
      .where((p) => p.abierto || p.creadoEn >= desde)
      .toList()
    ..sort((a, b) => b.creadoEn.compareTo(a.creadoEn));
}

enum TipoPartida { atrasada, empieza, termina }

class PartidaVisible {
  const PartidaVisible(this.partida, this.tipo);
  final PartidaPrograma partida;
  final TipoPartida tipo;
}

/// Lo que toca esta semana (lunes a domingo): lo que empieza, lo que termina y,
/// primero, lo que ya va atrasado.
List<PartidaVisible> partidasVisibles(
  DatosOficina d,
  DateTime ahora,
  Map<String, String> obrasActivas,
) {
  final hoy = claveDiaMx(ahora.millisecondsSinceEpoch);
  final lunes = DateTime(ahora.year, ahora.month, ahora.day)
      .subtract(Duration(days: ahora.weekday - 1));
  final domingo = _claveLocal(lunes.add(const Duration(days: 6)));
  final lista = <PartidaVisible>[];
  for (final p in d.partidas) {
    if (p.terminada || !obrasActivas.containsKey(p.obraId)) continue;
    final ini = claveDiaMx(p.inicio);
    final fin = claveDiaMx(p.fin);
    if (fin.compareTo(hoy) < 0) {
      lista.add(PartidaVisible(p, TipoPartida.atrasada));
    } else if (ini.compareTo(hoy) >= 0 && ini.compareTo(domingo) <= 0) {
      lista.add(PartidaVisible(p, TipoPartida.empieza));
    } else if (fin.compareTo(domingo) <= 0) {
      lista.add(PartidaVisible(p, TipoPartida.termina));
    }
  }
  int clave(PartidaVisible v) =>
      v.tipo == TipoPartida.empieza ? v.partida.inicio : v.partida.fin;
  lista.sort((a, b) {
    final atrasoA = a.tipo == TipoPartida.atrasada ? 0 : 1;
    final atrasoB = b.tipo == TipoPartida.atrasada ? 0 : 1;
    if (atrasoA != atrasoB) return atrasoA.compareTo(atrasoB);
    return clave(a).compareTo(clave(b));
  });
  return lista;
}

String _cuandoPartida(PartidaVisible v, DateTime ahora) {
  final hoy = claveDiaMx(ahora.millisecondsSinceEpoch);
  final ini = claveDiaMx(v.partida.inicio);
  final fin = claveDiaMx(v.partida.fin);
  return switch (v.tipo) {
    TipoPartida.atrasada => 'Debía terminar el ${_texto(_deClave(fin))}',
    TipoPartida.empieza => ini == hoy ? 'Empieza hoy' : 'Empieza el ${_texto(_deClave(ini))}',
    TipoPartida.termina => fin == hoy ? 'Termina hoy' : 'Termina el ${_texto(_deClave(fin))}',
  };
}

String _plural(int n, String uno, String varios) => n == 1 ? '1 $uno' : '$n $varios';

/// "3 pedidos de material · 1 extra · 1 estimación".
String detalleAprobaciones(int pedidos, Map<String, int> porTipo) {
  final partes = <String>[
    if (pedidos > 0) _plural(pedidos, 'pedido de material', 'pedidos de material'),
    if ((porTipo['COMPRA'] ?? 0) > 0) _plural(porTipo['COMPRA']!, 'compra', 'compras'),
    if ((porTipo['EXTRA'] ?? 0) > 0) _plural(porTipo['EXTRA']!, 'extra', 'extras'),
    if ((porTipo['ESTIMACION'] ?? 0) > 0)
      _plural(porTipo['ESTIMACION']!, 'estimación', 'estimaciones'),
    if ((porTipo['PAGO_SUBCONTRATO'] ?? 0) > 0)
      _plural(porTipo['PAGO_SUBCONTRATO']!, 'pago a subcontrato', 'pagos a subcontrato'),
  ];
  return partes.join(' · ');
}

/// Las llaves de la etapa 2 que lee Kotlin. [obrasActivas]: id → nombre.
Map<String, Object> llavesOficina({
  required DatosOficina? datos,
  required DateTime ahora,
  required PermisosWidgets permisos,
  required Map<String, String> obrasActivas,
  required String? rol,
}) {
  final m = <String, Object>{
    'mat_ok': permisos.material,
    'pr_ok': permisos.programa,
    'ap_ok': permisos.porAprobar,
    // Por qué no se enseña (el widget lo dice en vez de «no disponible»).
    'mat_no': permisos.sinMaterial,
    'pr_no': permisos.sinPrograma,
    'ap_no': permisos.sinAprobar,
    'sg_ok': permisos.seguridad,
    'ga_ok': permisos.garantias,
    'he_ok': permisos.herramienta,
    'sg_no': permisos.sinSeguridad,
    'ga_no': permisos.sinGarantias,
    'he_no': permisos.sinHerramienta,
    'of_hay_datos': datos != null,
    'of_actualizado': datos == null ? '' : 'Actualizado ${cuandoCorto(datos.leidoEn, ahora)}',
    'mat_url': '$urlPortal/admin/compras',
  };
  if (datos == null) {
    m['mat_n'] = 0;
    m['pr_n'] = 0;
    m['pr_atrasadas'] = 0;
    m['ap_total'] = 0;
    m['mat_llego'] = '';
    m['sg_n'] = 0;
    m['ga_n'] = 0;
    m['he_n'] = 0;
    return m;
  }

  // --- Material ---
  final pedidos = permisos.material
      ? pedidosVisibles(datos, ahora, obrasActivas).take(maxPedidos).toList()
      : const <PedidoMaterial>[];
  m['mat_n'] = pedidos.length;
  for (var i = 0; i < pedidos.length; i++) {
    final p = pedidos[i];
    final e = estadoPedido(p.estado);
    final obra = obrasActivas[p.obraId] ?? '';
    m['mat${i}_que'] = queSePidio(p);
    m['mat${i}_cuando'] = p.estado == 'RECHAZADA' && (p.motivoRechazo ?? '').trim().isNotEmpty
        ? 'Rechazado: ${p.motivoRechazo!.trim()}'
        : 'Pedido ${cuandoCorto(p.creadoEn, ahora)} · $obra';
    m['mat${i}_estado'] = e.etiqueta;
    m['mat${i}_tono'] = e.tono;
    m['mat${i}_url'] = '$urlPortal/admin/obras/${p.obraId}/material';
  }
  final hoy = claveDiaMx(ahora.millisecondsSinceEpoch);
  final llegoA = {
    for (final r in datos.recepciones)
      if (claveDiaMx(r.fecha) == hoy && obrasActivas.containsKey(r.obraId))
        obrasActivas[r.obraId]!,
  };
  m['mat_llego'] = !permisos.material || llegoA.isEmpty
      ? ''
      : 'Hoy llegó material a ${llegoA.join(', ')}';

  // --- Lo que toca esta semana ---
  final partidas = permisos.programa
      ? partidasVisibles(datos, ahora, obrasActivas)
      : const <PartidaVisible>[];
  m['pr_atrasadas'] = partidas.where((v) => v.tipo == TipoPartida.atrasada).length;
  final mostradas = partidas.take(maxPartidas).toList();
  m['pr_n'] = mostradas.length;
  for (var i = 0; i < mostradas.length; i++) {
    final v = mostradas[i];
    final (etiqueta, tono) = switch (v.tipo) {
      TipoPartida.atrasada => ('Atrasada', 'rojo'),
      TipoPartida.empieza => ('Esta semana', 'azul'),
      TipoPartida.termina => ('En curso', 'verde'),
    };
    final obra = obrasActivas[v.partida.obraId] ?? '';
    m['pr${i}_que'] = '${v.partida.concepto.trim()} · $obra';
    m['pr${i}_cuando'] = _cuandoPartida(v, ahora);
    m['pr${i}_estado'] = etiqueta;
    m['pr${i}_tono'] = tono;
    m['pr${i}_url'] = '$urlPortal/admin/obras/${v.partida.obraId}/programa';
  }

  // --- Por aprobar ---
  final pedidosPendientes = permisos.porAprobar
      ? datos.pedidos
          .where((p) => p.estado == 'PENDIENTE' && obrasActivas.containsKey(p.obraId))
          .length
      : 0;
  final porTipo = permisos.porAprobar ? datos.aprobaciones : const <String, int>{};
  m['ap_total'] = pedidosPendientes + porTipo.values.fold<int>(0, (s, n) => s + n);
  m['ap_detalle'] = detalleAprobaciones(pedidosPendientes, porTipo);
  // El visto bueno solo lo abre el administrador; los demás deciden pedidos
  // desde Compras.
  m['ap_url'] = (rol == null || rol == 'admin')
      ? '$urlPortal/admin/ajustes#aprobaciones'
      : '$urlPortal/admin/compras';

  m.addAll(llavesEtapa3(
    datos: datos,
    ahora: ahora,
    permisos: permisos,
    obrasActivas: obrasActivas,
  ));
  return m;
}

// ---------------------------------------------------------------- Etapa 3

const maxGarantias = 3;
const maxHerramientas = 3;
const maxObrasSinRevision = 3;

String _recorta(String s, int max) {
  final t = s.replaceAll(RegExp(r'\s+'), ' ').trim();
  return t.length <= max ? t : '${t.substring(0, max - 1).trimRight()}…';
}

/// La revisión diaria de seguridad de hoy, por obra activa.
({List<String> hechas, List<String> pendientes, int incidentes}) resumenSeguridad(
  DatosOficina d,
  DateTime ahora,
  Map<String, String> obrasActivas,
) {
  final hoy = claveDiaMx(ahora.millisecondsSinceEpoch);
  final conRevision = {
    for (final r in d.revisiones)
      if (claveDiaMx(r.fecha) == hoy) r.obraId,
  };
  final desde = ahora.subtract(const Duration(days: 7)).millisecondsSinceEpoch;
  return (
    hechas: [for (final id in obrasActivas.keys) if (conRevision.contains(id)) id],
    pendientes: [for (final id in obrasActivas.keys) if (!conRevision.contains(id)) id],
    incidentes: d.incidentes
        .where((i) => obrasActivas.containsKey(i.obraId) && i.fecha >= desde)
        .length,
  );
}

/// Garantías por atender: lo programado para hoy primero, luego lo abierto
/// más viejo (lleva más tiempo esperando), luego lo demás.
List<GarantiaAbierta> garantiasVisibles(
  DatosOficina d,
  DateTime ahora,
  Map<String, String> obrasActivas,
) {
  final hoy = claveDiaMx(ahora.millisecondsSinceEpoch);
  int rango(GarantiaAbierta g) {
    if (g.programadoPara != null && claveDiaMx(g.programadoPara!) == hoy) return 0;
    if (g.estado == 'ABIERTO') return 1;
    return 2;
  }

  // Las garantías se atienden en obras ya entregadas (que pueden no estar
  // activas): se enseñan todas las que la RLS deja ver.
  return [...d.garantias]..sort((a, b) {
      final r = rango(a).compareTo(rango(b));
      return r != 0 ? r : a.reportadoEn.compareTo(b.reportadoEn);
    });
}

/// Herramienta fuera de la bodega: lo que ya debió regresar primero.
List<HerramientaPrestada> herramientasVisibles(DatosOficina d, DateTime ahora) {
  final hoy = claveDiaMx(ahora.millisecondsSinceEpoch);
  bool vencida(HerramientaPrestada h) =>
      h.devolverAntes != null && claveDiaMx(h.devolverAntes!).compareTo(hoy) < 0;
  return [...d.herramientas]..sort((a, b) {
      final va = vencida(a) ? 0 : 1, vb = vencida(b) ? 0 : 1;
      if (va != vb) return va.compareTo(vb);
      final fa = a.devolverAntes ?? 1 << 52, fb = b.devolverAntes ?? 1 << 52;
      final f = fa.compareTo(fb);
      return f != 0 ? f : a.desde.compareTo(b.desde);
    });
}

Map<String, Object> llavesEtapa3({
  required DatosOficina datos,
  required DateTime ahora,
  required PermisosWidgets permisos,
  required Map<String, String> obrasActivas,
}) {
  final m = <String, Object>{};
  final hoy = claveDiaMx(ahora.millisecondsSinceEpoch);

  // --- Seguridad de hoy ---
  final s = permisos.seguridad
      ? resumenSeguridad(datos, ahora, obrasActivas)
      : (hechas: const <String>[], pendientes: const <String>[], incidentes: 0);
  final totalObras = s.hechas.length + s.pendientes.length;
  m['sg_resumen'] = totalObras == 0
      ? 'Sin obras activas.'
      : s.pendientes.isEmpty
          ? 'Revisión hecha en todas las obras'
          : 'Revisión hecha en ${s.hechas.length} de $totalObras obras';
  m['sg_pendientes'] = s.pendientes.length;
  final sinRevision = s.pendientes.take(maxObrasSinRevision).toList();
  m['sg_n'] = sinRevision.length;
  for (var i = 0; i < sinRevision.length; i++) {
    final id = sinRevision[i];
    m['sg${i}_que'] = obrasActivas[id] ?? '';
    m['sg${i}_cuando'] = 'Sin revisión diaria hoy';
    m['sg${i}_estado'] = 'Pendiente';
    m['sg${i}_tono'] = 'ambar';
    m['sg${i}_url'] = '$urlPortal/admin/obras/$id/seguridad';
  }
  // Solo cuántos: ni a quién ni qué le pasó.
  m['sg_incidentes'] = s.incidentes == 0
      ? ''
      : (s.incidentes == 1
          ? '1 incidente en los últimos 7 días'
          : '${s.incidentes} incidentes en los últimos 7 días');

  // --- Garantías ---
  final garantias = permisos.garantias
      ? garantiasVisibles(datos, ahora, obrasActivas)
      : const <GarantiaAbierta>[];
  m['ga_total'] = garantias.length;
  m['ga_hoy'] = garantias
      .where((g) => g.programadoPara != null && claveDiaMx(g.programadoPara!) == hoy)
      .length;
  final mostradas = garantias.take(maxGarantias).toList();
  m['ga_n'] = mostradas.length;
  for (var i = 0; i < mostradas.length; i++) {
    final g = mostradas[i];
    final obra = obrasActivas[g.obraId] ?? '';
    final esHoy = g.programadoPara != null && claveDiaMx(g.programadoPara!) == hoy;
    final (etiqueta, tono) = switch (g.estado) {
      _ when esHoy => ('Hoy', 'verde'),
      'PROGRAMADO' => ('Programada', 'verde'),
      'EN_REVISION' => ('En revisión', 'azul'),
      _ => ('Abierta', 'ambar'),
    };
    final donde = [
      if (g.ubicacion.trim().isNotEmpty) g.ubicacion.trim(),
      if (obra.isNotEmpty) obra,
    ].join(' · ');
    m['ga${i}_que'] = _recorta(g.descripcion, 60);
    m['ga${i}_cuando'] = g.programadoPara != null && !esHoy
        ? 'Programada el ${_texto(_deClave(claveDiaMx(g.programadoPara!)))}${donde.isEmpty ? '' : ' · $donde'}'
        : (donde.isEmpty ? 'Reportada ${cuandoCorto(g.reportadoEn, ahora)}' : donde);
    m['ga${i}_estado'] = etiqueta;
    m['ga${i}_tono'] = tono;
    m['ga${i}_url'] = '$urlPortal/admin/postventa';
  }

  // --- Herramienta en obra ---
  final herramientas = permisos.herramienta
      ? herramientasVisibles(datos, ahora)
      : const <HerramientaPrestada>[];
  bool vencida(HerramientaPrestada h) =>
      h.devolverAntes != null && claveDiaMx(h.devolverAntes!).compareTo(hoy) < 0;
  m['he_total'] = herramientas.length;
  m['he_vencidas'] = herramientas.where(vencida).length;
  final prestadas = herramientas.take(maxHerramientas).toList();
  m['he_n'] = prestadas.length;
  for (var i = 0; i < prestadas.length; i++) {
    final h = prestadas[i];
    final obra = h.obraId == null ? 'Sin obra' : (obrasActivas[h.obraId] ?? 'Otra obra');
    final quien = h.quien.trim();
    final (etiqueta, tono) = vencida(h)
        ? ('Ya debió volver', 'rojo')
        : (h.devolverAntes != null
            ? ('Hasta el ${_texto(_deClave(claveDiaMx(h.devolverAntes!)))}', 'ambar')
            : ('En obra', 'verde'));
    m['he${i}_que'] = h.nombre.trim();
    m['he${i}_cuando'] = quien.isEmpty ? obra : '$obra · la tiene $quien';
    m['he${i}_estado'] = etiqueta;
    m['he${i}_tono'] = tono;
    m['he${i}_url'] = '$urlPortal/admin/herramienta';
  }
  return m;
}
