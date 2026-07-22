# Plan — Módulo de configuración por rol

**Rama:** `feat/settings-por-rol` (creada desde `main` en `f1e568b`)
**Fecha:** 2026-07-20
**Estado:** Fase 1 en curso

---

## Idea rectora

La configuración **no son cuatro pantallas**, es **una que crece con el rol**. Cada rol ve
todo lo del anterior más lo suyo (círculos concéntricos):

| Sección | cliente | colaborador | supervisor | admin |
|---|:--:|:--:|:--:|:--:|
| Mi cuenta (nombre, correo, contraseña) | ✅ | ✅ | ✅ | ✅ |
| Preferencias personales (tema, densidad) | ✅ | ✅ | ✅ | ✅ |
| Campo (recordatorios, datos offline) | — | ✅ | ✅ | ✅ |
| Operación (IVA, catálogo, puestos) | — | — | ✅ | ✅ |
| Empresa (nombre/marca, PDF) | — | — | — | ✅ |
| Usuarios y roles | — | — | — | ✅ |

**Regla que manda sobre todo lo demás:** el rol no decide qué se *oculta*, decide qué se
puede *escribir*. Ocultar una sección en la UI es cosmético — si alguien manda el formulario
a mano, igual pasa. Cada sección va con su policy en Supabase (`auth_tiene_rol`): la UI
oculta, la base de datos rechaza.

## Decisiones tomadas (y por qué)

### 1. Modo oscuro por "paleta invertida" (opción A), no por tokenizar el kit

Hay 1,484 colores fijos en 104 de 113 archivos de `web/src`. Tokenizarlos de verdad
(`bg-surface`, `text-fg`) es lo correcto a largo plazo pero cuesta ~1 semana tocando casi
todo el repo. La opción A redefine las variables de color de Tailwind v4 para que la escala
`neutral` se invierta bajo tema oscuro: **un archivo hace el trabajo de 104**.

Se eligió A por costo (~1-2 días) y porque **no cierra la puerta a B** — al contrario, la
facilita: después de ver la app en oscuro se sabe qué color era "superficie" y cuál "acento".

Precedente importante: alguien ya intentó el modo oscuro aquí y **lo quitó a propósito**
(el comentario sigue en `web/src/app/globals.css`). Falló porque oscurecía el fondo pero
ningún componente del kit tenía estilos oscuros → tarjetas blancas sobre fondo negro. La
opción A ataca justamente esa causa.

### 2. El tema es del **dispositivo**, no de la cuenta

Tres estados, por `localStorage`, **sin tabla ni migración**:

| Estado | Comportamiento |
|---|---|
| **Automático** (por defecto) | Sigue al sistema operativo y cambia **en vivo** si el sistema cambia |
| **Claro** / **Oscuro** | Fijo, ignora al sistema |

Razones: (a) entrar con otra cuenta en la misma laptop no debe mover el tema; (b) **la app
móvil ya funciona así** (`Auto`/`Claro`/`Oscuro` en
`lib/presentation/configuraciones/config_screen.dart:36`) — hacerlo por cuenta en web
obligaría a reconciliar dos modelos distintos en la paridad; (c) `/campo` no consulta la
sesión a propósito (para que el service worker cachee el HTML sin filtrar datos entre
empresas), y un tema por cuenta habría roto eso.

**Consecuencia técnica:** el servidor no conoce el tema al generar el HTML → habría un
parpadeo blanco en cada carga. Se resuelve con un script bloqueante en `<head>` que aplica
la clase antes de pintar, y `suppressHydrationWarning` en `<html>`.

### 3. El toggle vive en la barra, no en la configuración

Icono animado sol ↔ luna junto a "Salir", en los tres layouts. **Un clic alterna
claro/oscuro y con eso ya sales de "Automático"**. Volver a "Automático" se hace desde
Preferencias. Se descartó ciclar los tres estados con un solo icono: no hay forma de
distinguir a simple vista "oscuro fijo" de "automático que resultó oscuro".

### 4. Lo que se sincroniza se decide ahora, no en la paridad

El tema es local por naturaleza. Pero el IVA y la configuración de PDF hoy viven **solo en
el celular de quien los configuró** — eso es justo lo que vuelve imposible la paridad. Van
a la nube desde la fase 3 (`empresa_config`), con las mismas columnas de sincronización que
el resto del esquema (`server_updated_at`, `deleted_at`).

---

## Fases

### Fase 1 — Tema claro/oscuro

| Archivo | Cambio |
|---|---|
| `web/src/app/globals.css` | Escala `neutral` a variables; inversión bajo oscuro. Rojo/verde/ámbar se ajustan por luminosidad, **no** se invierten |
| `web/src/components/tema/script-tema.tsx` | Script anti-parpadeo (corre antes de pintar) |
| `web/src/components/tema/usar-tema.ts` | Hook de 3 estados + listener `matchMedia` |
| `web/src/components/tema/toggle-tema.tsx` | Botón animado accesible |
| `web/src/app/layout.tsx` | Inserta el script + `suppressHydrationWarning` |
| `admin/layout.tsx`, `campo/layout.tsx`, `cliente/layout.tsx` | El toggle junto a "Salir" |
| ~25 `text-white` en 13 archivos | Única edición manual dispersa: al invertirse el fondo quedarían blanco sobre blanco |

**Verificación:** `npm run build`, `npm run lint`, contraste WCAG AA en ambos temas, y
revisión visual (es lo único del plan que se juzga a ojo).

### Fase 2 — Mi cuenta (los 4 roles)

- `web/src/components/ajustes/` — secciones escritas **una vez**, usadas por `/admin/ajustes`
  y `/cliente/ajustes`. El rol decide cuáles se arman, no cuáles se ocultan.
- **Nombre**: `user_metadata.nombre`, que el header ya sabe leer
  (`web/src/lib/data/usuario.ts:6`). Cero migración.
- **Contraseña**: se revalida la actual **antes** de cambiar. Supabase no lo exige; sin eso,
  cualquiera con la sesión abierta secuestra la cuenta.
- **Correo**: Supabase confirma por los dos correos. Requiere ruta nueva `/auth/callback`
  (hoy solo existe `auth/signout`).
- **Recuperar contraseña**: hoy **no existe**. Si alguien la olvida, hay que entrar a
  Supabase a mano. Enlace en `/login` → pedir correo → pantalla de contraseña nueva.

> ⚠️ **Dependencia externa (solo la puede hacer Mario):** las funciones con correo requieren
> configurar las *Redirect URLs* en el panel de Supabase. Sin eso, los enlaces del correo
> llevan al lugar equivocado.

### Fase 3 — Empresa y operación

- **Migración `0017_ajustes_empresa.sql`**:
  - Policy `UPDATE` en `empresas` restringida a `auth_tiene_rol(id, 'admin')`. Hoy solo hay
    `select` (`0001_tenancy.sql:51`) e `insert` (`0005_onboarding.sql:118`) → **el nombre de
    la empresa es literalmente inmutable**; si se escribió mal en el onboarding, queda mal
    para siempre en el header.
  - Tabla `empresa_config`: IVA por defecto y configuración de PDF.
- Un solo helper decide qué ve cada rol, para no desperdigar la lógica de permisos.

**Verificación:** además del build, probar que un supervisor **no** pueda cambiar el nombre
de la empresa aunque mande el formulario a mano. Ese es el punto de la fase.

---

## Fuera de alcance (por ahora)

- Tokenizar el kit de verdad (opción B).
- Paridad Android/iOS — se hará cuando la web esté cerca de su versión final. El móvil es
  **campo**, la web es **oficina**, pero el móvil también accede a lo de oficina; la única
  excepción permitida son funciones exclusivas de web (y las locales por naturaleza del
  móvil, como respaldo JSON o cargar datos de prueba).
- Pantalla de "Usuarios y roles" para dar de alta gente: es un módulo propio, no un ajuste.

## Verificación en producción/preview

`.env.tokens` (ignorado por git, `.gitignore:71`) tiene `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF` y `VERCEL_TOKEN` — se usan para desplegar preview y aplicar la
migración de la fase 3. Sus valores nunca se imprimen ni se commitean.
