# Plan: Listas de material (cuantificación con checklist)

> Estado: **Fase 1 implementada** (móvil + web, migración `0050_listas_material.sql`
> sin aplicar en producción todavía). Fases 2–4 pendientes. Prototipo del PDF
> (`salidas/checklist_trabes_pasillo.pdf`, generado con el mismo encabezado,
> paleta, títulos de sección, totales y firmas de `lib/pdf/pdf_service.dart`).

## 1. Qué problema resuelve

En obra la cuenta de material vive en notas de WhatsApp como esta:

```
Través
4 10:45
2 12:25
...
Pasillo
2 3:55 estribo 25
4:10 1
2 3mt
```

Hoy eso no se suma, no se puede palomear lo que ya llegó o ya se armó, y no se
convierte en material a comprar. El módulo hace tres cosas:

1. **Listar**: piezas por sección (trabes, castillos, pasillo…) con cantidad y
   medida, y una casilla por renglón para palomear en obra.
2. **Contabilizar**: a partir de medidas, calcular el material —blocks para un
   muro de X × Y m, bultos de cemento, arena y grava para un volumen de
   concreto, varillas de 12 m por diámetro, estribos por separación—.
3. **Sacar**: PDF con checklist (el del prototipo) y, si el módulo de Compras
   está activo, «Pedir este material» → requisición.

## 2. Dónde vive

- Módulo nuevo en `ClaveModulo`: **`listas`**, nombre «Listas de
  material», descripción: «Cuenta piezas y material de cada obra, palomea lo
  que ya está y saca la lista en PDF.» **No depende** de `compras`: quien no
  compra por la app igual quiere la lista. Si `compras` está activo aparece el
  botón de pedir.
- Siempre **por obra** (`obra_id` obligatorio), como requisiciones y notas.
- **Roles**: dueño/administración y supervisor/encargado **crean y editan**
  listas (así el que está en obra lleva el orden), palomean y avanzan barras.
  Cada marca guarda quién y cuándo.
- Móvil primero (se captura en obra), web igual (mismo nombre, mismos datos,
  mismo PDF — regla del monorepo).

## 3. Modelo de datos (migración `0050_listas_material.sql`)

> 0049 ya la ocupa la tabla de proyección (rama pendiente, tabla en prod).
> Confirmar el número libre antes de crear el archivo.

Columnas de sync iguales a las de 0038 (`created_at`, `updated_at`,
`server_updated_at`, `deleted_at` en bigint ms) y RLS por `empresa_id`.

**`lista_material`** (así quedó en 0050)

| columna | tipo | nota |
|---|---|---|
| id | uuid pk | lo genera el cliente |
| empresa_id, obra_id | uuid | obra obligatoria |
| titulo | text | «Trabes y pasillo planta alta» |
| plano | text | clave u hoja del plano de donde sale la lista: «E-03» |
| fecha | bigint | |
| estado | text | `ABIERTA` · `CERRADA` |
| notas, texto_final | text | texto_final = párrafo del PDF (0032) |
| requisicion_id | uuid null | si ya se pidió |

**`lista_material_renglon`** — en la fase 1 las entradas de cálculo van en columnas (`largo`, `separacion_cm`, `unidad`); `params`, `marca`, `elemento`, `avance` y `material_id` llegan con su fase.

| columna | tipo | nota |
|---|---|---|
| id, empresa_id, lista_id | uuid | |
| seccion | text | «Trabes», «Pasillo». Texto libre, no tabla aparte |
| tipo | text | `PIEZA` · `VARILLA` · `MURO_BLOCK` · `CONCRETO` · `LIBRE` |
| params | jsonb | entradas del cálculo según `tipo` (ver §4 y §5) |
| marca | text | clave de la barra o pieza: «T-1», «E-2». Vacía si no aplica |
| elemento | text | trabe, castillo, cadena, dala, losa, zapata, columna, muro |
| avance | text | solo `VARILLA`: `PENDIENTE` · `CORTADA` · `DOBLADA` · `COLOCADA` |
| material_id | uuid null | del catálogo `materiales` (0038) si aplica |
| descripcion, unidad | text | |
| cantidad | double | la que se captura (piezas) |
| nota | text | «chica», «estribo @25» |
| marcado | bool | la casilla |
| marcado_por, marcado_at | uuid, bigint | quién palomeó y cuándo |
| orden | bigint | orden manual, como `cuadrilla_miembro.orden` |

Los **resultados** del cálculo (blocks, bultos, varillas) **no se guardan**:
se recalculan de `params` con el mismo módulo puro en móvil y web. Así un
cambio de rendimiento no deja números viejos pegados.

Drift: tablas espejo y `schemaVersion` 15 → 16 con su paso incremental.

## 4. Calculadoras (lógica pura, gemelas Dart ↔ TS)

`lib/domain/logic/cuantificacion.dart` y `web/src/lib/cuantificacion/calculo.ts`,
con **los mismos casos de prueba** (fixture JSON compartido) para que web y
móvil den el mismo número.

| tipo | entradas (`params`) | salida |
|---|---|---|
| `PIEZA` | cantidad, largo m, sep. estribo cm (opc.) | metros lineales; estribos por pieza con la regla de §5.4 |
| `VARILLA` | ver §5 (diámetro, forma, cotas, ganchos, piezas) | largo de corte, ml, kg, varillas de 12 m, alambre recocido |
| `MURO_BLOCK` | largo, alto, vanos (lista de a×h), medida del block, desperdicio % | m² netos, blocks (12.5 pza/m² para 15×20×40), mortero m³ → bultos de cemento, cal, arena |
| `CONCRETO` | largo, ancho, espesor (o volumen directo), f'c | m³ → bultos de cemento de 50 kg, arena m³, grava m³, agua L |
| `LIBRE` | cantidad, unidad | tal cual |

Los **rendimientos** (pzas/m², bultos por m³ según f'c, traslape, desperdicio)
salen de una tabla por defecto en código; en la Fase 3 la empresa los ajusta
(cada maestro tiene su dosificación).

**Resumen de la lista** = suma de todas las salidas agrupadas por material
(«Varilla 3/8": 14 pzas de 12 m · Cemento: 32 bultos · Block 15×20×40: 640
pzas»). Ese resumen es lo que se pide.

## 5. Despiece de varilla (detalle por barra)

Es la parte que convierte «4 trabes de 10.45» en lo que el fierrero corta y lo
que se compra. Cada **barra distinta** es un renglón `VARILLA` con su casilla,
así se palomea barra por barra.

> **Regla del módulo: lo que se captura es lo que marca el plano.** La app no
> decide ingeniería: ganchos, medidas de estribo, separaciones, traslapes y
> armados se escriben tal cual vienen en el plano. Donde abajo aparece un
> «valor usual» es solo una pista en gris dentro del campo; **no se usa** si
> nadie lo escribe. Un renglón al que le falta un dato del plano queda marcado
> «Falta dato del plano», no se calcula con un supuesto y en el PDF sale «—».
> Lo único que la app sí calcula por su cuenta es aritmética: largos de corte,
> número de estribos, ml, kg, varillas a comprar y plan de cortes.

### 5.1 Qué se captura por barra (`params`)

| dato | ejemplo | nota |
|---|---|---|
| marca | `T-1`, `E-1` | clave que se escribe en el plano y en la barra |
| elemento | trabe, castillo, cadena, dala, losa, zapata, columna | para agrupar y para el PDF |
| posición | lecho inferior, lecho superior, bastón, columpio, estribo, grapa, refuerzo | opcional |
| diámetro | 3/8" (#3) | de la tabla §5.2 |
| forma | `U` (doble escuadra) | del catálogo §5.3, con su dibujo |
| cotas | A = 3.55 m, B = C = 0.15 m | las que pida la forma, en m o cm, como el plano |
| medida del estribo | exterior · interior | la que diga el plano; si es interior se suma 2·db para sacar el exterior |
| ganchos | 135° · 10 cm | ángulo y largo por extremo, como el plano, si la forma no los trae ya |
| piezas por elemento | 4 | varillas iguales en una pieza |
| elementos | 2 | cuántas piezas iguales hay (las «2» de «2 3:55») |
| separación | @25 cm (o por zonas: @10 en 60 cm de cada extremo, @20 al centro) | solo estribos y grapas, como el plano: el sistema saca las piezas |
| primer estribo | a 5 cm del paño | como el plano |
| traslape | 40 cm | como el plano; la app avisa cuando hace falta (§5.4) |
| plano | `E-03` | hoja de donde sale la barra, si es distinta a la de la lista |

### 5.2 Diámetros (todas las medidas que se fabrican)

Se ofrecen **todas** las medidas comerciales. Las de uso diario —**3/8", 1/2"
y 5/8"**— van primero como chips; el resto queda detrás de «Más medidas».

| designación | pulgada | mm | kg/m | se compra por | |
|---|---|---|---|---|---|
| #2 (alambrón) | 1/4" | 6.35 | 0.249 | kg / rollo | |
| #2.5 | 5/16" | 7.94 | 0.388 | pieza de 12 m | |
| **#3** | **3/8"** | 9.53 | 0.559 | pieza de 12 m | común |
| **#4** | **1/2"** | 12.70 | 0.994 | pieza de 12 m | común |
| **#5** | **5/8"** | 15.88 | 1.554 | pieza de 12 m | común |
| #6 | 3/4" | 19.05 | 2.237 | pieza de 12 m | |
| #7 | 7/8" | 22.23 | 3.045 | pieza de 12 m | |
| #8 | 1" | 25.40 | 3.978 | pieza de 12 m | |
| #9 | 1 1/8" | 28.58 | 5.034 | pieza de 12 m | |
| #10 | 1 1/4" | 31.75 | 6.215 | pieza de 12 m | |
| #11 | 1 3/8" | 34.93 | 7.520 | pieza de 12 m | |
| #12 | 1 1/2" | 38.10 | 8.950 | pieza de 12 m | |

El peso es el nominal del acero (7 850 kg/m³ × área de la barra), la misma
fórmula para todas las medidas, así web y móvil dan el mismo número. Puede
diferir un poco de la ficha de cada fabricante: la tabla y el largo comercial
(12 m) son editables por empresa.

### 5.3 Catálogo de formas

Cada forma tiene un dibujo con sus cotas (en pantalla y en el PDF) y una
fórmula de largo de corte. `g90`, `g135`, `g180` son los largos de gancho que
marca el plano para esa barra.

| clave | nombre en obra | cotas | largo de corte |
|---|---|---|---|
| `R` | recta | A | A |
| `L` | escuadra / bastón | A, B (pata) | A + B |
| `U` | doble escuadra | B, A, C | A + B + C |
| `G` | recta con ganchos | A | A + 2·g180 |
| `E` | estribo cerrado | a × b (exterior; si el plano da interior, + 2·db a cada lado) | 2·(a + b) + 2·g135 |
| `GR` | grapa (una rama) | A | A + 2·g135 |
| `Z` | bayoneta / columpio | A, B (diagonal: alto h, avance d), C | A + √(h² + d²) + C |
| `O` | anillo / zuncho | D (diámetro) | π·D + traslape |
| `X` | libre | tramos A, B, C, … + ganchos | suma |

v1 **no descuenta** el doblez (suma de cotas exteriores): sale un poco más
largo, que para comprar es el lado seguro. El descuento por doblez queda como
ajuste en la Fase 3.

### 5.4 Reglas de cálculo

Datos que vienen del plano (se capturan, la app no los inventa):

- **Ganchos**: ángulo y largo por extremo, como el plano. Pista en gris (no
  se usa sola): 90° = 12·db · 135° = 6·db, mín. 7.5 cm · 180° = 4·db, mín.
  6.5 cm.
- **Separación de estribos**, zonas y **primer estribo** (r, distancia al
  paño): como el plano. Pista: r = 5 cm.
- **Traslape**: como el plano. Cuando un largo de corte pasa de 12 m la app
  avisa «Esta barra necesita traslape: ¿cuánto marca el plano?» y no sigue
  hasta tenerlo. Pista: 40·db (≈ 38 cm en 3/8", 51 cm en 1/2", 64 cm en 5/8").
  Ej.: 12.25 m en 1/2" con 51 cm del plano → 12.76 m de varilla.

Aritmética que sí hace la app:

- **Estribos por pieza**: ⌈(L − 2·r) / s⌉ + 1. Con zonas, la misma regla en
  cada zona. Para 3.55 m @25 con r = 5 cm: ⌈3.45 / 0.25⌉ + 1 = 15 (lo del PDF).
- **Plan de cortes** (por diámetro): acomoda los largos de corte en varillas de
  12 m (el más largo primero, en la primera varilla donde quepa). Da cuántas
  varillas comprar, el desperdicio y los **sobrantes ≥ 1 m** como aprovechables.
- **Alambre recocido**: porcentaje del peso total de acero (arranque 2 %).
- **Peso**: ml × kg/m del diámetro.

### 5.5 Ejemplo con la nota de hoy (pasillo)

Pieza `2 3:55 estribo 25`. El armado de abajo **no está en la nota**: es un
ejemplo de lo que el plano podría marcar —4 varillas de 3/8" con escuadras de
15 cm; estribo de 1/4" de 11 × 16 cm exterior, ganchos de 135° de 7.5 cm,
primer estribo a 5 cm—:

| marca | Ø | forma | cotas | largo de corte | piezas | ml | kg |
|---|---|---|---|---|---|---|---|
| P-1 | 3/8" | U | 0.15 · 3.55 · 0.15 | 3.85 m | 4 × 2 = 8 | 30.80 | 17.22 |
| E-1 | 1/4" | E | 11 × 16 cm | 2·(0.11 + 0.16) + 2·0.075 = 0.69 m | 15 × 2 = 30 | 20.70 | 5.15 |

Plan de cortes: 3/8" → 3 barras de 3.85 por varilla → **3 varillas** (sobra
0.45 m por varilla). 1/4" → 5.15 kg de alambrón (17 estribos por tramo de
12 m). Alambre recocido ≈ 0.45 kg.

### 5.6 Plantillas de elemento

Capturar barra por barra cada trabe es lento. Una **plantilla** describe el
armado de un tipo de elemento una vez —«Trabe T-1 20 × 40: 2 Ø1/2" lecho
inferior en U, 2 Ø3/8" lecho superior rectas, estribo Ø1/4" @15 de 15 × 35»— y
al aplicarla a «4 piezas de 10.45 m» genera todos los renglones `VARILLA` con
sus cálculos. Son **por obra**, porque las marcas (T-1, K-2) son las del plano
de esa obra: tabla `plantillas_armado` con `obra_id` y mismas columnas de
sync. Para no capturar dos veces, «Copiar de otra obra» trae una plantilla y
la deja editable (la copia no queda ligada a la original). El armado
prefabricado (armex, castillos hechos) entra como renglón `LIBRE` con su
unidad.

### 5.7 Avance en obra

Cada barra pasa por **Pendiente → Cortada → Doblada → Colocada**. En el móvil
un toque avanza el estado (offline, sincroniza con quién y cuándo). El PDF
puede salir con una casilla (lista simple) o con tres columnas Corte / Doblez /
Colocado (hoja para el fierrero).

## 6. Captura rápida: pegar la nota

Reusar el enfoque de `text_import_parser.dart` y de «Nota desde un mensaje»:
pegar el texto de WhatsApp → renglones, **mostrando la interpretación para
confirmar** antes de guardar. Reglas para el formato que ya usan:

- Línea sin números → **encabezado de sección** («Través» → «Trabes»).
- `:` o `.` entre dígitos = punto decimal (`10:45` → 10.45 m).
- Sufijo `mt`/`m` = largo (`3mt` → 3.00 m).
- En «N medida», el entero sin decimales es la cantidad; si viene al revés
  (`4:10 1`), el que tiene decimal es el largo.
- `estribo 25` → separación de estribo 25 cm. Palabras sueltas (`chica`) → nota.
- Lo que no se entienda se queda como renglón `LIBRE` marcado para revisar,
  nunca se descarta en silencio.

## 7. Pantallas

**Móvil** (seguir `docs/DISENO_MOVIL.md`: `GrupoLista` / `FilaLista`,
`context.colores`, copy de obra):

- Obra → «Listas de material» → lista de listas (título, fecha, «12 de 20
  palomeadas»).
- Detalle: un `GrupoLista` por sección; cada `FilaLista` con casilla, «4 × 10.45
  m» y los metros a la derecha. Tocar la casilla palomea (offline, sincroniza).
  Al pie, el resumen de material.
- Alta de renglón en `HojaFormulario` con selector de tipo; cada tipo muestra
  solo sus campos y el resultado en vivo.
- **Alta de varilla**: primero el diámetro (chips 3/8", 1/2", 5/8" + «Más medidas»), luego la forma
  (rejilla de dibujos del catálogo §5.3), y el dibujo de la forma elegida se
  queda arriba con sus cotas como campos encima de cada tramo (A, B, C). Abajo,
  en vivo: largo de corte, ml, kg y «lleva traslape» si aplica.
- **Fila de varilla**: dibujo chico de la forma, «T-1 · 3/8" · U · 3.85 m ×
  8», kg a la derecha y el estado de avance como insignia (Cortada, Doblada…).
  Si le falta un dato del plano, la insignia es «Falta dato del plano» y la
  fila no suma al despiece hasta completarla.
- Pestaña **Despiece** de la lista: resumen por diámetro (ml, kg, varillas a
  comprar) y el plan de cortes de cada diámetro.
- Menú: Pegar nota · Aplicar plantilla · PDF · Pedir este material (si
  `compras`).

**Web**: misma estructura en `/admin/obras/[id]/listas`, `DataTable`
responsive, mismo PDF vía `documento-lista-material-html.ts` (gemelo del de
Dart, como ya pasa con la nota de obra).

## 8. PDF

Dos documentos, los dos con `_header`, `_sectionTitle`, `_totalLinea` y
`_firmas` de `PdfService`:

**Lista de material** — `PdfService.listaMaterial(...)`, el prototipo de
`salidas/` (confirmado como correcto) pasado a la clase: una tabla por sección
con columna de casilla (dibujada con un `Container` con borde: la Helvetica
base no tiene el glifo ☐), subtotal por sección, total, observaciones y firmas
«Elaboró» / «Revisó / recibió». Opciones: con o sin casillas ya marcadas, con
o sin el resumen de material.

**Despiece de varilla** — `PdfService.despieceVarilla(...)`, la hoja del
fierrero:

| ✓ | marca | elemento | Ø | forma (dibujo con cotas) | largo de corte | piezas | ml | kg |
|---|---|---|---|---|---|---|---|---|

- El dibujo de la forma se traza con líneas (`pw.CustomPaint`) y las cotas
  escritas junto a cada tramo, como en la pantalla.
- Variante con tres columnas Corte / Doblez / Colocado en vez de una casilla.
- Al final: **resumen por diámetro** (ml, kg, varillas de 12 m o kg de
  alambrón, alambre recocido) y **plan de cortes** («Varilla 1: 3.85 + 3.85 +
  3.85 · sobra 0.45»), para que el fierrero corte sin desperdiciar.

## 9. Fases

| fase | entrega | toca |
|---|---|---|
| **1** | Listas de `PIEZA` / `LIBRE` por sección, casilla, pegar nota, PDF de lista. Lo de hoy, pero en la app | migración, Drift v16, módulo, pantallas móvil + web, PDF gemelo, parser con pruebas |
| **2** | **Despiece de varilla**: renglón `VARILLA` con diámetro, forma, cotas, ganchos, estribos por separación/zonas, traslape, plan de cortes, avance Cortada/Doblada/Colocada, PDF de despiece | `cuantificacion.dart` / `.ts` + fixture compartido, dibujos de formas (pantalla y PDF) |
| **3** | Plantillas de armado por obra (con «Copiar de otra obra»); calculadoras `MURO_BLOCK` y `CONCRETO`; resumen de material de toda la lista | tabla `plantillas_armado`, calculadoras |
| **4** | Rendimientos y tabla de diámetros por empresa, descuento por doblez, «Pedir este material» → requisición (0038) | tabla de rendimientos, puente a compras |

Cada fase se publica sola (APK + web), como las etapas de widgets.

## 10. Decisiones tomadas

| tema | decisión |
|---|---|
| Nota de hoy | «Través» = trabes · `4:10 1` = 1 pieza de 4.10 m · `estribo 25` = estribos a cada 25 cm (PDF confirmado) |
| Diámetros | todas las medidas que se fabrican (#2 a #12); 3/8", 1/2" y 5/8" primero |
| Ganchos | como los marca el plano (§5.4) |
| Medida del estribo | como la marca el plano, indicando si es exterior o interior |
| Plantillas | como las marca el plano, por lo tanto **por obra**, con copia desde otra obra |
| Supervisor / encargado | **crea** listas (para llevar orden), además de palomear y avanzar barras |
| Regla general | lo que se captura es lo que está marcado en el plano; la app solo hace la aritmética |

Pendiente de definir al implementar: quién puede **borrar** una lista (por
defecto, los mismos roles que hoy borran requisiciones).
