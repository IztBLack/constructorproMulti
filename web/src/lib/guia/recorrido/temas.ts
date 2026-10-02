/**
 * Contenido del RECORRIDO GUIADO: los temas y sus pasos.
 *
 * Cada paso camina sobre la pantalla REAL. Los nombres de botones, pestañas y
 * campos salen del código de `app/admin/**`; si cambias una etiqueta en la
 * interfaz, cámbiala aquí también. Las anclas (`objetivo.ancla`) son atributos
 * `data-guia="…"` en esas pantallas; `temas.test.ts` revisa que existan, que
 * cada ruta tenga su `page.tsx` y que se respeten las reglas de seguridad.
 *
 * REGLAS DE SEGURIDAD (el recorrido nunca guarda nada):
 *  · `tocar` solo abre o navega: enlaces del menú, pestañas, la primera obra
 *    de la lista y botones «+ Nuevo…» que abren un formulario.
 *  · Lo que guardaría, enviaría o borraría va como `bloqueado`, con texto que
 *    dice qué haría.
 *  · `escribir` solo en campos de texto o número, con datos claramente de
 *    ejemplo. Selectores, fechas y buscadores se explican con `leer`.
 *  · La asistencia escribe en una cola sin conexión: ahí todo es `leer`, y el
 *    recorrido no entra a `/campo`.
 *  · Todo paso dentro de una obra (`/admin/obras/*`) trae maqueta: la cuenta
 *    puede no tener obras todavía.
 *
 * Tono profesional, de tú (decisión de Mario, 2026-10-01): nada de niveles,
 * misiones, rangos ni insignias.
 *
 * Los ids de tema son estables: el avance guardado se refiere a ellos. Si
 * cambias o quitas uno, sube `VERSION_RECORRIDO`.
 */

import type { Maqueta } from '../tipos';
import type { PasoRecorrido, Tema } from './tipos';

export const VERSION_RECORRIDO = 1;

// ── Roles ────────────────────────────────────────────────────────────────────
// Espejo de lo que cada pantalla deja ver (`lib/auth/roles.ts`, guardias de
// página). Compras y almacén no entran a obras, clientes ni equipo.

const OBRA = ['admin', 'supervisor', 'contador', 'residente'] as const;
const OFICINA = ['admin', 'supervisor', 'contador'] as const;
const ADMIN_CONTADOR = ['admin', 'contador'] as const;
const SOLO_ADMIN = ['admin'] as const;

// ── Maquetas (vista de ejemplo cuando la cuenta no tiene datos) ─────────────

const M_OBRAS: Maqueta = {
  tipo: 'lista',
  titulo: 'Obras',
  filas: [
    { principal: 'Casa Mendoza', detalle: 'Laura Mendoza · Col. Del Valle', valor: 'Activa', estado: 'ok' },
    { principal: 'Bodega Iztapalapa', detalle: 'Grupo Ferretero Ruiz', valor: 'Activa', estado: 'ok' },
    { principal: 'Local Coyoacán', detalle: 'Ana Torres', valor: 'Inactiva', estado: 'pendiente' },
  ],
};

const M_ENCABEZADO: Maqueta = {
  tipo: 'resumen',
  titulo: 'Casa Mendoza',
  cifras: [
    { etiqueta: 'Cliente', valor: 'Laura Mendoza', tono: 'neutro' },
    { etiqueta: 'Ubicación', valor: 'Col. Del Valle', tono: 'neutro' },
    { etiqueta: 'Inicio', valor: '06/10/2026', tono: 'neutro' },
  ],
};

const M_PESTANAS: Maqueta = {
  tipo: 'lista',
  titulo: 'Casa Mendoza · pestañas',
  filas: [
    { principal: 'Detalle', detalle: 'Estado de cuenta, presupuesto, equipo y movimientos' },
    { principal: 'Asistencia', detalle: 'El pase de lista de la semana' },
    { principal: 'Nómina', detalle: 'La raya de la semana' },
    { principal: 'Notas', detalle: 'Los tratos con tus maestros' },
    { principal: 'Extras', detalle: 'Lo que el cliente pide aparte' },
  ],
};

const M_PRESUPUESTO: Maqueta = {
  tipo: 'lista',
  titulo: 'Presupuesto por partidas',
  filas: [
    { principal: 'Cimentación', detalle: '48 m³ × $2,450.00', valor: '$117,600.00' },
    { principal: 'Muro de block 15 cm', detalle: '210 m² × $385.00', valor: '$80,850.00' },
    { principal: 'Losa de azotea', detalle: '95 m² × $1,280.00', valor: '$121,600.00' },
  ],
};

const M_EQUIPO_OBRA: Maqueta = {
  tipo: 'lista',
  titulo: 'Equipo de la obra',
  filas: [
    { principal: 'Juan Pérez', detalle: 'Albañil · Por día' },
    { principal: 'Martín Cruz', detalle: 'Cabo · Por día' },
    { principal: 'Pedro Ramírez', detalle: 'Ayudante · Por destajo' },
  ],
};

const M_ESTADO_CUENTA: Maqueta = {
  tipo: 'resumen',
  titulo: 'Casa Mendoza · Estado de cuenta',
  cifras: [
    { etiqueta: 'Costo total', valor: '$620,000.00', tono: 'neutro' },
    { etiqueta: 'Recibido', valor: '$410,000.00', tono: 'positivo' },
    { etiqueta: 'Pendiente', valor: '$210,000.00', tono: 'negativo' },
  ],
};

const M_MOVIMIENTOS: Maqueta = {
  tipo: 'lista',
  titulo: 'Movimientos',
  filas: [
    { principal: 'Anticipo construcción', detalle: 'Entrada · Laura Mendoza', valor: '$150,000.00', estado: 'ok' },
    { principal: 'Cemento y varilla', detalle: 'Salida · Materiales del Sur', valor: '-$38,420.00', estado: 'alerta' },
    { principal: 'Nómina semana 41', detalle: 'Salida · Raya', valor: '-$18,650.00', estado: 'alerta' },
  ],
};

const M_MOVIMIENTO_FORM: Maqueta = {
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
};

const M_DOCUMENTOS_CAJA: Maqueta = {
  tipo: 'lista',
  titulo: 'Estado de cuenta · documentos',
  filas: [
    { principal: 'Importar movimientos', detalle: 'Sube el estado de cuenta del banco' },
    { principal: 'Exportar a Excel', detalle: 'Para tu contadora' },
    { principal: 'Ver PDF', detalle: 'El PDF de caja de la obra' },
  ],
};

const M_SEMANA: Maqueta = {
  tipo: 'resumen',
  titulo: 'Semana',
  cifras: [
    { etiqueta: 'Desde', valor: 'lunes 5 de octubre', tono: 'neutro' },
    { etiqueta: 'Hasta', valor: 'domingo 11 de octubre', tono: 'neutro' },
  ],
};

const M_PASE: Maqueta = {
  tipo: 'lista',
  titulo: 'Casa Mendoza · martes 6 de octubre',
  filas: [
    { principal: 'Juan Pérez', detalle: 'Albañil', valor: 'Completo', estado: 'ok' },
    { principal: 'Martín Cruz', detalle: 'Cabo', valor: 'Completo', estado: 'ok' },
    { principal: 'Pedro Ramírez', detalle: 'Ayudante', valor: 'Medio', estado: 'pendiente' },
    { principal: 'Luis Hernández', detalle: 'Fierrero', valor: 'Falta', estado: 'alerta' },
  ],
};

const M_NOMINA: Maqueta = {
  tipo: 'resumen',
  titulo: 'Nómina · semana del 5 al 11 de octubre',
  cifras: [
    { etiqueta: 'Total de nómina de la semana', valor: '$18,650.00', tono: 'neutro' },
    { etiqueta: 'Por día', valor: '$14,700.00', tono: 'neutro' },
    { etiqueta: 'Por destajo', valor: '$3,950.00', tono: 'neutro' },
  ],
};

const M_NOMINA_DETALLE: Maqueta = {
  tipo: 'lista',
  titulo: 'Detalle por colaborador',
  filas: [
    { principal: 'Juan Pérez', detalle: '6 días × $450.00', valor: '$2,700.00' },
    { principal: 'Martín Cruz', detalle: '6 días × $520.00', valor: '$3,120.00' },
    { principal: 'Pedro Ramírez', detalle: 'Destajo: aplanado de muros', valor: '$3,950.00' },
  ],
};

const M_NOTAS: Maqueta = {
  tipo: 'lista',
  titulo: 'Nota · Orlando Ramos · MZ 2 LT 1',
  filas: [
    { principal: 'Base de tinacos', detalle: 'Concepto', valor: '$6,500.00' },
    { principal: 'Pretil y recorte de puertas', detalle: 'Concepto', valor: '$9,800.00' },
    { principal: 'Pago del viernes', detalle: 'Pago', valor: '-$8,000.00', estado: 'ok' },
    { principal: 'Saldo', valor: '$8,300.00', estado: 'pendiente' },
  ],
};

const M_NOTA_FORM: Maqueta = {
  tipo: 'formulario',
  titulo: 'Nueva nota',
  campos: [
    { etiqueta: 'A nombre de', valor: 'Orlando Ramos' },
    { etiqueta: 'Título', valor: 'MZ 2 LT 1' },
    { etiqueta: 'Fecha', valor: '08/10/2026' },
  ],
  boton: 'Crear y capturar',
};

const M_EXTRA_FORM: Maqueta = {
  tipo: 'formulario',
  titulo: 'Nuevo extra',
  campos: [
    { etiqueta: '¿De qué es el extra?', valor: 'Barda en la azotea' },
    { etiqueta: '¿Por qué se hace?', valor: 'Lo pidió el cliente' },
    { etiqueta: 'Fecha', valor: '08/10/2026' },
  ],
  boton: 'Crear y agregar conceptos',
};

const M_EXTRAS: Maqueta = {
  tipo: 'lista',
  titulo: 'Extras de Casa Mendoza',
  filas: [
    { principal: 'Extra 1 · Barda en la azotea', detalle: 'Aprobado por el cliente', valor: '$24,300.00', estado: 'ok' },
    { principal: 'Extra 2 · Cambio de piso en sala', detalle: 'Esperando al cliente', valor: '$18,900.00', estado: 'pendiente' },
  ],
};

const M_AVANCE: Maqueta = {
  tipo: 'lista',
  titulo: 'Avance físico de la obra · 52 %',
  filas: [
    { principal: 'Cimentación', detalle: '48 de 48 m³', valor: '100 %', estado: 'ok' },
    { principal: 'Muro de block 15 cm', detalle: '120 de 210 m²', valor: '57 %', estado: 'pendiente' },
    { principal: 'Losa de azotea', detalle: '0 de 95 m²', valor: '0 %', estado: 'pendiente' },
  ],
};

const M_CONTRATO: Maqueta = {
  tipo: 'resumen',
  titulo: 'Condiciones del contrato',
  cifras: [
    { etiqueta: 'Anticipo', valor: '$186,000.00 (30 %)', tono: 'neutro' },
    { etiqueta: 'Se amortiza en cada estimación', valor: '30 %', tono: 'neutro' },
    { etiqueta: 'Fondo de garantía', valor: '5 %', tono: 'neutro' },
    { etiqueta: 'IVA', valor: '16 %', tono: 'neutro' },
  ],
};

const M_ACUMULADOS: Maqueta = {
  tipo: 'resumen',
  titulo: 'Estimación 3 · del 1 al 15 de octubre',
  cifras: [
    { etiqueta: 'Lo hecho en el periodo', valor: '$145,000.00', tono: 'neutro' },
    { etiqueta: 'Amortización del anticipo', valor: '-$43,500.00', tono: 'negativo' },
    { etiqueta: 'Fondo de garantía (5 %)', valor: '-$7,250.00', tono: 'negativo' },
    { etiqueta: 'A pagar', valor: '$94,250.00', tono: 'positivo' },
  ],
};

const M_PROGRAMA: Maqueta = {
  tipo: 'lista',
  titulo: 'Programa · Casa Mendoza',
  filas: [
    { principal: 'Cimentación', detalle: '1 al 10 de octubre', valor: 'Terminada', estado: 'ok' },
    { principal: 'Muros', detalle: '11 al 31 de octubre', valor: 'Atrasada', estado: 'alerta' },
    { principal: 'Losa de azotea', detalle: '1 al 15 de noviembre', valor: 'Por empezar', estado: 'pendiente' },
  ],
};

const M_BITACORA: Maqueta = {
  tipo: 'lista',
  titulo: 'Bitácora de Casa Mendoza',
  filas: [
    { principal: 'Martes 6 de octubre · Avance', detalle: 'Se coló la losa del eje 3. Llegaron 8 m³ de concreto.' },
    { principal: 'Lunes 5 de octubre · Clima', detalle: 'Lluvia por la tarde, se suspendió el aplanado.' },
  ],
};

const M_SEGURIDAD: Maqueta = {
  tipo: 'lista',
  titulo: 'Revisión de hoy',
  filas: [
    { principal: 'Todos traen casco', valor: 'Sí cumple', estado: 'ok' },
    { principal: 'Todos traen calzado de seguridad', valor: 'Sí cumple', estado: 'ok' },
    { principal: 'Bordes de losa y huecos protegidos', valor: 'No cumple', estado: 'alerta' },
    { principal: 'Quien trabaja en altura usa arnés', valor: 'No aplica' },
  ],
};

const M_SEGURIDAD_RESUMEN: Maqueta = {
  tipo: 'resumen',
  titulo: 'Seguridad en Casa Mendoza',
  cifras: [
    { etiqueta: 'Días sin accidente', valor: '38', tono: 'positivo' },
    { etiqueta: 'Revisión de hoy', valor: '86%', tono: 'neutro' },
    { etiqueta: 'Avisos al IMSS por registrar', valor: '0', tono: 'neutro' },
  ],
};

const M_CLIENTES: Maqueta = {
  tipo: 'lista',
  titulo: 'Clientes',
  filas: [
    { principal: 'Laura Mendoza Ruiz', detalle: 'laura.mendoza@correo.com', valor: 'Vinculado', estado: 'ok' },
    { principal: 'Roberto Salas', detalle: '55 1234 5678', valor: 'Sin acceso', estado: 'pendiente' },
  ],
};

const M_PORTAL: Maqueta = {
  tipo: 'resumen',
  titulo: 'Acceso al portal · Laura Mendoza',
  cifras: [
    { etiqueta: 'Código de acceso', valor: '482 913', tono: 'neutro' },
    { etiqueta: 'Vale por', valor: '10 minutos', tono: 'neutro' },
  ],
};

// ── Pasos que se repiten ─────────────────────────────────────────────────────

/** Abre la primera obra de la lista. Sin obras, se ve la lista de ejemplo. */
function abrirObra(texto = 'Toca el nombre de la primera obra para abrirla.'): PasoRecorrido {
  return {
    id: 'abrir-obra',
    ruta: '/admin/obras',
    objetivo: { ancla: 'obras-fila' },
    titulo: 'Abre una obra',
    texto,
    accion: 'tocar',
    maqueta: M_OBRAS,
  };
}

/** Toca una pestaña de la obra. */
function abrirPestana(pestana: string, nombre: string, texto: string, maqueta: Maqueta): PasoRecorrido {
  return {
    id: `pestana-${pestana}`,
    ruta: '/admin/obras/*',
    objetivo: { ancla: `obra-tab-${pestana}` },
    titulo: `Pestaña ${nombre}`,
    texto,
    accion: 'tocar',
    maqueta,
  };
}

// ── Temas ────────────────────────────────────────────────────────────────────

export const TEMAS: readonly Tema[] = [
  // ════════════════════════════ ESENCIAL ════════════════════════════════════
  {
    id: 'panel',
    titulo: 'Tu panel y el menú',
    descripcion: 'Dónde está cada cosa y qué te dice la pantalla de Inicio.',
    desde: 'esencial',
    modulo: null,
    inicio: '/admin',
    pasos: [
      {
        id: 'bienvenida',
        ruta: '/admin',
        titulo: 'Así funciona este recorrido',
        texto:
          'Vas a usar tus pantallas reales. Puedes escribir y tocar lo que se te indique: nada de lo que hagas aquí se guarda en tu cuenta.',
        accion: 'leer',
      },
      {
        id: 'menu',
        ruta: '/admin',
        objetivo: { ancla: 'menu' },
        titulo: 'El menú',
        texto:
          'Aquí están todas las secciones, ordenadas en Obras, Gente, Dinero y Operación. En el celular se abre con el botón Menú.',
        accion: 'leer',
      },
      {
        id: 'indicadores',
        ruta: '/admin',
        objetivo: { ancla: 'inicio-indicadores' },
        titulo: 'Tus indicadores',
        texto:
          'Cuántas obras, cotizaciones y colaboradores tienes, y lo que tienes cotizado sin cerrar. Toca cualquiera para ir a su lista.',
        accion: 'leer',
      },
      {
        id: 'saldo',
        ruta: '/admin',
        objetivo: { ancla: 'inicio-saldo' },
        titulo: 'Saldo por obra',
        texto:
          'Lo que ha entrado menos lo que ha salido de cada obra. En rojo, la obra ha pagado más de lo que ha cobrado.',
        accion: 'leer',
      },
      {
        id: 'buscar',
        ruta: '/admin',
        titulo: 'Buscar rápido',
        texto:
          'En la computadora, presiona Ctrl + K en cualquier pantalla y escribe el nombre de una obra, una persona o una sección para ir directo.',
        accion: 'leer',
        soloEn: ['esencial'],
      },
      {
        id: 'iconos-ayuda',
        ruta: '/admin',
        titulo: 'Los íconos de ayuda',
        texto:
          'Junto a muchos títulos verás un ícono ⓘ. Tócalo cuando quieras una explicación corta de ese apartado.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'obras-alta',
    titulo: 'Da de alta una obra',
    descripcion: 'Cada obra junta su dinero, su gente y sus documentos.',
    desde: 'esencial',
    modulo: 'obras',
    roles: OBRA,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-obras',
        ruta: '/admin',
        objetivo: { enlace: '/admin/obras' },
        titulo: 'Abre Obras',
        texto: 'Toca Obras en el menú. Ahí está la lista de todas tus obras.',
        accion: 'tocar',
      },
      {
        id: 'nueva',
        ruta: '/admin/obras',
        objetivo: { ancla: 'obras-nueva' },
        titulo: 'Nueva obra',
        texto: 'Toca «+ Nueva obra» para abrir el formulario.',
        accion: 'tocar',
      },
      {
        id: 'nombre',
        ruta: '/admin/obras',
        objetivo: { ancla: 'obra-form-nombre' },
        titulo: 'El nombre',
        texto: 'Es lo único obligatorio. Usa el nombre con el que tu equipo conoce la obra.',
        accion: 'escribir',
        ejemplo: 'Casa Ejemplo — Col. Centro',
      },
      {
        id: 'cliente',
        ruta: '/admin/obras',
        objetivo: { ancla: 'obra-form-cliente' },
        titulo: 'El cliente',
        texto: 'Opcional. La ubicación y la fecha de inicio también lo son; las puedes llenar después.',
        accion: 'escribir',
        ejemplo: 'Cliente de Ejemplo',
        soloEn: ['esencial'],
      },
      {
        id: 'guardar',
        ruta: '/admin/obras',
        objetivo: { ancla: 'obra-form-guardar' },
        titulo: 'Guardar obra',
        texto: 'Al tocar Guardar obra, la obra quedaría registrada. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
      },
      {
        id: 'importar',
        ruta: '/admin/obras',
        objetivo: { ancla: 'obras-importar' },
        titulo: 'Si ya las tienes en Excel',
        texto:
          'Con Importar de Excel subes una obra con su presupuesto y sus movimientos usando la plantilla, sin capturarla a mano.',
        accion: 'leer',
        soloEn: ['esencial'],
      },
    ],
  },
  {
    id: 'clientes',
    titulo: 'Registra a tus clientes',
    descripcion: 'Tus clientes, para asignarles obras y cotizaciones.',
    desde: 'esencial',
    modulo: 'obras',
    roles: OFICINA,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-clientes',
        ruta: '/admin',
        objetivo: { enlace: '/admin/clientes' },
        titulo: 'Abre Clientes',
        texto: 'Toca Clientes en el menú, dentro de Obras.',
        accion: 'tocar',
      },
      {
        id: 'nuevo',
        ruta: '/admin/clientes',
        objetivo: { ancla: 'clientes-nuevo' },
        titulo: 'Nuevo cliente',
        texto: 'Toca «+ Nuevo cliente» para abrir el formulario.',
        accion: 'tocar',
      },
      {
        id: 'nombre',
        ruta: '/admin/clientes',
        objetivo: { ancla: 'cliente-form-nombre' },
        titulo: 'El nombre',
        texto: 'Escribe el nombre de tu cliente, como quieres que salga en sus documentos.',
        accion: 'escribir',
        ejemplo: 'Cliente de Ejemplo',
      },
      {
        id: 'correo',
        ruta: '/admin/clientes',
        objetivo: { ancla: 'cliente-form-correo' },
        titulo: 'Correo y teléfono',
        texto: 'Son opcionales. El correo sirve para que tu cliente entre a su portal y vea cómo va su obra.',
        accion: 'leer',
        soloEn: ['esencial'],
      },
      {
        id: 'guardar',
        ruta: '/admin/clientes',
        objetivo: { ancla: 'cliente-form-guardar' },
        titulo: 'Guardar cliente',
        texto: 'Al tocar Guardar cliente, quedaría registrado. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
      },
    ],
  },
  {
    id: 'cotizacion',
    titulo: 'Haz una cotización',
    descripcion: 'Arma una cotización por secciones y partidas, y sácala en PDF.',
    desde: 'esencial',
    modulo: 'cotizaciones',
    roles: OFICINA,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-cotizaciones',
        ruta: '/admin',
        objetivo: { enlace: '/admin/cotizaciones' },
        titulo: 'Abre Cotizaciones',
        texto: 'Toca Cotizaciones en el menú.',
        accion: 'tocar',
      },
      {
        id: 'estados',
        ruta: '/admin/cotizaciones',
        objetivo: { ancla: 'cotizaciones-estados' },
        titulo: 'Los estados',
        texto:
          'Cada cotización va de Borrador a Enviada, y luego a Aceptada o Rechazada. Toca un estado para ver solo esas.',
        accion: 'leer',
      },
      {
        id: 'nueva',
        ruta: '/admin/cotizaciones',
        objetivo: { ancla: 'cotizaciones-nueva' },
        titulo: 'Nueva cotización',
        texto: 'Toca «+ Nueva cotización».',
        accion: 'tocar',
      },
      {
        id: 'cliente',
        ruta: '/admin/cotizaciones/nueva',
        objetivo: { ancla: 'cotizacion-form-cliente' },
        titulo: 'El cliente',
        texto:
          'Elige uno de tus clientes registrados, o deja «Cliente sin vincular» y escribe su nombre a mano en el campo de al lado.',
        accion: 'leer',
        soloEn: ['esencial'],
      },
      {
        id: 'proyecto',
        ruta: '/admin/cotizaciones/nueva',
        objetivo: { ancla: 'cotizacion-form-proyecto' },
        titulo: 'Nombre del proyecto',
        texto: 'Así la reconoces en la lista y así sale en el PDF.',
        accion: 'escribir',
        ejemplo: 'Ampliación de ejemplo',
      },
      {
        id: 'iva',
        ruta: '/admin/cotizaciones/nueva',
        objetivo: { ancla: 'cotizacion-form-iva' },
        titulo: 'IVA',
        texto: 'Marcado, al total se le suma el IVA de tu empresa. Quítalo si esta cotización va sin IVA.',
        accion: 'leer',
      },
      {
        id: 'crear',
        ruta: '/admin/cotizaciones/nueva',
        objetivo: { ancla: 'cotizacion-form-crear' },
        titulo: 'Crear cotización',
        texto: 'Al tocar Crear cotización, quedaría registrada como borrador. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
      },
      {
        id: 'partidas',
        ruta: '/admin/cotizaciones/nueva',
        titulo: 'Después: secciones y partidas',
        texto:
          'Ya creada, agregas secciones (Cimentación, Muros…) y en cada una sus partidas, buscando el concepto en tu catálogo. Con Ver PDF la descargas o imprimes.',
        accion: 'leer',
        maqueta: {
          tipo: 'lista',
          titulo: 'Ampliación de recámara',
          filas: [
            { principal: 'Cimentación', detalle: '3 partidas', valor: '$28,400.00' },
            { principal: 'Muros', detalle: '4 partidas', valor: '$35,120.00' },
            { principal: 'Acabados', detalle: '5 partidas', valor: '$22,900.00' },
          ],
        },
      },
    ],
  },
  {
    id: 'colaborador',
    titulo: 'Da de alta a tu gente',
    descripcion: 'Registra a cada trabajador con su puesto y su sueldo para que la raya salga sola.',
    desde: 'esencial',
    modulo: 'equipo',
    roles: OBRA,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-equipo',
        ruta: '/admin',
        objetivo: { enlace: '/admin/equipo' },
        titulo: 'Abre Equipo',
        texto: 'Toca Equipo en el menú, dentro de Gente.',
        accion: 'tocar',
      },
      {
        id: 'nuevo',
        ruta: '/admin/equipo',
        objetivo: { ancla: 'equipo-nuevo' },
        titulo: 'Nuevo colaborador',
        texto: 'Toca «+ Nuevo colaborador».',
        accion: 'tocar',
      },
      {
        id: 'nombre',
        ruta: '/admin/equipo',
        objetivo: { ancla: 'colaborador-form-nombre' },
        titulo: 'El nombre',
        texto: 'Escribe su nombre completo, como lo quieres ver en el pase de lista y en la raya.',
        accion: 'escribir',
        ejemplo: 'Colaborador de Ejemplo',
      },
      {
        id: 'tipo-pago',
        ruta: '/admin/equipo',
        objetivo: { ancla: 'colaborador-form-tipo-pago' },
        titulo: 'Tipo de pago',
        texto:
          'Por día: la raya cuenta los días del pase de lista. Por destajo: se le paga por trabajo terminado. Arriba eliges su puesto y, abajo, si ya entra a una obra.',
        accion: 'leer',
      },
      {
        id: 'sueldo',
        ruta: '/admin/equipo',
        objetivo: { ancla: 'colaborador-form-sueldo' },
        titulo: 'El sueldo',
        texto:
          'Elige si le pagas por semana, quincena o mes, y escribe el monto: la app saca su salario diario. Vacío, toma el salario del puesto.',
        accion: 'escribir',
        ejemplo: '12000',
      },
      {
        id: 'guardar',
        ruta: '/admin/equipo',
        objetivo: { ancla: 'colaborador-form-guardar' },
        titulo: 'Guardar colaborador',
        texto: 'Al tocar Guardar colaborador, quedaría dado de alta. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
      },
      {
        id: 'incompletos',
        ruta: '/admin/equipo',
        titulo: 'Si a alguien le faltan datos',
        texto:
          'Cuando se da de alta a alguien desde la obra sin puesto, arriba sale un aviso amarillo. Complétalo: mientras tanto, la nómina lo cuenta en $0.',
        accion: 'leer',
        soloEn: ['esencial'],
      },
    ],
  },

  // ═════════════════════════ OPERACIÓN DIARIA ═══════════════════════════════
  {
    id: 'obra-detalle',
    titulo: 'Dentro de una obra',
    descripcion: 'El detalle de una obra y las pestañas que llevan a todo lo demás.',
    desde: 'diaria',
    modulo: 'obras',
    roles: OBRA,
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      {
        id: 'encabezado',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'obra-encabezado' },
        titulo: 'Los datos de la obra',
        texto:
          'Nombre, cliente, ubicación y fecha de inicio. Con Editar los cambias; si tienes varias obras, desde aquí saltas a otra.',
        accion: 'leer',
        maqueta: M_ENCABEZADO,
      },
      {
        id: 'pestanas',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'obra-pestanas' },
        titulo: 'Las pestañas',
        texto:
          'Cada pestaña es una parte de esta obra: asistencia, nómina, notas, extras y lo demás que tengas prendido. Detalle es esta pantalla.',
        accion: 'leer',
        maqueta: M_PESTANAS,
      },
      {
        id: 'presupuesto',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'obra-presupuesto' },
        titulo: 'Presupuesto por partidas',
        texto:
          'Lo que cobras por la obra, partida por partida. Es la base del estado de cuenta y del avance. Si la obra salió de una cotización, ya viene lleno.',
        accion: 'leer',
        maqueta: M_PRESUPUESTO,
      },
      {
        id: 'equipo',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'obra-equipo' },
        titulo: 'Equipo de la obra',
        texto: 'Asigna aquí a la gente que trabaja en esta obra: solo ellos salen en su pase de lista y en su nómina.',
        accion: 'leer',
        maqueta: M_EQUIPO_OBRA,
      },
    ],
  },
  {
    id: 'caja',
    titulo: 'La caja de la obra',
    descripcion: 'Lo que entra y sale de cada obra, y cuánto te falta por cobrar.',
    desde: 'diaria',
    modulo: 'caja',
    roles: OBRA,
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      {
        id: 'estado-cuenta',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'obra-estado-cuenta' },
        titulo: 'Estado de cuenta',
        texto:
          'Lo que cuesta la obra contra lo que te han pagado. Pendiente es lo que falta por cobrar.',
        accion: 'leer',
        maqueta: M_ESTADO_CUENTA,
      },
      {
        id: 'movimientos',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'obra-movimientos' },
        titulo: 'Movimientos',
        texto:
          'Cada entrada y salida de dinero de esta obra: anticipos, pagos, material, raya. A cada una le puedes adjuntar su comprobante.',
        accion: 'leer',
        maqueta: M_MOVIMIENTOS,
      },
      {
        id: 'registrar',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'obra-registrar-movimiento' },
        titulo: 'Registrar un movimiento',
        texto: 'Toca Registrar movimiento para abrir el formulario.',
        accion: 'tocar',
        maqueta: M_MOVIMIENTO_FORM,
      },
      {
        id: 'concepto',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'mov-form-concepto' },
        titulo: 'Tipo y concepto',
        texto:
          'Arriba eliges si es Entrada (dinero que recibes) o Salida (lo que pagas). Aquí escribe de qué es, o elige uno de los que ya usas.',
        accion: 'escribir',
        ejemplo: 'Anticipo de ejemplo',
        maqueta: M_MOVIMIENTO_FORM,
      },
      {
        id: 'monto',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'mov-form-monto' },
        titulo: 'El monto',
        texto: 'En pesos. Si es una salida, más arriba puedes decir en qué se gastó para saber cuánto te deja la obra.',
        accion: 'escribir',
        ejemplo: '1000',
        maqueta: M_MOVIMIENTO_FORM,
      },
      {
        id: 'guardar',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'mov-form-guardar' },
        titulo: 'Registrar movimiento',
        texto: 'Al tocar este botón, el movimiento quedaría en la caja de la obra. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
        maqueta: M_MOVIMIENTO_FORM,
      },
      {
        id: 'documentos',
        ruta: '/admin/obras/*',
        objetivo: { ancla: 'obra-caja-documentos' },
        titulo: 'PDF, Excel y banco',
        texto:
          'Ver PDF saca el PDF de caja; Exportar a Excel, el archivo para tu contadora; Importar movimientos sube el estado de cuenta del banco.',
        accion: 'leer',
        maqueta: M_DOCUMENTOS_CAJA,
      },
    ],
  },
  {
    id: 'asistencia',
    titulo: 'Asistencia y pase de lista',
    descripcion: 'Cómo se registra quién vino cada día, aun sin señal.',
    desde: 'diaria',
    modulo: 'equipo',
    roles: OBRA,
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      abrirPestana('asistencia', 'Asistencia', 'Toca la pestaña Asistencia.', M_PESTANAS),
      {
        id: 'semana',
        ruta: '/admin/obras/*/asistencia',
        objetivo: { ancla: 'asistencia-semana' },
        titulo: 'La semana',
        texto: 'Con ← Anterior y Siguiente → cambias de semana.',
        accion: 'leer',
        maqueta: M_SEMANA,
      },
      {
        id: 'pase',
        ruta: '/admin/obras/*/asistencia',
        objetivo: { ancla: 'asistencia-pase' },
        titulo: 'El pase de lista',
        texto:
          'A cada persona se le marca Falta, Medio, Tres cuartos o Completo. En el celular se ve día por día; en pantalla grande, la semana completa.',
        accion: 'leer',
        maqueta: M_PASE,
      },
      {
        id: 'sin-senal',
        ruta: '/admin/obras/*/asistencia',
        titulo: 'Sin señal también funciona',
        texto:
          'Lo marcado sin conexión queda «por enviar» en el aparato y se sube solo al volver la señal. Para pasar lista en todas las obras a la vez, usa Pase de lista en el menú.',
        accion: 'leer',
        maqueta: M_PASE,
      },
    ],
  },
  {
    id: 'nomina',
    titulo: 'La raya de la semana',
    descripcion: 'La nómina de cada obra sale sola del pase de lista y los destajos.',
    desde: 'diaria',
    modulo: 'equipo',
    roles: OBRA,
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      abrirPestana('nomina', 'Nómina', 'Toca la pestaña Nómina.', M_PESTANAS),
      {
        id: 'semana',
        ruta: '/admin/obras/*/nomina',
        objetivo: { ancla: 'nomina-semana' },
        titulo: 'La semana y su PDF',
        texto: 'Cambia de semana con las flechas. Ver PDF saca la lista de raya para imprimir o compartir.',
        accion: 'leer',
        maqueta: M_SEMANA,
      },
      {
        id: 'total',
        ruta: '/admin/obras/*/nomina',
        objetivo: { ancla: 'nomina-total' },
        titulo: 'Total de la semana',
        texto:
          'Los días del pase de lista por el salario diario de cada quien, más los destajos. Los destajos se capturan desde la app del celular.',
        accion: 'leer',
        maqueta: M_NOMINA,
      },
      {
        id: 'detalle',
        ruta: '/admin/obras/*/nomina',
        objetivo: { ancla: 'nomina-detalle' },
        titulo: 'Detalle por colaborador',
        texto: 'Cuánto le toca a cada persona. Si alguien sale en $0, revisa que tenga puesto o sueldo.',
        accion: 'leer',
        maqueta: M_NOMINA_DETALLE,
      },
      {
        id: 'caja',
        ruta: '/admin/obras/*/nomina',
        objetivo: { ancla: 'nomina-registrar-caja' },
        titulo: 'Registrar nómina en caja',
        texto:
          'Este botón anotaría el total de la raya como salida en la caja de la obra. En el recorrido no se registra nada.',
        accion: 'bloqueado',
        maqueta: M_NOMINA,
      },
    ],
  },
  {
    id: 'cuadrillas',
    titulo: 'Arma tus cuadrillas',
    descripcion: 'Agrupa a tu gente con su cabo y mándala a la obra de un jalón.',
    desde: 'diaria',
    modulo: 'cuadrillas',
    roles: OBRA,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-cuadrillas',
        ruta: '/admin',
        objetivo: { enlace: '/admin/cuadrillas' },
        titulo: 'Abre Cuadrillas',
        texto: 'Toca Cuadrillas en el menú, dentro de Gente.',
        accion: 'tocar',
      },
      {
        id: 'nueva',
        ruta: '/admin/cuadrillas',
        objetivo: { ancla: 'cuadrillas-nueva' },
        titulo: 'Nueva cuadrilla',
        texto: 'Toca «+ Nueva cuadrilla».',
        accion: 'tocar',
      },
      {
        id: 'nombre',
        ruta: '/admin/cuadrillas',
        objetivo: { ancla: 'cuadrilla-form-nombre' },
        titulo: 'Nombre y especialidad',
        texto: 'Ponle un nombre que tu gente reconozca. Abajo eliges su especialidad.',
        accion: 'escribir',
        ejemplo: 'Cuadrilla de ejemplo',
      },
      {
        id: 'guardar',
        ruta: '/admin/cuadrillas',
        objetivo: { ancla: 'cuadrilla-form-guardar' },
        titulo: 'Guardar cuadrilla',
        texto: 'Al tocar Guardar cuadrilla, quedaría creada. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
      },
      {
        id: 'despues',
        ruta: '/admin/cuadrillas',
        titulo: 'Dentro de la cuadrilla',
        texto:
          'Agregas a sus miembros, marcas a quien la dirige con Hacer cabo y le asignas obras. Con Mandar equipo, todos salen en el pase de lista de esa obra.',
        accion: 'leer',
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
      },
    ],
  },
  {
    id: 'proyeccion',
    titulo: 'Proyección de la raya',
    descripcion: 'Calcula lo que vas a pagar en la semana, sin tocar el pase de lista.',
    desde: 'diaria',
    modulo: 'proyeccion',
    roles: OFICINA,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-proyeccion',
        ruta: '/admin',
        objetivo: { enlace: '/admin/proyeccion' },
        titulo: 'Abre Proyección',
        texto: 'Toca Proyección en el menú, dentro de Gente.',
        accion: 'tocar',
      },
      {
        id: 'escenario',
        ruta: '/admin/proyeccion',
        objetivo: { ancla: 'proyeccion-escenario' },
        titulo: 'Es un escenario',
        texto:
          'La raya proyectada suma lo que ya está en el pase de lista (en firme) y los días que supones (estimado). Nada de aquí cambia la nómina real.',
        accion: 'leer',
      },
      {
        id: 'rellenar',
        ruta: '/admin/proyeccion',
        objetivo: { ancla: 'proyeccion-rellenar' },
        titulo: 'Llenar los días',
        texto:
          'Con Completa L–S, Según sus días, Sin sábado o Con domingo llenas la semana de todos de un jalón. Limpiar los quita.',
        accion: 'leer',
      },
      {
        id: 'tabla',
        ruta: '/admin/proyeccion',
        objetivo: { ancla: 'proyeccion-tabla' },
        titulo: 'Persona por persona',
        texto: 'Toca la casilla de una persona para quitarle o ponerle un día, o el nombre del día para todos.',
        accion: 'leer',
      },
      {
        id: 'pdf',
        ruta: '/admin/proyeccion',
        objetivo: { ancla: 'proyeccion-pdf' },
        titulo: 'Compártela',
        texto: 'PDF de la proyección la descarga para mandarla a tu socio o a tu contadora.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'notas',
    titulo: 'Tratos con maestros',
    descripcion: 'Las cuentas de palabra: lo acordado, lo pagado y lo que falta.',
    desde: 'diaria',
    modulo: 'notas',
    roles: OBRA,
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      abrirPestana('notas', 'Notas', 'Toca la pestaña Notas.', M_NOTAS),
      {
        id: 'nueva',
        ruta: '/admin/obras/*/notas',
        objetivo: { ancla: 'notas-nueva' },
        titulo: 'Nueva nota',
        texto: 'Cada nota es un trato con una persona. Toca «+ Nueva nota».',
        accion: 'tocar',
        maqueta: M_NOTA_FORM,
      },
      {
        id: 'titulo',
        ruta: '/admin/obras/*/notas',
        objetivo: { ancla: 'nota-form-titulo' },
        titulo: 'A nombre de quién y título',
        texto:
          'Arriba eliges a nombre de quién va: alguien de tu equipo o cualquier persona. El título es opcional, por ejemplo el lote o la etapa.',
        accion: 'escribir',
        ejemplo: 'Lote de ejemplo',
        maqueta: M_NOTA_FORM,
      },
      {
        id: 'crear',
        ruta: '/admin/obras/*/notas',
        objetivo: { ancla: 'nota-form-crear' },
        titulo: 'Crear y capturar',
        texto:
          'Este botón crearía la nota y te llevaría a capturar sus renglones: conceptos que suman, deducciones que restan y pagos. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
        maqueta: M_NOTAS,
      },
      {
        id: 'pegar',
        ruta: '/admin/obras/*/notas',
        objetivo: { ancla: 'notas-pegar' },
        titulo: 'Desde un WhatsApp',
        texto: 'Con Pegar mensaje pegas la cuenta que te mandó el maestro y la nota se llena sola; tú solo la revisas.',
        accion: 'leer',
        maqueta: M_NOTAS,
      },
    ],
  },
  {
    id: 'extras',
    titulo: 'Extras que pide el cliente',
    descripcion: 'Lo que no estaba en el presupuesto, con su precio y la aprobación del cliente.',
    desde: 'diaria',
    modulo: 'cambios',
    roles: OBRA,
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      abrirPestana('extras', 'Extras', 'Toca la pestaña Extras.', M_EXTRAS),
      {
        id: 'nuevo',
        ruta: '/admin/obras/*/extras',
        objetivo: { ancla: 'extras-nuevo' },
        titulo: 'Nuevo extra',
        texto: 'Toca Nuevo extra.',
        accion: 'tocar',
        maqueta: M_EXTRA_FORM,
      },
      {
        id: 'titulo',
        ruta: '/admin/obras/*/extras',
        objetivo: { ancla: 'extra-form-titulo' },
        titulo: '¿De qué es el extra?',
        texto: 'Descríbelo en pocas palabras. Abajo puedes anotar por qué se hace.',
        accion: 'escribir',
        ejemplo: 'Barda de ejemplo en azotea',
        maqueta: M_EXTRA_FORM,
      },
      {
        id: 'crear',
        ruta: '/admin/obras/*/extras',
        objetivo: { ancla: 'extra-form-crear' },
        titulo: 'Crear y agregar conceptos',
        texto: 'Este botón crearía el extra en borrador para agregarle sus conceptos. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
        maqueta: M_EXTRA_FORM,
      },
      {
        id: 'despues',
        ruta: '/admin/obras/*/extras',
        titulo: 'Lo que sigue',
        texto:
          'Le agregas conceptos con unidad, cantidad y precio, y tocas Enviar al cliente: lo aprueba en su portal o con el PDF. Lo aprobado se suma a lo que te debe.',
        accion: 'leer',
        maqueta: M_EXTRAS,
      },
    ],
  },

  // ═════════════════════════════ COMPLETO ═══════════════════════════════════
  {
    id: 'estimaciones',
    titulo: 'Avance y estimaciones',
    descripcion: 'Anota lo que se hizo y cóbralo por periodos al precio pactado.',
    desde: 'completo',
    modulo: 'estimaciones',
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      abrirPestana('avance', 'Avance', 'Toca la pestaña Avance.', M_AVANCE),
      {
        id: 'avance',
        ruta: '/admin/obras/*/avance',
        objetivo: { ancla: 'avance-resumen' },
        titulo: 'Avance físico',
        texto:
          'Qué tanto de la obra está hecho. En cada partida del presupuesto anotas lo que se hizo, y de ahí sale lo que se puede cobrar.',
        accion: 'leer',
        maqueta: M_AVANCE,
      },
      {
        id: 'pestana-estimaciones',
        ruta: '/admin/obras/*/avance',
        objetivo: { ancla: 'obra-tab-estimaciones' },
        titulo: 'Pestaña Estimaciones',
        texto: 'Toca la pestaña Estimaciones.',
        accion: 'tocar',
        maqueta: M_ACUMULADOS,
      },
      {
        id: 'contrato',
        ruta: '/admin/obras/*/estimaciones',
        objetivo: { ancla: 'estimaciones-contrato' },
        titulo: 'Condiciones del contrato',
        texto:
          'El anticipo, cuánto se descuenta de él en cada estimación, el fondo de garantía y el IVA. Se aplican a todas las estimaciones de la obra.',
        accion: 'leer',
        maqueta: M_CONTRATO,
      },
      {
        id: 'acumulados',
        ruta: '/admin/obras/*/estimaciones',
        objetivo: { ancla: 'estimaciones-acumulados' },
        titulo: 'Acumulados',
        texto: 'Lo estimado hasta hoy, el anticipo que falta por descontar, lo autorizado por cobrar y el fondo retenido.',
        accion: 'leer',
        maqueta: M_ACUMULADOS,
      },
      {
        id: 'nueva',
        ruta: '/admin/obras/*/estimaciones',
        objetivo: { ancla: 'estimaciones-nueva' },
        titulo: 'Nueva estimación',
        texto:
          'Eliges las fechas del periodo y Crear con lo hecho propone lo avanzado que no se ha cobrado. La revisas y se la envías al cliente.',
        accion: 'leer',
        maqueta: M_ACUMULADOS,
      },
    ],
  },
  {
    id: 'compras',
    titulo: 'Compras y material',
    descripcion: 'Lo que se pide en obra, lo que se compra y lo que se debe a proveedores.',
    desde: 'completo',
    modulo: 'compras',
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-compras',
        ruta: '/admin',
        objetivo: { enlace: '/admin/compras' },
        titulo: 'Abre Compras',
        texto: 'Toca Compras en el menú, dentro de Dinero.',
        accion: 'tocar',
      },
      {
        id: 'resumen',
        ruta: '/admin/compras',
        objetivo: { ancla: 'compras-resumen' },
        titulo: 'En números',
        texto: 'Cuánto hay por aprobar, cuánto material por comprar, las órdenes abiertas y lo que debes.',
        accion: 'leer',
      },
      {
        id: 'requisiciones',
        ruta: '/admin/compras',
        objetivo: { ancla: 'compras-requisiciones' },
        titulo: 'Requisiciones por aprobar',
        texto:
          'Lo que piden desde la obra, en su pestaña Material. El administrador aprueba o rechaza cada pedido.',
        accion: 'leer',
      },
      {
        id: 'por-comprar',
        ruta: '/admin/compras',
        objetivo: { ancla: 'compras-por-comprar' },
        titulo: 'Aprobado, por comprar',
        texto:
          'Con Armar órdenes de compra eliges proveedor y precio de lo aprobado. Cuando llega, se registra en la orden y el pago entra a la caja de la obra.',
        accion: 'leer',
      },
      {
        id: 'catalogos',
        ruta: '/admin/compras',
        objetivo: { ancla: 'compras-catalogos' },
        titulo: 'Materiales y proveedores',
        texto: 'Aquí llevas tu lista de materiales con su último precio, y a tus proveedores con sus días de crédito.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'facturacion',
    titulo: 'Datos para facturar',
    descripcion: 'Lo que falta facturar y el paquete del mes para tu contador.',
    desde: 'completo',
    modulo: 'fiscal',
    roles: ADMIN_CONTADOR,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-facturacion',
        ruta: '/admin',
        objetivo: { enlace: '/admin/facturacion' },
        titulo: 'Abre Facturación',
        texto: 'Toca Facturación en el menú, dentro de Dinero. La app no factura ni se conecta al SAT: te deja todo listo.',
        accion: 'tocar',
      },
      {
        id: 'paquete',
        ruta: '/admin/facturacion',
        objetivo: { ancla: 'facturacion-paquete' },
        titulo: 'Paquete para el contador',
        texto: 'Elige el mes y descarga un ZIP con el Excel y tus facturas, listo para mandárselo a tu contador.',
        accion: 'leer',
      },
      {
        id: 'por-facturar',
        ruta: '/admin/facturacion',
        objetivo: { ancla: 'facturacion-por-facturar' },
        titulo: 'Por facturar',
        texto:
          'Los cobros que ya recibiste sin factura. Abre uno para copiar sus datos a tu sistema de facturas y, ya timbrada, guardar su XML.',
        accion: 'leer',
      },
      {
        id: 'complementos',
        ruta: '/admin/facturacion',
        objetivo: { ancla: 'facturacion-complementos' },
        titulo: 'Complementos de pago',
        texto: 'Cuando una factura se paga en partes, cada abono lleva su complemento de pago. Aquí ves los que faltan.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'utilidad',
    titulo: 'Utilidad por obra',
    descripcion: 'Cuánto te está dejando cada obra y cómo va a terminar.',
    desde: 'completo',
    modulo: 'rentabilidad',
    roles: ADMIN_CONTADOR,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-utilidad',
        ruta: '/admin',
        objetivo: { enlace: '/admin/rentabilidad' },
        titulo: 'Abre Utilidad',
        texto: 'Toca Utilidad en el menú, dentro de Dinero.',
        accion: 'tocar',
      },
      {
        id: 'tabla',
        ruta: '/admin/rentabilidad',
        objetivo: { ancla: 'rentabilidad-tabla' },
        titulo: 'Cada obra',
        texto:
          'Lo contratado, lo gastado y cómo va a terminar. Las que necesitan atención salen primero; toca una para ver en qué se fue el dinero.',
        accion: 'leer',
        maqueta: {
          tipo: 'lista',
          titulo: 'Utilidad por obra',
          filas: [
            { principal: 'Casa Mendoza', detalle: 'Contratado $620,000.00', valor: '18 %', estado: 'ok' },
            { principal: 'Bodega Iztapalapa', detalle: 'Contratado $1,250,000.00', valor: '9 %', estado: 'pendiente' },
            { principal: 'Local Coyoacán', detalle: 'Contratado $340,000.00', valor: '-4 %', estado: 'alerta' },
          ],
        },
      },
      {
        id: 'clasificar',
        ruta: '/admin/rentabilidad',
        titulo: 'Para que la cuenta salga bien',
        texto:
          'Di en qué se gastó cada salida de caja. El margen objetivo de tu empresa se cambia en Ajustes → Operación.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'programa',
    titulo: 'Programa de obra',
    descripcion: 'Cuándo empieza y termina cada partida, y qué va atrasado.',
    desde: 'completo',
    modulo: 'programa',
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      abrirPestana('programa', 'Programa', 'Toca la pestaña Programa.', M_PROGRAMA),
      {
        id: 'que-es',
        ruta: '/admin/obras/*/programa',
        objetivo: { ancla: 'obra-seccion' },
        titulo: 'Fechas por partida',
        texto:
          'A cada partida le pones fecha de inicio y de fin. Puedes traer las partidas del presupuesto para no escribirlas.',
        accion: 'leer',
        maqueta: M_PROGRAMA,
      },
      {
        id: 'barras',
        ruta: '/admin/obras/*/programa',
        objetivo: { ancla: 'programa-barras' },
        titulo: 'Vista de barras',
        texto: 'Ves de un vistazo qué está en curso. Lo que pasa de su fecha sin terminarse sale como atrasado.',
        accion: 'leer',
        maqueta: M_PROGRAMA,
      },
    ],
  },
  {
    id: 'bitacora',
    titulo: 'Bitácora con fotos',
    descripcion: 'Lo que pasa cada día en la obra, con fecha y fotos, como evidencia.',
    desde: 'completo',
    modulo: 'bitacora',
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      abrirPestana('bitacora', 'Bitácora', 'Toca la pestaña Bitácora.', M_BITACORA),
      {
        id: 'que-es',
        ruta: '/admin/obras/*/bitacora',
        objetivo: { ancla: 'obra-seccion' },
        titulo: 'Evidencia diaria',
        texto:
          'Cada entrada se cierra 24 horas después de registrarse y ya no cambia. Lo que marques para el cliente aparece en su portal.',
        accion: 'leer',
        maqueta: M_BITACORA,
      },
      {
        id: 'nueva',
        ruta: '/admin/obras/*/bitacora',
        objetivo: { ancla: 'bitacora-nueva' },
        titulo: 'Nueva entrada',
        texto: 'Desde aquí se anota el día: qué pasó, el clima, quién estuvo y sus fotos.',
        accion: 'leer',
        maqueta: M_BITACORA,
      },
      {
        id: 'pdf',
        ruta: '/admin/obras/*/bitacora',
        objetivo: { ancla: 'bitacora-pdf' },
        titulo: 'PDF del periodo',
        texto: 'Elige las fechas y saca la bitácora de ese periodo en PDF.',
        accion: 'leer',
        maqueta: M_BITACORA,
      },
    ],
  },
  {
    id: 'seguridad',
    titulo: 'Seguridad en la obra',
    descripcion: 'La revisión diaria y el registro de incidentes.',
    desde: 'completo',
    modulo: 'seguridad',
    inicio: '/admin/obras',
    pasos: [
      abrirObra(),
      abrirPestana('seguridad', 'Seguridad', 'Toca la pestaña Seguridad.', M_SEGURIDAD_RESUMEN),
      {
        id: 'resumen',
        ruta: '/admin/obras/*/seguridad',
        objetivo: { ancla: 'seguridad-resumen' },
        titulo: 'Cómo va la obra',
        texto: 'Días sin accidente, cuánto se cumple en la revisión de hoy y los avisos al IMSS que faltan.',
        accion: 'leer',
        maqueta: M_SEGURIDAD_RESUMEN,
      },
      {
        id: 'revision',
        ruta: '/admin/obras/*/seguridad',
        objetivo: { ancla: 'seguridad-revision' },
        titulo: 'Revisión de hoy',
        texto: 'Se recorre la obra y se marca cada punto como Sí cumple, No cumple o No aplica.',
        accion: 'leer',
        maqueta: M_SEGURIDAD,
      },
      {
        id: 'incidentes',
        ruta: '/admin/obras/*/seguridad',
        objetivo: { ancla: 'seguridad-incidentes' },
        titulo: 'Incidentes',
        texto:
          'Con Registrar incidente anotas qué pasó y a quién. Un accidente de trabajo se le avisa al IMSS con el formato ST-7.',
        accion: 'leer',
        maqueta: M_SEGURIDAD,
      },
    ],
  },
  {
    id: 'herramienta',
    titulo: 'Herramienta y maquinaria',
    descripcion: 'Qué tienes, en qué obra está y quién la trae.',
    desde: 'completo',
    modulo: 'herramienta',
    roles: OBRA,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-herramienta',
        ruta: '/admin',
        objetivo: { enlace: '/admin/herramienta' },
        titulo: 'Abre Herramienta',
        texto: 'Toca Herramienta en el menú, dentro de Operación.',
        accion: 'tocar',
      },
      {
        id: 'resumen',
        ruta: '/admin/herramienta',
        objetivo: { ancla: 'herramienta-resumen' },
        titulo: 'De un vistazo',
        texto: 'Lo prestado, lo asignado de planta, lo vencido, lo que está en reparación y el valor de tu inventario.',
        accion: 'leer',
      },
      {
        id: 'nueva',
        ruta: '/admin/herramienta',
        objetivo: { ancla: 'herramienta-nueva' },
        titulo: 'Nueva herramienta',
        texto: 'Toca Nueva herramienta.',
        accion: 'tocar',
      },
      {
        id: 'nombre',
        ruta: '/admin/herramienta',
        objetivo: { ancla: 'herramienta-form-nombre' },
        titulo: 'El nombre',
        texto: 'Abajo eliges su tipo y su estado; el número de inventario y el costo son opcionales.',
        accion: 'escribir',
        ejemplo: 'Revolvedora de ejemplo',
      },
      {
        id: 'guardar',
        ruta: '/admin/herramienta',
        objetivo: { ancla: 'herramienta-form-guardar' },
        titulo: 'Guardar',
        texto:
          'Al tocar Guardar, la herramienta quedaría en tu inventario y ya se podría prestar a una obra. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
      },
    ],
  },
  {
    id: 'subcontratos',
    titulo: 'Subcontratos',
    descripcion: 'Los tratos con tus subcontratistas por escrito, con sus pagos.',
    desde: 'completo',
    modulo: 'subcontratos',
    roles: ADMIN_CONTADOR,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-subcontratos',
        ruta: '/admin',
        objetivo: { enlace: '/admin/subcontratos' },
        titulo: 'Abre Subcontratos',
        texto: 'Toca Subcontratos en el menú, dentro de Dinero.',
        accion: 'tocar',
      },
      {
        id: 'nuevo',
        ruta: '/admin/subcontratos',
        objetivo: { ancla: 'subcontratos-nuevo' },
        titulo: 'Nuevo contrato',
        texto:
          'Eliges la obra y al subcontratista; después llenas el alcance, el monto, el fondo de garantía y los pagos, y sacas el PDF para firmarlo.',
        accion: 'leer',
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
      },
      {
        id: 'desde-nota',
        ruta: '/admin/subcontratos',
        titulo: 'Desde una nota',
        texto: 'Si ya llevas el trato en una nota de la obra, ábrela y usa Convertir en contrato.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'garantias',
    titulo: 'Garantías',
    descripcion: 'Los reportes de tus clientes después de entregar la obra.',
    desde: 'completo',
    modulo: 'postventa',
    roles: OBRA,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-garantias',
        ruta: '/admin',
        objetivo: { enlace: '/admin/postventa' },
        titulo: 'Abre Garantías',
        texto: 'Toca Garantías en el menú, dentro de Operación.',
        accion: 'tocar',
      },
      {
        id: 'pestanas',
        ruta: '/admin/postventa',
        objetivo: { ancla: 'postventa-pestanas' },
        titulo: 'Reportes y garantía por obra',
        texto:
          'En Reportes ves lo que tus clientes reportan desde su portal y le das seguimiento. En Garantía por obra anotas la entrega y cuántos meses cubre.',
        accion: 'leer',
      },
      {
        id: 'registrar',
        ruta: '/admin/postventa',
        objetivo: { ancla: 'postventa-registrar' },
        titulo: 'Si te lo reportan por teléfono',
        texto: 'Con Registrar reporte lo anotas tú, para que no se pierda.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'imss',
    titulo: 'IMSS y papeles',
    descripcion: 'Lo que toca con el IMSS y la Secretaría del Trabajo, con su fecha y su comprobante.',
    desde: 'completo',
    modulo: 'cumplimiento',
    roles: ADMIN_CONTADOR,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-imss',
        ruta: '/admin',
        objetivo: { enlace: '/admin/cumplimiento' },
        titulo: 'Abre IMSS y papeles',
        texto: 'Toca IMSS y papeles en el menú, dentro de Operación. La app te recuerda y guarda comprobantes; el trámite lo haces tú o tu contador.',
        accion: 'tocar',
      },
      {
        id: 'siroc',
        ruta: '/admin/cumplimiento',
        objetivo: { ancla: 'cumplimiento-siroc' },
        titulo: 'Registro de obras (SIROC)',
        texto: 'Cuántos días hábiles te quedan para registrar cada obra ante el IMSS, y su acuse.',
        accion: 'leer',
      },
      {
        id: 'repse',
        ruta: '/admin/cumplimiento',
        objetivo: { ancla: 'cumplimiento-repse' },
        titulo: 'Tu registro REPSE',
        texto: 'Tu folio y hasta cuándo está vigente, para pedir la renovación a tiempo.',
        accion: 'leer',
      },
      {
        id: 'entregas',
        ruta: '/admin/cumplimiento',
        objetivo: { ancla: 'cumplimiento-entregas' },
        titulo: 'ICSOE y SISUB',
        texto: 'Los informes de cada cuatro meses, con su fecha límite y su acuse.',
        accion: 'leer',
      },
      {
        id: 'subcontratistas',
        ruta: '/admin/cumplimiento',
        objetivo: { ancla: 'cumplimiento-subcontratistas' },
        titulo: 'Expediente de subcontratistas',
        texto: 'Los papeles de cada subcontratista y su vencimiento. Sin REPSE vigente, te puede tocar responder por él.',
        accion: 'leer',
      },
      {
        id: 'contador',
        ruta: '/admin/cumplimiento',
        objetivo: { ancla: 'cumplimiento-contador' },
        titulo: 'Para tu contador',
        texto: 'Elige las fechas y descarga la raya del periodo para que tu contador haga el cálculo del IMSS.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'portal',
    titulo: 'El portal de tu cliente',
    descripcion: 'Tu cliente entra con su cuenta y ve sus cotizaciones y su obra.',
    desde: 'completo',
    modulo: 'portal',
    roles: OFICINA,
    inicio: '/admin/clientes',
    pasos: [
      {
        id: 'abrir-cliente',
        ruta: '/admin/clientes',
        objetivo: { ancla: 'clientes-fila' },
        titulo: 'Abre un cliente',
        texto: 'Toca el nombre del primer cliente de la lista.',
        accion: 'tocar',
        maqueta: M_CLIENTES,
      },
      {
        id: 'acceso',
        ruta: '/admin/clientes/*',
        objetivo: { ancla: 'cliente-portal' },
        titulo: 'Acceso al portal',
        texto:
          'Con Generar código de acceso sale un código de 6 dígitos que vale 10 minutos. Tu cliente crea su cuenta en el portal y lo escribe.',
        accion: 'leer',
        maqueta: M_PORTAL,
      },
      {
        id: 'que-ve',
        ruta: '/admin/clientes/*',
        titulo: 'Qué ve tu cliente',
        texto:
          'Sus cotizaciones, cómo va su obra y su estado de cuenta. Nunca ve tus gastos. Desde ahí también aprueba extras y reporta garantías.',
        accion: 'leer',
        maqueta: {
          tipo: 'lista',
          titulo: 'Portal de Laura Mendoza',
          filas: [
            { principal: 'Cotizaciones', detalle: 'Ampliación de recámara · Aceptada', estado: 'ok' },
            { principal: 'Mi obra', detalle: 'Casa Mendoza · 52 % hecho' },
            { principal: 'Estado de cuenta', detalle: 'Pagado $410,000.00 · Pendiente $210,000.00' },
          ],
        },
      },
    ],
  },
  {
    id: 'ajustes',
    titulo: 'Ajustes de la empresa',
    descripcion: 'Qué partes de la app usa tu empresa y cómo salen tus documentos.',
    desde: 'completo',
    modulo: null,
    roles: SOLO_ADMIN,
    inicio: '/admin',
    pasos: [
      {
        id: 'ir-ajustes',
        ruta: '/admin',
        objetivo: { enlace: '/admin/ajustes' },
        titulo: 'Abre Ajustes',
        texto: 'Toca el botón de Ajustes, arriba. Ahí están tu cuenta, tus preferencias y la configuración de la empresa.',
        accion: 'tocar',
      },
      {
        id: 'modulos',
        ruta: '/admin/ajustes',
        objetivo: { ancla: 'ajustes-modulos' },
        titulo: 'Módulos',
        texto:
          'Prende solo lo que usas; lo demás no aparece en el menú de nadie. Apagar un módulo no borra sus datos: al prenderlo, todo sigue ahí.',
        accion: 'leer',
      },
      {
        id: 'operacion',
        ruta: '/admin/ajustes',
        objetivo: { ancla: 'ajustes-operacion' },
        titulo: 'Operación',
        texto:
          'El IVA con que nacen tus cotizaciones, tu margen objetivo, cómo salen tus PDF (contacto, color, pie y firmas) y los catálogos de conceptos y puestos.',
        accion: 'leer',
      },
      {
        id: 'empresa',
        ruta: '/admin/ajustes',
        objetivo: { ancla: 'ajustes-empresa' },
        titulo: 'Empresa',
        texto: 'El nombre de tu constructora, como lo ven tus clientes en sus documentos y en su portal.',
        accion: 'leer',
      },
    ],
  },
  {
    id: 'usuarios',
    titulo: 'Invita a tu equipo de oficina',
    descripcion: 'Da acceso a tu supervisor, residente o contadora, cada quien con su rol.',
    desde: 'completo',
    modulo: null,
    roles: SOLO_ADMIN,
    inicio: '/admin/ajustes',
    pasos: [
      {
        id: 'seccion',
        ruta: '/admin/ajustes',
        objetivo: { ancla: 'ajustes-usuarios' },
        titulo: 'Usuarios',
        texto: 'Quién entra a tu empresa y con qué permisos. Es lo más delicado de Ajustes.',
        accion: 'leer',
      },
      {
        id: 'administrar',
        ruta: '/admin/ajustes',
        objetivo: { ancla: 'ajustes-administrar-usuarios' },
        titulo: 'Administrar usuarios',
        texto: 'Toca Administrar usuarios.',
        accion: 'tocar',
      },
      {
        id: 'invitar',
        ruta: '/admin/usuarios',
        objetivo: { ancla: 'usuarios-invitar' },
        titulo: 'Invitar persona',
        texto: 'Toca Invitar persona.',
        accion: 'tocar',
      },
      {
        id: 'nombre',
        ruta: '/admin/usuarios',
        objetivo: { ancla: 'invitar-form-nombre' },
        titulo: 'Nombre de la persona',
        texto: 'Solo sirve para que reconozcas la invitación en la lista.',
        accion: 'escribir',
        ejemplo: 'Persona de ejemplo',
      },
      {
        id: 'rol',
        ruta: '/admin/usuarios',
        objetivo: { ancla: 'invitar-form-rol' },
        titulo: 'El rol',
        texto:
          'Define qué puede ver y hacer: residente, supervisor, compras, almacén, contador o colaborador. A un socio se le invita por correo y entra como administrador.',
        accion: 'leer',
      },
      {
        id: 'generar',
        ruta: '/admin/usuarios',
        objetivo: { ancla: 'invitar-form-generar' },
        titulo: 'Generar código',
        texto:
          'Este botón generaría un código que vale 72 horas y sirve una sola vez, para dictárselo a la persona. En el recorrido no se genera nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
      },
    ],
  },
  {
    id: 'catalogo',
    titulo: 'Tu lista de precios',
    descripcion: 'Los conceptos que usas siempre, para cotizar más rápido.',
    desde: 'completo',
    modulo: 'cotizaciones',
    roles: OFICINA,
    inicio: '/admin/catalogo',
    pasos: [
      {
        id: 'nuevo',
        ruta: '/admin/catalogo',
        objetivo: { ancla: 'catalogo-nuevo' },
        titulo: 'Nuevo concepto',
        texto:
          'A esta pantalla llegas desde Ajustes → Operación → Catálogos. Toca Nuevo concepto.',
        accion: 'tocar',
      },
      {
        id: 'descripcion',
        ruta: '/admin/catalogo',
        objetivo: { ancla: 'concepto-form-descripcion' },
        titulo: 'Descripción',
        texto: 'Así lo vas a buscar al cotizar. La clave y la categoría son opcionales.',
        accion: 'escribir',
        ejemplo: 'Muro de block de ejemplo',
      },
      {
        id: 'unidad',
        ruta: '/admin/catalogo',
        objetivo: { ancla: 'concepto-form-unidad' },
        titulo: 'Unidad',
        texto: 'Por ejemplo m2, m3, pza o lote.',
        accion: 'escribir',
        ejemplo: 'm2',
      },
      {
        id: 'precio',
        ruta: '/admin/catalogo',
        objetivo: { ancla: 'concepto-form-precio' },
        titulo: 'Precio unitario',
        texto: 'Es el precio con que el concepto entra a la cotización; ahí lo puedes ajustar.',
        accion: 'escribir',
        ejemplo: '385',
      },
      {
        id: 'guardar',
        ruta: '/admin/catalogo',
        objetivo: { ancla: 'concepto-form-guardar' },
        titulo: 'Guardar concepto',
        texto: 'Al tocar Guardar concepto, quedaría en tu lista de precios. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
      },
    ],
  },
  {
    id: 'puestos',
    titulo: 'Puestos y salarios',
    descripcion: 'Tus puestos con su salario por día, para dar de alta más rápido.',
    desde: 'completo',
    modulo: 'equipo',
    roles: OFICINA,
    inicio: '/admin/puestos',
    pasos: [
      {
        id: 'nuevo',
        ruta: '/admin/puestos',
        objetivo: { ancla: 'puestos-nuevo' },
        titulo: 'Nuevo puesto',
        texto: 'También llegas aquí desde Ajustes → Operación → Catálogos. Toca Nuevo puesto.',
        accion: 'tocar',
      },
      {
        id: 'nombre',
        ruta: '/admin/puestos',
        objetivo: { ancla: 'puesto-form-nombre' },
        titulo: 'Nombre del puesto',
        texto: 'Albañil, ayudante, fierrero, cabo…',
        accion: 'escribir',
        ejemplo: 'Oficial albañil (ejemplo)',
      },
      {
        id: 'salario',
        ruta: '/admin/puestos',
        objetivo: { ancla: 'puesto-form-salario' },
        titulo: 'Salario por día',
        texto: 'Quien tenga este puesto arranca con este salario, salvo que le captures su propio sueldo.',
        accion: 'escribir',
        ejemplo: '450',
      },
      {
        id: 'guardar',
        ruta: '/admin/puestos',
        objetivo: { ancla: 'puesto-form-guardar' },
        titulo: 'Guardar puesto',
        texto: 'Al tocar Guardar puesto, quedaría en tu lista. En el recorrido no se guarda nada.',
        accion: 'bloqueado',
        cerrarDialogo: true,
      },
    ],
  },
];
