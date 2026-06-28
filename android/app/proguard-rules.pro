# ConstructorPro — ProGuard / R8 rules

# Flutter engine
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# Drift / SQLite (generación de código en tiempo de ejecución)
-keep class androidx.sqlite.** { *; }
-keep class org.sqlite.** { *; }
-keep class com.mario.constructorpro.** { *; }

# Riverpod / Dart reflection stubs
-keep class dev.riverpod.** { *; }

# flutter_local_notifications
-keep class com.dexterous.** { *; }

# share_plus
-keep class dev.fluttercommunity.plus.share.** { *; }

# file_picker
-keep class com.mr.flutter.plugin.filepicker.** { *; }

# image_picker
-keep class io.flutter.plugins.imagepicker.** { *; }

# pdf / printing
-keep class com.techprd.pdf.** { *; }

# Mantener anotaciones en general (requerido por varios plugins)
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Evitar advertencias de dependencias opcionales
-dontwarn javax.annotation.**
-dontwarn org.jetbrains.annotations.**
