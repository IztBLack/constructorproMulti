/// CATÁLOGO DE MÓDULOS en el móvil (F0 del alcance ampliado).
///
/// Cada empresa prende las partes de la app que usa. La elección vive en
/// `empresa_config.modulos` (migración 0035) y se hace en la WEB (Ajustes →
/// Módulos). El móvil solo la LEE para ocultar lo apagado.
///
/// ESPEJO de `web/src/lib/modulos.ts` (la única fuente en la web) y de las
/// funciones `modulos_catalogo()` / `modulos_dependencias()` de la migración.
/// `test/core/modulos_test.dart` lee esos dos archivos y falla si las claves,
/// las dependencias o los nombres dejan de coincidir.
///
/// REGLA QUE MANDA: apagar un módulo OCULTA, nunca BORRA. Esto es presentación,
/// no seguridad: lo que se puede leer o escribir lo sigue decidiendo la RLS.
///
/// Módulo PURO (sin Flutter, sin Supabase) para probarlo sin montar nada.
library;

/// Claves del catálogo, en el MISMO orden que `CLAVES_MODULO` de la web. El
/// `name` de cada valor es la clave tal como viaja en `empresa_config.modulos`.
enum ClaveModulo {
  // Existentes
  obras,
  cotizaciones,
  equipo,
  cuadrillas,
  caja,
  proyeccion,
  notas,
  portal,
  // Futuros (F1–F7)
  cambios,
  rentabilidad,
  fiscal,
  compras,
  estimaciones,
  bitacora,
  programa,
  cumplimiento,
  subcontratos,
  seguridad,
  postventa,
  herramienta,
}

class Modulo {
  const Modulo({
    required this.clave,
    required this.nombre,
    required this.descripcion,
    this.dependeDe = const [],
    this.implementadoEnMovil = false,
    this.aplicaEnMovil = true,
    this.nucleo = false,
  });

  final ClaveModulo clave;

  /// El MISMO nombre que ve el dueño en la web al prenderlo.
  final String nombre;

  /// Qué resuelve, en lenguaje de obra.
  final String descripcion;

  /// Módulos que se prenden solos al prender este.
  final List<ClaveModulo> dependeDe;

  /// true si el móvil ya tiene sus pantallas. Lo que está prendido pero no
  /// implementado aparece en Configuración → "Disponibles en la web".
  final bool implementadoEnMovil;

  /// false para lo que por naturaleza no vive en la app del constructor (el
  /// portal lo usa el CLIENTE desde el navegador): ni se muestra ni se anuncia.
  final bool aplicaEnMovil;

  /// El núcleo: siempre prendido.
  final bool nucleo;
}

const List<Modulo> catalogoModulos = [
  Modulo(
    clave: ClaveModulo.obras,
    nombre: 'Obras y clientes',
    descripcion:
        'Tus obras y tus clientes. Es la base de todo, por eso siempre está prendido.',
    implementadoEnMovil: true,
    nucleo: true,
  ),
  Modulo(
    clave: ClaveModulo.cotizaciones,
    nombre: 'Cotizaciones y presupuesto',
    descripcion:
        'Arma cotizaciones con tu lista de precios, mándalas en PDF y lleva el presupuesto de cada obra.',
    implementadoEnMovil: true,
  ),
  Modulo(
    clave: ClaveModulo.equipo,
    nombre: 'Equipo, asistencia y raya',
    descripcion:
        'Tu gente con su puesto y su sueldo, el pase de lista de cada día y la raya del viernes.',
    implementadoEnMovil: true,
  ),
  Modulo(
    clave: ClaveModulo.cuadrillas,
    nombre: 'Cuadrillas y destajo',
    descripcion:
        'Agrupa a tu gente en cuadrillas con su jefe y paga los destajos por cuadrilla.',
    dependeDe: [ClaveModulo.equipo],
    implementadoEnMovil: true,
  ),
  Modulo(
    clave: ClaveModulo.caja,
    nombre: 'Caja de la obra',
    descripcion:
        'Lo que entra y sale de cada obra: pagos, gastos, comprobantes, el estado de cuenta del cliente y la carga del estado de cuenta del banco.',
    implementadoEnMovil: true,
  ),
  Modulo(
    clave: ClaveModulo.proyeccion,
    nombre: 'Proyección de la raya',
    descripcion:
        'Cuánto vas a pagar de raya la semana que viene, persona por persona.',
    dependeDe: [ClaveModulo.equipo],
    implementadoEnMovil: true,
  ),
  Modulo(
    clave: ClaveModulo.notas,
    nombre: 'Tratos con maestros y socios',
    descripcion:
        'Los tratos de palabra con tus maestros y subcontratistas: lo acordado, lo pagado y lo que falta.',
    implementadoEnMovil: true,
  ),
  Modulo(
    clave: ClaveModulo.portal,
    nombre: 'Portal del cliente',
    descripcion:
        'Tu cliente entra con un código y ve sus cotizaciones y cómo va su obra, sin tener que llamarte.',
    aplicaEnMovil: false,
  ),
  // ── Futuros: primero salen en la web (decisión D6) ──────────────────────
  Modulo(
    clave: ClaveModulo.cambios,
    nombre: 'Extras y cambios',
    descripcion:
        'Los extras que te pide el cliente, aprobados por él y sumados a lo que te debe.',
    dependeDe: [ClaveModulo.cotizaciones],
  ),
  Modulo(
    clave: ClaveModulo.rentabilidad,
    nombre: 'Ganancia por obra',
    descripcion:
        'Cuánto te está dejando cada obra: lo contratado contra lo que llevas gastado.',
    dependeDe: [ClaveModulo.cotizaciones],
  ),
  Modulo(
    clave: ClaveModulo.fiscal,
    nombre: 'Datos para facturar',
    descripcion:
        'Junta los datos de cada cobro para facturar o para tu contador. La app no factura ni se conecta al SAT.',
    dependeDe: [ClaveModulo.cotizaciones],
  ),
  Modulo(
    clave: ClaveModulo.compras,
    nombre: 'Compras y material',
    descripcion:
        'Pide material desde la obra, compra, recibe y sabe cuánto costó en cada obra.',
  ),
  Modulo(
    clave: ClaveModulo.estimaciones,
    nombre: 'Avance y estimaciones',
    descripcion:
        'Cobra por avance: lo que se hizo en el periodo por el precio pactado, con anticipo y retenciones.',
    dependeDe: [ClaveModulo.cotizaciones],
  ),
  Modulo(
    clave: ClaveModulo.bitacora,
    nombre: 'Bitácora con fotos',
    descripcion:
        'Lo que pasa cada día en la obra, con fotos y fecha, para tener evidencia.',
    // Fase 1 de la paridad (docs/PLAN_BITACORA_MOVIL.md). No entra al paquete
    // por defecto: igual que en la web, la prende el dueño en Ajustes → Módulos.
    implementadoEnMovil: true,
  ),
  Modulo(
    clave: ClaveModulo.programa,
    nombre: 'Programa de obra',
    descripcion: 'Fechas de inicio y fin de cada partida, y qué va atrasado.',
  ),
  Modulo(
    clave: ClaveModulo.cumplimiento,
    nombre: 'IMSS, SIROC y REPSE',
    descripcion:
        'Te recuerda lo que toca con el IMSS y guarda los comprobantes, para que no te multen. El trámite lo haces tú o tu contador.',
  ),
  Modulo(
    clave: ClaveModulo.subcontratos,
    nombre: 'Contratos de subcontrato',
    descripcion:
        'Convierte un trato con un subcontratista en contrato, con sus retenciones.',
    dependeDe: [ClaveModulo.notas],
  ),
  Modulo(
    clave: ClaveModulo.seguridad,
    nombre: 'Seguridad en obra',
    descripcion:
        'Revisión diaria, equipo de protección entregado e incidentes.',
  ),
  Modulo(
    clave: ClaveModulo.postventa,
    nombre: 'Garantías',
    descripcion:
        'Tu cliente reporta una garantía desde el portal y tú le das seguimiento.',
  ),
  Modulo(
    clave: ClaveModulo.herramienta,
    nombre: 'Herramienta y maquinaria',
    descripcion: 'Qué herramienta tienes, en qué obra está y quién la trae.',
  ),
];

final Map<ClaveModulo, Modulo> _porClave = {
  for (final m in catalogoModulos) m.clave: m,
};

/// El módulo de una clave. Todas las claves del enum están en el catálogo (lo
/// fija un test), así que nunca es null.
Modulo moduloDe(ClaveModulo clave) => _porClave[clave]!;

final Map<String, ClaveModulo> _porNombre = {
  for (final c in ClaveModulo.values) c.name: c,
};

/// La clave de un texto que llegó del servidor, o null si esta versión de la
/// app no la conoce (una fase que salió en la web después de este build).
ClaveModulo? claveDesdeTexto(Object? x) => x is String ? _porNombre[x] : null;

/// Lo que tiene prendido una empresa que nunca eligió: los módulos que existían
/// antes de que hubiera módulos. Es el default de la columna en 0035 y el
/// `PAQUETE_POR_DEFECTO` de la web.
const Set<ClaveModulo> paquetePorDefecto = {
  ClaveModulo.obras,
  ClaveModulo.cotizaciones,
  ClaveModulo.equipo,
  ClaveModulo.cuadrillas,
  ClaveModulo.caja,
  ClaveModulo.proyeccion,
  ClaveModulo.notas,
  ClaveModulo.portal,
};

/// Agrega `obras` y todo lo que se necesita para que cada módulo funcione. Es
/// la misma regla que `resolverDependencias` (web) y `modulos_resolver` (base).
Set<ClaveModulo> resolverDependencias(Iterable<ClaveModulo> claves) {
  final resultado = <ClaveModulo>{ClaveModulo.obras, ...claves};
  final pendientes = [...resultado];
  while (pendientes.isNotEmpty) {
    final actual = pendientes.removeLast();
    for (final dep in moduloDe(actual).dependeDe) {
      if (resultado.add(dep)) pendientes.add(dep);
    }
  }
  return resultado;
}

/// Normaliza lo que venga de `empresa_config.modulos`. Si no es una lista (la
/// columna no existe todavía, la fila falta, llegó basura) se usa el paquete de
/// siempre: el móvil nunca debe quedarse sin pantallas por un dato raro. Las
/// claves que esta versión no conoce se ignoran.
Set<ClaveModulo> normalizarModulos(Object? crudo) {
  if (crudo is! List) return {...paquetePorDefecto};
  return resolverDependencias(
    crudo.map(claveDesdeTexto).whereType<ClaveModulo>(),
  );
}

/// De dónde salió la lista que se está aplicando. Sirve para explicarlo en
/// Configuración y para las pruebas.
enum FuenteModulos {
  /// Sin cuenta vinculada o sin dato: todo lo que el móvil tiene, prendido.
  porDefecto,

  /// Última lista que se bajó del servidor para esta empresa (sin señal).
  cache,

  /// Recién leída de `empresa_config`.
  servidor,
}

/// Los módulos prendidos de la empresa, listos para que la UI pregunte.
class ModulosActivos {
  const ModulosActivos(this.activos, this.fuente);

  /// Sin cuenta o sin dato: el paquete de siempre.
  static const ModulosActivos porDefecto = ModulosActivos(
    paquetePorDefecto,
    FuenteModulos.porDefecto,
  );

  final Set<ClaveModulo> activos;
  final FuenteModulos fuente;

  /// ¿Se enseña en el móvil lo de este módulo? El núcleo siempre.
  bool usa(ClaveModulo clave) =>
      moduloDe(clave).nucleo || activos.contains(clave);

  /// Prendidos en la empresa, pero que el móvil todavía no tiene: se listan en
  /// Configuración como "Disponibles en la web". En el orden del catálogo.
  List<Modulo> get soloEnLaWeb => [
    for (final m in catalogoModulos)
      if (activos.contains(m.clave) &&
          m.aplicaEnMovil &&
          !m.implementadoEnMovil)
        m,
  ];

  @override
  bool operator ==(Object other) =>
      other is ModulosActivos &&
      other.fuente == fuente &&
      other.activos.length == activos.length &&
      other.activos.containsAll(activos);

  @override
  int get hashCode =>
      Object.hash(fuente, Object.hashAllUnordered(activos.map((c) => c.index)));

  @override
  String toString() =>
      'ModulosActivos(${activos.map((c) => c.name).join(',')}, $fuente)';
}
