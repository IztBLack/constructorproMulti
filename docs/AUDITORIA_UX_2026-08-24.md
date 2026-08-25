# Auditoría de UX — navegación y accesos directos

**2026-08-24** · Hecha con los checklists de **ECC** (`~/.claude/ecc`), skills
`click-path-audit`, `accessibility` y `frontend-design-direction`. Alcance: las
dos plataformas, sobre la rama `claude/custom-notes-works-7b1bb8`.

Método: se levantó el mapa completo —**28 páginas** en la web y **21 pantallas**
en el móvil— y se contaron los clics/toques reales desde la app abierta hasta
cada tarea frecuente. Nada de esto sale de memoria: cada afirmación tiene su
archivo y su línea.

---

## Veredicto

**La navegación no es profunda; es plana pero sin salidas laterales.**

Llegar a cualquier cosa cuesta 2 o 3 pasos, que está bien. El problema aparece
**una vez que llegaste**: las pantallas de detalle no llevan a ninguna otra
parte. Para pasar de una obra a su cliente, o de una cotización a la obra que
generó, hay que volver al menú y empezar de nuevo.

Es el patrón que explica casi todos los hallazgos, y también por qué "faltan
accesos directos" se siente como el síntoma: lo que falta no son atajos sueltos,
son **los enlaces entre cosas que ya están relacionadas en la base de datos**.

---

## Hallazgos

### N1 — Las pantallas de detalle son callejones sin salida (web) · **alto**

Enlaces salientes a otras entidades:

| Pantalla | Enlaces |
|---|---|
| `obra-header.tsx` | **ninguno** |
| `cotizacion-header.tsx` | **ninguno** |
| `equipo/[id]/page.tsx` | solo "← Equipo" |
| `clientes/[id]/page.tsx` | ✅ enlaza a sus obras |

El de clientes demuestra que el patrón ya existe y funciona; simplemente no se
replicó. Las relaciones ya están en los datos y no se usan para navegar:
`obras.cliente_id`, `obras.cotizacion_origen_id`, `cotizaciones.obra_id`.

Un caso concreto: `cotizacion_origen_id` solo aparece en el código para
escribirle `null` (`obras/actions.ts:42`, `obras/importar/actions.ts:141`).
La columna existe, se llena al convertir una cotización en obra, y **nadie la
lee nunca**. Es un enlace ya pagado que no se está cobrando.

### N2 — Las notas quedaron escondidas en el móvil · **alto**

| | Web | Móvil |
|---|---|---|
| Camino | Obra → pestaña **Notas** | Obra → **⋮** → Notas de trato |
| Pasos | 3 | 4 |
| Visible sin abrir nada | sí | **no** |

Esto es responsabilidad mía: lo decidí ayer para no apretar la `TabBar`, que es
fija y con cuatro títulos ya reparte justo el ancho. La razón técnica era buena,
la consecuencia de uso no: **un menú de desbordamiento no se descubre**. Quien
no sepa que la función existe no va a abrirlo para averiguarlo, y esta función
es nueva justamente para todos.

### N3 — El menú principal no coincide entre plataformas · **medio**

| Sección | Web (8) | Móvil (5) |
|---|---|---|
| Obras | nav | nav |
| Cotizaciones | nav | nav |
| Equipo | nav | nav |
| Inicio / Resumen | nav | nav |
| Configuración | engranaje | nav |
| **Clientes** | nav | **no existe** |
| **Cuadrillas** | nav | dentro de Equipo |
| **Proyección** | nav | dentro de Resumen |
| **Pase de lista** | nav | dentro de Resumen |

Que el móvil tenga menos es correcto: cinco destinos es el tope sano de una
barra inferior. Lo que no es correcto es que la diferencia **no siga ninguna
regla explicable**. Cuadrillas está en el nav de la web y a dos toques en el
móvil; Proyección igual. Quien usa las dos no puede formarse un modelo mental.

### N4 — "Resumen" es el cajón de sastre del móvil · **medio**

Es la única entrada a **Pase de lista**, **Proyección**, **Catálogo** y varios
PDF globales. Un nombre que no promete nada concreto termina acumulando todo lo
que no cupo en otro lado, y entonces nadie lo abre buscando algo específico.

Síntoma medible: `PaseListaScreen` —la tarea **diaria** del negocio— solo se
alcanza desde ahí. La tarea más repetida de la app está detrás de la etiqueta
más vaga.

### N5 — La búsqueda está al revés · **medio**

| Lista | Web | Móvil |
|---|---|---|
| Obras | ✅ | ✅ |
| Cotizaciones | ✅ | ✅ |
| Equipo | ✅ | ✅ |
| Catálogo | — | ✅ |
| **Cuadrillas** | ❌ | ✅ |
| **Clientes** | ❌ | (no existe) |

El móvil —pantalla chica, en la obra, con una mano— tiene buscador en seis
listas. La web —pantalla grande, sentado, con teclado— tiene uno solo, el de
obras. Debería ser al revés, o al menos igual.

---

## Accesos directos propuestos

Ordenados por lo que ahorran, no por lo que cuestan.

### 1. Enlaces entre entidades relacionadas (web) — cierra N1

| Desde | Hacia | Por qué |
|---|---|---|
| Obra | su **cliente** | El nombre ya se muestra; hoy es texto muerto |
| Obra | su **cotización de origen** | La columna existe y nadie la lee |
| Cotización | su **obra vinculada** | Ya hay "Vincular a obra"; falta "ir a la obra" |
| Colaborador | **sus obras** | Para responder "¿dónde ha estado?" sin rodeos |
| Nota de obra | **la obra** | Ya existe ✅ |

Es el cambio de mayor efecto y el más barato: son enlaces, no pantallas.

### 2. Las notas, visibles en el móvil — cierra N2

Tres caminos, de menos a más intrusivo:

- **En la tarjeta de la obra**, un contador ("2 notas") que abra directo. No
  toca la `TabBar` y además informa: ves que hay tratos sin salir de la lista.
- **`TabBar` desplazable** con una quinta pestaña. Coincide con la web, pero
  las pestañas dejan de verse todas de un vistazo.
- **Botón en la pantalla de la obra**, junto al de PDF.

Recomiendo el primero: resuelve el descubrimiento *y* aporta un dato.

### 3. Pase de lista al alcance — cierra N4

Sacarlo de Resumen y ponerlo donde se usa: un acceso en la **tarjeta de cada
obra** de la lista, o un botón fijo en Obras. Es la tarea diaria; no puede estar
detrás de la etiqueta más vaga de la app.

### 4. Buscador en las listas que faltan — cierra N5

Cuadrillas y Clientes en la web. El componente ya existe en `buscador-obras.tsx`;
es replicarlo, no diseñarlo.

### 5. Cambio rápido de obra, en todas partes

`obra-header` ya tiene el selector "cambiar a obra" y el móvil su gemelo en
`obra_detail_screen`. Ese patrón —saltar a otra obra sin volver a la lista— es
el mejor acceso directo que ya existe en el producto, y está en una sola
pantalla. Vale la pena llevarlo a Asistencia, Nómina, Caja y Notas.

---

## Lo que NO hay que tocar

Para que la lista de arriba no se lea como "hay que rehacerlo todo":

- **La profundidad está bien.** 2–3 pasos a todo. No hay que aplanar nada.
- **Las pestañas de obra** (Equipo/Asistencia/Nómina/Caja) son la agrupación
  correcta y se desactivan solas sin conexión, con aviso. Está bien resuelto.
- **La barra inferior de cinco destinos** del móvil respeta el tope sano.
- **Los objetivos táctiles** de la web ya cumplen: `Button` fuerza `min-h-11`
  (44 px) incluso en tamaño `sm`, con su comentario citando WCAG 2.5.8.
- **`aria-current="page"`** está puesto en la navegación de obra.

---

## Siguiente paso sugerido

Empezar por el punto 1. Son enlaces sobre datos que ya existen, no cambian
ninguna pantalla de sitio, y son los que quitan el "volver al menú y empezar de
nuevo" que aparece en casi todos los recorridos.
