Set-Location $PSScriptRoot

# Eliminar lock residual si existe
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

git add -A

git commit -m "feat(fase5): icono, ProGuard, politica privacidad y script release

- Icono propio en todos los tamanos Android (mdpi->xxxhdpi) + ic_launcher_round
- Iconos iOS 12 tamanos + Contents.json actualizado
- build.gradle.kts: R8 minificacion para release
- proguard-rules.pro: reglas Flutter, Drift, Riverpod y plugins
- build_release.ps1: genera .aab y .apk release
- POLITICA_PRIVACIDAD.md + privacy_policy.html para Google Play
- Limpieza: elimina screencaps del repo"

git push origin main

Write-Host "`nListo. Presiona Enter para cerrar." -ForegroundColor Green
Read-Host
