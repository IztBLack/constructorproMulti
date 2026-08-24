/// Aritmética de las NOTAS DE OBRA: los tratos de palabra con socios que no
/// están en el sistema (Supabase 0031).
///
/// Puerto en Dart de `web/src/lib/data/notas-obra-calculo.ts`. Los dos tienen
/// que dar EXACTAMENTE los mismos números: la misma nota se abre desde la
/// oficina y desde el celular, y dos saldos distintos para el mismo trato es un
/// problema con un socio enfrente. `test/logic/notas_obra_calculo_test.dart`
/// fija los casos, incluida la nota real que originó la funcionalidad.
///
/// REGLA CENTRAL: la app SUGIERE, el dueño DECIDE. Los renglones proponen un
/// monto a partir de `montoBase` y `porcentaje`, y la nota propone total y
/// saldo a partir de los renglones; los tres se pueden fijar a mano. Los
/// números se los asigna la constructora con la que se trabaja y no siempre
/// cuadran con la aritmética (62,000 − 4% son 59,520, pero el trato fue 60,000).
library;

enum TipoRenglon { concepto, deduccion, pago, texto }

enum EstadoNota { abierta, liquidada }

/// Espaciado del `orden` (convención de 0026: 100, 200, 300…), para insertar en
/// medio sin renumerar toda la lista.
const int pasoOrdenRenglon = 100;

/// Las cadenas que viajan a Supabase. Son las MISMAS que usa la web: si
/// divergen, una nota escrita en el celular se leería mal en la oficina.
String tipoRenglonACadena(TipoRenglon t) => switch (t) {
      TipoRenglon.concepto => 'CONCEPTO',
      TipoRenglon.deduccion => 'DEDUCCION',
      TipoRenglon.pago => 'PAGO',
      TipoRenglon.texto => 'TEXTO',
    };

/// Un tipo desconocido cae a CONCEPTO en vez de lanzar: si el servidor
/// introdujera uno nuevo, una versión vieja de la app debe seguir abriendo la
/// nota, no reventar en la pantalla del usuario.
TipoRenglon tipoRenglonDeCadena(String? s) => switch (s) {
      'DEDUCCION' => TipoRenglon.deduccion,
      'PAGO' => TipoRenglon.pago,
      'TEXTO' => TipoRenglon.texto,
      _ => TipoRenglon.concepto,
    };

String estadoNotaACadena(EstadoNota e) =>
    e == EstadoNota.liquidada ? 'LIQUIDADA' : 'ABIERTA';

EstadoNota estadoNotaDeCadena(String? s) =>
    s == 'LIQUIDADA' ? EstadoNota.liquidada : EstadoNota.abierta;

/// Lo mínimo que la aritmética necesita de un renglón. Es un tipo propio y no
/// la fila de Drift para poder probarlo sin base de datos, igual que la web.
class RenglonCalc {
  const RenglonCalc({
    required this.tipo,
    this.monto,
    this.montoBase,
    this.porcentaje,
  });

  final TipoRenglon tipo;

  /// Valor que entra en los totales. `null` = usar el sugerido.
  final double? monto;

  /// Bruto antes del porcentaje, cuando la nota enseña la cuenta completa.
  final double? montoBase;

  /// Retención en % sobre [montoBase].
  final double? porcentaje;
}

class TotalesNota {
  const TotalesNota({
    required this.subtotal,
    required this.deducciones,
    required this.totalCalculado,
    required this.total,
    required this.pagado,
    required this.saldoCalculado,
    required this.saldo,
    required this.totalFijado,
    required this.saldoFijado,
  });

  /// Σ de los renglones CONCEPTO.
  final double subtotal;

  /// Σ de los renglones DEDUCCION.
  final double deducciones;

  /// subtotal − deducciones. Lo que la nota diría sin intervención.
  final double totalCalculado;

  /// El que manda: el fijado a mano si lo hay, si no el calculado.
  final double total;

  /// Σ de los renglones PAGO (anticipos, proyecciones).
  final double pagado;

  final double saldoCalculado;
  final double saldo;

  /// true cuando el dueño fijó el valor y NO coincide con el cálculo.
  final bool totalFijado;
  final bool saldoFijado;
}

/// Monto que la app propone para un renglón a partir del bruto y la retención.
/// `null` cuando no hay bruto: entonces el monto se captura directo.
///
/// El porcentaje se lee distinto según el tipo, porque el monto de un renglón
/// siempre es CUÁNTO MUEVE ESE RENGLÓN:
///   DEDUCCION → el renglón ES la retención, así que vale la parte retenida
///               ("Retención 4% sobre 100,000" descuenta 4,000).
///   los demás → el renglón es lo que queda después de retener
///               ("62,000 − 4% de retención" es un pago de 59,520).
double? montoSugerido(TipoRenglon tipo, double? montoBase, double? porcentaje) {
  if (montoBase == null || !montoBase.isFinite) return null;
  if (porcentaje == null || !porcentaje.isFinite) return montoBase;
  final parte = montoBase * porcentaje / 100;
  return tipo == TipoRenglon.deduccion ? parte : montoBase - parte;
}

/// Valor con el que el renglón entra en los totales. Los TEXTO no suman: son
/// apuntes ("LIQUIDADO: bases de tinacos, pretil y recorte de puertas").
double montoEfectivo(RenglonCalc r) {
  if (r.tipo == TipoRenglon.texto) return 0;
  final m = r.monto;
  if (m != null && m.isFinite) return m;
  return montoSugerido(r.tipo, r.montoBase, r.porcentaje) ?? 0;
}

/// Redondeo a centavos, para que los flotantes no dejen colas de 0.00000001.
double _centavos(double n) => (n * 100).roundToDouble() / 100;

TotalesNota calcularTotales({
  double? totalOverride,
  double? saldoOverride,
  required List<RenglonCalc> renglones,
}) {
  var subtotal = 0.0;
  var deducciones = 0.0;
  var pagado = 0.0;

  for (final r in renglones) {
    final v = montoEfectivo(r);
    switch (r.tipo) {
      case TipoRenglon.concepto:
        subtotal += v;
      case TipoRenglon.deduccion:
        deducciones += v;
      case TipoRenglon.pago:
        pagado += v;
      case TipoRenglon.texto:
        break;
    }
  }

  subtotal = _centavos(subtotal);
  deducciones = _centavos(deducciones);
  pagado = _centavos(pagado);

  final totalCalculado = _centavos(subtotal - deducciones);
  final total = totalOverride ?? totalCalculado;

  // El saldo sale del total QUE MANDA, no del calculado: si el dueño fijó el
  // total porque así se lo asignaron, lo que resta se mide contra ese.
  final saldoCalculado = _centavos(total - pagado);
  final saldo = saldoOverride ?? saldoCalculado;

  return TotalesNota(
    subtotal: subtotal,
    deducciones: deducciones,
    totalCalculado: totalCalculado,
    total: total,
    pagado: pagado,
    saldoCalculado: saldoCalculado,
    saldo: saldo,
    totalFijado: totalOverride != null && totalOverride != totalCalculado,
    saldoFijado: saldoOverride != null && saldoOverride != saldoCalculado,
  );
}
