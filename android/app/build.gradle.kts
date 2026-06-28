import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Carga la config de firma de release desde android/key.properties (ignorado por
// git). Si el archivo no existe (p. ej. en una máquina de desarrollo sin keystore),
// el build de release cae a la debug key para no romper `flutter run --release`.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.mario.constructorpro"
    // Fijo en 36 para coincidir con el override de compileSdk de los subproyectos
    // (android/build.gradle.kts) y evitar mismatch app/dependencias.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // Requerido por flutter_local_notifications.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.mario.constructorpro"
        // Valores fijos explícitos (no heredar del SDK de Flutter, que puede
        // cambiar entre versiones). targetSdk 35 = requisito de Google Play 2025.
        minSdk = flutter.minSdkVersion
        targetSdk = 35
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (hasReleaseKeystore) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Usa la keystore de release si está configurada; si no, debug.
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            // R8/ProGuard: reduce tamaño y ofusca el bytecode.
            isMinifyEnabled = true
            isShrinkResourcesEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
     