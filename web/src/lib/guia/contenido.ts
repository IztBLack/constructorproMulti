/**
 * Contenido de la Guía: los mazos y sus tarjetas.
 *
 * Cada tarjeta describe una pantalla REAL: los nombres de botones y pestañas
 * salen de las páginas de `app/admin/**` y `app/campo/`. Si cambias una
 * etiqueta en la interfaz, cámbiala aquí también.
 *
 * Las maquetas son solo ejemplo (se pintan con la marca EJEMPLO): nada de esto
 * se guarda. Las anclas (`destino.ancla`) son atributos `data-guia="…"` que
 * existen en la pantalla destino; una prueba revisa que estén en el código.
 *
 * Los ids son estables: el avance guardado se refiere a ellos. Si cambias o
 * quitas uno, sube `VERSION_GUIA`.
 *
 * Datos planos a propósito: el mismo contenido se puede llevar a Flutter.
 */

import type { Mazo } from './tipos';

export const VERSION_GUIA = 1;

/** Las pestañas de una obra se alcanzan desde la lista de obras: se resalta el buscador. */
const A_UNA_OBRA = { href: '/admin/obras', ancla: 'obras-buscar' } as const;

export const MAZOS: readonly Mazo[] = [
  // ── Inicio ────────────────────────────────────────────────────────────────
  {
    clave: 'inicio',
    titulo: 'Cómo funciona tu panel',
    descripcion: 'Lo básico para moverte: el menú, la pantalla de Inicio, el buscador y la app del celular.',
    sello: 'Sello de Cimentación',
    tarjetas: [
      {
        id: 'inicio-menu',
        modulo: null,
        titulo: 'El menú y sus secciones',
        resumen:
          'Arriba está el menú con todo lo que usas a diario, ordenado en Obras, Gente, Dinero y Operación.',
        pasos: [
          'Mira la barra de arriba: ahí están todas las secciones.',
          'Toca una categoría (Obras, Gente, Dinero u Operación) para ver lo que trae.',
          'En el celular, toca «Menú» para abrir todas las secciones.',
          'Toca «Inicio» para regresar a tu panel cuando quieras.',
        ],
        consejo:
          'Si algo no aparece en el menú, puede estar apagado en Ajustes → Módulos. Eso lo decide el administrador.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Menú',
          filas: [
            { principal: 'Obras', detalle: 'Pase de lista, Obras, Cotizaciones, Clientes' },
            { principal: 'Gente', detalle: 'Equipo, Cuadrillas, Proyección' },
            { principal: 'Dinero', detalle: 'Facturación, Compras, Utilidad, Subcontratos' },
            { principal: 'Operación', detalle: 'Garantías, Herramienta, IMSS y papeles' },
          ],
        },
        destino: { href: '/admin', ancla: 'menu' },
      },
      {
        id: 'inicio-indicadores',
        modulo: null,
        titulo: 'La pantalla de Inicio',
        resumen:
          'Es tu tablero: cuántas obras, cotizaciones y gente tienes, el saldo de cada obra y cómo va el dinero del mes.',
        pasos: [
          'Revisa los cuadros de arriba: Obras, Cotizaciones, Colaboradores y Pipeline (lo cotizado que aún no cierras).',
          'Toca un cuadro para ir directo a esa sección.',
          'Baja a «Finanzas» para ver ingresos, egresos y en qué se fue el gasto.',
          'Cambia entre «Mes» y año, o muévete de periodo con las flechas.',
        ],
        maqueta: {
          tipo: 'resumen',
          titulo: 'Finanzas · octubre 2026',
          cifras: [
            { etiqueta: 'Obras', valor: '4', tono: 'neutro' },
            { etiqueta: 'Ingresos', valor: '$186,400.00', tono: 'positivo' },
            { etiqueta: 'Egresos', valor: '$142,750.00', tono: 'negativo' },
            { etiqueta: 'Saldo', valor: '$43,650.00', tono: 'positivo' },
          ],
        },
        destino: { href: '/admin', ancla: 'inicio-indicadores' },
      },
      {
        id: 'inicio-buscar',
        modulo: null,
        titulo: 'Buscar rápido con Ctrl + K',
        resumen:
          'Escribe tres letras y salta a una obra, una persona o una pantalla sin pasar por el menú. Entiende palabras de obra: «raya» te lleva a la nómina.',
        pasos: [
          'Presiona Ctrl + K (en Mac, ⌘ + K) en cualquier pantalla del panel.',
          'Escribe lo que buscas: una obra, una persona o una acción como «nueva cotización».',
          'Muévete con las flechas ↑ ↓ y presiona Enter para abrir.',
          'Presiona Esc para cerrarla.',
        ],
        consejo:
          'Dentro de una obra te ofrece primero las pestañas de ESA obra. Con el campo vacío te enseña lo último que abriste. Solo te lleva a pantallas: nunca borra ni manda nada.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Busca una obra, una persona o una acción…',
          filas: [
            { principal: 'Nueva cotización', detalle: 'Crear' },
            { principal: 'Casa Mendoza', detalle: 'Obra · Col. Del Valle' },
            { principal: 'Juan Pérez', detalle: 'Gente' },
            { principal: 'Proyección de nómina', detalle: 'Ir a' },
          ],
        },
        destino: { href: '/admin' },
      },
      {
        id: 'inicio-descargas',
        modulo: null,
        titulo: 'La app para el celular',
        resumen:
          'Tu gente de campo pasa lista desde el celular, aunque no haya señal. La descargas desde el botón de arriba.',
        pasos: [
          'Toca el botón de descarga en la barra de arriba.',
          'En Android, toca «Descargar» e instala la app.',
          'En iPhone, toca «Abrir». Si dice «Próximamente», todavía no está lista.',
          'Entra con tu cuenta, o en «Vincular empresa» escribe el código que te dio el administrador.',
        ],
        maqueta: {
          tipo: 'lista',
          titulo: 'Descargar la app móvil',
          filas: [
            { principal: 'Android', detalle: 'Celular o tableta', valor: 'Descargar', estado: 'ok' },
            { principal: 'iPhone (iOS)', detalle: 'Apple', valor: 'Abrir', estado: 'ok' },
          ],
        },
        destino: { href: '/admin', ancla: 'descargas' },
      },
      {
        id: 'inicio-tema',
        modulo: null,
        titulo: 'Modo claro u oscuro',
        resumen:
          'Cambia los colores de la pantalla para ver mejor de día o de noche. Solo cambia en este aparato.',
        pasos: [
          'Toca el botón de tema en la barra de arriba para cambiar entre claro y oscuro.',
          'Para que siga el tema de tu celular o computadora, ve a Ajustes → Preferencias y elige «Automático».',
        ],
        maqueta: {
          tipo: 'lista',
          titulo: 'Preferencias · Tema',
          filas: [
            { principal: 'Automático', detalle: 'Sigue el tema de tu dispositivo', estado: 'ok' },
            { principal: 'Claro', detalle: 'Siempre claro' },
            { principal: 'Oscuro', detalle: 'Siempre oscuro' },
          ],
        },
        destino: { href: '/admin', ancla: 'tema' },
      },
      {
        id: 'inicio-ayuda',
        modulo: null,
        titulo: 'Esta guía y el botón de ayuda',
        resumen:
          'Cada tarjeta te explica una parte de la app con un ejemplo y te lleva a la pantalla real. Los ejemplos no se guardan.',
        pasos: [
          'Toca el botón «?» de arriba para abrir la guía cuando quieras.',
          'Voltea la tarjeta para ver los pasos.',
          'Toca «Llévame ahí» y sigue lo que se marca en la pantalla.',
          'Termina un mazo para ganar su sello y subir de rango.',
        ],
        consejo:
          'Tu avance se guarda en este aparato. Lo ves o lo reinicias en Ajustes → Preferencias → Guía de la app.',
        maqueta: {
          tipo: 'resumen',
          titulo: 'Tu avance',
          cifras: [
            { etiqueta: 'Rango', valor: 'Media cuchara', tono: 'neutro' },
            { etiqueta: 'Sellos ganados', valor: '1', tono: 'positivo' },
            { etiqueta: 'Siguiente rango', valor: 'Oficial', tono: 'neutro' },
          ],
        },
        destino: { href: '/admin', ancla: 'ayuda' },
      },
    ],
  },

  // ── Obras ─────────────────────────────────────────────────────────────────
  {
    clave: 'obras',
    titulo: 'Obras',
    descripcion: 'Tus obras, tus clientes, las cotizaciones y lo que pasa cada día en la obra.',
    sello: 'Sello de Obra Negra',
    tarjetas: [
      {
        id: 'obras-crear',
        modulo: 'obras',
        titulo: 'Da de alta una obra',
        resumen:
          'Cada obra junta su dinero, su gente y sus documentos. Es lo primero que registras.',
        pasos: [
          'Toca «+ Nueva obra».',
          'Escribe el nombre. El cliente, la ubicación y la fecha de inicio son opcionales.',
          'Toca «Guardar obra».',
          '¿Ya las tienes en Excel? Toca «Importar de Excel» para subirlas todas de una vez.',
        ],
        consejo: 'Una cotización aceptada también se vuelve obra con su botón «Convertir en obra».',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Nueva obra',
          campos: [
            { etiqueta: 'Nombre', valor: 'Casa Mendoza' },
            { etiqueta: 'Cliente', valor: 'Laura Mendoza Ruiz' },
            { etiqueta: 'Ubicación', valor: 'Col. Del Valle, CDMX' },
            { etiqueta: 'Fecha de inicio', valor: '06/10/2026' },
          ],
          boton: 'Guardar obra',
        },
        destino: { href: '/admin/obras', ancla: 'obras-nueva' },
      },
      {
        id: 'obras-detalle',
        modulo: 'obras',
        titulo: 'El detalle de la obra y sus pestañas',
        resumen:
          'Al abrir una obra ves su estado de cuenta, su presupuesto, su equipo y sus movimientos. Las pestañas de arriba llevan a todo lo demás.',
        pasos: [
          'Busca la obra por nombre, cliente o ubicación y tócala para abrirla.',
          'Usa las pestañas de arriba: Detalle, Asistencia, Nómina, Notas, Extras y las demás que tengas prendidas.',
          'Toca «Editar» junto al nombre para cambiar sus datos.',
          'En la lista, toca el ojo para verla rápido o los tres puntos para ir directo a su nómina, sus notas o su PDF de caja.',
        ],
        consejo:
          'En «Equipo de la obra» asignas a la gente que va a salir en su pase de lista.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Casa Mendoza · pestañas',
          filas: [
            { principal: 'Detalle', detalle: 'Estado de cuenta, presupuesto, equipo y movimientos' },
            { principal: 'Asistencia', detalle: 'El pase de lista de la semana' },
            { principal: 'Nómina', detalle: 'La raya de la semana' },
            { principal: 'Notas', detalle: 'Los tratos con tus maestros' },
            { principal: 'Extras', detalle: 'Lo que el cliente pide aparte' },
          ],
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'obras-clientes',
        modulo: 'obras',
        titulo: 'Tus clientes',
        resumen:
          'Guarda a tus clientes con su correo y teléfono para asignarles obras y cotizaciones.',
        pasos: [
          'Toca «+ Nuevo cliente».',
          'Escribe su nombre. El correo y el teléfono son opcionales.',
          'Toca «Guardar cliente».',
          'Ábrelo para ver sus obras y sus cotizaciones asignadas.',
        ],
        consejo: 'Su correo sirve para que entre al portal del cliente.',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Nuevo cliente',
          campos: [
            { etiqueta: 'Nombre', valor: 'Laura Mendoza Ruiz' },
            { etiqueta: 'Correo', valor: 'laura.mendoza@correo.com' },
            { etiqueta: 'Teléfono', valor: '55 1234 5678' },
          ],
          boton: 'Guardar cliente',
        },
        destino: { href: '/admin/clientes', ancla: 'clientes-nuevo' },
      },
      {
        id: 'portal-acceso',
        modulo: 'portal',
        titulo: 'El portal de tu cliente',
        resumen:
          'Tu cliente entra con su propia cuenta y ve sus cotizaciones y cómo va su obra, sin tener que llamarte.',
        pasos: [
          'En Clientes, abre al cliente.',
          'En «Acceso al portal», toca «Generar código de acceso».',
          'Pásale el código de 6 dígitos: vale 10 minutos.',
          'Dile que cree su cuenta en el portal y escriba el código antes de que venza.',
        ],
        consejo:
          'Cuando ya está vinculado verás «Vinculado» y no necesita otro código. Si el código vence, toca «Generar otro».',
        maqueta: {
          tipo: 'resumen',
          titulo: 'Acceso al portal · Laura Mendoza',
          cifras: [
            { etiqueta: 'Código de acceso', valor: '482 913', tono: 'neutro' },
            { etiqueta: 'Vence en', valor: '10 minutos', tono: 'neutro' },
          ],
        },
        destino: { href: '/admin/clientes' },
      },
      {
        id: 'cotizaciones-crear',
        modulo: 'cotizaciones',
        titulo: 'Haz una cotización',
        resumen:
          'Arma la cotización con tus precios, por secciones y partidas, y sácala en PDF para mandarla.',
        pasos: [
          'Toca «+ Nueva cotización».',
          'Elige al cliente, ponle nombre al proyecto y toca «Crear cotización».',
          'Toca «+ Agregar sección» (por ejemplo, Cimentación) y adentro «+ Agregar partida».',
          'Busca el concepto en tu catálogo para que el precio se llene solo.',
          'Toca «Ver PDF» para descargarlo o imprimirlo.',
        ],
        consejo:
          'Si ya tienes las partidas escritas, usa «Importar texto» y pégalas de un jalón, una por renglón.',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Nueva cotización',
          campos: [
            { etiqueta: 'Cliente', valor: 'Laura Mendoza Ruiz' },
            { etiqueta: 'Nombre del proyecto', valor: 'Ampliación de recámara' },
            { etiqueta: 'Ubicación', valor: 'Col. Del Valle, CDMX' },
            { etiqueta: 'Descuento (%)', valor: '0' },
            { etiqueta: 'Aplicar IVA (16%)', valor: 'Sí' },
          ],
          boton: 'Crear cotización',
        },
        destino: { href: '/admin/cotizaciones', ancla: 'cotizaciones-nueva' },
      },
      {
        id: 'cotizaciones-seguimiento',
        modulo: 'cotizaciones',
        titulo: 'De cotización a obra',
        resumen:
          'Cada cotización lleva su estado: Borrador, Enviada, Aceptada o Rechazada. Cuando te la aceptan, la vuelves obra con un toque.',
        pasos: [
          'Abre la cotización y toca «Enviar al cliente».',
          'Cuando te conteste, toca «Marcar aceptada» o «Marcar rechazada».',
          'Si la aceptó, toca «Convertir en obra».',
          'Usa «Duplicar» para hacer otra parecida sin empezar de cero.',
        ],
        consejo: '«Ajustar precios» sube o baja todas las partidas por porcentaje.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Cotizaciones',
          filas: [
            { principal: 'Ampliación de recámara', detalle: 'Laura Mendoza · Aceptada', valor: '$86,420.00', estado: 'ok' },
            { principal: 'Barda perimetral', detalle: 'Roberto Salas · Enviada', valor: '$48,500.00', estado: 'pendiente' },
            { principal: 'Losa de azotea', detalle: 'Ana Torres · Rechazada', valor: '$132,800.00', estado: 'alerta' },
          ],
        },
        destino: { href: '/admin/cotizaciones' },
      },
      {
        id: 'equipo-pase-lista',
        modulo: 'equipo',
        titulo: 'El pase de lista del día',
        resumen:
          'Marca quién vino hoy en todas tus obras desde una sola pantalla. Funciona en el celular y aunque se vaya la señal.',
        pasos: [
          'Revisa el día de arriba. Usa las flechas para ir a otro día.',
          'A cada persona márcale Falta, Medio, Tres cuartos o Completo.',
          'Si todos vinieron, toca «Todos ✓» y luego «Confirmar».',
          'Si llega alguien nuevo, toca «+» en su obra, escribe su nombre y toca «Crear y agregar».',
        ],
        consejo:
          'Sin señal, lo que marques queda «por enviar» y se sube solo cuando regresa la conexión.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Casa Mendoza · martes 6 de octubre',
          filas: [
            { principal: 'Juan Pérez', detalle: 'Albañil', valor: 'Completo', estado: 'ok' },
            { principal: 'Martín Cruz', detalle: 'Cabo', valor: 'Completo', estado: 'ok' },
            { principal: 'Pedro Ramírez', detalle: 'Ayudante', valor: 'Medio', estado: 'pendiente' },
            { principal: 'Luis Hernández', detalle: 'Fierrero', valor: 'Falta', estado: 'alerta' },
          ],
        },
        destino: { href: '/campo', ancla: 'campo-dia' },
      },
      {
        id: 'estimaciones-avance',
        modulo: 'estimaciones',
        titulo: 'Anota el avance de la obra',
        resumen:
          'Lleva cuánto se ha hecho de cada partida del presupuesto. De ahí salen tus estimaciones.',
        pasos: [
          'Abre la obra y entra a la pestaña «Avance».',
          'En la partida, toca «Anotar avance».',
          'Elige cómo lo anotas: lo que se hizo, lo que llevan en total o el porcentaje.',
          'Escribe cómo se midió (ejes o medidas) y toca «Guardar avance».',
        ],
        consejo:
          'La obra necesita su presupuesto por partidas. Lo que pongas en «Cómo se midió» sirve de número generador.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Avance físico de la obra',
          filas: [
            { principal: 'Cimentación', detalle: '48 de 48 m³', valor: '100 %', estado: 'ok' },
            { principal: 'Muro de block 15 cm', detalle: '120 de 210 m²', valor: '57 %', estado: 'pendiente' },
            { principal: 'Losa de azotea', detalle: '0 de 95 m²', valor: '0 %', estado: 'pendiente' },
          ],
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'bitacora-entrada',
        modulo: 'bitacora',
        titulo: 'Bitácora con fotos',
        resumen:
          'Apunta lo que pasa cada día en la obra, con fotos y fecha, para tener evidencia si algún día la necesitas.',
        pasos: [
          'Abre la obra y entra a la pestaña «Bitácora».',
          'Toca «Nueva entrada» y elige el día, el tipo y el clima.',
          'Escribe qué pasó y toca «Traer del pase de lista» para anotar quién estuvo.',
          'Agrega fotos y, si quieres, marca «Que el cliente la vea en su portal».',
          'Toca «Guardar entrada».',
        ],
        consejo: 'Con «PDF del periodo» sacas la bitácora de las fechas que elijas.',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Nueva entrada',
          campos: [
            { etiqueta: 'Día', valor: '06/10/2026' },
            { etiqueta: 'Tipo', valor: 'Avance' },
            { etiqueta: 'Clima', valor: 'Soleado' },
            { etiqueta: '¿Qué pasó?', valor: 'Se coló la losa del eje 3. Llegaron 8 m³ de concreto.' },
            { etiqueta: 'Personal presente', valor: '6 personas' },
          ],
          boton: 'Guardar entrada',
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'programa-obra',
        modulo: 'programa',
        titulo: 'Programa de obra',
        resumen:
          'Ponle fecha de inicio y de fin a cada partida y ve de un vistazo qué va atrasado.',
        pasos: [
          'Abre la obra y entra a la pestaña «Programa».',
          'Toca «Traer partidas del presupuesto» para no escribirlas a mano.',
          'O toca «Agregar partida» y elige cuándo empieza y cuándo termina.',
          'Ajusta las fechas con «Editar» y revisa cuáles dicen «Atrasada» o «Va atrás».',
        ],
        maqueta: {
          tipo: 'lista',
          titulo: 'Programa · Casa Mendoza',
          filas: [
            { principal: 'Cimentación', detalle: '1 al 10 de octubre', valor: 'Terminada', estado: 'ok' },
            { principal: 'Muros', detalle: '11 al 31 de octubre', valor: 'Va atrás', estado: 'alerta' },
            { principal: 'Losa de azotea', detalle: '1 al 15 de noviembre', valor: 'Por empezar', estado: 'pendiente' },
          ],
        },
        destino: A_UNA_OBRA,
      },
    ],
  },

  // ── Gente ─────────────────────────────────────────────────────────────────
  {
    clave: 'gente',
    titulo: 'Gente',
    descripcion: 'Tu equipo con su sueldo, tus cuadrillas y la raya de cada semana.',
    sello: 'Sello de Cuadrilla',
    tarjetas: [
      {
        id: 'equipo-alta',
        modulo: 'equipo',
        titulo: 'Da de alta a tu gente',
        resumen:
          'Registra a cada trabajador con su puesto, cómo se le paga y su sueldo. Con eso la raya sale sola.',
        pasos: [
          'Toca «+ Nuevo colaborador».',
          'Escribe su nombre y elige su puesto y si se le paga por día o por destajo.',
          'Si ya va a entrar a una obra, elígela en «Asignar a obra».',
          'Pon su sueldo o déjalo vacío para usar el salario del puesto, y toca «Guardar colaborador».',
        ],
        consejo: 'Si te sale el aviso de que a alguien le faltan datos, tócalo para ver solo a esas personas.',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Nuevo colaborador',
          campos: [
            { etiqueta: 'Nombre', valor: 'Juan Pérez López' },
            { etiqueta: 'Puesto', valor: 'Albañil' },
            { etiqueta: 'Tipo de pago', valor: 'Por día' },
            { etiqueta: 'Sueldo semanal (MXN)', valor: '$2,100.00' },
            { etiqueta: 'Asignar a obra', valor: 'Casa Mendoza' },
          ],
          boton: 'Guardar colaborador',
        },
        destino: { href: '/admin/equipo', ancla: 'equipo-nuevo' },
      },
      {
        id: 'equipo-raya',
        modulo: 'equipo',
        titulo: 'La raya del viernes',
        resumen:
          'La nómina de cada obra se arma sola con el pase de lista y los destajos de la semana.',
        pasos: [
          'Abre la obra y entra a la pestaña «Nómina».',
          'Muévete de semana con «← Anterior» y «Siguiente →».',
          'Revisa el total y el detalle por colaborador.',
          'Toca «Ver PDF» para imprimir la lista de raya.',
          'Toca «Registrar nómina en caja» para que el pago quede como salida de la obra.',
        ],
        consejo:
          'A quien cobra por destajo le agregas sus trabajos abajo, en «Destajos por colaborador».',
        maqueta: {
          tipo: 'resumen',
          titulo: 'Nómina · semana del 5 al 11 de octubre',
          cifras: [
            { etiqueta: 'Total de nómina de la semana', valor: '$18,650.00', tono: 'neutro' },
            { etiqueta: 'Por día', valor: '$14,700.00', tono: 'neutro' },
            { etiqueta: 'Por destajo', valor: '$3,950.00', tono: 'neutro' },
          ],
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'cuadrillas-armar',
        modulo: 'cuadrillas',
        titulo: 'Arma tus cuadrillas',
        resumen:
          'Agrupa a tu gente en cuadrillas con su cabo y mándalas a la obra de un jalón.',
        pasos: [
          'Toca «+ Nueva cuadrilla», ponle nombre y especialidad, y toca «Guardar cuadrilla».',
          'Ábrela, elige a los colaboradores y toca «Agregar».',
          'Toca «Hacer cabo» en quien la dirige.',
          'Asígnale sus obras y toca «Mandar equipo» para que todos salgan en el pase de lista.',
        ],
        maqueta: {
          tipo: 'lista',
          titulo: 'Cuadrilla de Enrique · Albañilería',
          filas: [
            { principal: 'Enrique Soto', detalle: 'Cabo', estado: 'ok' },
            { principal: 'Marcos Díaz', detalle: 'Oficial albañil' },
            { principal: 'Pedro Ramírez', detalle: 'Ayudante' },
            { principal: 'Obra: Casa Mendoza', detalle: 'Equipo mandado', estado: 'ok' },
          ],
        },
        destino: { href: '/admin/cuadrillas', ancla: 'cuadrillas-nueva' },
      },
      {
        id: 'cuadrillas-destajo',
        modulo: 'cuadrillas',
        titulo: 'Destajo por cuadrilla',
        resumen:
          'Paga un trabajo a destajo a toda la cuadrilla y reparte la bolsa entre sus miembros.',
        pasos: [
          'Abre la cuadrilla y toca «Registrar destajo».',
          'Elige la obra y escribe el total de la bolsa y el concepto.',
          'Reparte entre los miembros, o toca «Partes iguales».',
          'Toca «Guardar reparto».',
        ],
        maqueta: {
          tipo: 'resumen',
          titulo: 'Destajo: colado de losa',
          cifras: [
            { etiqueta: 'Total de la bolsa', valor: '$12,000.00', tono: 'neutro' },
            { etiqueta: 'Enrique Soto', valor: '$4,000.00' },
            { etiqueta: 'Marcos Díaz', valor: '$4,000.00' },
            { etiqueta: 'Pedro Ramírez', valor: '$4,000.00' },
          ],
        },
        destino: { href: '/admin/cuadrillas' },
      },
      {
        id: 'proyeccion-raya',
        modulo: 'proyeccion',
        titulo: 'Proyección de la raya',
        resumen:
          'Calcula cuánto vas a pagar de raya en la semana, persona por persona. Es un escenario: no toca el pase de lista.',
        pasos: [
          'Llena los días de un jalón con «Completa L–S», «Según sus días», «Sin sábado» o «Con domingo».',
          'Toca la casilla de una persona para quitarle o ponerle un día; toca el nombre del día para todos.',
          'Con «Participantes» sacas o metes gente solo para esta cuenta.',
          'Toca «PDF de la proyección» para compartirla.',
        ],
        maqueta: {
          tipo: 'resumen',
          titulo: 'Proyección · semana del 12 al 18 de octubre',
          cifras: [
            { etiqueta: 'Personas', valor: '23', tono: 'neutro' },
            { etiqueta: 'Días-hombre', valor: '126', tono: 'neutro' },
            { etiqueta: 'Raya esperada', valor: '$52,300.00', tono: 'negativo' },
          ],
        },
        destino: { href: '/admin/proyeccion', ancla: 'proyeccion-rellenar' },
        roles: ['admin', 'supervisor', 'contador'],
      },
    ],
  },

  // ── Dinero ────────────────────────────────────────────────────────────────
  {
    clave: 'dinero',
    titulo: 'Dinero',
    descripcion: 'Lo que entra y sale de cada obra, los tratos, los extras, las compras y lo que te deja cada obra.',
    sello: 'Sello de Estimación',
    tarjetas: [
      {
        id: 'caja-movimientos',
        modulo: 'caja',
        titulo: 'La caja de la obra',
        resumen:
          'Apunta todo lo que entra y sale de cada obra: anticipos, pagos, material, raya. Así sabes cuánto te han pagado y cuánto falta.',
        pasos: [
          'Abre la obra. Abajo está «Movimientos».',
          'Toca «Registrar movimiento».',
          'Elige Entrada o Salida, la fecha, el concepto y el monto.',
          'Si es salida, elige en qué se gastó para saber cuánto te deja la obra.',
          'Toca «Registrar movimiento» para guardarlo.',
        ],
        consejo: 'A cada movimiento le puedes adjuntar la foto del comprobante.',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Registrar movimiento',
          campos: [
            { etiqueta: 'Tipo', valor: 'Entrada' },
            { etiqueta: 'Fecha', valor: '02/10/2026' },
            { etiqueta: 'Concepto / Categoría', valor: 'Anticipo construcción' },
            { etiqueta: 'Nombre', valor: 'Laura Mendoza' },
            { etiqueta: 'Monto (MXN)', valor: '$48,500.00' },
          ],
          boton: 'Registrar movimiento',
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'caja-estado-cuenta',
        modulo: 'caja',
        titulo: 'Estado de cuenta y PDF de caja',
        resumen:
          'En cada obra ves cuánto cuesta, cuánto te han pagado y cuánto falta. De ahí sacas el PDF de caja y el estado de cuenta para tu cliente.',
        pasos: [
          'Abre la obra y revisa «Estado de cuenta».',
          'Toca «Ver PDF» para el PDF de caja, o «Exportar a Excel» para tu contadora.',
          'Toca «Importar movimientos» para subir el estado de cuenta del banco.',
          'Para tu cliente: en la lista de obras, tres puntos → «Estado de cuenta del cliente».',
        ],
        maqueta: {
          tipo: 'resumen',
          titulo: 'Casa Mendoza · Estado de cuenta',
          cifras: [
            { etiqueta: 'Costo total', valor: '$620,000.00', tono: 'neutro' },
            { etiqueta: 'Recibido', valor: '$410,000.00', tono: 'positivo' },
            { etiqueta: 'Pendiente', valor: '$210,000.00', tono: 'negativo' },
          ],
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'notas-tratos',
        modulo: 'notas',
        titulo: 'Tratos con maestros y socios',
        resumen:
          'Las cuentas de palabra con tus maestros: lo acordado, lo pagado y lo que falta. Como la nota de papel, pero sin perderla.',
        pasos: [
          'Abre la obra y entra a la pestaña «Notas».',
          'Toca «+ Nueva nota», escribe a nombre de quién y toca «Crear y capturar».',
          'Toca «+ Agregar renglón»: conceptos que suman, deducciones que restan y pagos.',
          'O toca «Pegar mensaje» y pega el WhatsApp del maestro para que se llene sola.',
          'Revisa el saldo y toca «Ver PDF para compartir».',
        ],
        maqueta: {
          tipo: 'lista',
          titulo: 'Nota · Orlando Ramos · MZ 2 LT 1',
          filas: [
            { principal: 'Base de tinacos', detalle: 'Concepto', valor: '$6,500.00' },
            { principal: 'Pretil y recorte de puertas', detalle: 'Concepto', valor: '$9,800.00' },
            { principal: 'Pago del viernes', detalle: 'Pago', valor: '-$8,000.00', estado: 'ok' },
            { principal: 'Saldo', valor: '$8,300.00', estado: 'pendiente' },
          ],
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'cambios-extras',
        modulo: 'cambios',
        titulo: 'Extras que pide el cliente',
        resumen:
          'Cuando el cliente pide algo que no estaba en el presupuesto, apúntalo con su precio, que él lo apruebe, y se suma a lo que te debe.',
        pasos: [
          'Abre la obra y entra a la pestaña «Extras».',
          'Toca «Nuevo extra», di de qué es y toca «Crear y agregar conceptos».',
          'Agrega cada concepto con su unidad, cantidad y precio.',
          'Toca «Enviar al cliente»: lo ve en su portal para aprobarlo. Si no usa el portal, mándale el PDF por WhatsApp.',
        ],
        consejo:
          'Ya enviado no se puede cambiar. Si hay que corregirlo, se cancela y se hace otro.',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Nuevo extra',
          campos: [
            { etiqueta: '¿De qué es el extra?', valor: 'Barda en la azotea' },
            { etiqueta: '¿Por qué se hace?', valor: 'Lo pidió el cliente' },
            { etiqueta: 'Fecha', valor: '08/10/2026' },
          ],
          boton: 'Crear y agregar conceptos',
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'estimaciones-cobrar',
        modulo: 'estimaciones',
        titulo: 'Cobra por estimaciones',
        resumen:
          'Cobra lo que se hizo en el periodo al precio pactado, descontando anticipo y fondo de garantía.',
        pasos: [
          'Abre la obra y entra a la pestaña «Estimaciones».',
          'Revisa «Condiciones del contrato»: anticipo, amortización, fondo de garantía e IVA.',
          'Toca «Nueva estimación», elige las fechas y toca «Crear con lo hecho».',
          'Revisa las cuentas y toca «Enviar al cliente».',
          'Toca «PDF con generadores» para entregarla.',
        ],
        consejo: 'Lo que se cobra sale del avance anotado en la pestaña «Avance».',
        maqueta: {
          tipo: 'resumen',
          titulo: 'Estimación 3 · del 1 al 15 de octubre',
          cifras: [
            { etiqueta: 'Lo hecho en el periodo', valor: '$145,000.00', tono: 'neutro' },
            { etiqueta: 'Amortización del anticipo', valor: '-$43,500.00', tono: 'negativo' },
            { etiqueta: 'Fondo de garantía (5 %)', valor: '-$7,250.00', tono: 'negativo' },
            { etiqueta: 'A pagar', valor: '$94,250.00', tono: 'positivo' },
          ],
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'compras-pedir',
        modulo: 'compras',
        titulo: 'Pide material desde la obra',
        resumen:
          'Desde la obra se pide lo que falta, y la oficina lo aprueba y lo compra. Nada de papelitos.',
        pasos: [
          'Abre la obra y entra a la pestaña «Material».',
          'Toca «+ Pedir material».',
          'Escribe cada material con su cantidad y unidad. Usa «+ Otro material» para agregar más.',
          'Di para cuándo se necesita y toca «Enviar requisición».',
          'En «Por llegar» ves lo que ya se compró y falta que llegue.',
        ],
        maqueta: {
          tipo: 'formulario',
          titulo: 'Pedir material',
          campos: [
            { etiqueta: 'Material 1', valor: 'Cemento gris 50 kg' },
            { etiqueta: 'Cantidad', valor: '40' },
            { etiqueta: 'Unidad', valor: 'bulto' },
            { etiqueta: '¿Para cuándo se necesita?', valor: '09/10/2026' },
          ],
          boton: 'Enviar requisición',
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'compras-mesa',
        modulo: 'compras',
        titulo: 'La mesa de compras',
        resumen:
          'Aquí ves lo que piden en obra, lo que se compra, lo que llega y lo que les debes a tus proveedores.',
        pasos: [
          'Revisa los números de arriba: por aprobar, por comprar, órdenes abiertas y por pagar.',
          'En «Requisiciones por aprobar», toca «Aprobar» o «Rechazar».',
          'Toca «Armar órdenes de compra», elige proveedor y precio, y abre la orden para «Emitir orden».',
          'Cuando llegue, abre la orden y toca «Registrar lo que llegó» con la foto de la remisión.',
          'Toca «Registrar pago» para abonarle al proveedor.',
        ],
        consejo: 'Con «Materiales» y «Proveedores» llevas tu lista de precios y los días de crédito.',
        maqueta: {
          tipo: 'resumen',
          titulo: 'Compras',
          cifras: [
            { etiqueta: 'Por aprobar', valor: '3', tono: 'neutro' },
            { etiqueta: 'Materiales por comprar', valor: '12', tono: 'neutro' },
            { etiqueta: 'Órdenes abiertas', valor: '4', tono: 'neutro' },
            { etiqueta: 'Por pagar', valor: '$38,920.00', tono: 'negativo' },
          ],
        },
        destino: { href: '/admin/compras', ancla: 'compras-resumen' },
      },
      {
        id: 'rentabilidad-obras',
        modulo: 'rentabilidad',
        titulo: 'Ganancia por obra',
        resumen:
          'Cuánto te está dejando cada obra: lo contratado contra lo que llevas gastado, y cómo va a terminar.',
        pasos: [
          'Revisa cada obra: contratado, gastado, utilidad y margen al terminar.',
          'Las que necesitan atención salen primero.',
          'Para ver en qué se fue el dinero, abre la obra y entra a su pestaña «Utilidad».',
        ],
        consejo:
          'Para que cuente bien, di en qué se gastó cada salida de caja. El margen objetivo se cambia en Ajustes → Operación.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Utilidad por obra',
          filas: [
            { principal: 'Casa Mendoza', detalle: 'Contratado $620,000.00', valor: '18 %', estado: 'ok' },
            { principal: 'Bodega Iztapalapa', detalle: 'Contratado $1,250,000.00', valor: '9 %', estado: 'pendiente' },
            { principal: 'Local Coyoacán', detalle: 'Contratado $340,000.00', valor: '-4 %', estado: 'alerta' },
          ],
        },
        destino: { href: '/admin/rentabilidad', ancla: 'rentabilidad-tabla' },
        roles: ['admin', 'contador'],
      },
      {
        id: 'fiscal-facturacion',
        modulo: 'fiscal',
        titulo: 'Datos para facturar',
        resumen:
          'Junta lo que necesitas de cada cobro para facturarlo y arma el paquete del mes para tu contador. La app no factura ni se conecta al SAT.',
        pasos: [
          'En «Por facturar», abre un cobro y toca «Copiar todo» para pasarlo a tu sistema de facturas.',
          'Ya timbrada, toca «Subir XML» o pega el folio fiscal.',
          'Si un cobro no lleva factura, toca «No requiere factura».',
          'Elige el mes y toca «Descargar paquete» para mandárselo a tu contador.',
        ],
        consejo: 'Tu RFC, razón social y régimen van en Ajustes → Datos para facturar.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Por facturar',
          filas: [
            { principal: 'Anticipo · Casa Mendoza', detalle: '02/10/2026', valor: '$48,500.00', estado: 'pendiente' },
            { principal: 'Estimación 3 · Bodega Iztapalapa', detalle: '15/10/2026', valor: '$94,250.00', estado: 'pendiente' },
            { principal: 'Pago final · Local Coyoacán', detalle: 'Facturado', valor: '$62,000.00', estado: 'ok' },
          ],
        },
        destino: { href: '/admin/facturacion', ancla: 'facturacion-paquete' },
        roles: ['admin', 'contador'],
      },
      {
        id: 'subcontratos-contrato',
        modulo: 'subcontratos',
        titulo: 'Contratos de subcontrato',
        resumen:
          'Pasa a papel el trato con un subcontratista: alcance, monto, fondo de garantía y pagos, con su PDF.',
        pasos: [
          'Toca «Nuevo contrato», elige la obra y al subcontratista, y toca «Crear contrato».',
          'Llena el alcance, el monto, el fondo de garantía y la forma de pago, y toca «Guardar datos».',
          'Registra cada pago con «Registrar pago». Puede salir también de la caja de la obra.',
          'Toca «Ver PDF del contrato» para firmarlo.',
        ],
        consejo: 'Si ya tienes el trato en una nota, ábrela y toca «Convertir en contrato».',
        maqueta: {
          tipo: 'resumen',
          titulo: 'Impermeabilizaciones Ruiz · Casa Mendoza',
          cifras: [
            { etiqueta: 'Contratado', valor: '$85,000.00', tono: 'neutro' },
            { etiqueta: 'Pagado', valor: '$40,000.00', tono: 'positivo' },
            { etiqueta: 'Retenido (garantía)', valor: '$2,000.00', tono: 'neutro' },
            { etiqueta: 'Por pagar', valor: '$43,000.00', tono: 'negativo' },
          ],
        },
        destino: { href: '/admin/subcontratos', ancla: 'subcontratos-nuevo' },
      },
    ],
  },

  // ── Operación ─────────────────────────────────────────────────────────────
  {
    clave: 'operacion',
    titulo: 'Operación',
    descripcion: 'Garantías, herramienta, seguridad en la obra y los papeles del IMSS.',
    sello: 'Sello de Acabados',
    tarjetas: [
      {
        id: 'postventa-garantias',
        modulo: 'postventa',
        titulo: 'Garantías',
        resumen:
          'Tu cliente reporta un problema desde su portal después de entregar, y tú le das seguimiento sin perder el hilo.',
        pasos: [
          'En «Reportes», abre el que llegó.',
          'Cambia su estado: En revisión, Visita programada, Resuelto o No procede.',
          'Escribe la respuesta (el cliente la lee tal cual) y toca «Guardar seguimiento».',
          'Si te lo reportan por teléfono, toca «Registrar reporte».',
        ],
        consejo: 'En «Garantía por obra» anotas cuándo se entregó y cuántos meses cubre.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Reportes',
          filas: [
            { principal: 'Humedad en el baño de arriba', detalle: 'Casa Mendoza', valor: 'Recibido', estado: 'pendiente' },
            { principal: 'Puerta que no cierra', detalle: 'Depto. Narvarte', valor: 'Visita programada', estado: 'pendiente' },
            { principal: 'Fisura en la barda', detalle: 'Local Coyoacán', valor: 'Resuelto', estado: 'ok' },
          ],
        },
        destino: { href: '/admin/postventa', ancla: 'postventa-registrar' },
        roles: ['admin', 'supervisor', 'contador', 'residente'],
      },
      {
        id: 'herramienta-inventario',
        modulo: 'herramienta',
        titulo: 'Herramienta y maquinaria',
        resumen:
          'Qué herramienta tienes, en qué obra está y quién la trae, para que no se pierda.',
        pasos: [
          'Toca «Nueva herramienta», dale nombre, tipo y estado, y toca «Guardar».',
          'Para mandarla a una obra, toca «Prestar o asignar» y elige la obra y al responsable.',
          'Cuando regrese, toca «Registrar regreso» y di cómo volvió.',
          'Revisa arriba las prestadas, las vencidas y las que están en reparación.',
        ],
        maqueta: {
          tipo: 'lista',
          titulo: 'Herramienta',
          filas: [
            { principal: 'Revolvedora de 1 saco', detalle: 'Casa Mendoza · Juan Pérez', valor: 'Prestada', estado: 'ok' },
            { principal: 'Rotomartillo', detalle: 'Debía regresar el 3 de octubre', valor: 'Vencida', estado: 'alerta' },
            { principal: 'Andamio de 10 cuerpos', detalle: 'Bodega', valor: 'En reparación', estado: 'pendiente' },
          ],
        },
        destino: { href: '/admin/herramienta', ancla: 'herramienta-nueva' },
        roles: ['admin', 'supervisor', 'contador', 'residente'],
      },
      {
        id: 'seguridad-revision',
        modulo: 'seguridad',
        titulo: 'Seguridad en la obra',
        resumen:
          'La revisión diaria de casco, botas y protecciones, y el registro de accidentes, para cuidar a tu gente y tener comprobante.',
        pasos: [
          'Abre la obra y entra a la pestaña «Seguridad».',
          'En «Revisión de hoy», recorre la obra y marca cada punto: Sí cumple, No cumple o No aplica.',
          'Toca «Guardar revisión».',
          'Si pasa un accidente, toca «Registrar incidente» y anota qué fue y a quién le pasó.',
        ],
        consejo:
          'Un accidente de trabajo se avisa al IMSS (formato ST-7). Arriba ves cuántos avisos te faltan.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Revisión de hoy',
          filas: [
            { principal: 'Todos traen casco', valor: 'Sí cumple', estado: 'ok' },
            { principal: 'Todos traen calzado de seguridad', valor: 'Sí cumple', estado: 'ok' },
            { principal: 'Bordes de losa y huecos protegidos', valor: 'No cumple', estado: 'alerta' },
            { principal: 'Quien trabaja en altura usa arnés', valor: 'No aplica' },
          ],
        },
        destino: A_UNA_OBRA,
      },
      {
        id: 'cumplimiento-imss',
        modulo: 'cumplimiento',
        titulo: 'IMSS, SIROC y REPSE',
        resumen:
          'Te recuerda lo que toca con el IMSS y guarda tus comprobantes para que no te multen. El trámite lo haces tú o tu contador.',
        pasos: [
          'En «Registro de obras (SIROC)», revisa cuántos días te quedan para registrar cada obra.',
          'En «Tu registro REPSE», anota tu folio y hasta cuándo está vigente.',
          'En «Expediente de subcontratistas», toca «Nuevo subcontratista» y guarda sus papeles.',
          'En «Para tu contador», elige las fechas y toca «Descargar raya en Excel».',
        ],
        maqueta: {
          tipo: 'lista',
          titulo: 'IMSS y papeles',
          filas: [
            { principal: 'SIROC · Casa Mendoza', detalle: 'Te quedan 3 días hábiles', estado: 'alerta' },
            { principal: 'REPSE', detalle: 'Vigente hasta marzo de 2028', estado: 'ok' },
            { principal: 'ICSOE y SISUB', detalle: 'Entrega a más tardar el 17 de enero', estado: 'pendiente' },
          ],
        },
        destino: { href: '/admin/cumplimiento', ancla: 'cumplimiento-subcontratista' },
        roles: ['admin', 'contador'],
      },
    ],
  },

  // ── Ajustes ───────────────────────────────────────────────────────────────
  {
    clave: 'ajustes',
    titulo: 'Ajustes',
    descripcion: 'Tu cuenta, lo que usa tu empresa, cómo salen tus PDF, quién entra y tus listas de precios.',
    sello: 'Sello de Entrega',
    tarjetas: [
      {
        id: 'ajustes-cuenta',
        modulo: null,
        titulo: 'Tu cuenta y tu contraseña',
        resumen: 'Cambia tu nombre, tu correo o tu contraseña. Solo te afecta a ti.',
        pasos: [
          'En «Mi cuenta», cambia tu nombre y toca «Guardar nombre».',
          'Para cambiar tu correo, escribe el nuevo y toca «Enviar confirmación».',
          'En «Seguridad», escribe tu contraseña actual y la nueva dos veces.',
          'Toca «Cambiar contraseña».',
        ],
        maqueta: {
          tipo: 'formulario',
          titulo: 'Contraseña',
          campos: [
            { etiqueta: 'Contraseña actual', valor: '••••••••' },
            { etiqueta: 'Contraseña nueva', valor: '••••••••' },
            { etiqueta: 'Repite la contraseña nueva', valor: '••••••••' },
          ],
          boton: 'Cambiar contraseña',
        },
        destino: { href: '/admin/ajustes' },
      },
      {
        id: 'ajustes-modulos',
        modulo: null,
        titulo: 'Prende y apaga módulos',
        resumen:
          'Elige qué partes de la app usa tu empresa. Lo apagado se esconde del menú de todos, pero tus datos se conservan.',
        pasos: [
          'En Ajustes, baja a «Módulos».',
          'Toca el interruptor de un módulo para prenderlo o apagarlo.',
          'Si al apagar te avisa que también se apagan otros, confirma con «Sí, apagarlo».',
        ],
        consejo:
          'Algunos módulos necesitan otro: al prenderlos, se prende solo el que hace falta. Si lo vuelves a prender, todo aparece como lo dejaste.',
        maqueta: {
          tipo: 'lista',
          titulo: 'Módulos',
          filas: [
            { principal: 'Obras y clientes', valor: 'Siempre prendido', estado: 'ok' },
            { principal: 'Cotizaciones y presupuesto', valor: 'Prendido', estado: 'ok' },
            { principal: 'Bitácora con fotos', valor: 'Prendido', estado: 'ok' },
            { principal: 'Compras y material', valor: 'Apagado', estado: 'pendiente' },
          ],
        },
        destino: { href: '/admin/ajustes' },
        roles: ['admin'],
      },
      {
        id: 'ajustes-empresa-pdf',
        modulo: null,
        titulo: 'Tu empresa y tus PDF',
        resumen:
          'El nombre de tu constructora y cómo salen tus documentos: contacto, color, pie de página y firmas. Lo ven tus clientes.',
        pasos: [
          'En «Empresa», cambia el nombre de tu constructora y toca «Guardar nombre».',
          'En «Operación» → «IVA por defecto», elige el IVA de las cotizaciones nuevas y toca «Guardar IVA».',
          'En «Documentos», pon tu contacto, el color de acento, el pie de página y las firmas.',
          'Revisa la vista previa y toca «Guardar personalización».',
        ],
        maqueta: {
          tipo: 'formulario',
          titulo: 'Documentos',
          campos: [
            { etiqueta: 'Contacto de la empresa', valor: '55 1234 5678 · contacto@constructora.mx' },
            { etiqueta: 'Color de acento', valor: 'Azul' },
            { etiqueta: 'Pie de página', valor: 'Precios vigentes por 15 días' },
            { etiqueta: 'Firma izquierda', valor: 'El constructor' },
            { etiqueta: 'Firma derecha', valor: 'El cliente' },
          ],
          boton: 'Guardar personalización',
        },
        destino: { href: '/admin/ajustes' },
        roles: ['admin'],
      },
      {
        id: 'ajustes-usuarios',
        modulo: null,
        titulo: 'Invita a tu equipo de oficina',
        resumen:
          'Dale acceso a tu supervisor, residente, contadora o socio. Cada quien entra con su cuenta y ve lo que le toca.',
        pasos: [
          'Toca «Invitar persona».',
          'Escribe su nombre y elige su rol.',
          'Toca «Generar código» y díctaselo por teléfono o WhatsApp. Vale 72 horas y sirve una sola vez.',
          'Para un socio, elige «Socio», escribe su correo y toca «Enviar invitación».',
        ],
        consejo: 'A esta pantalla llegas desde Ajustes → Usuarios → «Administrar usuarios».',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Invitar a la empresa',
          campos: [
            { etiqueta: 'Nombre de la persona', valor: 'Ing. Carlos Ruiz' },
            { etiqueta: 'Rol', valor: 'Residente de obra' },
          ],
          boton: 'Generar código',
        },
        destino: { href: '/admin/usuarios', ancla: 'usuarios-invitar' },
        roles: ['admin'],
      },
      {
        id: 'ajustes-catalogo',
        modulo: 'cotizaciones',
        titulo: 'Tu lista de precios',
        resumen:
          'Los conceptos que usas siempre, con su unidad y su precio. Al cotizar los buscas y se llenan solos.',
        pasos: [
          'Toca «Nuevo concepto».',
          'Escribe la descripción, la unidad y el precio unitario; la clave y la categoría son opcionales.',
          'Toca «Guardar concepto».',
          'Para empezar con uno ya hecho, toca «Cargar catálogo oficial».',
        ],
        consejo: 'Llegas aquí desde Ajustes → Operación → Catálogos, o con Ctrl + K.',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Nuevo concepto',
          campos: [
            { etiqueta: 'Descripción', valor: 'Muro de block 15 cm' },
            { etiqueta: 'Clave', valor: 'MUR-015' },
            { etiqueta: 'Categoría', valor: 'Albañilería' },
            { etiqueta: 'Unidad', valor: 'm2' },
            { etiqueta: 'Precio unitario (MXN)', valor: '$385.00' },
          ],
          boton: 'Guardar concepto',
        },
        destino: { href: '/admin/catalogo', ancla: 'catalogo-nuevo' },
        roles: ['admin', 'supervisor', 'contador'],
      },
      {
        id: 'ajustes-puestos',
        modulo: 'equipo',
        titulo: 'Puestos y salarios',
        resumen:
          'Tus puestos (albañil, ayudante, fierrero) con su salario por día. Al dar de alta a alguien, toma ese sueldo.',
        pasos: [
          'Toca «Nuevo puesto».',
          'Escribe el nombre y el salario por día.',
          'Toca «Guardar puesto».',
        ],
        consejo: 'Llegas aquí desde Ajustes → Operación → Catálogos, o con Ctrl + K.',
        maqueta: {
          tipo: 'formulario',
          titulo: 'Nuevo puesto',
          campos: [
            { etiqueta: 'Nombre', valor: 'Oficial albañil' },
            { etiqueta: 'Salario por día (MXN)', valor: '$450.00' },
          ],
          boton: 'Guardar puesto',
        },
        destino: { href: '/admin/puestos', ancla: 'puestos-nuevo' },
        roles: ['admin', 'supervisor', 'contador'],
      },
    ],
  },
];
