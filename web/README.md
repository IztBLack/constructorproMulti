# 🏗️ ConstructorPro — Web (Next.js)

Web **online-directa contra Supabase** (Postgres + Auth + RLS), parte del plan
nube+web de ConstructorPro. Comparte la misma BD que la app móvil Flutter; **no hay
API propia** (Supabase la expone). Dos zonas:

- **`/admin`** — panel de oficina (captura/gestión). Roles `admin`/`supervisor`/`colaborador`.
- **`/cliente`** — portal de lectura para clientes (sus cotizaciones/avances). Rol `cliente`.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · `@supabase/ssr`.

## Estado — W0 (scaffold) ✅
- Cliente Supabase (browser + server) en `src/lib/supabase/`.
- Auth por cookies + **middleware** que protege `/admin` y `/cliente` (sin sesión → `/login`).
- `/login` (email+password), `/admin` y `/cliente` (esqueletos), `/auth/signout`.
- **Pendiente W1+:** pantallas reales de obras/equipo/cotizaciones/reportes en `/admin`;
  portal en `/cliente` (depende del modelo de acceso de cliente, ver SQL del móvil).

## Configurar y correr
1. Crear el proyecto Supabase y correr el SQL de `constructorpro_flutter/supabase/migrations/`.
2. `cp .env.local.example .env.local` y pegar `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. `npm run dev` → http://localhost:3000

Sin `.env.local` la app compila, pero `/login` y las zonas protegidas fallarán en runtime
(no hay backend al cual autenticarse).

## Deploy
Vercel (previsto): importar el repo, definir las 2 variables de entorno, deploy.
