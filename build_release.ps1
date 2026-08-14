# ============================================================
# ConstructorPro — Script de build release (Android)
# Ejecutar desde PowerShell en la raíz del proyecto:
#   .\build_release.ps1
#
# REQUISITO PREVIO (Fase 5, paso 1):
#   Generar keystore y crear android/key.properties antes de
#   ejecutar este script. Sin keystore usa la debug key.
# ============================================================

$env:PUB_CACHE         = "D:\pub_cache"
$env:GRADLE_USER_HOME  = "D:\gradle"
$env:ANDROID_HOME      = "D:\Android\Sdk"
$env:ANDROID_SDK_ROOT  = "D:\Android\Sdk"
$env:Path             += ";D:\flutter\bin"

Set-Location $PSScriptRoot

Write-Host "`n=== ConstructorPro Release Build ===" -ForegroundColor Cyan

# 1. Verificar entorno
Write-Host "`n[1/5] Verificando Flutter..." -ForegroundColor Yellow
flutter --version

# 2. Dependencias
Write-Host "`n[2/5] Obteniendo dependencias..." -ForegroundColor Yellow
flutter pub get

# 3. Análisis
Write-Host "`n[3/5] Analizando código..." -ForegroundColor Yellow
# `--no-fatal-infos` NO es aflojar la vara: sin él, `flutter analyze` devuelve
# codigo distinto de cero por simples INFOS, y bastaba un `deprecated_member_use`
# del SDK —como los `onReorder` que dejo de existir en Flutter 3.41— para que
# este script no pudiera terminar NUNCA, aunque el codigo este perfecto. Una
# puerta que no se puede abrir ni haciendo bien las cosas no protege nada: se
# ignora o se rodea. Los errores y las advertencias SIGUEN tumbando el build.
flutter analyze --no-fatal-infos lib
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: flutter analyze encontro errores o advertencias." -ForegroundColor Red
    exit 1
}

# 4. Tests
Write-Host "`n[4/5] Ejecutando tests..." -ForegroundColor Yellow
flutter test test/logic
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: tests fallaron." -ForegroundColor Red
    exit 1
}

# 5. Build
Write-Host "`n[5/5] Compilando..." -ForegroundColor Yellow

# App Bundle (para Google Play)
Write-Host "  → App Bundle (.aab)..." -ForegroundColor White
flutter build appbundle --release
if ($LASTEXITCODE -eq 0) {
    $aab = "build\app\outputs\bundle\release\app-release.aab"
    Write-Host "  ✓ App Bundle: $aab" -ForegroundColor Green
}

# APK universal (para instalar directo / pruebas)
Write-Host "  → APK universal..." -ForegroundColor White
flutter build apk --release
if ($LASTEXITCODE -eq 0) {
    $apk = "build\app\outputs\flutter-apk\app-release.apk"
    Write-Host "  ✓ APK: $apk" -ForegroundColor Green
}

# ── Copia con el nombre que espera el portal ────────────────────────────────
# El portal descarga de `releases/latest/download/constructorpro.apk`, una ruta
# que GitHub resuelve por nombre EXACTO de archivo. Si el asset se sube con la
# versión en el nombre (constructorpro-1.0.7.apk), ese enlace da 404 aunque el
# release exista. Dejar aquí la copia ya renombrada evita que el nombre dependa
# de que alguien recuerde la regla en el momento de publicar.
$apkPortal = "build\app\outputs\flutter-apk\constructorpro.apk"
if (Test-Path "build\app\outputs\flutter-apk\app-release.apk") {
    Copy-Item "build\app\outputs\flutter-apk\app-release.apk" $apkPortal -Force
    Write-Host "  ✓ Copia para el portal: $apkPortal" -ForegroundColor Green
}

# ── Copia al Escritorio ─────────────────────────────────────────────────────
# Al terminar el build, el APK aparece solo en el Escritorio: es donde se va a
# buscar para instalarlo en la tableta o mandarlo por WhatsApp, y tener que
# acordarse de la ruta `build\app\outputs\flutter-apk\` cada vez es fricción
# innecesaria.
#
# La ruta se PREGUNTA al sistema en vez de escribirse a mano: con OneDrive el
# Escritorio no está en `%USERPROFILE%\Desktop` sino redirigido a
# `%USERPROFILE%\OneDrive\Escritorio` (y en una máquina en inglés sería
# `\OneDrive\Desktop`). `GetFolderPath` devuelve la buena en los tres casos.
#
# Se copia con el nombre `constructorpro.apk` —el mismo del portal— para que el
# archivo que quede a la mano sea exactamente el que se publica.
$escritorio = [Environment]::GetFolderPath('Desktop')
if ([string]::IsNullOrWhiteSpace($escritorio)) {
    Write-Host "  ! No se pudo resolver el Escritorio; se omite la copia." -ForegroundColor Yellow
} elseif (Test-Path $apkPortal) {
    $destinoEscritorio = Join-Path $escritorio "constructorpro.apk"
    try {
        Copy-Item $apkPortal $destinoEscritorio -Force -ErrorAction Stop
        Write-Host "  * Copia en el Escritorio: $destinoEscritorio" -ForegroundColor Green
    } catch {
        # Un fallo aqui NO debe tumbar el build: el APK ya existe en build\.
        # OneDrive a veces tiene el archivo bloqueado mientras sincroniza.
        Write-Host "  ! No se pudo copiar al Escritorio: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Versión declarada en pubspec, para sugerir el tag sin que haya que buscarla.
$versionLine = (Select-String -Path "pubspec.yaml" -Pattern '^version:\s*(.+)$').Matches.Groups[1].Value
$versionName = ($versionLine -split '\+')[0].Trim()

Write-Host "`n=== Build completado ===" -ForegroundColor Cyan
Write-Host "App Bundle → build\app\outputs\bundle\release\app-release.aab"
Write-Host "APK        → build\app\outputs\flutter-apk\app-release.apk"
Write-Host "APK portal → $apkPortal"
if ($destinoEscritorio -and (Test-Path $destinoEscritorio)) {
    Write-Host "Escritorio → $destinoEscritorio"
}
Write-Host ""
Write-Host "Publica el release y el portal queda al dia solo (sirve 'latest'):" -ForegroundColor Yellow
Write-Host "  gh release create v$versionName $apkPortal ``" -ForegroundColor White
Write-Host "    --repo IztBLack/constructorproMulti ``" -ForegroundColor White
Write-Host "    --title `"ConstructorPro $versionName (Android)`"" -ForegroundColor White
Write-Host ""
Write-Host "NO renombres el APK con la version: el enlace del portal lo busca" -ForegroundColor DarkGray
Write-Host "por nombre exacto (web/src/lib/descargas.ts)." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Próximo paso (Play Store): subir el .aab a Google Play Console." -ForegroundColor DarkGray
