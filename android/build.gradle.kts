allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    // Algunos plugins (p. ej. file_picker) compilan contra un compileSdk menor
    // que el que exigen sus dependencias transitivas. Forzamos 36. El callback
    // se registra ANTES de evaluationDependsOn para evitar el error de "already
    // evaluated".
    afterEvaluate {
        extensions.findByType<com.android.build.gradle.LibraryExtension>()?.let { ext ->
            if ((ext.compileSdk ?: 0) < 36) {
                ext.compileSdk = 36
            }
        }
    }
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
