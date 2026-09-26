# Progreso — Alcance ampliado (ejecución de `PLAN_ALCANCE_AMPLIADO.md`)

**Rama de integración:** `claude/project-target-audience-c50407` (base `22805aa`)
**Arranque:** 2026-09-25
**Regla de oro:** nada de esto se aplica a producción (Supabase prod ni Vercel prod)
sin el visto bueno de Mario. Todo queda en ramas, con migraciones escritas y probadas
en local (PGlite).

---

## Decisiones tomadas (resumen para Mario al final)

| # | Decisión | Por qué |
|---|---|---|
| D1 | El **supervisor NO ve la utilidad** de la obra (solo admin y contador) | El margen es información del dueño. El supervisor ya ve la raya y los costos de campo; si ve el margen, se vuelve tema de negociación. Así lo manejan los ERP del ramo (el residente ve avance y costo, no la utilidad) |
| D2 | **Los módulos son gratis por ahora**: el admin los prende y apaga sin restricción | El modelo de negocio sigue sin definirse (el copy de precio de la landing es neutro). El control vive en la RPC `activar_modulos`, así que cobrar después es un cambio en un solo lugar |
| D3 | **Sin asesor fiscal:** claves SAT **sugeridas** con la leyenda "confírmala con tu contador"; nunca se timbra | Se investigó el catálogo c_ClaveProdServ. Con un facilitador, un error se corrige al capturar, porque la app no emite el CFDI |
| D4 | **Residente = supervisor limitado a sus obras asignadas** (`usuario_obra`) | Es el uso estándar en México: el residente responde por una o varias obras concretas. Se reusan las policies del supervisor más un filtro por obra, en vez de un rol con permisos inventados |
| D5 | Orden de trabajo: F0 → (F1, F1b, móvil-F0) → (F2, F3, F5) → (F4, F6, F7) | Las dependencias técnicas del plan (§5) |
| D6 | **Web primero en todos los módulos nuevos.** En el móvil solo entran el gating de módulos (F0) y las pantallas marcadas "disponible en la web" | El móvil va atrasado (Drift v13, sin tesorería 0016-0025). El plan ya lo prevé: el móvil oculta lo que no implementa |
| D7 | Apagar un módulo **oculta, no borra**. RLS no cambia por módulo | Regla del plan §2.3 |
| D8 | Incidentes de seguridad (F7): datos de salud mínimos, visibles solo para el admin | Son datos sensibles según la LFPDPPP |

(Cada agente agrega aquí las decisiones menores que tome, con su porqué.)

---

## Convenciones para todos los agentes

- **ECC:** los checklists están en `~/.claude/ecc/skills/` (`database-migrations`,
  `security-review`, `nextjs-turbopack`, `react-patterns`, `frontend-a11y`). Léelos
  antes de escribir.
- **Next.js 16:** lee `web/AGENTS.md`. Esta versión tiene cambios que rompen: consulta
  `web/node_modules/next/dist/docs/` antes de usar APIs de las que no estés seguro.
- **Migraciones SQL:** aditivas e idempotentes (`if not exists`, `drop policy if exists`).
  Columnas de sync en cada tabla (`created_at`, `updated_at`, `server_updated_at`,
  `deleted_at` en bigint ms), `empresa_id` + policies con `public.auth_tiene_rol(...)`.
  Las policies de escritura validan que el **padre** sea de la misma empresa (lección de
  0019). Encabezado explicativo como en `0031_notas_obra.sql`.
- **Numeración reservada** (no la cambies):

  | Mig | Fase |
  |---|---|
  | 0035 | F0 módulos por empresa + perfil + RPC `activar_modulos` + `crear_empresa` v2 |
  | 0036 | F1 órdenes de cambio + categoría de costo en movimientos + objetivo de margen |
  | 0037 | F1b datos fiscales (emisor, receptor, claves SAT, estado fiscal por cobro) |
  | 0038 | F2 compras y material |
  | 0039 | F3 avance y estimaciones |
  | 0040 | F5 cumplimiento + subcontratos |
  | 0041 | F4 bitácora + programa |
  | 0042 | F6 residente/compras/almacén + `usuario_obra` + bitácora de actividad |
  | 0043 | F7 seguridad, postventa, herramienta |

- **Registro de módulos:** `web/src/lib/modulos.ts` es la **única** fuente. Cada fase
  cambia `disponible: true` en su módulo y registra su entrada de nav. No crees listas
  paralelas.
- **Copy:** español de México, lenguaje de obra, sin tecnicismos. Contraste AA. Botones
  de mínimo 44px.
- **Verificación obligatoria antes de entregar** (desde `web/`): `npx tsc --noEmit`,
  `npx eslint <archivos tocados>`, `npx vitest run`, y la prueba de migraciones en
  PGlite (`web/src/db/`, ver `web/src/db/pglite/README.md`) cuando exista. Lógica de dinero = tests unitarios.
- **Git:** commits en español con el formato del repo (`feat(modulo): …`), terminando con
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push, sin tocar prod.

---

## Estado

| Fase | Estado | Rama/commit | Notas |
|---|---|---|---|
| Harness PGlite | ✅ | f36a70e | 34 migraciones sin reemplazos, 26 tests RLS, ~12 s |
| F0 web | ⏳ | | |
| F0 móvil | ⏳ | | |
| F1 | ⏳ | | |
| F1b | ⏳ | | |
| F2 | ⏳ | | |
| F3 | ⏳ | | |
| F5 | ⏳ | | |
| F4 | ⏳ | | |
| F6 | ⏳ | | |
| F7 | ⏳ | | |
