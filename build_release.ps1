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
flutter analyze lib
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: flutter analyze falló. Corrige los issues antes de publicar." -ForegroundColor Red
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

# Versión declarada en pubspec, para sugerir el tag sin que haya que buscarla.
$versionLine = (Select-String -Path "pubspec.yaml" -Pattern '^version:\s*(.+)$').Matches.Groups[1].Value
$versionName = ($versionLine -split '\+')[0].Trim()

Write-Host "`n=== Build completado ===" -ForegroundColor Cyan
Write-Host "App Bundle → build\app\outputs\bundle\release\app-release.aab"
Write-Host "APK        → build\app\outputs\flutter-apk\app-release.apk"
Write-Host "APK portal → $apkPortal"
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
