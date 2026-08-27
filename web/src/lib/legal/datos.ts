/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATOS LEGALES — fuente única para /privacidad, /terminos y /soporte
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. El aviso de privacidad que se publicó con la app
 * (`POLITICA_PRIVACIDAD.md` y `privacy_policy.html` en la raíz del repo) afirma
 * que ConstructorPro "no recopila, transmite ni comparte ningún dato" y que "no
 * existe ningún servidor externo, cuenta de usuario, ni conexión a internet".
 * Eso era verdad cuando la app era 100% local. Hoy hay Supabase (base de datos y
 * autenticación), Sentry (diagnóstico de fallos) y un portal de clientes con
 * cuentas — en web y en móvil. Un aviso que describe mal el tratamiento real es
 * el documento con el que uno se defendería, declarando en contra.
 *
 * Aquí vive lo que cambia (identidad del responsable, terceros, versión) para
 * que las tres páginas no se desincronicen entre sí ni con la realidad.
 *
 * ⚠️ CAMPOS EN `null` = FALTA EL DATO. Las páginas los pintan como un marcador
 * ámbar bien visible y `BORRADOR_LEGAL` se queda en `true` mientras quede uno.
 * No es un `TODO` en un comentario: es un dato que la ley pide y que solo Mario
 * puede decidir. Ver `legalIncompleto()` abajo.
 */

/**
 * Versión del cuerpo legal. Cambia SOLO cuando cambie el texto de fondo (no por
 * corregir una coma). Se registra junto con la aceptación de cada usuario, así
 * que su valor es la prueba de QUÉ aceptó esa persona: si aquí se sobrescribe
 * una versión ya aceptada, esa prueba se pierde. Formato: fecha de vigencia.
 */
export const VERSION_LEGAL = '2026-08-25';

/**
 * Identidad del responsable del tratamiento.
 *
 * La LFPDPPP (art. 16) exige que el aviso identifique al responsable y su
 * domicilio. Hoy los documentos publicados solo traen un correo personal, lo
 * que no cumple. Hay que decidir bajo qué figura se presta el servicio:
 * persona física con actividad empresarial (nombre + domicilio fiscal) o una
 * sociedad (razón social + domicilio social).
 */
export const RESPONSABLE = {
  /**
   * Nombre completo o razón social. PROVISIONAL — ver `nombreProvisional`.
   *
   * Se pone un nombre en vez de dejarlo vacío porque el documento se lee muy
   * distinto con un sujeto que sin él: sin nombre, ni siquiera se puede juzgar
   * si el resto del texto está bien redactado.
   */
  nombre: 'Mario Ramos' as string | null,

  /**
   * `true` mientras el nombre de arriba no sea el definitivo.
   *
   * Falta decidir bajo qué figura se presta el servicio, y de eso depende qué
   * nombre es el correcto: persona física con actividad empresarial (nombre
   * completo como aparece en el RFC, que probablemente lleve los dos apellidos)
   * o una sociedad (razón social, que no sería este nombre). Mientras esto sea
   * `true`, el nombre se pinta con un distintivo y el aviso de borrador sigue
   * arriba: un nombre provisional publicado como definitivo identifica mal al
   * responsable, que es justo lo que el aviso tiene que hacer bien.
   */
  nombreProvisional: true,

  /** Domicilio para oír y recibir notificaciones. FALTA DECIDIR. */
  domicilio: null as string | null,

  /**
   * Correo de contacto y para ejercer derechos ARCO.
   *
   * Es el que ya aparece en el aviso publicado con la app, así que se conserva
   * por continuidad. Conviene migrarlo a una dirección de rol (soporte@…) en
   * cuanto haya dominio propio: un correo personal ata el canal formal del
   * servicio a una persona concreta, y no se puede delegar ni transferir.
   */
  correo: 'mariohernandezrmos6@gmail.com',
} as const;

/**
 * Compromiso de tiempo de respuesta de soporte.
 *
 * Esto es blindaje, no marketing: sin un plazo escrito, el usuario asume que se
 * le responde el domingo a las 11 de la noche. Un plazo ACOTADO y cumplible
 * protege; uno ambicioso se convierte en la vara con la que te miden.
 *
 * FALTA DECIDIR el que se pueda sostener en temporada de obra. Referencia:
 * "2 días hábiles, lunes a viernes de 9:00 a 18:00 (hora del centro de México)".
 */
export const COMPROMISO_RESPUESTA = {
  /** p. ej. '2 días hábiles'. FALTA DECIDIR. */
  plazo: null as string | null,
  /** p. ej. 'lunes a viernes, 9:00–18:00 (hora del centro de México)'. FALTA DECIDIR. */
  horario: null as string | null,
} as const;

/**
 * Terceros que participan en el tratamiento (encargados/subencargados).
 *
 * Verificado contra el código, no contra la memoria:
 *  · Supabase → `@supabase/ssr` + `supabase_flutter` en el móvil.
 *  · Sentry   → `@sentry/nextjs` y `sentry_flutter`; `sendDefaultPii: false`.
 *  · Cloudflare → `components/auth/turnstile.tsx`, solo si hay site key.
 *  · Vercel   → hospedaje de la web (`.vercel/project.json`).
 *  · GitHub   → únicamente distribución del APK (`lib/descargas.ts`), no datos.
 */
export const TERCEROS = [
  {
    nombre: 'Supabase',
    proposito: 'Base de datos, autenticación y almacenamiento de archivos.',
    datos: 'Toda la información que capturas: obras, colaboradores, nómina, cotizaciones y pagos.',
  },
  {
    nombre: 'Vercel',
    proposito: 'Hospedaje del sitio y del panel web.',
    datos: 'Registros técnicos de acceso (dirección IP, navegador, fecha).',
  },
  {
    nombre: 'Sentry',
    proposito: 'Aviso de errores de la aplicación para poder corregirlos.',
    datos:
      'Detalle técnico del fallo. Está configurado para NO enviar datos personales en el cuerpo de la petición.',
  },
  {
    nombre: 'Cloudflare (Turnstile)',
    proposito: 'Verificación anti-robots en el inicio de sesión, cuando está activada.',
    datos: 'Señales técnicas del navegador y dirección IP.',
  },
] as const;

/**
 * Categorías de datos personales tratados. La segunda es la delicada: son datos
 * de TERCEROS (los trabajadores del constructor), y por eso los Términos fijan
 * quién responde por ellos.
 */
export const CATEGORIAS_DATOS = [
  {
    titulo: 'De tu cuenta',
    detalle: 'Correo electrónico, contraseña cifrada, nombre y empresa a la que perteneces.',
  },
  {
    titulo: 'De tus colaboradores',
    detalle:
      'Nombre, puesto, sueldo, asistencia y contacto de emergencia. Los capturas tú; nosotros solo los guardamos y procesamos por tu instrucción.',
  },
  {
    titulo: 'De tus clientes y obras',
    detalle: 'Nombre y contacto del cliente, cotizaciones, presupuestos, pagos y movimientos de caja.',
  },
  {
    titulo: 'Archivos que adjuntas',
    detalle:
      'Planos, fichas técnicas y comprobantes de pago. Un comprobante de transferencia o de cheque puede contener datos financieros —número de cuenta, banco, firma—, así que conviene subir solo lo que de verdad haga falta para la obra.',
  },
  {
    titulo: 'Técnicos',
    detalle: 'Registros de acceso y de errores, usados solo para operar y reparar el servicio.',
  },
] as const;

/**
 * Archivos que el usuario puede adjuntar, y quién los ve.
 *
 * ESTO NO ES DECORACIÓN: los valores salen de las migraciones, no de la
 * memoria. `cotizaciones` se creó en 0007 y recibió sus límites en 0028;
 * `comprobantes` nació con ellos en 0024. Ambos son buckets PRIVADOS y el
 * aislamiento por empresa lo hace la policy sobre la primera carpeta de la
 * ruta (`{empresa_id}/…`), no el frontend.
 *
 * El reparto de acceso de `comprobantes` es más estrecho a propósito, y la
 * razón está escrita en la propia migración 0024: un comprobante puede traer
 * datos bancarios. Esa protección ya existía y funcionaba, pero no estaba
 * documentada en ninguna parte que el usuario pudiera leer — o sea, protegía a
 * alguien que no sabía que estaba protegido. De ahí que ahora se publique.
 *
 * Si cambian los límites o las policies en Supabase, se cambian AQUÍ también:
 * un documento que promete 10 MB sobre un bucket que acepta 50 es una promesa
 * incumplida al revés, y sigue siendo un problema.
 */
export const ARCHIVOS = {
  /** Formatos aceptados, iguales en los dos buckets salvo HEIC. */
  formatos: 'imágenes (JPG, PNG, WEBP, HEIC) y archivos PDF',

  tipos: [
    {
      que: 'Archivos de cotización',
      ejemplos: 'Planos, fichas técnicas, referencias del proyecto.',
      limite: '15 MB por archivo',
      quienVe:
        'El personal de tu empresa: administrador, supervisor y colaborador. Tus clientes no tienen acceso a este material.',
    },
    {
      que: 'Comprobantes de pago',
      ejemplos: 'Fotos o PDF de transferencias, depósitos y cheques.',
      limite: '10 MB por archivo',
      quienVe:
        'Solo el personal de oficina: administrador, supervisor y contador. Ni el personal de campo ni tus clientes pueden verlos, justamente porque un comprobante suele traer datos bancarios.',
    },
  ],
} as const;

/**
 * Lista de los datos que faltan por decidir. Vacía ⇒ el cuerpo legal está
 * completo y `BORRADOR_LEGAL` es `false`.
 */
export function legalIncompleto(): string[] {
  const faltantes: string[] = [];
  if (!RESPONSABLE.nombre) {
    faltantes.push('nombre o razón social del responsable');
  } else if (RESPONSABLE.nombreProvisional) {
    // Un nombre provisional cuenta como pendiente a propósito: el documento no
    // está listo para publicarse aunque ya se lea completo.
    faltantes.push('confirmar el nombre del responsable (hoy es provisional)');
  }
  if (!RESPONSABLE.domicilio) faltantes.push('domicilio del responsable');
  if (!COMPROMISO_RESPUESTA.plazo) faltantes.push('plazo de respuesta de soporte');
  if (!COMPROMISO_RESPUESTA.horario) faltantes.push('horario de atención');
  return faltantes;
}

/** `true` mientras quede algún dato por decidir. Las páginas lo anuncian arriba. */
export const BORRADOR_LEGAL = legalIncompleto().length > 0;

/**
 * Rutas cuyo texto sale de este archivo. Se listan aquí y no en `lib/sitio.ts`
 * porque quien las quite del sitemap necesita saber POR QUÉ las quita, y ese
 * porqué (`BORRADOR_LEGAL`) vive aquí.
 */
export const RUTAS_LEGALES = ['/privacidad', '/terminos', '/soporte'] as const;

/**
 * Metadata que impide indexar una página mientras falte algún dato legal.
 *
 * Se hace con `noindex` y NO con un `Disallow` en `robots.txt`, aunque a primera
 * vista el segundo suene más contundente. Son cosas distintas: `Disallow` impide
 * *rastrear*, y una página que no se rastrea es una página cuyo `noindex` nadie
 * llega a leer — Google puede acabar listando la URL igual, si alguien la enlaza,
 * y entonces ya no hay forma de pedirle que la quite. `noindex` sí se obedece,
 * justamente porque para verlo hay que entrar.
 *
 * La página sigue existiendo y se puede abrir por enlace directo: eso es
 * deliberado, porque el borrador es legible a propósito. Lo que no queremos es
 * que un aviso de privacidad incompleto sea el resultado de buscar la empresa.
 *
 * Cuando `legalIncompleto()` se quede vacío, esto devuelve `{}` solo y las tres
 * páginas vuelven a indexarse sin tocar nada más.
 */
export function metadataBorrador() {
  if (!BORRADOR_LEGAL) return {};
  return { robots: { index: false, follow: true } };
}
