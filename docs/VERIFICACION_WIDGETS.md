# Verificación de los widgets del móvil (etapas 1, 2 y 3)

Versión a probar: **1.7.0 (build 24)**. Se instala encima de cualquier versión anterior **sin perder datos** (misma firma).
Código: rama `feat/widgets-movil`. Lógica en `lib/core/widgets_inicio/`, dibujo en `android/app/src/main/kotlin/com/mario/constructorpro/widgets/`.

Marca cada casilla al probarla. Si algo no cuadra, anota **qué widget, qué esperabas y qué viste** (foto de la pantalla si se puede).

---

## 0. Antes de empezar

- [ ] Instala el APK y abre la app **con internet** al menos una vez. Hasta entonces los widgets dicen «Abre ConstructorPro una vez…».
- [ ] Para agregar un widget: mantén presionada la pantalla de inicio → **Widgets** → **ConstructorPro** → arrastra el que quieras.
- [ ] **Ojo con los módulos.** La cuenta *Orlando Ramoz* hoy NO tiene prendidos: Bitácora, Compras y material, Programa de obra, Extras, Estimaciones, Seguridad, Garantías ni Herramienta. Los widgets de esos módulos dirán «Prende «…» en la web: Ajustes → Módulos». Eso es correcto. Para verlos con datos:
  - prende el módulo en la web (Ajustes → Módulos) y captura algo, **o**
  - entra con la cuenta demo (`mariokeinan@gmail.com`, empresa *Edificaciones Valle del Norte*), que tiene todo prendido y seis meses de datos.
- [ ] Lo que viene de la oficina (etapas 2 y 3) se baja **al abrir la app, al volver a ella y al terminar cada sincronización**, como mucho una vez cada 3 minutos. Si cambias algo en la web, cierra y vuelve a abrir la app (o espera la siguiente sincronización).

---

## 1. Etapa 1 — lo que ya está en el teléfono

### Pase de lista de hoy (4×2)
- [ ] Muestra la obra con más gente presente (o la de más gente asignada si nadie ha pasado lista), «X de Y presentes» y los cuadros por cuadrilla.
- [ ] Pasa lista en la app: **unos 2 segundos después** el widget cambia los números y la hora («Hoy · tomado 7:02»).
- [ ] Hazlo **sin señal**: el widget cambia igual y aparece la ficha ámbar «N por subir». Al volver la señal y sincronizar, desaparece.
- [ ] El botón «Pasar lista» abre el pase de lista. (Si tu cuenta no puede pasar lista, el botón no aparece.)
- [ ] Al día siguiente, **antes de abrir la app**: dice «Hoy · aún no se pasa lista» con 0 presentes, no los datos de ayer.
- [ ] Tamaño: prueba agrandarlo/achicarlo. *(Detalle ya reportado: reajustar el tamaño.)*

### Avisos de la oficina (4×2)
- [ ] Con la bitácora prendida, escribe en la web una entrada de tipo **Instrucción** o una **aclaración** en una obra → aparece en el widget con «Instrucción · autor · hora · obra».
- [ ] Crea en la web una **nota de obra** nueva → aparece como «Nota nueva» (solo título y para quién, **sin montos**).
- [ ] Lo que escribiste tú desde este teléfono NO aparece como aviso.
- [ ] La ficha morada «N nuevos» se quita al abrir la bitácora o las notas.
- [ ] Tocar un aviso abre la bitácora o las notas de **esa** obra.

### Acciones rápidas (4×1) y atajos del ícono
- [ ] El widget muestra solo las acciones que tu cuenta puede usar (Pase de lista, Bitácora, Nota nueva, Gasto de caja).
- [ ] Mantén presionado el ícono de la app: aparecen los mismos atajos.
- [ ] Con **varias obras activas**, Bitácora / Nota / Gasto preguntan «¿En qué obra?»; con una sola, entran directo.
- [ ] «Gasto de caja» abre la obra en la pestaña Caja **con el alta de salida ya abierta**.
- [ ] «Nota nueva» abre las notas **con el alta ya abierta**.

### Hoy en las obras (4×3)
- [ ] Lista las obras activas con gente asignada: «X de Y», hora del pase e incidencias de bitácora.
- [ ] Las que no han pasado lista salen en **ámbar «Sin pase»**.
- [ ] Tocar una obra abre su detalle.

---

## 2. Etapa 2 — lo que mueve la oficina (abre la web al tocar)

### Material de la obra (4×2)
- [ ] En la web, pide material en una obra (pestaña Material) → en el widget: «Cemento, 40 bultos · Pedido hoy 9:10 · obra» con ficha **Por aprobar**.
- [ ] Apruébalo / márcalo comprado / recházalo → la ficha cambia (Aprobado, Comprado, Rechazado y el motivo).
- [ ] Registra una **recepción** hoy → aparece la franja verde «Hoy llegó material a …».
- [ ] **Nunca** aparece un precio.
- [ ] Tocar un pedido abre la página Material de esa obra en el navegador (tienes que tener sesión en la web).

### Lo que toca esta semana (4×2)
- [ ] En la web (Programa de obra) crea partidas: una que **ya debió terminar**, una que **empieza** esta semana y una que **termina** esta semana.
- [ ] El widget pone primero la atrasada (roja, «Debía terminar el…») y la ficha «1 atrasada» arriba.
- [ ] Una partida marcada **terminada** ya no aparece.

### Por aprobar (2×2) — solo administrador y supervisor
- [ ] Cuenta pedidos de material pendientes + extras/estimaciones/compras que esperan visto bueno: «3 pedidos de material · 1 extra».
- [ ] Sin montos.
- [ ] Como administrador, al tocarlo abre Ajustes → Visto bueno; como supervisor, abre Compras.
- [ ] Con un rol que no aprueba (residente, contador), dice que solo admin y supervisor lo ven.

---

## 3. Etapa 3

### Seguridad de hoy (4×2)
- [ ] En la web, haz la **revisión diaria** de una obra → el widget dice «Revisión hecha en 1 de N obras» y lista las que faltan.
- [ ] Registra un **incidente** → aparece «1 incidente en los últimos 7 días». **Solo el número**: ni nombre ni detalle de salud.
- [ ] Al día siguiente, antes de abrir la app: «Abre la app para ver la revisión de hoy».
- [ ] Tocar una obra pendiente abre su página de Seguridad en la web.

### Garantías abiertas (4×2)
- [ ] Reporta una garantía (desde el portal del cliente o la web) → aparece con ficha **Abierta**.
- [ ] Prográmala para **hoy** → sube al primer lugar con ficha verde **Hoy**.
- [ ] Al resolverla o marcarla «no procede» desaparece.

### Herramienta en obra (4×2)
- [ ] Presta una herramienta a una obra con fecha de devolución **ayer** → sale primero, roja, «Ya debió volver», y la ficha «1 por regresar».
- [ ] Una con devolución futura dice «Hasta el …»; una sin fecha, «En obra».
- [ ] Dice quién la tiene («la tiene Juan»). **Nunca** el costo.
- [ ] Al registrar la devolución desaparece.

---

## 4. Pruebas generales (todas las etapas)

- [ ] **Sin señal** (modo avión): todos los widgets siguen mostrando lo último, con «Actualizado …».
- [ ] **Cerrar sesión**: todos dicen «Inicia sesión en ConstructorPro para ver tus datos».
- [ ] **Cambio de cuenta** en el mismo teléfono: nunca se ven datos de la cuenta anterior.
- [ ] **Roles**: con un usuario colaborador, compras o almacén, los widgets de campo dicen «No disponible con tu cuenta» (compras y almacén SÍ ven Material; almacén SÍ ve Herramienta).
- [ ] **Modo oscuro** del teléfono: los widgets se ven bien y se leen.
- [ ] **Texto grande** del sistema: nada se encima de forma grave.
- [ ] **Ningún widget muestra dinero** (sueldos, saldos, precios, montos).

---

## 5. Limitaciones conocidas (no son errores)

- Con la app **cerrada** los widgets no consultan nada: se actualizan al abrir la app, al guardar algo o al sincronizar. Android solo los vuelve a dibujar cada 30 min (por eso al cambiar el día saben que lo de «hoy» ya no vale).
- Las etapas 2 y 3 abren la **web** porque el móvil aún no tiene esas pantallas.
- Solo Android. En iPhone siguen la PWA.
- Detalles reportados de la etapa 1 pendientes: visuales de Ajustes, formularios con UX desactualizada, vista de sincronización y tamaño del widget de pase de lista.
