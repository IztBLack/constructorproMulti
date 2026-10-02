/**
 * Textos de los íconos de ayuda (ⓘ) que van junto a cada apartado.
 *
 * Una entrada por apartado: QUÉ es y PARA QUÉ sirve o CÓMO se usa, en dos o
 * tres frases cortas. Tono profesional, de tú, sin tecnicismos. Se pintan con
 * `<Ayuda clave="…" />` (`components/guia/ayuda.tsx`); TypeScript no deja usar
 * una clave que no esté aquí.
 *
 * Datos planos a propósito: el mismo texto se puede llevar a Flutter.
 */

export interface TextoAyuda {
  /** Nombre del apartado, como se ve en pantalla. */
  titulo: string;
  /** 1–3 frases. Máximo ~240 caracteres para que quepa sin desplazarse. */
  texto: string;
}

export const AYUDAS = {
  // ── Inicio ──────────────────────────────────────────────────────────────
  'inicio.indicadores': {
    titulo: 'Indicadores',
    texto:
      'Un resumen de tu empresa: cuántas obras, cotizaciones y personas tienes. Toca cualquiera para ir a su lista.',
  },
  'inicio.pipeline': {
    titulo: 'Pipeline',
    texto:
      'La suma de tus cotizaciones en borrador o enviadas, que el cliente todavía no acepta ni rechaza. Es trabajo posible, todavía no ganado.',
  },
  'inicio.saldo-obra': {
    titulo: 'Saldo por obra',
    texto:
      'Lo que ha entrado menos lo que ha salido de la caja de cada obra. En verde, la obra tiene dinero a favor; en rojo, se ha pagado más de lo que se ha cobrado.',
  },
  'inicio.finanzas': {
    titulo: 'Finanzas del periodo',
    texto:
      'Lo que entró y salió de todas tus obras en el mes o en el año. Cambia entre Mes y Año, y muévete de periodo con las flechas.',
  },
  'inicio.flujo': {
    titulo: 'Flujo de caja',
    texto:
      'Ingresos son las entradas de caja del periodo y egresos, las salidas. El saldo es la diferencia: si sale en rojo, salió más dinero del que entró.',
  },
  'inicio.gasto': {
    titulo: 'Distribución del gasto',
    texto:
      'En qué se fueron las salidas del periodo. Sale de la categoría de cada salida: si dice nómina o material, cuenta ahí; lo demás va a Otros.',
  },

  // ── Obras ───────────────────────────────────────────────────────────────
  'obras.importar': {
    titulo: 'Importar de Excel',
    texto:
      'Si ya llevas tus obras en Excel, súbelas con la plantilla: se crea la obra con su presupuesto y sus movimientos de una sola vez.',
  },
  'obras.orden': {
    titulo: 'Orden de la lista',
    texto:
      'Elige cómo se acomodan tus obras: por nombre, por fecha o en tu propio orden. Con tu propio orden puedes arrastrar las filas para acomodarlas.',
  },
  'obra.pestanas': {
    titulo: 'Pestañas de la obra',
    texto:
      'Cada pestaña es una parte de esta obra: asistencia, nómina, notas, extras y lo demás que tengas prendido. Si falta alguna, se prende en Ajustes → Módulos.',
  },
  'obra.estado-cuenta': {
    titulo: 'Estado de cuenta',
    texto:
      'Compara lo que cuesta la obra (su presupuesto más los extras aprobados) con lo que te han pagado. Pendiente es lo que falta por cobrar.',
  },
  'obra.iva': {
    titulo: 'IVA de la obra',
    texto:
      'La tasa con la que cobras esta obra. Sirve para separar el IVA de lo que recibes: ese IVA no es ganancia, se le paga al SAT.',
  },
  'obra.pagado-persona': {
    titulo: 'Pagado por persona',
    texto:
      'Las salidas de la obra sumadas por el nombre de a quién se le pagó. Así ves cuánto lleva cobrado cada maestro o proveedor.',
  },
  'obra.recibido-tipo': {
    titulo: 'Recibido por tipo',
    texto:
      'Las entradas de la obra sumadas por su categoría o concepto: anticipos, estimaciones, pagos. Así ves de dónde vino el dinero.',
  },
  'obra.nota-conciliacion': {
    titulo: 'Nota de conciliación',
    texto:
      'Un apunte libre para cuadrar la caja con el banco o con tu contadora, por ejemplo una diferencia por aclarar. Sale al pie del Excel de la obra.',
  },
  'obra.cobros-facturar': {
    titulo: 'Cobros para facturar',
    texto:
      'Las entradas de caja de esta obra y si ya tienen factura. Los datos para timbrarlas los juntas en Facturación.',
  },
  'obra.presupuesto': {
    titulo: 'Presupuesto por partidas',
    texto:
      'Lo que cobras por esta obra, partida por partida: concepto, cantidad y precio. Es la base del estado de cuenta, del avance y de las estimaciones.',
  },
  'obra.equipo': {
    titulo: 'Equipo de la obra',
    texto:
      'Las personas asignadas a esta obra. Solo ellas salen en su pase de lista y en su nómina.',
  },
  'obra.movimientos': {
    titulo: 'Movimientos',
    texto:
      'Todo lo que entra y sale de la caja de esta obra. Entrada es dinero que recibes; salida, lo que pagas. A cada uno le puedes adjuntar su comprobante.',
  },
  'obra.fisico-financiero': {
    titulo: 'Avance físico vs financiero',
    texto:
      'Físico es cuánto de la obra está hecho; financiero, cuánto te han pagado. Si lo pagado va muy por debajo de lo hecho, estás financiando la obra.',
  },
  'obra.siroc': {
    titulo: 'SIROC',
    texto:
      'El registro de la obra ante el IMSS. Hay un plazo corto desde que empieza la obra; aquí ves cuántos días hábiles te quedan y guardas el acuse.',
  },

  // ── Asistencia y nómina ─────────────────────────────────────────────────
  'asistencia.pase-lista': {
    titulo: 'Pase de lista',
    texto:
      'A cada persona se le marca Falta, Medio, Tres cuartos o Completo. Sin señal, lo marcado se guarda en el aparato y se envía solo al volver la conexión.',
  },
  'nomina.total': {
    titulo: 'Total de nómina',
    texto:
      'Lo que toca pagar esta semana en la obra: los días del pase de lista por el salario diario de cada quien, más los destajos.',
  },
  'nomina.detalle': {
    titulo: 'Detalle por colaborador',
    texto:
      'Cuántos días se le cuentan a cada persona y cuánto le toca. Si alguien sale en $0, revisa que tenga puesto o sueldo capturado.',
  },
  'nomina.registrar-caja': {
    titulo: 'Registrar nómina en caja',
    texto:
      'Anota el total de la raya como una salida en la caja de la obra, para que el estado de cuenta y la utilidad la tomen en cuenta.',
  },
  'nomina.destajos': {
    titulo: 'Destajos',
    texto:
      'Trabajos que se pagan por pieza o por tarea, no por día. Se capturan desde la app del celular; aquí ves los de esta semana, que se suman a la raya.',
  },

  // ── Notas y extras ──────────────────────────────────────────────────────
  'notas.pegar-mensaje': {
    titulo: 'Pegar mensaje',
    texto:
      'Copia el mensaje de WhatsApp donde el maestro te pasa su cuenta y pégalo aquí: la nota se llena sola y tú solo la revisas.',
  },
  'nota.renglones': {
    titulo: 'Renglones',
    texto:
      'Cada renglón es un concepto que suma, una deducción que resta o un pago. El saldo es lo que todavía falta por pagar de ese trato.',
  },
  'extras.que-son': {
    titulo: 'Extras',
    texto:
      'Lo que el cliente pide fuera del presupuesto. Mientras lo armas está en borrador; ya enviado no se puede cambiar, y lo aprobado se suma a lo que te debe.',
  },
  'extra.conceptos': {
    titulo: 'Conceptos del extra',
    texto:
      'Cada concepto lleva unidad, cantidad y precio, sin IVA, igual que el presupuesto de la obra. El total del extra es la suma de sus conceptos.',
  },

  // ── Avance y estimaciones ───────────────────────────────────────────────
  'avance.fisico': {
    titulo: 'Avance físico',
    texto:
      'Qué tanto de la obra está hecho, medido contra las cantidades del presupuesto. Sale de lo que anotas en cada partida.',
  },
  'estimaciones.anticipo': {
    titulo: 'Anticipo',
    texto:
      'El dinero que el cliente te dio al arrancar, antes de que hubiera obra hecha. Se va descontando de cada estimación.',
  },
  'estimaciones.amortizacion': {
    titulo: 'Amortización',
    texto:
      'El porcentaje de cada estimación que se descuenta para ir pagando el anticipo. Lo normal es el mismo porcentaje del anticipo.',
  },
  'estimaciones.fondo-garantia': {
    titulo: 'Fondo de garantía',
    texto:
      'Un porcentaje que el cliente te retiene de cada estimación por si algo sale mal. Lo típico es 5 % y se regresa al cerrar la obra.',
  },

  // ── Bitácora, programa, seguridad, material, utilidad de la obra ────────
  'bitacora.entrada': {
    titulo: 'Entradas de bitácora',
    texto:
      'Cada entrada se cierra 24 horas después de registrarse y ya no se puede cambiar: así sirve de evidencia. Lo que marques para el cliente sale en su portal.',
  },
  'programa.barras': {
    titulo: 'Vista de barras',
    texto:
      'Cada barra va del inicio al fin de una partida. Lo que pasa de su fecha sin marcarse como terminado sale como atrasado.',
  },
  'seguridad.revision': {
    titulo: 'Revisión de hoy',
    texto:
      'Recorre la obra y marca cada punto: Sí cumple, No cumple o No aplica. Lo que se revisa sale de la norma de seguridad en obras de construcción.',
  },
  'seguridad.incidentes': {
    titulo: 'Incidentes',
    texto:
      'Anota accidentes, casi accidentes y condiciones inseguras. Un accidente de trabajo se le avisa al IMSS con el formato ST-7.',
  },
  'material.pedir': {
    titulo: 'Pedir material',
    texto:
      'Desde la obra se hace la requisición: qué material, cuánto y para cuándo. La oficina la aprueba y la compra.',
  },
  'material.existencias': {
    titulo: 'Lo que hay en la obra',
    texto:
      'El material que debería estar en la obra: lo recibido menos lo usado y lo que se mandó a otra obra. Sirve para saber qué no hace falta volver a pedir.',
  },
  'utilidad.terminar': {
    titulo: 'Cómo va a terminar',
    texto:
      'Un cálculo de cuánto costará la obra al final, según lo gastado y el avance. Sirve para ver a tiempo si el gasto se va a comer la ganancia.',
  },
  'utilidad.gasto': {
    titulo: 'En qué se ha ido el dinero',
    texto:
      'Las salidas de caja de la obra por tipo de gasto. Clasifica cada salida al registrarla para que esta cuenta salga completa.',
  },
  'utilidad.margen': {
    titulo: 'Margen objetivo',
    texto:
      'La ganancia que esperas, como porcentaje de lo contratado. Si la obra va por debajo, se marca para que la revises.',
  },

  // ── Cotizaciones ────────────────────────────────────────────────────────
  'cotizaciones.estado': {
    titulo: 'Estados de la cotización',
    texto:
      'Borrador mientras la armas, Enviada cuando la mandas, Aceptada o Rechazada según conteste el cliente, y Convertida cuando ya es obra. Toca uno para filtrar.',
  },
  'cotizacion.estado': {
    titulo: 'Estado y siguiente paso',
    texto:
      'Los botones de aquí cambian según el estado: enviar al cliente, marcarla aceptada o rechazada y, cuando la acepta, convertirla en obra.',
  },
  'cotizacion.iva': {
    titulo: 'Aplicar IVA',
    texto:
      'Marcado, al total se le suma el IVA con la tasa de tu empresa. Quítalo si esta cotización va sin IVA. La tasa se cambia en Ajustes → Operación.',
  },
  'cotizacion.secciones': {
    titulo: 'Secciones y partidas',
    texto:
      'Agrupa la cotización en secciones (Cimentación, Muros, Acabados) y dentro de cada una agrega sus partidas. Si ya las tienes escritas, usa Importar texto y pégalas.',
  },
  'cotizacion.resumen': {
    titulo: 'Resumen',
    texto:
      'La suma de las partidas, menos el descuento, más el IVA si lo aplicas. El total es lo que sale en el PDF.',
  },
  'cotizacion.pagos': {
    titulo: 'Pagos y abonos',
    texto:
      'Los anticipos y abonos que el cliente te da por esta cotización. Llevarlos aquí te dice cuánto falta por cobrar.',
  },

  // ── Clientes ────────────────────────────────────────────────────────────
  'cliente.portal': {
    titulo: 'Acceso al portal',
    texto:
      'Genera un código de 6 dígitos y pásaselo a tu cliente: con él vincula su cuenta y ve sus cotizaciones y cómo va su obra. El código vale 10 minutos.',
  },
  'cliente.datos-factura': {
    titulo: 'Datos para factura',
    texto:
      'El RFC, la razón social y el régimen de tu cliente, tal como vienen en su constancia fiscal. Con ellos la factura no te la rechazan.',
  },

  // ── Equipo y cuadrillas ─────────────────────────────────────────────────
  'equipo.sueldo': {
    titulo: 'Sueldo',
    texto:
      'Di si le pagas por semana, quincena o mes y cuántos días trabaja: la app saca su salario diario, que es el que usa la nómina. Vacío, toma el del puesto.',
  },
  'equipo.incompletos': {
    titulo: 'Información incompleta',
    texto:
      'Personas dadas de alta sin puesto definido, casi siempre desde la obra. Mientras no se completen sus datos, la nómina las cuenta en $0.',
  },
  'equipo.epp': {
    titulo: 'Equipo de protección',
    texto:
      'Lo que le entregas a la persona: casco, botas, chaleco y demás. Así sabes qué trae y cuándo toca reponerlo.',
  },
  'cuadrillas.cabo': {
    titulo: 'Cabo',
    texto:
      'Quien dirige la cuadrilla. Se elige dentro de la cuadrilla, con el botón Hacer cabo junto a la persona.',
  },
  'cuadrilla.miembros': {
    titulo: 'Miembros',
    texto:
      'Las personas que forman esta cuadrilla. Elígelas de la lista para agregarlas y marca a quien la dirige con Hacer cabo.',
  },
  'cuadrilla.obras': {
    titulo: 'Obras de la cuadrilla',
    texto:
      'Las obras donde trabaja la cuadrilla. Con Mandar equipo, todos sus miembros quedan asignados a esa obra y salen en su pase de lista.',
  },
  'cuadrilla.destajo': {
    titulo: 'Destajo por cuadrilla',
    texto:
      'Paga un trabajo completo a toda la cuadrilla, por ejemplo un colado, y reparte el total entre sus miembros, a partes iguales o como lo acuerden.',
  },

  // ── Proyección ──────────────────────────────────────────────────────────
  'proyeccion.escenario': {
    titulo: 'Escenario',
    texto:
      'Esta pantalla es una cuenta de prueba: lo que marques aquí no cambia el pase de lista ni la nómina de las obras.',
  },
  'proyeccion.raya': {
    titulo: 'Raya proyectada',
    texto:
      'Lo que pagarías en la semana: lo que ya está en el pase de lista (en firme) más los días que estás suponiendo (estimado).',
  },
  'proyeccion.rellenar': {
    titulo: 'Llenar los días',
    texto:
      'Llena los días de todos de un jalón: de lunes a sábado, según los días de cada quien, sin sábado o con domingo. Limpiar los quita.',
  },
  'proyeccion.participantes': {
    titulo: 'Participantes',
    texto:
      'Saca o mete personas solo para esta cuenta, sin tocar tu equipo ni sus obras.',
  },

  // ── Compras ─────────────────────────────────────────────────────────────
  'compras.requisiciones': {
    titulo: 'Requisiciones',
    texto:
      'Una requisición es el pedido de material que se hace desde la obra. Primero se aprueba y después se compra con una orden de compra.',
  },
  'compras.por-comprar': {
    titulo: 'Aprobado, por comprar',
    texto:
      'Material aprobado que aún no está en una orden. Con Armar órdenes de compra eliges proveedor y precio, y se arma una orden por obra y proveedor.',
  },
  'compras.ordenes': {
    titulo: 'Órdenes de compra',
    texto:
      'El pedido formal al proveedor. Nace en borrador; ya emitida, se espera el material, y cuando llega se registra lo que se recibió.',
  },
  'compras.por-pagar': {
    titulo: 'Por pagar a proveedores',
    texto:
      'Lo que les debes a tus proveedores por lo que ya te entregaron, con lo vencido según sus días de crédito.',
  },

  // ── Facturación y utilidad ──────────────────────────────────────────────
  'facturacion.paquete': {
    titulo: 'Paquete para el contador',
    texto:
      'Un ZIP con el Excel del mes y tus facturas en XML y PDF, listo para mandárselo a tu contador. El resumen de IVA es estimado, no una declaración.',
  },
  'facturacion.por-facturar': {
    titulo: 'Por facturar',
    texto:
      'Cobros que ya recibiste y todavía no tienen factura. Abre uno para copiar sus datos a tu sistema de facturas: la app no timbra.',
  },
  'facturacion.complementos': {
    titulo: 'Complemento de pago',
    texto:
      'Cuando una factura se paga después o en partes, el SAT pide un comprobante por cada pago recibido. Aquí ves los que te faltan.',
  },
  'rentabilidad.utilidad': {
    titulo: 'Utilidad al terminar',
    texto:
      'Lo contratado menos lo que se calcula que costará la obra completa. Es la ganancia que te dejaría si todo sigue igual.',
  },
  'rentabilidad.margen': {
    titulo: 'Margen al terminar',
    texto:
      'La utilidad al terminar como porcentaje de lo contratado. Se compara con el margen objetivo de tu empresa.',
  },
  'rentabilidad.semaforo': {
    titulo: 'Cómo va',
    texto:
      'Un aviso rápido de si la obra va bien o por debajo de tu margen objetivo. Las que necesitan atención salen primero.',
  },

  // ── Subcontratos, garantías, herramienta ────────────────────────────────
  'subcontrato.pagos': {
    titulo: 'Pagos al subcontratista',
    texto:
      'Cada pago que le haces. Si el contrato tiene fondo de garantía, una parte de cada pago se retiene y se le entrega al terminar.',
  },
  'garantias.pestanas': {
    titulo: 'Reportes y garantías',
    texto:
      'En Reportes ves lo que tus clientes reportan desde su portal. En Garantía por obra anotas cuándo entregaste y cuántos meses cubre.',
  },
  'herramienta.planta': {
    titulo: 'Asignada de planta',
    texto:
      'Herramienta que se queda fija en una obra o con una persona, sin fecha de regreso. Un préstamo, en cambio, tiene fecha para volver.',
  },

  // ── IMSS y papeles ──────────────────────────────────────────────────────
  'cumplimiento.siroc': {
    titulo: 'SIROC',
    texto:
      'Cada obra se registra ante el IMSS en el SIROC dentro de un plazo corto desde que empieza. Aquí ves cuántos días hábiles te quedan y guardas el acuse.',
  },
  'cumplimiento.repse': {
    titulo: 'REPSE',
    texto:
      'El registro ante la Secretaría del Trabajo para dar servicios especializados. Anota tu folio y su vigencia para tenerlo a la vista antes de que venza.',
  },
  'cumplimiento.entregas': {
    titulo: 'ICSOE y SISUB',
    texto:
      'Informes que se entregan cada cuatro meses al IMSS y al Infonavit cuando das servicios especializados. Marca cada entrega y guarda su acuse.',
  },
  'cumplimiento.subcontratistas': {
    titulo: 'Expediente de subcontratistas',
    texto:
      'Si tu subcontratista no tiene REPSE vigente, quien le paga puede perder la deducción y responder por él. Guarda aquí sus papeles y su vencimiento.',
  },
  'cumplimiento.contador': {
    titulo: 'Para tu contador',
    texto:
      'La app no calcula cuotas del IMSS, ISR ni Infonavit. Descarga la raya de un periodo para que tu contador haga el cálculo en su sistema.',
  },

  // ── Catálogos y usuarios ────────────────────────────────────────────────
  'catalogo.precio': {
    titulo: 'Precio unitario',
    texto:
      'El precio con que el concepto entra a una cotización. Al cotizar lo buscas y se llena solo; ahí mismo lo puedes ajustar.',
  },
  'puestos.salario': {
    titulo: 'Salario por día',
    texto:
      'El salario diario con el que arranca cada persona de este puesto. Si a alguien le capturas su propio sueldo, cuenta el suyo.',
  },
  'usuarios.rol': {
    titulo: 'Rol',
    texto:
      'Lo que cada persona puede ver y hacer. El administrador controla todo, incluidos los usuarios; los demás roles ven solo su parte.',
  },
  'usuarios.invitar': {
    titulo: 'Invitar',
    texto:
      'A tu equipo le generas un código que vale 72 horas y sirve una sola vez; se lo dictas. A un socio se le invita por correo y entra como administrador.',
  },

  // ── Ajustes ─────────────────────────────────────────────────────────────
  'ajustes.modulos': {
    titulo: 'Módulos',
    texto:
      'Las partes de la app que usa tu empresa. Lo apagado se esconde del menú de todos, pero sus datos se conservan: al prenderlo, todo sigue ahí.',
  },
  'ajustes.iva-defecto': {
    titulo: 'IVA por defecto',
    texto:
      'La tasa con la que nace cada cotización nueva: 16 % en casi todo el país, 8 % en la franja fronteriza. Las cotizaciones anteriores no cambian.',
  },
  'ajustes.margen': {
    titulo: 'Margen objetivo',
    texto:
      'La ganancia que esperas de cada obra, en porcentaje. Con él se marcan las obras que van por debajo en Utilidad.',
  },
  'ajustes.documentos': {
    titulo: 'Documentos',
    texto:
      'Cómo salen tus PDF: tu contacto, el color, el pie de página y las firmas. Es lo que ven tus clientes en cotizaciones y estados de cuenta.',
  },
  'ajustes.fiscal': {
    titulo: 'Tus datos fiscales',
    texto:
      'Tu RFC, razón social, régimen y código postal. Se usan en la hoja de datos de cada cobro para que tu factura salga correcta.',
  },
  'ajustes.visto-bueno': {
    titulo: 'Visto bueno',
    texto:
      'Reglas para que un extra o una orden de compra, desde cierto monto, espere tu aprobación antes de salir.',
  },
  'ajustes.usuarios': {
    titulo: 'Usuarios y roles',
    texto:
      'Quién entra a la empresa y con qué permisos. Desde aquí invitas a tu equipo, cambias roles y revisas el registro de actividad.',
  },
} as const satisfies Record<string, TextoAyuda>;

export type ClaveAyuda = keyof typeof AYUDAS;
