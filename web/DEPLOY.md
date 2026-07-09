# 🚀 Despliegue a producción — ConstructorPro Web

La web es una app **Next.js 16 (App Router)**. El backend (base de datos, auth,
storage) ya vive en **Supabase** (proyecto `vmkkkrlctakzzqebtyci`), así que **lo
único que hay que hostear es esta app web**. La app móvil (Flutter) se distribuye
por separado (Play Store / SideStore).

---

## 1. Hosting recomendado: **Vercel**

Es la opción ideal para Next.js (Vercel es la creadora del framework):

- **Zero-config**: detecta Next.js y lo compila sin ajustes.
- **Gratis** para este tamaño (plan Hobby): SSR, dominios, HTTPS, previews por PR.
- **Rápido**: CDN global + funciones serverless donde corren los Server Actions.
- **Git-connected**: cada push a `main` despliega solo.

### Alternativas (por si acaso)
| Opción | Cuándo | Nota |
|---|---|---|
| **Netlify** | Similar a Vercel | Buen soporte Next, algo menos "nativo". |
| **Cloudflare Pages** | Quieres el edge de CF | Requiere adaptar a runtime edge; más fricción con Server Actions. |
| **VPS / Node propio** (Railway, Render, Fly.io, o tu servidor) | Quieres control total / evitar serverless | Corres `npm run build && npm run start`; tú administras. |

**Recomendación:** Vercel para la web + Supabase (que ya tienes) para el backend. No necesitas nada más.

---

## 2. Pasos para desplegar en Vercel

1. **Sube el repo a GitHub** (si no lo está). La web está en la carpeta `web/` del monorepo.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo.
3. **Root Directory:** selecciona `web` (importante: es un monorepo; la app está en esa subcarpeta).
4. Framework: **Next.js** (autodetectado). Build command y output: por defecto.
5. **Environment Variables** (Settings → Environment Variables) — copia de `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `TZ = America/Mexico_City`  ← evita el desfase de días en asistencia
6. **Deploy.** Vercel te da una URL `https://tu-proyecto.vercel.app`.

### Dominio propio (opcional)
Settings → Domains → agrega tu dominio (ej. `app.tuconstructora.com`) y sigue las instrucciones de DNS. HTTPS es automático.

---

## 3. Configurar Supabase para el dominio de producción

En el panel de Supabase → **Authentication → URL Configuration**:
- **Site URL:** la URL de producción (ej. `https://tu-proyecto.vercel.app`).
- **Redirect URLs:** agrega esa URL (y el dominio propio si aplica).

Esto es necesario para que el login/registro y los correos funcionen con el dominio real.

> Auto-confirmación de email ya está activada (`mailer_autoconfirm: true`), así que
> los usuarios entran sin confirmar. Si quieres exigir confirmación en producción,
> desactívala y configura el proveedor de correo (SMTP) en Supabase.

---

## 4. Checklist antes de ir a producción

- [ ] Variables de entorno configuradas en Vercel (incluida `TZ`).
- [ ] Site URL + Redirect URLs en Supabase apuntando a producción.
- [ ] Migraciones SQL 0001–0009 aplicadas en el proyecto Supabase (ya lo están en `vmkkkrlctakzzqebtyci`).
- [ ] Crear el primer usuario admin: registrarse en `/login` → onboarding crea la empresa.
- [ ] Probar el flujo completo: admin crea obra/cotización → cliente se vincula con código → ve solo lo suyo.
- [ ] (Opcional) Dominio propio configurado.

---

## 4bis. Migraciones (`supabase/migrations/`)

Este proyecto **no tiene el CLI de Supabase vinculado** (`supabase link`) — el
historial de migraciones no se trackea vía CLI. Cada archivo nuevo en
`supabase/migrations/` se aplica a mano, por cualquiera de estas dos vías:

**A) SQL Editor (sin nada que instalar, recomendado si no traes token a la mano):**
1. [supabase.com/dashboard/project/vmkkkrlctakzzqebtyci/sql/new](https://supabase.com/dashboard/project/vmkkkrlctakzzqebtyci/sql/new)
2. Pega el contenido del archivo `NNNN_*.sql` completo → **Run**.

**B) Management API (para automatizar / correr desde una sesión sin navegador):**
Requiere un **Personal Access Token** de Supabase (`sbp_...`, se genera en
[dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) — **no
confundir** con las API keys del proyecto `sb_publishable_...`/`sb_secret_...`,
esas no sirven para esto). Guardado como `SUPABASE_ACCESS_TOKEN` en
`web/.env.local` (gitignored, no se commitea).

```bash
curl -X POST "https://api.supabase.com/v1/projects/vmkkkrlctakzzqebtyci/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(node -e "console.log(JSON.stringify({query: require('fs').readFileSync('supabase/migrations/NNNN_archivo.sql','utf8')}))")"
```

Respuesta `[]` = éxito (DDL no devuelve filas). Verificar con una consulta a
`information_schema.columns`/`.tables` si hace falta confirmar.

---

## 5. Notas de arquitectura para producción

- **Seguridad de datos:** el aislamiento entre empresas y el acceso de clientes se
  aplica con **RLS en Postgres** (no depende del frontend). La app usa la
  *publishable/anon key* (segura de exponer); nunca la *service_role key*.
- **Móvil ⇄ web:** comparten el mismo Supabase. El móvil es offline-first y
  sincroniza; las columnas exclusivas de la web (`cliente_id`, `avance`) las
  preserva el upsert del sync.
- **Zona horaria:** ver `TZ` arriba. A futuro, lo más robusto sería guardar las
  fechas de asistencia como `yyyymmdd` (entero de día) en vez de epoch-ms de
  medianoche local, para eliminar toda dependencia de zona horaria.
- **Storage:** bucket privado `cotizaciones` con RLS por empresa; los archivos se
  sirven con *signed URLs* temporales.
