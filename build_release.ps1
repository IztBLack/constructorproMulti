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

Write-Host "`n=== Build completado ===" -ForegroundColor Cyan
Write-Host "App Bundle → build\app\outputs\bundle\release\app-release.aab"
Write-Host "APK        → build\app\outputs\flutter-apk\app-release.apk"
Write-Host ""
Write-Host "Próximo paso: subir el .aab a Google Play Console." -ForegroundColor DarkGray
