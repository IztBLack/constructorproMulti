# Bitácora de obra en el móvil — Fase 1 de la paridad web → móvil

**Abierto:** 2026-10-06. **Referencia de comportamiento:** la web (`web/src/app/admin/obras/[id]/bitacora/`, `web/src/lib/bitacora/bitacora.ts`) y la base (`supabase/migrations/0041_bitacora_y_programa.sql`, `0042_roles_organizacion.sql`). El servidor NO cambia: cero migraciones SQL.

La razón de llevarla al móvil es la que la web dejó escrita en F4-10: la bitácora se captura en la obra, muchas veces sin señal, y la web no tiene cola offline para fotos. El móvil sí puede guardarlas en el teléfono y subirlas cuando haya red.

---

## 1. Qué hace (igual que la web)

- **Ver** la bitácora de una obra: días de más reciente a más antiguo; dentro del día, en el orden en que llegaron. Cada entrada: tipo, clima, hora, autor, texto, personal en obra, fotos y aclaraciones.
- **Escribir** una entrada: día (hasta hoy), tipo (Avance, Incidencia, Instrucción, Visita, Clima, Otro), clima (opcional), texto (obligatorio, 5000 letras), personal (nombres traídos del pase de lista del día o solo el número) y hasta 10 fotos. Nace **sin publicar al cliente**.
- **Editar o borrar** mientras esté abierta (24 h desde que llegó al servidor): el admin cualquiera; los demás, solo las suyas.
- **Aclarar** (admin, supervisor, residente): una nota fechada debajo de la entrada, abierta o cerrada. No se edita ni se borra nunca.
- **Publicar al cliente** (admin o autor): el único cambio que se permite con la entrada cerrada.
- **Fotos:** se comprimen como en la web (lado mayor 1600 px, JPEG calidad 80) y se guardan en el teléfono hasta subirlas.

**Quién:** admin, supervisor, residente y colaborador capturan (el servidor decide si la obra es suya); el contador solo lee; compras y almacén no la ven. El módulo `bitacora` apagado la oculta.

**Fuera de esta fase (se quedan en la web):** el PDF por periodo y el programa de obra.

## 2. Diseño

### 2.1 Datos (Drift v15)
Tres tablas espejo con `SyncCols`: `bitacora_entrada`, `bitacora_foto` (+ `Orderable`, el servidor tiene `orden`) y `bitacora_aclaracion`, con las MISMAS columnas que el servidor (el push manda todas: una columna solo-local rompería cada push).

- `personal_nombres` (`text[]` en el servidor) se guarda local como **JSON** (`'["Ana","Beto"]'`); el sync la convierte en los dos sentidos. Es la primera columna de arreglo del proyecto.
- El archivo de cada foto vive en el directorio de documentos de la app como `bitacora/<foto_id>.<ext>`: el nombre ES la llave, así que no hace falta columna local. Las fotos que bajan de otros dispositivos se descargan al verlas y se guardan igual (después se ven sin señal).
- `autor_id`, `autor_nombre`, `registrada_en` los sella el servidor: en local valen vacío/0 hasta el eco del pull.

### 2.2 Sync — por qué no sirve el upsert de siempre
El push genérico hace `upsert` de la fila completa. Aquí choca con la base:
1. El colaborador puede INSERTAR pero no ACTUALIZAR; nadie actualiza aclaraciones.
2. Los triggers `BEFORE INSERT` (máximo 10 fotos, entrada cerrada) se disparan aunque el upsert acabe en conflicto: reintentar una foto ya subida podría fallar.
3. El archivo de una foto solo se puede subir si su entrada YA existe en el servidor y sigue abierta.

Por eso estas tres tablas usan un push propio, **"insertar primero"** (revisado con `ecc:architect`):
- Fila que el servidor nunca confirmó (`server_updated_at` nulo) → **INSERT** sin las columnas selladas, pidiendo de vuelta `server_updated_at` y los sellos. **Si falla, primero se lee la fila por id** (un INSERT que sí entró pero cuya respuesta no llegó): si existe, se toma su `server_updated_at` y se sigue por la rama UPDATE en la misma vuelta; solo si no existe se clasifica el error.
- Fila ya confirmada → **UPDATE condicional** `… where id = ? and server_updated_at = <el que conozco>` solo de lo editable (entrada: fecha, tipo, texto, clima, personal, deleted_at; foto: orden, deleted_at), pidiendo `server_updated_at` de vuelta. **0 filas NO es éxito**: la RLS bloquea en silencio. Se relee la fila: si no se ve → sin permiso; si cambió → alguien más la editó (conflicto).
- **Publicar al cliente no viaja en la edición.** Es una operación aparte, en línea, que solo manda `visible_cliente` (como `cambiarVisibilidadEntrada` de la web). Así una edición hecha sin señal nunca vuelve a publicar algo que la oficina retiró.
- Orden: entradas → (archivo → fila) de cada foto → aclaraciones. Fotos y aclaraciones esperan a que su entrada esté confirmada.
- La ruta de la foto se arma con la empresa **del momento de subirla** (la de captura podía estar vacía).
- Archivo ya existente en Storage (`statusCode` "409" / `Duplicate`) = ya subido. Si la fila de la foto falla sin remedio, el archivo se borra de Storage (como la web).
- **Pull:** en estas tablas el LWW protege toda fila que no esté `synced` (pending, error, skipped), y `personal_nombres` se convierte de lista a JSON.

### 2.3 Rechazos que no se arreglan reintentando
`BITACORA_CERRADA`, `BITACORA_MAX_FOTOS`, falta de permiso (RLS 42501, 403 de Storage o UPDATE de 0 filas), conflicto con una edición de la oficina, o la regla de evidencia **no** se dejan en `error` (se reintentarían cada 25 s para siempre con el indicador en rojo). Los avisos viven en el teléfono (preferencias), no en columnas: una columna local en las tablas espejo se borraría con cada pull.
- **Edición rechazada** (cerró, sin permiso o la cambió la oficina): se guarda un aviso con el texto que se quiso subir, la fila se reescribe con la versión del servidor (leída ahí mismo) y la pantalla ofrece **"Agregar como aclaración"** o **"Descartar"**.
- **Alta rechazada** (p. ej. la obra no es del colaborador) o **foto que ya no cupo** (entrada cerrada o 10 fotos): la fila queda `skipped` (terminal, no cuenta como error) con su motivo a la vista; si es una entrada, sus fotos y aclaraciones también. La foto sigue en el teléfono y se puede compartir.
- **Borrados locales:** lo que nunca llegó al servidor se borra solo en el teléfono (fila y archivo), en cascada desde la entrada, después de confirmar que el servidor no lo tiene.

### 2.4 Cierre a las 24 h
Abierta = todavía no llega al servidor (`registrada_en` = 0) **o** `registrada_en` + 24 h > ahora. El servidor es quien manda; el reloj del teléfono solo sirve para pintar "se cierra en…".

### 2.5 Fecha del día
Medianoche **de la Ciudad de México**, la misma regla que la web (`web/src/lib/data/tz.ts`): en un teléfono en Quintana Roo la medianoche local caería en el día anterior de la web y del PDF. El personal sugerido sí busca el pase de lista con la medianoche del teléfono, que es como el móvil guarda las asistencias.

### 2.6 Roles (igual que la web y la RLS)
- **Escribir:** admin, supervisor, residente, colaborador (el servidor decide si la obra es suya).
- **Editar/borrar** (abierta): admin cualquiera; supervisor y residente las suyas; el colaborador solo antes de que suba (no tiene UPDATE). "Suya" = creada en este teléfono y sin confirmar, o `autor_id` igual al usuario; nunca "autor vacío".
- **Aclarar:** admin, supervisor, residente. **Publicar:** admin o autor (no colaborador), con señal.
- **Contador** solo lee; **compras/almacén** no la ven.

### 2.7 Fotos en el teléfono
`image_picker` con `maxWidth/maxHeight` 1600 e `imageQuality` 80 (recomprime a JPEG; con transparencia sale PNG). La foto se copia de inmediato a `getApplicationSupportDirectory()/bitacora/<foto_id>.<ext>` (la caché donde la deja `image_picker` la puede borrar Android) y se borra al cambiar de cuenta. `retrieveLostData()` recupera la foto si Android destruyó la pantalla al abrir la cámara.

## 3. Incrementos
1. **Datos:** tablas, migración v14 → v15 (+ trigger `mark_pending`), código generado, `drift_schema_v15.json`, `schema_v15.dart`, test `migration_desde_v14_test.dart`, `resetAll`.
2. **Reglas puras:** abierta/cerrada, quién captura/edita/aclara/publica, limpieza de nombres, catálogos de tipo y clima con las etiquetas de la web. Con tests.
3. **Repositorio + fotos locales:** crear/editar/borrar/aclarar/publicar, línea de tiempo reactiva a las tres tablas, personal sugerido del pase de lista, guardar y comprimir fotos.
4. **Sync:** conversión de arreglos, push "insertar primero", subida de archivos, avisos de rechazo. Con tests de las partes puras.
5. **Pantallas:** acceso desde el menú de la obra, línea de tiempo, formulario, visor de fotos, avisos; `implementadoEnMovil: true`.
6. **Revisión ECC** (flutter-reviewer + security-reviewer), correcciones, suite completa, build.
