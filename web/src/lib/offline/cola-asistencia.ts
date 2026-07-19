/// Cola offline del pase de lista.
///
/// Sustituye a la antigua Server Action `guardarAsistencia` (eliminada; vive en
/// el historial de git) para que el capturista pueda marcar asistencia sin señal
/// en la obra. También corrige el `select`+`insert` de aquella: ver `enviarMarca`.
///
/// ¿Por qué se abandona la Server Action para esta mutación? Una Server Action
/// exige round-trip al servidor: sin red no hay forma de encolarla ni de darle
/// respuesta al usuario. Aquí escribimos directo a Supabase desde el navegador
/// con el cliente de `@/lib/supabase/client`, que lleva la sesión y respeta RLS
/// igual que el servidor.
///
/// NOTA: al escribir desde el cliente ya NO hay `revalidatePath()`. La vista es
/// responsable de reflejar la marca de forma optimista (y para eso existe
/// `snapshot-asistencia.ts`).

import { createClient } from '@/lib/supabase/client';
import {
  STORE_COLA,
  hayIdb,
  idbDelete,
  idbDeleteMuchos,
  idbGetAll,
  idbPut,
} from './idb';

// ── Tipos públicos ────────────────────────────────────────────────────────

export interface MarcaPendiente {
  obraId: string;
  colaboradorId: string;
  fecha: number; // epoch ms, medianoche de México (ver @/lib/data/tz)
  fraccion: number; // 0 | 0.5 | 0.75 | 1
  empresaId: string;
  updatedAt: number; // sellado AL CAPTURAR (ver comentario en `encolarMarca`)
  intentos: number;
  ultimoError?: string;
}

export interface EstadoOffline {
  pendientes: number;
  enviando: boolean;
  enLinea: boolean;
  ultimoError?: string;
}

// ── Tipo interno persistido ───────────────────────────────────────────────

interface RegistroCola extends MarcaPendiente {
  /** Clave natural `${obraId}|${colaboradorId}|${fecha}` (keyPath del store). */
  clave: string;
  /**
   * Marca bloqueada: falló por un error permanente (RLS, dato inválido) las
   * veces suficientes como para que reintentar sea inútil. NO se borra —
   * sigue contando como pendiente y se reporta al usuario con `ultimoError`.
   */
  bloqueada?: boolean;
}

/** Intentos con error permanente antes de dejar de reintentar en bucle. */
const MAX_INTENTOS_PERMANENTE = 3;

function clave(obraId: string, colaboradorId: string, fecha: number): string {
  return `${obraId}|${colaboradorId}|${fecha}`;
}

/** Quita los campos internos (`clave`, `bloqueada`) antes de exponer la marca. */
function aMarca(r: RegistroCola): MarcaPendiente {
  return {
    obraId: r.obraId,
    colaboradorId: r.colaboradorId,
    fecha: r.fecha,
    fraccion: r.fraccion,
    empresaId: r.empresaId,
    updatedAt: r.updatedAt,
    intentos: r.intentos,
    ultimoError: r.ultimoError,
  };
}

// ── Estado observable ─────────────────────────────────────────────────────

const suscriptores = new Set<(e: EstadoOffline) => void>();

let _estado: EstadoOffline = {
  pendientes: 0,
  enviando: false,
  enLinea: typeof navigator === 'undefined' ? true : navigator.onLine,
};

function emitir(parcial: Partial<EstadoOffline>) {
  _estado = { ..._estado, ...parcial };
  for (const cb of suscriptores) {
    try {
      cb(_estado);
    } catch {
      /* un suscriptor roto no debe tumbar a los demás */
    }
  }
}

async function refrescarConteo() {
  const todas = await idbGetAll<RegistroCola>(STORE_COLA);
  // El "último error" que se muestra es el de alguna marca bloqueada, si la hay:
  // es el que exige intervención humana.
  const bloqueada = todas.find((r) => r.bloqueada && r.ultimoError);
  emitir({ pendientes: todas.length, ultimoError: bloqueada?.ultimoError });
}

/**
 * Suscripción al estado. Emite el estado actual de inmediato (de forma síncrona)
 * y luego en cada cambio. Devuelve la función para desuscribirse.
 */
export function suscribirEstado(cb: (e: EstadoOffline) => void): () => void {
  suscriptores.add(cb);
  cb(_estado);
  // Refresco asíncrono del conteo real por si es el primer suscriptor.
  void refrescarConteo();
  return () => {
    suscriptores.delete(cb);
  };
}

// ── Encolar ───────────────────────────────────────────────────────────────

/**
 * Encola —o reemplaza— la marca de esa celda. Resuelve apenas persiste en
 * IndexedDB, sin esperar a la red.
 *
 * La cola se indexa por la **clave natural** `(obraId, colaboradorId, fecha)`,
 * no por un UUID. Consecuencia buscada: re-marcar la misma celda **reemplaza**
 * la entrada pendiente en vez de apilar una segunda. La cola es idempotente por
 * diseño y no puede generar dos escrituras contradictorias para el mismo día.
 *
 * `updatedAt` viene sellado AL CAPTURAR, no al enviar. La resolución de
 * conflictos contra la app móvil es last-write-wins comparando `updated_at`
 * (ver `docs/SYNC_PROBLEMA_Y_SOLUCION.md`, "CAUSA 4"). Si selláramos al enviar,
 * una marca hecha sin señal a las 8:00 y subida a las 18:00 le ganaría a una
 * corrección hecha en el móvil a las 14:00, corrompiendo el dato. Sellar al
 * capturar preserva el orden real de los hechos.
 */
export async function encolarMarca(
  m: Omit<MarcaPendiente, 'intentos' | 'ultimoError'>,
): Promise<void> {
  if (!hayIdb()) return;
  const reg: RegistroCola = {
    clave: clave(m.obraId, m.colaboradorId, m.fecha),
    obraId: m.obraId,
    colaboradorId: m.colaboradorId,
    fecha: m.fecha,
    fraccion: m.fraccion,
    empresaId: m.empresaId,
    updatedAt: m.updatedAt || Date.now(),
    intentos: 0,
    // Reemplazar la celda limpia cualquier bloqueo previo: es una captura
    // nueva del usuario y merece su propia tanda de intentos.
    bloqueada: false,
  };
  await idbPut(STORE_COLA, reg);
  await refrescarConteo();
}

export async function listarPendientes(): Promise<MarcaPendiente[]> {
  const todas = await idbGetAll<RegistroCola>(STORE_COLA);
  todas.sort((a, b) => a.updatedAt - b.updatedAt);
  return todas.map(aMarca);
}

// ── Clasificación de errores ──────────────────────────────────────────────

type TipoError = 'transitorio' | 'permanente';

/**
 * Distingue un fallo de red (la marca sigue pendiente, hay que reintentar) de
 * un rechazo del servidor por RLS/permiso o dato inválido (reintentar es
 * inútil: hay que reportarlo al usuario).
 *
 * Criterio: PostgREST/Postgres devuelven `code` (SQLSTATE tipo `42501`, `23503`,
 * o `PGRST###`). Un `fetch` caído no trae `code` y sí un `TypeError: Failed to
 * fetch`. Los 5xx y el 429 son del servidor pero SÍ son transitorios.
 */
function clasificar(e: unknown): { tipo: TipoError; mensaje: string } {
  const err = e as { message?: string; code?: string; status?: number; name?: string } | null;
  const mensaje = err?.message?.trim() || 'Error desconocido al guardar la asistencia.';
  const code = err?.code ? String(err.code) : '';
  const status = typeof err?.status === 'number' ? err.status : undefined;

  // Sin red: el navegador ya nos lo dice.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { tipo: 'transitorio', mensaje };
  }
  // Fallo de transporte: `fetch` lanza TypeError, sin código de Postgres.
  if (
    !code &&
    (err?.name === 'TypeError' ||
      err?.name === 'AbortError' ||
      /failed to fetch|networkerror|network request failed|load failed|timeout|timed out/i.test(
        mensaje,
      ))
  ) {
    return { tipo: 'transitorio', mensaje };
  }
  // Servidor caído o rate limit: reintentar tiene sentido.
  if (status !== undefined && (status >= 500 || status === 429)) {
    return { tipo: 'transitorio', mensaje };
  }
  if (/^(5\d\d|429)$/.test(code)) return { tipo: 'transitorio', mensaje };
  // Postgres puede caerse a media escritura; estos SQLSTATE son reintentables.
  // 08### conexión, 40001 serialización, 40P01 deadlock, 57014 cancelado.
  if (/^08|^40001$|^40P01$|^57014$/.test(code)) return { tipo: 'transitorio', mensaje };

  // Todo lo demás (42501 RLS, 23503 FK, 23514 check, 22P02 dato inválido,
  // PGRST301 JWT expirado sin refrescar…) es permanente para esta marca.
  return { tipo: 'permanente', mensaje };
}

// ── Empresa de la sesión activa ───────────────────────────────────────────

let _empresaCache: { userId: string; empresaId: string } | null = null;

/**
 * Empresa del usuario autenticado AHORA MISMO en este navegador.
 * Devuelve `null` si no hay sesión (o no se pudo consultar): en ese caso el
 * flush se pospone, nunca descarta.
 */
async function empresaDeLaSesion(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    _empresaCache = null;
    return null;
  }
  if (_empresaCache?.userId === user.id) return _empresaCache.empresaId;

  const { data: mem, error } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (error || !mem) return null;

  const empresaId = mem.empresa_id as string;
  _empresaCache = { userId: user.id, empresaId };
  return empresaId;
}

// ── Envío de una marca ────────────────────────────────────────────────────

async function enviarMarca(reg: RegistroCola): Promise<void> {
  const supabase = createClient();

  // Buscamos el `id` existente de la celda ANTES del upsert. Motivo: PostgREST
  // implementa el upsert como `ON CONFLICT … DO UPDATE SET <todas las columnas
  // enviadas>`, así que mandar un `id` nuevo sobre una fila existente le
  // cambiaría la llave primaria. La app móvil hace pull por
  // `server_updated_at` e `INSERT OR REPLACE` por PK: un cambio de `id` le
  // dejaría DOS filas locales para el mismo (colaborador, obra, fecha) y al
  // hacer push reventaría `uq_asist` — exactamente el error de producción del
  // 2026-07-09. Reusando el `id` que ya existe, eso no puede pasar.
  const { data: existente, error: errSel } = await supabase
    .from('asistencias')
    .select('id')
    .eq('obra_id', reg.obraId)
    .eq('colaborador_id', reg.colaboradorId)
    .eq('fecha', reg.fecha)
    .maybeSingle();
  if (errSel) throw errSel;

  const id = (existente?.id as string | undefined) ?? crypto.randomUUID();

  // `upsert` sobre la restricción única natural, NO el `select`+`insert` de la
  // Server Action. Con `select`+`insert` dos dispositivos pueden generar UUIDs
  // distintos para la misma celda y chocar con
  // `duplicate key value violates unique constraint "uq_asist"` (producción,
  // 2026-07-09). Con `onConflict` sobre `uq_asist` la colisión se resuelve como
  // UPDATE en el servidor y ese error es imposible.
  //
  // `deleted_at: null` reactiva filas borradas en suave, igual que la Server
  // Action actual. `cuadrilla_id` se omite a propósito: no enviarlo hace que el
  // UPDATE lo deje intacto (si se enviara null, borraría la cuadrilla asignada).
  const payload: Record<string, unknown> = {
    id,
    empresa_id: reg.empresaId,
    colaborador_id: reg.colaboradorId,
    obra_id: reg.obraId,
    fecha: reg.fecha,
    fraccion: reg.fraccion,
    deleted_at: null,
    updated_at: reg.updatedAt, // sello de CAPTURA, no de envío
  };
  // `created_at` sólo en filas nuevas: incluirlo siempre lo pisaría en cada
  // re-marca (el UPDATE del upsert asigna todas las columnas enviadas).
  if (!existente) payload.created_at = reg.updatedAt;

  const { error } = await supabase
    .from('asistencias')
    .upsert(payload, { onConflict: 'colaborador_id,obra_id,fecha' });
  if (error) throw error;
}

// ── Flush ─────────────────────────────────────────────────────────────────

/**
 * Serialización del flush: sólo puede correr una pasada a la vez. Si llega otra
 * llamada mientras hay una en vuelo se marca `_rerun` y, al terminar, se
 * encadena una pasada más. Así ninguna marca encolada durante el envío se queda
 * esperando al siguiente disparador (que en iOS puede tardar minutos).
 */
let _enVuelo: Promise<{ enviadas: number; fallidas: number }> | null = null;
let _rerun = false;

/** Intenta enviar todo lo pendiente. Seguro de llamar en paralelo. */
export function flush(): Promise<{ enviadas: number; fallidas: number }> {
  if (_enVuelo) {
    _rerun = true;
    return _enVuelo;
  }
  _enVuelo = (async () => {
    let total = { enviadas: 0, fallidas: 0 };
    try {
      let pasadas = 0;
      do {
        _rerun = false;
        const r = await flushUnaPasada();
        total = { enviadas: total.enviadas + r.enviadas, fallidas: total.fallidas + r.fallidas };
        // Si la pasada falló sin enviar nada, no tiene caso repetir en bucle:
        // el auto-flush con backoff se encargará más tarde. (Una pasada con
        // cero enviadas y cero fallidas es simplemente la cola vacía, y ahí sí
        // conviene repetir por si entró una marca nueva durante el envío.)
        if (r.enviadas === 0 && r.fallidas > 0) break;
      } while (_rerun && ++pasadas < 5);
    } finally {
      _enVuelo = null;
      _rerun = false;
    }
    return total;
  })();
  return _enVuelo;
}

async function flushUnaPasada(): Promise<{ enviadas: number; fallidas: number }> {
  if (!hayIdb()) return { enviadas: 0, fallidas: 0 };

  const todas = await idbGetAll<RegistroCola>(STORE_COLA);
  if (todas.length === 0) {
    emitir({ pendientes: 0, ultimoError: undefined });
    return { enviadas: 0, fallidas: 0 };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitir({ enLinea: false, pendientes: todas.length });
    return { enviadas: 0, fallidas: todas.length };
  }

  emitir({ enviando: true, pendientes: todas.length });
  try {
    const empresaSesion = await empresaDeLaSesion();
    if (!empresaSesion) {
      // Sin sesión no se puede escribir (RLS) ni verificar el tenant. NO se
      // descarta nada: se espera a que el usuario vuelva a entrar.
      emitir({ ultimoError: 'Sin sesión activa: la asistencia sigue pendiente de subir.' });
      return { enviadas: 0, fallidas: todas.length };
    }

    // GUARDA MULTI-TENANT: otro usuario pudo iniciar sesión en este mismo
    // dispositivo (tablet compartida de obra). Subir marcas encoladas por el
    // usuario anterior bajo la sesión del actual las escribiría en la empresa
    // equivocada, o las rechazaría RLS. Se descartan.
    const ajenas = todas.filter((r) => r.empresaId !== empresaSesion);
    if (ajenas.length > 0) {
      await idbDeleteMuchos(STORE_COLA, ajenas.map((r) => r.clave));
    }

    const propias = todas
      .filter((r) => r.empresaId === empresaSesion)
      // Las bloqueadas ya agotaron sus intentos por un error permanente: no se
      // reintentan en bucle, pero tampoco se borran (siguen visibles al usuario).
      .filter((r) => !r.bloqueada)
      // Orden cronológico de captura: reproduce el orden real de los hechos.
      .sort((a, b) => a.updatedAt - b.updatedAt);

    let enviadas = 0;
    let fallidas = 0;
    let ultimoError: string | undefined;

    for (const reg of propias) {
      try {
        await enviarMarca(reg);
        await idbDelete(STORE_COLA, reg.clave);
        enviadas++;
      } catch (e) {
        const { tipo, mensaje } = clasificar(e);
        fallidas++;
        ultimoError = mensaje;
        const intentos = reg.intentos + 1;
        const bloqueada = tipo === 'permanente' && intentos >= MAX_INTENTOS_PERMANENTE;
        await idbPut<RegistroCola>(STORE_COLA, {
          ...reg,
          intentos,
          ultimoError: mensaje,
          bloqueada,
        });
        if (tipo === 'transitorio') {
          // Se cayó la red a media pasada: no tiene caso seguir golpeando el
          // servidor con las demás marcas. Se corta y se reintenta con backoff.
          fallidas += propias.length - propias.indexOf(reg) - 1;
          break;
        }
      }
    }

    await refrescarConteo();
    if (ultimoError) emitir({ ultimoError });
    else if (enviadas > 0) emitir({ ultimoError: undefined });
    return { enviadas, fallidas };
  } finally {
    emitir({ enviando: false });
  }
}

// ── Auto-flush ────────────────────────────────────────────────────────────

/// Background Sync API no sirve para este caso: no existe en iOS Safari, que es
/// justo el dispositivo objetivo (tablets/iPhones en obra). El flush real se
/// dispara al cargar, al reconectar, al enfocar la pestaña y con un reintento
/// de respaldo con backoff exponencial.

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/**
 * Arranca los disparadores automáticos. Devuelve la función de limpieza.
 * Idempotente: llamarla dos veces no duplica listeners.
 */
export function iniciarAutoFlush(): () => void {
  if (typeof window === 'undefined') return () => {};

  let vivo = true;
  let fallosSeguidos = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const agendar = (ms: number) => {
    if (!vivo) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void correr();
    }, ms);
  };

  const correr = async () => {
    if (!vivo) return;
    const { enviadas, fallidas } = await flush();
    if (!vivo) return;
    if (fallidas > 0) {
      fallosSeguidos++;
      // Backoff exponencial con techo, para no martillar la red del celular
      // ni gastar batería cuando la obra simplemente no tiene señal.
      agendar(Math.min(BACKOFF_BASE_MS * 2 ** (fallosSeguidos - 1), BACKOFF_MAX_MS));
    } else {
      fallosSeguidos = 0;
      if (enviadas > 0) agendar(BACKOFF_BASE_MS); // pudo entrar algo más mientras
    }
  };

  const alConectar = () => {
    emitir({ enLinea: true });
    fallosSeguidos = 0; // volvió la red: reintentar ya, sin esperar el backoff
    agendar(0);
  };
  const alDesconectar = () => emitir({ enLinea: false });
  const alVolverVisible = () => {
    if (document.visibilityState === 'visible') {
      fallosSeguidos = 0;
      agendar(0);
    }
  };

  window.addEventListener('online', alConectar);
  window.addEventListener('offline', alDesconectar);
  window.addEventListener('focus', alVolverVisible);
  document.addEventListener('visibilitychange', alVolverVisible);

  emitir({ enLinea: navigator.onLine });
  void refrescarConteo();
  agendar(0); // flush al cargar

  return () => {
    vivo = false;
    if (timer) clearTimeout(timer);
    window.removeEventListener('online', alConectar);
    window.removeEventListener('offline', alDesconectar);
    window.removeEventListener('focus', alVolverVisible);
    document.removeEventListener('visibilitychange', alVolverVisible);
  };
}

/**
 * Desbloquea las marcas que se dieron por perdidas por un error permanente y
 * fuerza un nuevo intento. Pensado para un botón "Reintentar" en la UI cuando
 * el usuario ya corrigió la causa (p. ej. le dieron permisos sobre la obra).
 */
export async function reintentarBloqueadas(): Promise<{ enviadas: number; fallidas: number }> {
  const todas = await idbGetAll<RegistroCola>(STORE_COLA);
  for (const r of todas) {
    if (r.bloqueada) {
      await idbPut<RegistroCola>(STORE_COLA, { ...r, bloqueada: false, intentos: 0 });
    }
  }
  await refrescarConteo();
  return flush();
}
