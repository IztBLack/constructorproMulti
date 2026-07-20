/// Snapshot de LECTURA del pase de lista unificado (un día, todas las obras).
///
/// Hermano de `snapshot-asistencia.ts` (que guarda por obra+semana): aquí la
/// unidad es el DÍA completo con todas las obras activas, que es lo que pinta
/// `/admin/pase-lista`. La cola (`cola-asistencia.ts`) ya resuelve la escritura
/// sin señal, pero sin esto la pantalla abriría en blanco en la obra.
///
/// La clave del día es el epoch ms de la medianoche de México. NUNCA se
/// construye con `new Date('YYYY-MM-DD')` (eso interpreta la cadena en UTC y
/// desfasa el día, bug ya sufrido en este proyecto): usa los helpers de
/// `@/lib/data/tz`.
///
/// ─────────────────────────────────────────────────────────────────────────
/// GUARDA MULTI-TENANT SIN RED — la parte frágil, léela antes de tocar nada.
/// ─────────────────────────────────────────────────────────────────────────
/// El escenario real es una tablet o un teléfono compartido en obra donde hoy
/// entra el capturista de la empresa A y mañana el de la empresa B. Si B abre la
/// pantalla sin señal, NO puede ver la lista de trabajadores que dejó cacheada A.
///
/// El problema es que la verificación tiene que correr justo cuando no hay red,
/// así que las dos formas habituales de saber a qué empresa pertenece el usuario
/// están prohibidas aquí:
///   - `supabase.auth.getUser()` → hace un round-trip a /auth/v1/user.
///   - consultar `usuarios_empresa` → obviamente también.
/// Lo único que sí funciona offline es `supabase.auth.getSession()`: lee el JWT
/// del almacenamiento local. De ahí sale el `user.id`, pero NO la empresa.
///
/// Solución: un mapa local `userId → empresaId` que se escribe en
/// `guardarSnapshotDia()`, es decir en el único momento en que SÍ hubo red y se
/// conocen ambos valores (`DatosPaseLista.empresaId` viene de `usuarios_empresa`
/// recién consultada). Al leer se compara la `empresaId` del snapshot contra la
/// que ese `userId` tiene mapeada.
///
/// El diseño falla CERRADO: sin sesión, con un `userId` que nunca se mapeó, o
/// con empresas que no coinciden, se devuelve `null` **y se borra el snapshot**.
/// Como mucho el usuario ve la pantalla vacía hasta que recupere señal —
/// molesto, pero recuperable. Lo contrario (fallar abierto) sería enseñarle los
/// trabajadores y los sueldos de otra empresa, que es una fuga de datos.
///
/// Nota para el futuro: el mapa NO es un caché de conveniencia, es el ancla de
/// la guarda. Si alguien lo mueve, lo poda o lo deja de escribir, la guarda deja
/// de proteger (o deja de funcionar del todo). `podarSnapshotsDia()` lo excluye
/// a propósito.

import type { DatosPaseLista } from '@/lib/data/pase-lista-cliente';
import { createClient } from '@/lib/supabase/client';
import { STORE_SNAPSHOTS, hayIdb, idbDelete, idbDeleteMuchos, idbGet, idbGetAll, idbPut } from './idb';

/// Se reutiliza el store `STORE_SNAPSHOTS` en lugar de crear uno nuevo porque
/// `idb.ts` declara sus stores en la versión 1 de la base y añadir otro exigiría
/// subir `VERSION_DB` (migración para todos los usuarios ya instalados). Para no
/// pisarse con los snapshots por obra+semana de `snapshot-asistencia.ts`, las
/// claves de este módulo van prefijadas con `pl|`.
///
/// Consecuencia conocida: `podarSnapshots()` de aquel módulo poda por
/// antigüedad SIN mirar el prefijo, así que puede borrar registros de éste
/// (incluido el mapa de tenant) si el usuario usa mucho la vista semanal por
/// obra. Es degradación aceptable —todo esto se vuelve a bajar del servidor— y
/// nunca abre la guarda: sin mapa, `leerSnapshotDia()` devuelve `null`.
const PREFIJO_DIA = 'pl|dia|';
const PREFIJO_TENANT = 'pl|tenant|';

/** Días de snapshot que se conservan por defecto (iOS tiene techo de ~50MB). */
const MAX_DIAS_POR_DEFECTO = 7;

interface RegistroDia {
  /** `pl|dia|${diaMs}` (keyPath del store). */
  clave: string;
  datos: DatosPaseLista;
  guardadoEn: number;
}

interface RegistroTenant {
  /** `pl|tenant|${userId}` (keyPath del store). */
  clave: string;
  empresaId: string;
  guardadoEn: number;
}

function claveDia(diaMs: number): string {
  return `${PREFIJO_DIA}${diaMs}`;
}

function claveTenant(userId: string): string {
  return `${PREFIJO_TENANT}${userId}`;
}

/**
 * `userId` de la sesión guardada en este navegador, o `null`.
 *
 * `getSession()` lee el JWT del almacenamiento local: funciona sin red, que es
 * justo el caso de uso. Si el token está vencido puede intentar refrescarlo y
 * fallar; se atrapa y se trata como "sin sesión" (fallo cerrado).
 */
async function userIdDeLaSesion(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { data } = await createClient().auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Guarda (o reemplaza) el snapshot de ese día y, con él, el mapa
 * `userId → empresaId` que hace posible la guarda multi-tenant offline.
 *
 * Llamar SOLO tras una carga exitosa desde el servidor: es el único momento en
 * que `d.empresaId` es de fiar (viene de `usuarios_empresa`) y por tanto el
 * único momento válido para (re)escribir el mapa.
 */
export async function guardarSnapshotDia(d: DatosPaseLista): Promise<void> {
  if (!hayIdb()) return;

  const userId = await userIdDeLaSesion();
  // Sin sesión no se escribe NADA. Un snapshot sin su entrada de tenant sería
  // ilegible después (la guarda lo descartaría), así que guardarlo solo gastaría
  // cuota; y escribir el mapa sin userId es imposible por definición.
  if (!userId) return;

  const ahora = Date.now();
  const tenant: RegistroTenant = {
    clave: claveTenant(userId),
    empresaId: d.empresaId,
    guardadoEn: ahora,
  };
  const dia: RegistroDia = { clave: claveDia(d.diaMs), datos: d, guardadoEn: ahora };

  // El mapa primero: si la segunda escritura falla (cuota), el estado resultante
  // es "mapa sin snapshot", inocuo. Al revés sería "snapshot huérfano", que la
  // guarda tendría que borrar en la siguiente lectura.
  await idbPut(STORE_SNAPSHOTS, tenant);
  await idbPut(STORE_SNAPSHOTS, dia);

  // Poda oportunista: que la UI no tenga que acordarse. Si falla no debe tumbar
  // el guardado.
  void podarSnapshotsDia().catch(() => {});
}

/**
 * Lee el snapshot de ese día. Devuelve `null` si no existe O si pertenece a otra
 * empresa que la de la sesión activa (ver el bloque de la guarda multi-tenant
 * arriba). En los casos de rechazo el snapshot se borra, para no dejar datos de
 * otra empresa ocupando el dispositivo.
 *
 * OJO: devuelve lo que había la última vez que hubo red. La vista debe fusionar
 * encima las marcas todavía pendientes en la cola (`listarPendientes()`) para
 * que el capturista vea sus propias capturas offline reflejadas.
 */
export async function leerSnapshotDia(diaMs: number): Promise<DatosPaseLista | null> {
  if (!hayIdb()) return null;

  const clave = claveDia(diaMs);
  const reg = await idbGet<RegistroDia>(STORE_SNAPSHOTS, clave);
  if (!reg) return null;

  // Caso 1: no hay sesión (usuario salió, o el storage de auth se limpió).
  const userId = await userIdDeLaSesion();
  if (!userId) {
    await idbDelete(STORE_SNAPSHOTS, clave);
    return null;
  }

  // Caso 2: hay sesión pero ese usuario nunca guardó nada en este dispositivo,
  // así que no sabemos su empresa y no podemos afirmar que el snapshot sea suyo.
  const tenant = await idbGet<RegistroTenant>(STORE_SNAPSHOTS, claveTenant(userId));
  if (!tenant) {
    await idbDelete(STORE_SNAPSHOTS, clave);
    return null;
  }

  // Caso 3: el snapshot es de otra empresa (dispositivo compartido).
  if (tenant.empresaId !== reg.datos.empresaId) {
    await idbDelete(STORE_SNAPSHOTS, clave);
    return null;
  }

  return reg.datos;
}

/**
 * Poda los snapshots de día más viejos, conservando los `maxDias` más recientes.
 * En iOS el techo por origen ronda los ~50MB y, al pasarse, Safari puede purgar
 * TODO el origen (incluida la cola de escritura pendiente). Por eso se poda
 * agresivamente la lectura —siempre recuperable del servidor— y nunca la cola,
 * que es dato del usuario aún no subido.
 *
 * Solo toca claves `pl|dia|`: ni el mapa de tenant (ancla de la guarda
 * multi-tenant) ni los snapshots por obra+semana de `snapshot-asistencia.ts`.
 */
export async function podarSnapshotsDia(
  maxDias: number = MAX_DIAS_POR_DEFECTO,
): Promise<void> {
  if (!hayIdb()) return;
  const todos = await idbGetAll<{ clave: string; guardadoEn: number }>(STORE_SNAPSHOTS);
  const mios = todos.filter((r) => typeof r.clave === 'string' && r.clave.startsWith(PREFIJO_DIA));
  if (mios.length <= maxDias) return;
  mios.sort((a, b) => b.guardadoEn - a.guardadoEn); // más reciente primero
  await idbDeleteMuchos(
    STORE_SNAPSHOTS,
    mios.slice(maxDias).map((r) => r.clave),
  );
}
