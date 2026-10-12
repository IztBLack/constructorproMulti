/// Lo que enseñan los widgets de la pantalla de inicio de Android.
///
/// Todo es PURO: recibe lo que ya está en la base del teléfono y decide qué se
/// pinta. Así se prueba sin Android y sin base, y la parte nativa (Kotlin, en
/// `android/app/src/main/kotlin/.../widgets/`) solo lee llaves ya resueltas.
///
/// REGLA DE LA PANTALLA DE INICIO: nunca dinero. La ve cualquiera que agarre el
/// teléfono; aquí van cuántos y qué, nunca montos, sueldos ni saldos.
library;

import 'package:intl/intl.dart';

import '../../domain/bitacora/bitacora_reglas.dart' show puedeCapturar, puedeVerBitacora;
import '../modulos/modulos.dart';
import '../sync/rol_provider.dart' show puedeEditarOperacionSegunRol;

/// Versión del contrato de llaves con Kotlin. Si cambia el formato, se sube.
const versionLlavesWidgets = 1;

/// Cuántos avisos y cuántas obras caben en los widgets (filas fijas en XML).
const maxAvisos = 3;
const maxObrasHoy = 5;

/// Roles que no usan la operación de campo en el teléfono.
const _rolesSinCampo = {'compras', 'almacen', 'colaborador', 'cliente'};

/// Qué widgets y qué acciones le tocan a quien usa el teléfono.
///
/// Un widget que el rol no puede usar se sigue pudiendo poner en la pantalla
/// (Android no deja esconderlo de la lista), pero dice que no está disponible.
class PermisosWidgets {
  const PermisosWidgets({
    required this.paseLista,
    required this.pasarLista,
    required this.avisos,
    required this.avisosBitacora,
    required this.avisosNotas,
    required this.obrasHoy,
    required this.accionBitacora,
    required this.accionNota,
    required this.accionGasto,
  });

  final bool paseLista;
  final bool pasarLista;
  final bool avisos;
  final bool avisosBitacora;
  final bool avisosNotas;
  final bool obrasHoy;
  final bool accionBitacora;
  final bool accionNota;
  final bool accionGasto;

  bool get accionPase => pasarLista;
}

/// Las mismas reglas que ya usa la app en sus menús (rol + módulos prendidos).
/// Con el rol aún sin resolver (`null`) se concede, como el resto de la app:
/// el servidor nunca da más de lo que toca.
PermisosWidgets permisosWidgets({
  required String? rol,
  required bool Function(ClaveModulo) usa,
}) {
  final campo = !_rolesSinCampo.contains(rol);
  final edita = puedeEditarOperacionSegunRol(rol);
  final equipo = usa(ClaveModulo.equipo);
  final bitacora = usa(ClaveModulo.bitacora) && puedeVerBitacora(rol);
  final notas = usa(ClaveModulo.notas) && edita;
  return PermisosWidgets(
    paseLista: equipo && campo,
    pasarLista: equipo && campo && edita,
    avisos: campo && (bitacora || notas),
    avisosBitacora: campo && bitacora,
    avisosNotas: campo && notas,
    obrasHoy: equipo && campo,
    accionBitacora: bitacora && campo && puedeCapturar(rol),
    accionNota: notas && campo,
    // El contador SÍ usa la caja (0022), aunque no edite la operación.
    accionGasto: usa(ClaveModulo.caja) && campo,
  );
}

/// Una obra activa del teléfono.
class ObraWidget {
  const ObraWidget({required this.id, required this.nombre});
  final String id;
  final String nombre;
}

/// La cuadrilla vigente de un colaborador.
class CuadrillaWidget {
  const CuadrillaWidget({required this.id, required this.nombre, this.orden = 0});
  final String id;
  final String nombre;
  final int orden;
}

/// Una asistencia de HOY.
class AsistenciaWidget {
  const AsistenciaWidget({
    required this.obraId,
    required this.colaboradorId,
    required this.fraccion,
    required this.pendiente,
    required this.capturadaEn,
  });
  final String obraId;
  final String colaboradorId;
  final double fraccion;

  /// Todavía no sube a la nube (pending o error).
  final bool pendiente;

  /// Momento de captura (epoch ms). Sirve para decir a qué hora se pasó lista.
  final int capturadaEn;
}

enum TipoAviso { instruccion, aclaracion, nota }

/// Algo que la oficina (u otro compañero) dejó para la obra.
class AvisoCandidato {
  const AvisoCandidato({
    required this.tipo,
    required this.obraId,
    required this.obraNombre,
    required this.autor,
    required this.texto,
    required this.momento,
    required this.propio,
  });
  final TipoAviso tipo;
  final String obraId;
  final String obraNombre;
  final String autor;
  final String texto;
  final int momento;

  /// Lo escribió quien usa el teléfono: no es un aviso PARA él.
  final bool propio;
}

/// Todo lo que el widget necesita saber, ya en la forma de la base local.
class EntradaWidgets {
  const EntradaWidgets({
    required this.ahora,
    required this.permisos,
    required this.obras,
    required this.roster,
    required this.cuadrillaDe,
    required this.asistenciasHoy,
    this.entradasBitacoraHoy = const {},
    this.incidenciasHoy = const {},
    this.avisos = const [],
    this.avisosVistosHasta = 0,
  });

  final DateTime ahora;
  final PermisosWidgets permisos;

  /// Obras ACTIVAS, en el orden en que se quieren ver.
  final List<ObraWidget> obras;

  /// obraId → colaboradores que se pasan en esa obra (mismo criterio que la
  /// pantalla de pase de lista: pago por día y esta es su última obra).
  final Map<String, List<String>> roster;

  /// colaboradorId → su cuadrilla vigente (vacío si el módulo está apagado).
  final Map<String, CuadrillaWidget> cuadrillaDe;
  final List<AsistenciaWidget> asistenciasHoy;
  final Map<String, int> entradasBitacoraHoy;
  final Map<String, int> incidenciasHoy;
  final List<AvisoCandidato> avisos;

  /// Hasta cuándo (epoch ms) ya se vieron los avisos: lo posterior es «nuevo».
  final int avisosVistosHasta;
}

/// Conteo de una obra para un día.
class ConteoObra {
  const ConteoObra({
    required this.obra,
    required this.presentes,
    required this.total,
    required this.porSubir,
    required this.primeraCaptura,
    required this.grupos,
  });
  final ObraWidget obra;
  final int presentes;
  final int total;
  final int porSubir;

  /// Epoch ms de la primera asistencia de hoy (null = aún no se pasa lista).
  final int? primeraCaptura;
  final List<GrupoConteo> grupos;
}

class GrupoConteo {
  const GrupoConteo({required this.nombre, required this.presentes, required this.total});
  final String nombre;
  final int presentes;
  final int total;

  String get texto => '$presentes de $total';
}

/// Cuenta presentes por obra y por cuadrilla. Presente = fracción mayor a 0
/// (medio día cuenta como que vino).
ConteoObra contarObra(EntradaWidgets e, ObraWidget obra) {
  final ids = e.roster[obra.id] ?? const <String>[];
  final deHoy = {
    for (final a in e.asistenciasHoy)
      if (a.obraId == obra.id) a.colaboradorId: a,
  };
  var presentes = 0;
  var porSubir = 0;
  int? primera;
  for (final a in deHoy.values) {
    if (a.pendiente) porSubir++;
    if (a.fraccion > 0 && (primera == null || a.capturadaEn < primera)) {
      primera = a.capturadaEn;
    }
  }

  // Grupos en el orden de las cuadrillas; "Sin cuadrilla" al final.
  final porGrupo = <String?, List<String>>{};
  for (final id in ids) {
    (porGrupo[e.cuadrillaDe[id]?.id] ??= []).add(id);
    if ((deHoy[id]?.fraccion ?? 0) > 0) presentes++;
  }
  CuadrillaWidget? cuadrilla(String? id) => id == null
      ? null
      : e.cuadrillaDe.values.firstWhere((c) => c.id == id);
  final claves = porGrupo.keys.toList()
    ..sort((a, b) {
      if (a == null) return 1;
      if (b == null) return -1;
      final qa = cuadrilla(a)!, qb = cuadrilla(b)!;
      final o = qa.orden.compareTo(qb.orden);
      return o != 0 ? o : qa.nombre.compareTo(qb.nombre);
    });
  final grupos = [
    for (final k in claves)
      GrupoConteo(
        nombre: cuadrilla(k)?.nombre ?? 'Sin cuadrilla',
        presentes: porGrupo[k]!.where((id) => (deHoy[id]?.fraccion ?? 0) > 0).length,
        total: porGrupo[k]!.length,
      ),
  ];

  return ConteoObra(
    obra: obra,
    presentes: presentes,
    total: ids.length,
    porSubir: porSubir,
    primeraCaptura: primera,
    grupos: grupos,
  );
}

/// La obra que enseña el widget de pase de lista: la que más gente tiene
/// presente hoy; si nadie ha pasado lista, la de más gente asignada.
ConteoObra? obraPrincipal(EntradaWidgets e) {
  final conteos = [
    for (final o in e.obras) contarObra(e, o),
  ].where((c) => c.total > 0).toList();
  if (conteos.isEmpty) return null;
  conteos.sort((a, b) {
    final p = b.presentes.compareTo(a.presentes);
    return p != 0 ? p : b.total.compareTo(a.total);
  });
  return conteos.first;
}

final _hora = DateFormat('H:mm', 'es_MX');
final _diaCorto = DateFormat('EEE', 'es_MX');

/// "hoy 6:40", "ayer 18:15" o "jue 9:10".
String cuandoCorto(int ms, DateTime ahora) {
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  final hoy = DateTime(ahora.year, ahora.month, ahora.day);
  final dia = DateTime(d.year, d.month, d.day);
  final dias = hoy.difference(dia).inDays;
  final h = _hora.format(d);
  if (dias <= 0) return 'hoy $h';
  if (dias == 1) return 'ayer $h';
  return '${_diaCorto.format(d).replaceAll('.', '')} $h';
}

String _recortar(String s, int max) {
  final t = s.replaceAll(RegExp(r'\s+'), ' ').trim();
  return t.length <= max ? t : '${t.substring(0, max - 1).trimRight()}…';
}

String _etiquetaAviso(TipoAviso t) => switch (t) {
      TipoAviso.instruccion => 'Instrucción',
      TipoAviso.aclaracion => 'Aclaración',
      TipoAviso.nota => 'Nota nueva',
    };

/// Los avisos que se enseñan: de la última semana, no propios, del más nuevo
/// al más viejo.
List<AvisoCandidato> avisosVisibles(EntradaWidgets e) {
  final desde = e.ahora.subtract(const Duration(days: 7)).millisecondsSinceEpoch;
  final lista = e.avisos
      .where((a) => !a.propio && a.momento >= desde)
      .where((a) => switch (a.tipo) {
            TipoAviso.nota => e.permisos.avisosNotas,
            _ => e.permisos.avisosBitacora,
          })
      .toList()
    ..sort((a, b) => b.momento.compareTo(a.momento));
  return lista;
}

String _diaIso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Las llaves que lee Kotlin. Solo String, int y bool (lo que guarda
/// `HomeWidget.saveWidgetData` en SharedPreferences).
Map<String, Object> llavesWidgets(EntradaWidgets e) {
  final p = e.permisos;
  final m = <String, Object>{
    'w_version': versionLlavesWidgets,
    'w_dia': _diaIso(e.ahora),
    'w_actualizado': _hora.format(e.ahora),
    'w_vacio': false,
  };

  // --- Pase de lista ---
  final principal = p.paseLista ? obraPrincipal(e) : null;
  m['pase_ok'] = p.paseLista;
  m['pase_hay_obra'] = principal != null;
  m['pase_puede_pasar'] = p.pasarLista;
  if (principal != null) {
    m['pase_obra'] = principal.obra.nombre;
    m['pase_obra_id'] = principal.obra.id;
    m['pase_presentes'] = principal.presentes;
    m['pase_total'] = principal.total;
    m['pase_por_subir'] = principal.porSubir;
    m['pase_hora'] = principal.primeraCaptura == null
        ? ''
        : _hora.format(DateTime.fromMillisecondsSinceEpoch(principal.primeraCaptura!));
    // Dos cuadros: si hay más grupos, el segundo junta a los demás.
    final g = principal.grupos;
    final cuadros = g.length <= 2
        ? g
        : [
            g.first,
            GrupoConteo(
              nombre: 'Otras ${g.length - 1} cuadrillas',
              presentes: g.skip(1).fold(0, (s, x) => s + x.presentes),
              total: g.skip(1).fold(0, (s, x) => s + x.total),
            ),
          ];
    m['pase_cu_n'] = cuadros.length;
    for (var i = 0; i < cuadros.length; i++) {
      m['pase_cu${i}_nombre'] = cuadros[i].nombre;
      m['pase_cu${i}_txt'] = cuadros[i].texto;
    }
  } else {
    m['pase_cu_n'] = 0;
  }

  // --- Avisos de la oficina ---
  final avisos = p.avisos ? avisosVisibles(e) : const <AvisoCandidato>[];
  m['av_ok'] = p.avisos;
  m['av_nuevos'] = avisos.where((a) => a.momento > e.avisosVistosHasta).length;
  final mostrados = avisos.take(maxAvisos).toList();
  m['av_n'] = mostrados.length;
  for (var i = 0; i < mostrados.length; i++) {
    final a = mostrados[i];
    final autor = a.autor.trim().isEmpty ? '' : ' · ${a.autor.trim()}';
    m['av${i}_titulo'] =
        '${_etiquetaAviso(a.tipo)}$autor · ${cuandoCorto(a.momento, e.ahora)} · ${a.obraNombre}';
    m['av${i}_texto'] = _recortar(a.texto, 140);
    m['av${i}_obra_id'] = a.obraId;
    m['av${i}_destino'] = a.tipo == TipoAviso.nota ? 'notas' : 'bitacora';
    m['av${i}_nuevo'] = a.momento > e.avisosVistosHasta;
  }

  // --- Hoy en las obras ---
  m['oh_ok'] = p.obrasHoy;
  final conteos = p.obrasHoy
      ? [for (final o in e.obras) contarObra(e, o)].where((c) => c.total > 0).toList()
      : <ConteoObra>[];
  conteos.sort((a, b) => b.total.compareTo(a.total));
  m['oh_personas'] = conteos.fold<int>(0, (s, c) => s + c.presentes);
  final obras = conteos.take(maxObrasHoy).toList();
  m['oh_n'] = obras.length;
  for (var i = 0; i < obras.length; i++) {
    final c = obras[i];
    final entradas = e.entradasBitacoraHoy[c.obra.id] ?? 0;
    final incid = e.incidenciasHoy[c.obra.id] ?? 0;
    final partes = <String>[
      if (c.primeraCaptura == null)
        'Aún no pasan lista'
      else
        'Pase ${_hora.format(DateTime.fromMillisecondsSinceEpoch(c.primeraCaptura!))}',
      if (incid > 0) incid == 1 ? '1 incidencia' : '$incid incidencias',
      if (incid == 0 && entradas > 0)
        entradas == 1 ? '1 entrada de bitácora' : '$entradas entradas de bitácora',
    ];
    m['oh${i}_id'] = c.obra.id;
    m['oh${i}_nombre'] = c.obra.nombre;
    m['oh${i}_detalle'] = partes.join(' · ');
    m['oh${i}_cuenta'] = c.primeraCaptura == null ? 'Sin pase' : '${c.presentes} de ${c.total}';
    m['oh${i}_falta'] = c.primeraCaptura == null;
  }

  // --- Acciones rápidas ---
  m['ac_pase'] = p.accionPase;
  m['ac_bitacora'] = p.accionBitacora;
  m['ac_nota'] = p.accionNota;
  m['ac_gasto'] = p.accionGasto;
  return m;
}

/// Lo que se escribe al cerrar sesión o al vaciar el teléfono para otra cuenta:
/// los widgets dicen que no hay datos en vez de enseñar los de la cuenta anterior.
Map<String, Object> llavesWidgetsVacias(DateTime ahora) => {
      'w_version': versionLlavesWidgets,
      'w_dia': _diaIso(ahora),
      'w_actualizado': _hora.format(ahora),
      'w_vacio': true,
      'pase_ok': false,
      'pase_hay_obra': false,
      'pase_puede_pasar': false,
      'pase_cu_n': 0,
      'av_ok': false,
      'av_nuevos': 0,
      'av_n': 0,
      'oh_ok': false,
      'oh_personas': 0,
      'oh_n': 0,
      'ac_pase': false,
      'ac_bitacora': false,
      'ac_nota': false,
      'ac_gasto': false,
    };
