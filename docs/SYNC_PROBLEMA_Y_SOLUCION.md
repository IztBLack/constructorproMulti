# Problema de Sincronización Nube (Móvil ↔ Web)

> **Estado:** En investigación  
> **Fecha:** 2026-07-10  
> **Versión afectada:** 1.0.1 → 1.0.2  

---

## Resumen del Problema

Al sincronizar manualmente desde el móvil (Nube y sincronización → Sincronizar ahora):
- Los datos creados en el **móvil NO suben** a Supabase (y por tanto no aparecen en la web).
- Los datos creados en la **web NO bajan** al móvil.
- La pantalla muestra "Conectado" y tiene empresa vinculada, pero la sincronización falla silenciosamente o con errores visibles.

---

## Arquitectura del Sistema

```
┌─────────────┐       PUSH        ┌──────────────┐      Lectura/Escritura
│  📱 Móvil   │ ──────────────►  │  ☁️ Supabase  │  ◄──────────────────── │ 🌐 Web │
│  (SQLite)   │ ◄──────────────  │  (PostgreSQL) │                        │ (Next.js) │
└─────────────┘       PULL        └──────────────┘                        └───────────┘
```

| Capa | Tecnología | Rol |
|------|-----------|-----|
| **Móvil** | Flutter + Drift (SQLite) | Fuente de verdad offline. Marca filas con `sync_status` |
| **Supabase** | PostgreSQL + RLS | Hub central. Trigger `set_server_updated_at()` sella cada escritura |
| **Web** | Next.js + Supabase SDK | Online-only. Lee/escribe directo a PostgreSQL. Sin motor de sync |

---

## Cómo Funciona el Motor de Sync del Móvil

### Archivos clave

| Archivo | Responsabilidad |
|---------|----------------|
| `lib/core/sync/sync_service.dart` | Motor principal: PUSH y PULL tabla por tabla |
| `lib/core/sync/sync_controller.dart` | Orquestador automático (cuándo disparar sync) |
| `lib/core/sync/sync_metadata.dart` | Cursores de pull por tabla (SharedPreferences) |
| `lib/core/sync/cloud_providers.dart` | Providers Riverpod + `resolverEmpresaYsellar()` |
| `lib/core/db/app_database.dart` | Triggers SQLite + `sellarEmpresaId()` |

### Flujo de `syncAll()`

```
1. Pre-checks: ¿sesión? ¿red? ¿empresa_id?

2. FASE PUSH (padres → hijos, orden topológico de FK):
   Para cada tabla en pushOrder:
     → SELECT * FROM tabla WHERE sync_status = 'pending'
     → Para cada fila:
         - Validar UUIDs (saltar filas legacy con IDs numéricos)
         - Convertir bools (0/1 → true/false para Postgres)
         - Inyectar empresa_id
         - UPSERT en Supabase (onConflict = PK)
         - Marcar local como sync_status = 'synced'

3. FASE PULL (incremental por cursor):
   Para cada tabla:
     → SELECT * FROM supabase WHERE server_updated_at > cursor LIMIT 1000
     → Para cada fila del servidor:
         - Si existe local con sync_status='pending' y updated_at más nuevo → skip (LWW)
         - Si no → INSERT OR REPLACE con sync_status='synced'
     → Guardar nuevo cursor
```

### Orden topológico de tablas (`pushOrder`)

```
puestos → colaboradores → obras → cotizaciones → secciones → partidas
→ pagos → obra_colaborador → asistencias → destajos → movimientos
→ catalogo_conceptos → archivos_cotizacion
```

> ⚠️ **`obra_presupuesto` NO está incluida** en pushOrder ni en SyncMetadata.

### Disparadores automáticos del sync

| Evento | Delay | Mecanismo |
|--------|-------|-----------|
| Arranque de la app | 1s | `_agendar(1s)` en `start()` |
| Reconexión WiFi | 1s | `Connectivity().onConnectivityChanged` |
| Escritura local | 3s debounce | `_db.tableUpdates()` |
| Sondeo periódico | Cada 25s | `Timer.periodic` |

### Cómo se marcan filas como "pendiente de subir"

1. **Borrado suave:** `deleteObra()` y similares ponen explícitamente `syncStatus: 'pending'`
2. **Trigger SQLite:** `trg_<tabla>_mark_pending` se dispara en `AFTER UPDATE` cuando `sync_status` no cambió (edición del usuario, no del motor de sync)

---

## Causas Raíz Identificadas

### 🔴 CAUSA 1: El PUSH falla y aborta TODA la sincronización (CRÍTICA)

**Ubicación:** `sync_service.dart`, método `_pushTabla()` líneas 265-270.

```dart
} catch (e) {
    final pkVals = pk.map((c) => '$c=${r.data[c]}').join(', ');
    debugPrint('[SyncService] ✖ PUSH $name fallo en fila ($pkVals): $e');
    rethrow;  // ← MATA TODO el syncAll()
}
```

**Impacto:** Si UNA sola fila de UNA sola tabla falla al subir (ej: error `uq_asist` en asistencias), el `rethrow` propaga la excepción hasta `syncAll()`, que:
- Retorna `SyncOutcome.error`
- **Nunca ejecuta el PULL** de ninguna tabla
- Los cambios de la web nunca bajan al móvil

**Ejemplo real observado:**
```
PostgrestException(message: {"code":"23505", "message":"duplicate key value 
violates unique constraint \"uq_asist\""}, code: 409)
```

Una asistencia duplicada bloqueó TODA la sincronización, incluyendo obras, colaboradores, cotizaciones, etc.

### 🟡 CAUSA 2: Tabla `obra_presupuesto` excluida del sync

**Ubicación:** `sync_service.dart` línea 55-69, `sync_metadata.dart` línea 38-52.

La tabla `obra_presupuesto` se creó en la migración v4→v5 pero nunca se agregó a:
- `SyncService.pushOrder`
- `SyncMetadata.tablas`

Los presupuestos creados en la web nunca bajan al móvil y viceversa.

### 🟡 CAUSA 3: Cursores de pull "en el futuro" tras reset de BD

**Ubicación:** `sync_metadata.dart`, método `cursorTs()`.

Si en algún momento se reseteó la base de datos de Supabase (se borraron y recrearon las tablas), los cursores guardados en SharedPreferences del móvil apuntan a un `server_updated_at` mayor al que tienen los datos nuevos del servidor. El pull filtra con `.gt('server_updated_at', cursorTs)`, así que las filas nuevas nunca se traen.

**Solución temporal:** Cerrar sesión y volver a iniciar (el logout ejecuta `metadata.resetAll()`).

### 🟡 CAUSA 4: Conflicto LWW con datos de la web sin `updated_at`

**Ubicación:** `sync_service.dart` líneas 304-311.

La web escribe a Supabase sin poner `updated_at` (timestamp del cliente). Solo el trigger de PostgreSQL pone `server_updated_at`. En el pull, la resolución LWW compara:
```dart
if (pending && localUpd > serverUserUpd) {
    continue; // gana el cambio local
}
```

Si `serverUserUpd` es `null` o `0` (porque la web no lo puso) y `localUpd > 0`, el móvil siempre "gana" y descarta el dato del servidor.

---

## Errores Observados en Producción

| Fecha | Error | Causa | Fix aplicado |
|-------|-------|-------|-------------|
| 2026-07-09 | `SQL logic error: duplicate column name: periodo_pago` | Migración v3→v4 sin verificar columna existente | Agregar `pragma_table_info` check |
| 2026-07-09 | Trigger sobre tabla inexistente en `onUpgrade` | `_instalarTriggersSync()` iteraba todas las tablas de Dart sin verificar existencia en SQLite | Filtrar con `sqlite_master` |
| 2026-07-09 | `duplicate key value violates unique constraint "uq_asist"` | Asistencia local con UUID diferente al del servidor para el mismo (colaborador, obra, fecha) | Resolución de conflicto: adoptar ID del servidor |
| 2026-07-09 | Error de conexión al vincular código | `PostgrestException` se tragaba sin diferenciar entre error real y "ya vinculado" | Mejorar manejo de errores en `_vincular()` |

---

## Solución Propuesta

### 1. No abortar el sync por una fila fallida (Crítica)

Cambiar `_pushTabla` para que al fallar una fila:
- Marque esa fila como `sync_status = 'error'`
- **Continue** con las demás filas y tablas
- **Siempre ejecute el PULL** aunque haya errores en el PUSH

```dart
// ANTES (rompe todo):
} catch (e) { rethrow; }

// DESPUÉS (resiliente):
} catch (e) {
    await db.customStatement(
      "UPDATE $name SET sync_status='error' WHERE ...",
    );
    continue; // seguir con la siguiente fila
}
```

### 2. Agregar `obra_presupuesto` al sync

Agregar `'obra_presupuesto'` a:
- `SyncService.pushOrder` (después de `'obras'`)
- `SyncMetadata.tablas`

### 3. Botón "Forzar re-sync completo"

Agregar a la pantalla de Nube y sincronización un botón que ejecute `metadata.resetAll()` sin cerrar sesión, para resetear cursores cuando se sospeche de datos desfasados.

### 4. Proteger el LWW contra `updated_at` nulo

En `_pullTabla`, tratar `updated_at = null` del servidor como "infinito" (siempre gana el server si no tiene timestamp de cliente):

```dart
final serverUserUpd = (row['updated_at'] as num?)?.toInt() ?? double.maxFinite.toInt();
```

---

## Cómo Verificar que el Sync Funciona

1. **Crear una obra en el móvil** → Sincronizar → Verificar que aparece en la web
2. **Crear una obra en la web** → Esperar 25s o sincronizar manual → Verificar que aparece en el móvil
3. **Editar un colaborador en la web** → Sincronizar → Verificar que el cambio baja al móvil
4. **Crear una asistencia duplicada** → Verificar que NO aborta el sync de las demás tablas
