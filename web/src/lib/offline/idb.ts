/// Envoltorio mínimo de IndexedDB a mano (sin dependencias nuevas).
///
/// ¿Por qué IndexedDB y no localStorage? El pase de lista puede acumular
/// cientos de marcas y, sobre todo, snapshots de semana completos con la lista
/// de colaboradores. localStorage tiene ~5MB y es síncrono (bloquea el hilo de
/// UI en cada escritura, justo mientras el capturista pica celdas). IndexedDB
/// es asíncrono y en iOS Safari ronda los ~50MB por origen — de ahí que
/// `podarSnapshots()` exista.
///
/// Todo aquí es SSR-safe: si no hay `window`/`indexedDB` las funciones
/// resuelven en vacío en vez de reventar, para que importar este módulo desde
/// un componente de servidor no rompa el render.

const NOMBRE_DB = 'constructorpro-offline';
const VERSION_DB = 1;

/** Cola de marcas de asistencia pendientes de subir. Clave: `${obraId}|${colaboradorId}|${fecha}`. */
export const STORE_COLA = 'cola_asistencia';
/** Snapshots de lectura por (obra, semana). Clave: `${obraId}|${inicioSemanaMs}`. */
export const STORE_SNAPSHOTS = 'snapshots_asistencia';

/** ¿Estamos en un navegador con IndexedDB utilizable? */
export function hayIdb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

let _db: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (_db) return _db;
  _db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(NOMBRE_DB, VERSION_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_COLA)) {
        db.createObjectStore(STORE_COLA, { keyPath: 'clave' });
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        const st = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'clave' });
        // Índice por antigüedad: `podarSnapshots()` recorre del más viejo al
        // más nuevo sin tener que cargar todos los snapshots en memoria.
        st.createIndex('porGuardadoEn', 'guardadoEn');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Si otra pestaña abre una versión mayor, cerramos para no bloquearla.
      db.onversionchange = () => {
        db.close();
        _db = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB.'));
    req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña.'));
  });
  // Si falla la apertura (modo privado antiguo de Safari, cuota, etc.) no
  // dejamos la promesa rota cacheada para siempre: el siguiente intento reabre.
  _db.catch(() => {
    _db = null;
  });
  return _db;
}

function esperar<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Fallo en IndexedDB.'));
  });
}

/** Ejecuta `fn` dentro de una transacción y resuelve cuando la transacción hace commit. */
async function conTx<T>(
  store: string,
  modo: IDBTransactionMode,
  fn: (st: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await abrir();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, modo);
    let valor: T;
    let fallo: unknown = null;
    tx.oncomplete = () => (fallo ? reject(fallo) : resolve(valor));
    tx.onerror = () => reject(tx.error ?? fallo ?? new Error('Transacción fallida.'));
    tx.onabort = () => reject(tx.error ?? fallo ?? new Error('Transacción abortada.'));
    Promise.resolve(fn(tx.objectStore(store))).then(
      (v) => {
        valor = v;
      },
      (e) => {
        fallo = e;
        try {
          tx.abort();
        } catch {
          /* ya abortada */
        }
      },
    );
  });
}

export async function idbPut<T>(store: string, valor: T): Promise<void> {
  if (!hayIdb()) return;
  await conTx(store, 'readwrite', (st) => esperar(st.put(valor)));
}

export async function idbGet<T>(store: string, clave: string): Promise<T | null> {
  if (!hayIdb()) return null;
  const v = await conTx(store, 'readonly', (st) => esperar<T | undefined>(st.get(clave)));
  return v ?? null;
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  if (!hayIdb()) return [];
  return conTx(store, 'readonly', (st) => esperar<T[]>(st.getAll()));
}

export async function idbDelete(store: string, clave: string): Promise<void> {
  if (!hayIdb()) return;
  await conTx(store, 'readwrite', (st) => esperar(st.delete(clave)));
}

export async function idbDeleteMuchos(store: string, claves: string[]): Promise<void> {
  if (!hayIdb() || claves.length === 0) return;
  await conTx(store, 'readwrite', (st) => {
    for (const c of claves) st.delete(c);
    return undefined;
  });
}

export async function idbCount(store: string): Promise<number> {
  if (!hayIdb()) return 0;
  return conTx(store, 'readonly', (st) => esperar<number>(st.count()));
}
