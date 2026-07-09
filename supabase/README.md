# ☁️ Backend Supabase — ConstructorPro (Fase ②, cimiento)

Espejo en Postgres del esquema local (Drift) + Auth + RLS, base del sync
offline-first. La app móvil sigue siendo offline-first (Drift = fuente de verdad);
Supabase es el punto de encuentro para sync y para la web `/admin` + `/cliente`.

> **Estado:** proyecto Supabase **activo en producción** (`vmkkkrlctakzzqebtyci`),
> migraciones `0001`–`0009` corridas. Este directorio ya no es "guion de creación"
> puro: es el historial versionado del esquema. Detalle sesión a sesión en
> `docs/BITACORA.md` (local, no se publica); guía de deploy en `web/DEPLOY.md`
> (incluye cómo aplicar una migración nueva sin el CLI vinculado).

## Qué hace cada archivo (correr en orden)

| Archivo | Contenido |
|---|---|
| `migrations/0001_tenancy.sql` | `empresas`, `usuarios_empresa` (roles), funciones helper de auth (`auth_empresa_ids`, `auth_tiene_rol`). |
| `migrations/0002_schema.sql` | Espejo de las **13 tablas** con columnas de sync (`empresa_id`, `created_at`, `updated_at`, `server_updated_at`, `deleted_at`) + trigger que sella `server_updated_at` (árbitro de LWW y cursor de pull). |
| `migrations/0003_rls.sql` | RLS: **aislamiento por `empresa_id`** en todas las tablas (baseline seguro: nadie ve datos de otra empresa). |
| `migrations/0004_vinculacion.sql` | `codigos_vinculacion` + RPC `canjear_codigo_vinculacion` (vínculo móvil/portal por código de 6 dígitos, con `rol`). |
| `migrations/0005_onboarding.sql` | RPC `crear_empresa` (alta atómica de empresa + binding admin + siembra de catálogo base). |
| `migrations/0006_clientes.sql` | Tabla `clientes` + `obras.cliente_id`/`avance` + `cotizaciones.cliente_id` + RLS de solo-lectura para rol `cliente` (portal). |
| `migrations/0007_storage_y_cliente_responde.sql` | Bucket Storage `cotizaciones` (archivos adjuntos) + RPC `cliente_responder_cotizacion`. |
| `migrations/0008_control_pagos_obra.sql` | `movimientos.nombre` + tabla `obra_presupuesto` (estado de cuenta de obra estilo Excel). |
| `migrations/0009_sueldo_periodo_colaborador.sql` | `colaboradores.periodo_pago`/`salario_periodo`/`dias_semana` — sueldo capturado por periodo (semanal/quincenal/mensual); el salario diario que usa la nómina (`salario_personalizado`) pasa a derivarse de estos campos. |

## Pasos para activarlo (ya activo; referencia si se recrea el proyecto)

1. Crear proyecto en [supabase.com](https://supabase.com) (región cercana, p. ej. `us-east`).
2. En **SQL Editor**, correr `0001` → `0002` → … → el más alto, en orden.
   - Alternativa con CLI: `supabase link` + `supabase db push` (no usado hasta ahora en este proyecto — ver nota de "Estado" arriba).
   - Alternativa sin navegador: Management API con un Personal Access Token (`SUPABASE_ACCESS_TOKEN`) — ver `web/DEPLOY.md` § "Migraciones".
3. Copiar **Project URL** y **anon key** (Settings → API). Se usan en:
   - Flutter: `supabase_flutter` (sync).
   - Web Next.js: `@supabase/supabase-js` (`web/.env.local`).
4. Crear tu primera `empresa` y tu `usuarios_empresa` (rol `admin`) — vía RPC `crear_empresa` (ver `0005`), no por INSERT directo (RLS lo bloquea).

## Decisiones embebidas (cámbialas si no te cuadran)

- **`id` = UUID** en todas las tablas (igual que el cliente). `obra_colaborador` mantiene
  PK compuesta `(obra_id, colaborador_id)`.
- **Fechas/timestamps = `bigint` (epoch ms)** para casar 1:1 con Drift (no `timestamptz`).
- **`server_updated_at`** lo pone Postgres por trigger; el cliente NUNCA lo escribe.
- **`sync_status` NO existe en el servidor** (es estado local del cliente).
- **FKs `DEFERRABLE INITIALLY DEFERRED`** para que el push en lote no truene por orden.
- **Soft-delete:** se respeta `deleted_at`; el servidor no borra físico.

## ✅ Modelo del portal `/cliente` (decidido e implementado en `0006`)

`0003` dejaba el acceso de rol `cliente` como TODO. Se resolvió con la tabla
`clientes(id, empresa_id, nombre, email, telefono, user_id)`: el admin crea el
cliente y le asigna obras (`obras.cliente_id`) y cotizaciones
(`cotizaciones.cliente_id`); el cliente se vincula su cuenta vía código de 6
dígitos (`0004`, rol `cliente`); RLS de solo-lectura en `0006` scopea todo por
`clientes.user_id = auth.uid()`.
