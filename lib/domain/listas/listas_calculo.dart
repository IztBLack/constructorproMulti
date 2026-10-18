/// Aritmética de las LISTAS DE MATERIAL (Supabase 0050, fase 1).
///
/// Gemelo de `web/src/lib/listas/calculo.ts`: los dos tienen que dar los
/// MISMOS números —la lista se palomea en el celular y se imprime en la
/// oficina—. Los casos viven en `web/src/lib/listas/casos.json` y los leen las
/// pruebas de las dos plataformas.
///
/// REGLA DEL MÓDULO: lo que se captura es lo que marca el plano. La app no
/// inventa medidas; solo hace cuentas con lo capturado. Por eso los resultados
/// (metros, estribos) no se guardan: se recalculan aquí.
library;

enum TipoRenglonLista { pieza, libre }

enum EstadoLista { abierta, cerrada }

/// Espaciado del `orden` (convención de 0026: 100, 200, 300…).
const int pasoOrdenLista = 100;

String tipoRenglonListaACadena(TipoRenglonLista t) => switch (t) {
      TipoRenglonLista.pieza => 'PIEZA',
      TipoRenglonLista.libre => 'LIBRE',
    };

/// Un tipo de una fase más nueva (VARILLA, MURO_BLOCK…) se muestra como LIBRE
/// en vez de reventar: esta versión no sabe calcularlo, pero sí enseñarlo.
TipoRenglonLista tipoRenglonListaDeCadena(String? s) =>
    s == 'PIEZA' ? TipoRenglonLista.pieza : TipoRenglonLista.libre;

String estadoListaACadena(EstadoLista e) =>
    e == EstadoLista.cerrada ? 'CERRADA' : 'ABIERTA';

EstadoLista estadoListaDeCadena(String? s) =>
    s == 'CERRADA' ? EstadoLista.cerrada : EstadoLista.abierta;

/// Lo mínimo que la cuenta necesita de un renglón.
class RenglonCalc {
  const RenglonCalc({
    required this.tipo,
    required this.cantidad,
    this.largo,
    this.separacionCm,
    this.seccion = '',
    this.marcado = false,
  });

  final TipoRenglonLista tipo;
  final double cantidad;
  final double? largo;
  final double? separacionCm;
  final String seccion;
  final bool marcado;
}

/// Tolerancia para que 3.00 × 100 / 25 (= 11.999… en binario) cuente 12.
const double _eps = 1e-6;

/// Metros lineales de un renglón de piezas: cantidad × largo. Null si no es
/// pieza o le falta el largo (falta el dato del plano: no se supone).
double? metrosLineales(RenglonCalc r) {
  final largo = r.largo;
  if (r.tipo != TipoRenglonLista.pieza || largo == null) return null;
  return redondear2(r.cantidad * largo);
}

/// Estribos de UNA pieza a separación fija: uno al arranque y uno por cada
/// tramo completo, ⌊L / s⌋ + 1. Es la cuenta del PDF que el dueño revisó
/// (3.55 m @25 cm → 15). Null sin largo o sin separación.
int? estribosPorPieza(double? largo, double? separacionCm) {
  if (largo == null || separacionCm == null || separacionCm <= 0) return null;
  return (largo * 100 / separacionCm + _eps).floor() + 1;
}

/// Estribos de todo el renglón: por pieza × cantidad de piezas.
int? estribosTotales(RenglonCalc r) {
  final porPieza = estribosPorPieza(r.largo, r.separacionCm);
  if (r.tipo != TipoRenglonLista.pieza || porPieza == null) return null;
  return porPieza * r.cantidad.round();
}

double redondear2(double v) => (v * 100).roundToDouble() / 100;

/// Totales de una sección o de toda la lista.
class TotalesLista {
  const TotalesLista({
    required this.renglones,
    required this.marcados,
    required this.piezas,
    required this.metros,
    required this.estribos,
  });

  final int renglones;
  final int marcados;

  /// Suma de cantidades de los renglones PIEZA (los LIBRE no son piezas).
  final double piezas;

  /// Suma de metros lineales de los PIEZA con largo.
  final double metros;

  /// Suma de estribos de los PIEZA con separación.
  final int estribos;

  bool get completa => renglones > 0 && marcados == renglones;
}

TotalesLista totalesDe(Iterable<RenglonCalc> renglones) {
  var n = 0, marcados = 0, estribos = 0;
  var piezas = 0.0, metros = 0.0;
  for (final r in renglones) {
    n++;
    if (r.marcado) marcados++;
    if (r.tipo == TipoRenglonLista.pieza) piezas += r.cantidad;
    metros += metrosLineales(r) ?? 0;
    estribos += estribosTotales(r) ?? 0;
  }
  return TotalesLista(
    renglones: n,
    marcados: marcados,
    piezas: redondear2(piezas),
    metros: redondear2(metros),
    estribos: estribos,
  );
}

/// Las secciones en el orden en que aparecen (el de los renglones ya
/// ordenados por `orden`), con sus renglones. Una sección vacía ('') se llama
/// «Sin sección» en pantalla y en el PDF.
List<(String, List<T>)> agruparPorSeccion<T>(
    Iterable<T> renglones, String Function(T) seccionDe) {
  final orden = <String>[];
  final grupos = <String, List<T>>{};
  for (final r in renglones) {
    final s = seccionDe(r).trim();
    final grupo = grupos[s];
    if (grupo == null) {
      orden.add(s);
      grupos[s] = [r];
    } else {
      grupo.add(r);
    }
  }
  return [for (final s in orden) (s, grupos[s]!)];
}

/// Número sin ceros de más: 4 → «4», 2.5 → «2.5», 10.45 → «10.45».
String numeroCorto(double v) {
  final r = redondear2(v);
  if (r == r.roundToDouble()) return r.toStringAsFixed(0);
  return r.toStringAsFixed(2).replaceFirst(RegExp(r'0$'), '');
}

/// Medida con dos decimales fijos, como en el PDF: 3 → «3.00».
String metros2(double v) => redondear2(v).toStringAsFixed(2);
