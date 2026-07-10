# 🔀 Runbook — Integrar una rama a `main` + deploy a producción

> **Para qué:** procedimiento repetible para tomar una rama con cambios nuevos,
> **verificarla**, integrarla a `main` por fast-forward, borrarla, y **redeployear
> la web a producción** — sin dejar ramas abiertas y sin romper prod.
>
> **Cómo usarlo:** pega el prompt de abajo en una sesión nueva de Claude Code
> abierta en este repo. El agente debe seguir el runbook **en orden** y **detenerse
> si una verificación falla** (no empujar código roto a `main`/producción).

---

## 📋 PROMPT (copiar/pegar en la sesión nueva)

```
Añadí cambios en otra rama. Sigue el runbook INTEGRAR_A_MAIN.md de este repo:
verifica la rama, intégrala a main por fast-forward, borra la rama, y redeploya
la web a producción. NO empujes a main si alguna verificación falla — detente y
avísame. Si la rama trae una migración Supabase nueva, aplícala antes del deploy.
```

---

## 🧭 Contexto fijo del proyecto (no cambia entre sesiones)

| Cosa | Valor |
|---|---|
| **Repo GitHub** | `IztBLack/constructorproMulti` |
| **Checkout principal** | `D:\Dev\_EnDesarrollo\constructorpro_flutter` (rama `main` viva aquí) |
| **Web (Next.js 16)** | subcarpeta `web/` del monorepo |
| **App móvil (Flutter, Drift/SQLite)** | raíz del repo (`lib/`, `test/`, …) |
| **Backend** | Supabase, proyecto ref **`vmkkkrlctakzzqebtyci`** |
| **Producción web** | Vercel, proyecto `mrs4/constructorpro` → https://constructorpro-tawny.vercel.app |
| **Vercel CLI** | ya autenticado como `iztblack` (`npx vercel whoami`) |
| **Supabase token** | en `web/.env.local` como `SUPABASE_ACCESS_TOKEN=sbp_...` (gitignored) |

### Herramientas / rutas Windows
- **Flutter:** `D:\flutter\bin` · **Dart** 3.12+
- **adb:** `D:\Android\Sdk\platform-tools\adb.exe`
- **Vars de build Android** (exportar en el shell antes de `flutter build/run`):
  ```bash
  export PUB_CACHE="D:/pub_cache"; export GRADLE_USER_HOME="D:/gradle"
  export ANDROID_HOME="D:/Android/Sdk"; export ANDROID_SDK_ROOT="D:/Android/Sdk"
  export PATH="D:/flutter/bin:D:/Android/Sdk/platform-tools:$PATH"
  ```
- **Push a `main` dispara el build iOS** (`.github/workflows/ios-build.yml`). Es
  esperado cuando cambió el móvil; genera el IPA sin firmar para SideStore.

---

## 🚦 Pasos (en orden — detenerse si algo falla)

### 1. Localizar la rama nueva
```bash
cd <checkout-o-worktree>
git fetch origin --prune
git branch -r | grep -v HEAD          # ver qué rama nueva hay además de origin/main
```

### 2. Revisar qué trae y si es fast-forward
```bash
B=origin/<rama-nueva>
git merge-base --is-ancestor origin/main $B && echo "FF OK" || echo "DIVERGE"
git log --oneline origin/main..$B      # commits nuevos
git diff --stat origin/main...$B       # archivos tocados
```
- Si **DIVERGE** (main tiene commits que la rama no): no es fast-forward. Avisar al
  usuario y proponer rebase/merge — no forzar.

### 3. ⚠️ Chequeos críticos ANTES de verificar/mergear
1. **¿Migración Supabase nueva?**
   ```bash
   git ls-tree -r --name-only $B -- supabase/migrations/
   ```
   Si aparece un `00XX_*.sql` que **no** existe hoy en producción → **hay que
   aplicarla** (ver §6). Si la web escribe columnas/tablas que aún no están en
   Postgres, producción se rompe. **Nota clave:** a veces el esquema Drift del móvil
   solo se pone al día con columnas que Postgres **ya tiene** (p. ej. `0008` ya creó
   `movimientos.nombre` + `obra_presupuesto`); en ese caso **no** se necesita
   migración nueva. Confirmar comparando el paso `onUpgrade` de Drift contra las
   migraciones ya aplicadas.
2. **¿Subió `schemaVersion` de Drift?** (`lib/core/db/app_database.dart`) → debe
   existir el paso `if (from < N)` correspondiente en `onUpgrade`. Sin él, los
   usuarios pierden datos al actualizar.
3. **¿Deps nuevas?** `git diff origin/main..$B -- pubspec.yaml web/package.json`
   → correr `flutter pub get` y/o `npm install` según aplique.
4. **¿Subió la versión en `pubspec.yaml`?**
   Para que los dispositivos (iOS/SideStore o Android) detecten la actualización, la versión `x.y.z+n` **debe** subir si hubo cambios en la app móvil (`lib/`).
   - Sube el parche (`1.0.1+2`) para arreglos menores o fixes.
   - Sube la versión menor (`1.1.0+2`) para funcionalidades grandes.
   - **Importante:** Siempre debes sumarle 1 al número de build (`+n`) al final. Si la rama no subió la versión, actualiza `pubspec.yaml` y haz un commit con este cambio.

### 4. Verificar (checkout de la rama en un worktree/dir de trabajo)
```bash
git checkout -B verify-tmp $B
```
**Web (crítico — se despliega a prod):**
```bash
cd web && npm install   # solo si package.json cambió
npm run lint && npm run build
```
**Móvil:**
```bash
# (exportar las vars de build de arriba)
flutter pub get
flutter analyze lib      # debe quedar LIMPIO (estándar del proyecto)
flutter test             # TODOS verdes
```
- Si `analyze` deja un `info`/lint menor introducido por la rama, **corregirlo**
  (cambios de cero riesgo) y commitearlo aparte para dejar `main` limpio.
- **Si build/lint/analyze/test fallan → DETENERSE.** Reportar al usuario, no mergear.

### 5. Integrar a `main` (fast-forward) + limpiar ramas
```bash
git merge-base --is-ancestor origin/main HEAD && echo "FF OK"
git push origin HEAD:main                                  # ← dispara iOS build
MAIN="D:/Dev/_EnDesarrollo/constructorpro_flutter"
git -C "$MAIN" fetch origin && git -C "$MAIN" merge --ff-only origin/main
git push origin --delete <rama-nueva>                      # borra la rama remota
git branch -D verify-tmp                                    # borra la temporal local
git branch -r | grep -v HEAD                                # confirmar: solo origin/main
```

### 6. (Solo si §3.1 detectó migración nueva) Aplicarla a Supabase
El SQL Editor requiere hacerlo a mano, o usar la **Management API** con el token de
`web/.env.local`. Vía API (segura, no re-corre migraciones viejas):
```bash
TOKEN=$(grep SUPABASE_ACCESS_TOKEN web/.env.local | cut -d= -f2)
# Poné el SQL de la migración en un archivo y armá el JSON con Python (evita escapes):
python -c "import json;print(json.dumps({'query':open('mig.sql').read()}))" > payload.json
curl -s -X POST \
  "https://api.supabase.com/v1/projects/vmkkkrlctakzzqebtyci/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data @payload.json
# Verificar que las columnas/tablas nuevas existan (query information_schema).
```
> El token `sbp_...` es el **Personal Access Token** del CLI. NO confundir con
> `sb_publishable_...` (anon del navegador) ni `sb_secret_...` (secret del proyecto):
> esos dos **no** sirven para el CLI ni la Management API.

### 7. Deploy a producción + verificar
```bash
cd D:/Dev/_EnDesarrollo/constructorpro_flutter/web
git rev-parse --short HEAD                 # debe ser el HEAD de main
npx vercel --prod --yes
# Verificar rutas (200 público, 307 = protegido por auth = correcto):
for p in "/" "/login" "/admin/obras"; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' "https://constructorpro-tawny.vercel.app$p")"
done
```

### 8. Cierre
- Confirmar al usuario: `main` en `<commit>`, rama borrada (solo `origin/main`),
  prod redeployeada y verde, y el estado del build iOS
  (`gh run list --workflow=ios-build.yml -L 1`).
- Actualizar `HANDOFF.md` / `docs/BITACORA.md` con una línea de continuidad (opcional).

---

## ✅ Definición de "hecho"
- [ ] Verificaciones verdes (web build/lint + móvil analyze/test).
- [ ] Migración Supabase aplicada **si** la rama traía una nueva.
- [ ] `main` = fast-forward a la punta de la rama; **solo `origin/main`** queda.
- [ ] Producción redeployeada desde `main` y rutas verificadas.
- [ ] iOS build corriendo (si cambió el móvil).

## 🛑 Cuándo NO continuar (detenerse y avisar)
- La rama **diverge** de `main` (no es fast-forward).
- Falla `npm run build`/`lint`, `flutter analyze` (error/warning) o `flutter test`.
- La rama trae una migración Supabase que **no se pudo aplicar** (sin token válido).
- Aparecen archivos sospechosos (secretos, `.env` con claves, binarios raros) en el diff.
