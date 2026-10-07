# Cambio de cuenta sin mezclar datos — plan

**Abierto:** 2026-10-07. **Origen:** el RedMagic de pruebas tuvo antes otra cuenta; al entrar con la cuenta demo, su base local conservó filas de la otra empresa y el sync acumuló **72 cambios rechazados** (`42501 … USING expression` en `cuadrilla_miembro`). No es de la 1.5.0: viene de siempre.

## 1. Qué pasa hoy (causa raíz)

1. **"Cerrar sesión" borra la empresa guardada** (`cloud_sync_screen.dart` → `_cerrarSesion` hace `prefs.remove('empresa_id')`) y no vacía la base local.
2. Al entrar la cuenta nueva, `resolverEmpresaYsellar` (`cloud_providers.dart`) solo detecta un cambio de empresa si conoce la anterior… que ya se borró en el paso 1. **La detección nunca se dispara.**
3. `sellarEmpresaId` adopta para la empresa nueva solo las filas con empresa vacía (`''`); las de la otra empresa se quedan con la suya.
4. El push **sobrescribe `empresa_id` con la empresa actual** en cada fila: las filas viejas se intentan subir como si fueran de la empresa nueva, el servidor encuentra que ya existen en la otra y las rechaza. Se reintentan cada 25 s para siempre, con el indicador en rojo.
5. Además, `MaintenanceRepository.restablecerTodo()` quedó viejo: no borra cuadrillas, notas, caja, presupuesto ni bitácora.

Hay, además, un riesgo de privacidad: el teléfono de una cuenta conserva datos de la anterior (textos, nombres, fotos de la bitácora).

## 2. La corrección, en tres capas

### Capa 1 — El teléfono sabe de quién son sus datos
- Nueva preferencia **`datos_locales_empresa`**: la empresa dueña de lo que hay en la base local. A diferencia de `empresa_id`, **no se borra al cerrar sesión**.
- Al entrar, si la empresa nueva **es distinta** de `datos_locales_empresa`, o si la base tiene filas con una empresa que no es `''` ni la nueva, eso es un **cambio de cuenta**.

### Capa 2 — Antes de cambiar, revisar lo pendiente y empezar limpio
- **Contar lo que no ha subido** de la cuenta anterior en TODAS las tablas sincronizadas (`pending`, `error`, `conflict`), más las fotos de bitácora sin subir.
- **Sin pendientes:** vaciar la base local (todas las tablas de `allTables`, en un ciclo genérico para que una tabla nueva nunca se quede fuera), las fotos de la bitácora, los avisos y las cachés por empresa (módulos, `ui_orden`, `pdf_*`), reiniciar cursores y bajar todo de la cuenta nueva.
- **Con pendientes:** depende de la decisión D1 (abajo).
- **"Cerrar sesión" avisa** si hay cambios sin subir, antes de cerrar.
- Se conserva lo que ya funciona: quien usó la app **sin cuenta** y luego entra por primera vez sigue adoptando sus datos locales (filas con empresa `''`) para su empresa. Eso es intencional (offline-first).

### Capa 3 — El sync nunca sube filas de otra empresa (red de seguridad)
- En el push genérico y en el de la bitácora: una fila cuya `empresa_id` no es `''` ni la actual **no se sube**; pasa a `skipped` con un aviso. Deja de sobrescribirse la empresa.
- Esto arregla de inmediato a los teléfonos que **ya** están mezclados, como el RedMagic: los 72 errores dejan de reintentarse en cuanto actualicen a la 1.5.1.

## 3. Decisiones que son de Mario

**D1. Si al cambiar de cuenta quedan cambios sin subir de la anterior:**
- **(a) Avisar y dejar elegir** — *recomendado.* Mensaje del tipo: "Hay 12 cambios de *Casas Bienestar* que no han subido. Para no perderlos, entra con esa cuenta y sincroniza. ¿O los descartas?" Con [Volver a esa cuenta] / [Descartar y continuar].
- (b) Bloquear el cambio hasta que todo suba. Más seguro, pero puede dejar a alguien atorado sin señal.
- (c) Descartar sin preguntar. Lo más simple y lo peligroso.

**D2. ¿Qué hacer en un teléfono que ya está mezclado (como el RedMagic)?**
- (a) La capa 3 aparta las filas ajenas y la app ofrece **"Limpiar datos de otra cuenta"** en Nube y sincronización — *recomendado.*
- (b) Solo apartarlas en silencio.

## 4. Incrementos
1. **Detección + preferencia `datos_locales_empresa`** (capa 1), con tests de los escenarios: misma cuenta, otra cuenta, primer login sin cuenta previa, teléfono ya mezclado.
2. **Vaciado genérico** de la base (todas las tablas de `allTables`) + fotos + avisos + cachés; `restablecerTodo()` pasa a usarlo. Test que falla si una tabla nueva queda fuera.
3. **Conteo de pendientes por empresa y diálogos** (cambio de cuenta y cerrar sesión), según D1.
4. **Push defensivo** (capa 3) en el sync genérico y en el de la bitácora, con tests.
5. **Revisión ECC** (`ecc:flutter-reviewer` + `ecc:security-reviewer`), suite completa, build **1.5.1** (PATCH: es una corrección).
6. **Prueba real en el RedMagic:** que los 72 errores desaparezcan y la entrada de bitácora suba.

**Fuera de alcance, para revisar aparte:** la cola offline del pase de lista en la web (PWA). Guarda `empresaId` por registro, así que en principio no tiene este problema, pero conviene confirmarlo.
