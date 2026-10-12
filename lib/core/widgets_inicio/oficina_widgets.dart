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

/// Lo que se bajó de la oficina en la última lectura.
class DatosOficina {
  const DatosOficina({
    required this.leidoEn,
    this.pedidos = const [],
    this.recepciones = const [],
    this.partidas = const [],
    this.aprobaciones = const {},
  });

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
  return m;
}
