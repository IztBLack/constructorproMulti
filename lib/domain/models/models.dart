// Modelos de dominio puros (sin dependencia de Drift/Flutter) usados por la
// lógica de negocio y sus tests de paridad. Espejan las entidades Room del
// proyecto Kotlin en los campos relevantes para los cálculos.

enum TipoPago { dia, destajo }

enum TipoMovimiento { entrada, salida }

class Puesto {
  final String id;
  final String nombre;
  final double salarioDiaDefault;

  const Puesto({
    required this.id,
    required this.nombre,
    this.salarioDiaDefault = 0.0,
  });
}

class Colaborador {
  final String id;
  final String nombre;
  final String puestoId;
  final TipoPago tipoPago;

  /// Si no es null, sustituye al salario del puesto (override por colaborador).
  final double? salarioPersonalizado;

  const Colaborador({
    required this.id,
    required this.nombre,
    required this.puestoId,
    required this.tipoPago,
    this.salarioPersonalizado,
  });
}

class Asistencia {
  final String colaboradorId;
  final String obraId;
  final int fecha; // epoch millis
  final double fraccion; // 0.0, 0.5, 0.75, 1.0

  const Asistencia({
    required this.colaboradorId,
    required this.obraId,
    required this.fecha,
    required this.fraccion,
  });
}

class Destajo {
  final String colaboradorId;
  final String obraId;
  final int fecha; // epoch millis
  final double monto;

  const Destajo({
    required this.colaboradorId,
    required this.obraId,
    required this.fecha,
    required this.monto,
  });
}

class Movimiento {
  final TipoMovimiento tipo;
  final double monto;

  /// Beneficiario/pagador (a quién se le pagó / de quién se recibió).
  /// '' si no se capturó (filas previas a la migración v5).
  final String nombre;

  const Movimiento({
    required this.tipo,
    required this.monto,
    this.nombre = '',
  });
}

class Partida {
  final double cantidad;
  final double precioUnitario;

  const Partida({required this.cantidad, required this.precioUnitario});

  double get total => cantidad * precioUnitario;
}

/// Partida del presupuesto de una obra (encabezado tipo "COSTO TOTAL" del
/// Excel "estado de cuenta"). Espeja la tabla Drift `ObraPresupuesto`
/// (`ObraPresupuestoRow`) y `public.obra_presupuesto` de Supabase.
class PartidaPresupuesto {
  final String id;
  final String obraId;
  final String concepto;
  final String seccion;
  final String unidad;
  final double cantidad;
  final double precioUnitario;
  final int orden;

  const PartidaPresupuesto({
    required this.id,
    required this.obraId,
    this.concepto = '',
    this.seccion = '',
    this.unidad = '',
    this.cantidad = 1,
    this.precioUnitario = 0,
    this.orden = 0,
  });

  double get total => cantidad * precioUnitario;
}
