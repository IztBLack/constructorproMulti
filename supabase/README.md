# ☁️ Backend Supabase — ConstructorPro (Fase ②, cimiento)

Espejo en Postgres del esquema local (Drift) + Auth + RLS, base del sync
offline-first. La app móvil sigue siendo offline-first (Drift = fuente de verdad);
Supabase es el punto de encuentro para sync y para la web `/admin` + `/cliente`.

> **Estado:** SQL **listo para correr**, pero el proyecto Supabase **aún no existe**.
> Estos archivos no tocan la app; son el guion de creación del backend.

## Qué hace cada archivo (correr en orden)

| Archivo | Contenido |
|---|---|
| `migrations/0001_tenancy.sql` | `empresas`, `usuarios_empresa` (roles), funciones helper de auth (`auth_empresa_ids`, `auth_tiene_rol`). |
| `migrations/0002_schema.sql` | Espejo de las **13 tablas** con columnas de sync (`empresa_id`, `created_at`, `updated_at`, `server_updated_at`, `deleted_at`) + trigger que sella `server_updated_at` (árbitro de LWW y cursor de pull). |
| `migrations/0003_rls.sql` | RLS: **aislamiento por `empresa_id`** en todas las tablas (baseline seguro: nadie ve datos de otra empresa). El **portal de clientes** queda como TODO al final (decisión pendiente, ver abajo). |

## Pasos para activarlo (los haces tú)

1. Crear proyecto en [supabase.com](https://supabase.com) (región cercana, p. ej. `us-east`).
2. En **SQL Editor**, correr `0001` → `0002` → `0003` en ese orden.
   - Alternativa con CLI: `supabase link` + `supabase db push`.
3. Copiar **Project URL** y **anon key** (Settings → API). Se usarán en:
   - Flutter: `supabase_flutter` (Fase 2 sync).
   - Web Next.js: `@supabase/supabase-js`.
4. Crear tu primera `empresa` y tu `usuarios_empresa` (rol `admin`) — ver final de `0001`.

## Decisiones embebidas (cámbialas si no te cuadran)

- **`id` = UUID** en todas las tablas (igual que el cliente). `obra_colaborador` mantiene
  PK compuesta `(obra_id, colaborador_id)`.
- **Fechas/timestamps = `bigint` (epoch ms)** para casar 1:1 con Drift (no `timestamptz`).
- **`server_updated_at`** lo pone Postgres por trigger; el cliente NUNCA lo escribe.
- **`sync_status` NO existe en el servidor** (es estado local del cliente).
- **FKs `DEFERRABLE INITIALLY DEFERRED`** para que el push en lote no truene por orden.
- **Soft-delete:** se respeta `deleted_at`; el servidor no borra físico.

## ⚠️ Pendiente de TU decisión: modelo del portal `/cliente`

`0003` deja el acceso de rol `cliente` como **TODO**. Hay que decidir cómo un
usuario-cliente ve "sus" cotizaciones/obras. Propuesta por defecto (la más simple y
segura): una tabla de **concesión explícita** `cliente_acceso(user_id, cotizacion_id)`
que el `admin` llena → el cliente solo ve lo que le concedieron. Confírmalo y cierro el RLS del portal.
