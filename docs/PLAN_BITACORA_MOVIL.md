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

Por eso estas tres tablas usan un push propio, **"insertar primero"**:
- Fila que el servidor nunca confirmó (`server_updated_at` nulo) → **INSERT** sin las columnas selladas. Si falla, se pregunta si ya existe (un reintento tras un corte); si existe, cuenta como subida.
- Fila ya confirmada → **UPDATE** solo de lo editable (entrada: fecha, tipo, texto, clima, personal, visible_cliente, deleted_at, updated_at; foto: orden, deleted_at).
- Orden: entradas → (archivo → fila) de cada foto → aclaraciones. Una foto espera a que su entrada esté confirmada.
- Archivo ya existente en Storage (409) = ya subido.

### 2.3 Rechazos que no se arreglan reintentando
`BITACORA_CERRADA`, `BITACORA_MAX_FOTOS`, falta de permiso (RLS 42501) o la regla de evidencia **no** se dejan en `error` (se reintentarían cada 25 s para siempre con el indicador en rojo):
- **Edición rechazada** (la entrada cerró antes de que subiera): se guarda un aviso con el texto que se quiso subir, la fila vuelve a la versión del servidor y la pantalla ofrece **"Agregar como aclaración"** o **"Descartar"**.
- **Alta rechazada** (p. ej. la obra no es del colaborador) o **foto que ya no cupo** (entrada cerrada o 10 fotos): la fila queda `skipped` (terminal, no cuenta como error) con su motivo a la vista; la foto sigue en el teléfono y se puede compartir.

### 2.4 Cierre a las 24 h
Abierta = todavía no llega al servidor (`registrada_en` = 0) **o** `registrada_en` + 24 h > ahora. El servidor es quien manda; el reloj del teléfono solo sirve para pintar "se cierra en…".

### 2.5 Fecha del día
Medianoche del día **en el teléfono**, igual que el pase de lista del móvil (`Semana.inicioDia`). La web usa la medianoche de México; en un teléfono en México son el mismo número.

## 3. Incrementos
1. **Datos:** tablas, migración v14 → v15 (+ trigger `mark_pending`), código generado, `drift_schema_v15.json`, `schema_v15.dart`, test `migration_desde_v14_test.dart`, `resetAll`.
2. **Reglas puras:** abierta/cerrada, quién captura/edita/aclara/publica, limpieza de nombres, catálogos de tipo y clima con las etiquetas de la web. Con tests.
3. **Repositorio + fotos locales:** crear/editar/borrar/aclarar/publicar, línea de tiempo reactiva a las tres tablas, personal sugerido del pase de lista, guardar y comprimir fotos.
4. **Sync:** conversión de arreglos, push "insertar primero", subida de archivos, avisos de rechazo. Con tests de las partes puras.
5. **Pantallas:** acceso desde el menú de la obra, línea de tiempo, formulario, visor de fotos, avisos; `implementadoEnMovil: true`.
6. **Revisión ECC** (flutter-reviewer + security-reviewer), correcciones, suite completa, build.
