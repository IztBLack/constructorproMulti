# Guía de diseño del móvil — ConstructorPro

**Vigente desde:** 2026-10-07 (rediseño de Ajustes, aprobado por Mario).
**Aplica a:** toda pantalla nueva o que se toque en `lib/presentation/`. Si una pantalla vieja no la cumple, se corrige al tocarla.
**Referencia visual:** mockup aprobado https://claude.ai/artifact/HtuvLfGbjC13xGPAhyPLcn (tableros "Rediseño · claro" y "Rediseño · oscuro").
**Hermana web:** `web/src/app/globals.css` y `web/src/components/ui/`. La web y el móvil son el MISMO producto: mismos colores, mismos nombres, misma forma de hablar. (Ojo: `web/design-system/constructorpro/MASTER.md` describe otra app y está marcado obsoleto.)

---

## 1. Principios

1. **Para la obra, no para la oficina.** Se usa al sol, con guantes, sin señal y con prisa. Toques grandes, contraste alto, texto que se entiende sin saber de sistemas.
2. **El valor a la vista.** Si una fila tiene un dato (IVA 16 %, 9 puestos, "Lunes 08:00"), se ve sin entrar. Entrar es para cambiarlo.
3. **Lo importante arriba, lo peligroso escondido.** La cuenta y el estado de la nube van primero. Borrar va al final, en UNA fila que abre su propia pantalla, nunca como lista de botones rojos.
4. **Color solo cuando significa algo.** Superficies neutras; el color identifica (mosaico de ícono) o informa (éxito, aviso, error). Nunca adorno.
5. **Lo que pasa se dice.** Guardado en el teléfono, por subir, subido, con error: siempre en texto, no solo con un ícono de color.
6. **Mismo nombre que la web.** Si en la web se llama "Ajustes", aquí también.

## 2. Dónde viven los tokens (no inventar valores)

| Qué | Dónde | Regla |
|---|---|---|
| Colores | `lib/core/theme/app_colors.dart` → `context.colores` | Nunca `Colors.x` ni hex sueltos en pantallas. El test de contraste (`test/theme/`) falla el build si un par no cumple AA. |
| Tema Material | `lib/core/theme/app_theme.dart` | Radios, alto táctil, estilos de botones/campos. |
| Texto | `Theme.of(context).textTheme` | Nunca `fontSize:` suelto (rompe el texto grande del sistema). |
| Espaciado | `lib/presentation/common/app_spacing.dart` | 4 · 8 · 12 · 16 · 24. |

### Colores por significado (pares fondo suave + texto fuerte, ya verificados ≥4.5:1)
| Tono (`BadgeTone`) | Úsalo para |
|---|---|
| `neutral` | Acciones de datos/sistema (respaldo, reportar), IVA |
| `info` (azul) | Documentos, ayuda, módulos |
| `success` (verde) | Gente/equipo; "todo subió" |
| `warning` (ámbar) | Catálogos, recordatorios; algo que espera |
| `accent` (morado) | Apariencia, rol de la cuenta |
| `danger` (rojo) | SOLO borrar o un error real |

### Radios
- `AppTheme.radiusMd` (10): controles y **mosaicos de ícono**.
- `AppTheme.radiusLg` (12): tarjetas (`AppCard`).
- `AppTheme.radiusXl` (16): **grupos de lista** y tarjetas de cabecera (cuenta).
- Fichas y avisos de estado: `999` (píldora).

### Tipografía
Hoy: la del sistema (Roboto en Android). **Meta: Geist**, la de la web (U16) — pendiente de agregar los archivos al proyecto. Cifras de dinero y conteos con números tabulares (`MoneyText`, `FontFeature.tabularFigures`).

## 3. Componentes (en `lib/presentation/common/`)

Usa estos antes de armar algo a mano. Si falta uno, se crea aquí, no dentro de la pantalla.

| Componente | Para qué |
|---|---|
| `GrupoLista` | Un grupo con título ("Tu empresa") y una tarjeta con filas separadas por divisores sangrados. La forma estándar de cualquier lista de opciones. |
| `FilaLista` | Fila de 64 dp: `MosaicoIcono` + título + subtítulo + **valor a la derecha** (máx. 120 dp; se parte si es largo) + chevron. `peligro: true` la pinta en rojo. `etiquetaValor` dice el valor completo a TalkBack ("9 puestos"). Acepta `trailing` (un `Switch` o un `AppBadge`) y `debajo` (fichas). |
| `MosaicoIcono` | Ícono de 20 dp en un cuadro de 36 dp con fondo suave del tono. Identifica la fila de un vistazo. |
| `margenesDeLista(context, ancho)` | Márgenes de una pantalla de lista: 16 dp en teléfono; en tableta centra el contenido a 720 dp **sin achicar la zona de scroll**. Úsalo como `padding` del `ListView` dentro de un `LayoutBuilder`. |
| `AppCard` | Contenedor con borde tenue; con `onTap` la onda queda recortada. |
| `AppBadge` | Estado o rol en píldora ("Admin", "Archivada"). |
| `SectionHeader` | Título + descripción dentro de una pantalla con scroll. |
| `EmptyStateView` / `ErrorStateView` | Vacíos y errores, siempre con qué hacer. Nunca `Text('Error: $e')`. |
| `InsigniaSync` | "Por subir" / "Subido" en filas que se capturan sin señal. |
| `SyncStatusAction` | Indicador de nube en el `AppBar` de toda pantalla donde se captura. |
| `SelectorFraccion` | Asistencia: `· ½ ¾ 1` con nombre accesible (mismo catálogo que la web). |
| `showAppSnack` | Avisos; con "Deshacer" de **8 s** cuando la acción es reversible. |

## 4. Anatomía de pantalla

### Pantalla de opciones / lista agrupada (modelo: Ajustes)
```
Título grande (headlineMedium, 700)            [ayuda]
[ Buscar … ]                     ← solo si hay más de ~10 filas
┌ Tarjeta de cabecera (lo más importante: cuenta, obra, estado) ┐
Título de grupo (labelLarge, textMuted)
┌ GrupoLista ─────────────────────────────┐
│ [▣] Título              valor   ›       │
│     subtítulo                           │
│ ─────────────── (divisor sangrado)      │
└─────────────────────────────────────────┘
… más grupos (24 dp entre grupos) …
┌ GrupoLista sin título: la fila de peligro ┐
```
- Margen lateral 16 dp; 8 dp entre el título del grupo y su tarjeta; 24 dp entre grupos.
- Los títulos de grupo van en **oración**, no en MAYÚSCULAS.
- Lo que depende de un módulo apagado **no se pinta** (se lee de `modulosProvider`).

### Una fila, una acción
- Una `FilaLista` hace UNA cosa. Si lleva `Switch`, tocar la fila alterna el switch (como `SwitchListTile`). Lo demás (p. ej. el día y la hora del recordatorio) va en **otra fila**, que aparece solo cuando aplica. Dos toques distintos en una fila se funden en uno para TalkBack.
- Un selector de varias opciones (`SegmentedButton`) va en su propio bloque a todo el ancho de la tarjeta, no dentro del texto de una fila (ver "Apariencia" en Ajustes).

### Acciones destructivas
- En una pantalla de opciones, nunca más de una fila roja: esa fila abre una pantalla dedicada a borrar (ahí todas las filas son rojas, y es lo único que hay).
- Siempre confirman: escribir la palabra (BORRAR, VACIAR…) cuando no se puede deshacer; "Deshacer" cuando sí.
- El texto dice qué se pierde y qué NO ("lo que ya está en la nube sigue allá"), y si hay cambios sin subir, que esos SÍ se pierden.
- El botón de confirmar dice qué hace ("Borrar obras"), no "Confirmar" ni "Aceptar".

### Estados
- **Vacío:** `EmptyStateView` con qué hacer ("Toca + para agregar al primero").
- **Error:** `ErrorStateView`: "No se pudo mostrar esto. Tus datos están a salvo en el teléfono." El detalle técnico va plegado o al registro, nunca al frente.
- **Cargando:** esqueleto (`esqueleto.dart`), no un spinner mudo en pantalla completa.

## 5. Cómo se escribe (copy)

- Español de México, tú, frases cortas. "Guardar un respaldo", no "Exportar respaldo (JSON)".
- Decir el efecto, no la técnica: "Reemplaza lo que hay en el teléfono", no "Sobrescribe la base local".
- Los botones dicen lo que hacen: "Dejar solo en este teléfono", no "Omitir".
- **Nombres de la web** (U7): Ajustes · Obras · Cotizaciones · Equipo · Notas · Inicio. Fechas como la web: "6 oct 2026" (U15).
- Sin "datos de prueba", "demo" ni jerga en una cuenta real.

## 6. Accesibilidad (no negociable)
- Toque mínimo **48 dp** (`AppTheme.touchTarget`); filas de lista 64 dp.
- Todo control con nombre para TalkBack: `Semantics`/`tooltip` en lo que es solo ícono; filas con semántica de botón.
- El estado nunca solo por color: texto o ícono además.
- Contraste AA en claro y oscuro; los pares nuevos se agregan al test de contraste.
- Probar con texto grande (1.3×): nada se corta; si una fila no cabe, el valor baja de renglón.

## 7. Tableta
Desde 600 dp: contenido con `maxWidth` 720 centrado (las listas no se estiran a 800+ dp). Rail lateral y maestro-detalle: Fase C de la auditoría.

## 8. Lista para cada pantalla nueva o tocada
- [ ] Colores por `context.colores`, texto por `textTheme`, espacios por `AppSpacing`.
- [ ] Listas de opciones con `GrupoLista` + `FilaLista`; valores a la vista.
- [ ] `SyncStatusAction` en el `AppBar` si ahí se captura algo.
- [ ] Vacío y error con sus vistas; nada de `$e` en pantalla.
- [ ] Una sola fila roja como máximo; destructivo con confirmación.
- [ ] Nombres y fechas como la web.
- [ ] Toques ≥48 dp, nombres para TalkBack, contraste en ambos temas.
- [ ] Revisado en claro, oscuro y texto grande.

## 9. Estado de adopción
| Pantalla | Estado |
|---|---|
| Ajustes | ✅ Línea nueva (2026-10-07, `docs/PLAN_AJUSTES_REDISENO.md`) |
| Bitácora | ✅ Modelo de estados y avisos |
| Nube y sincronización | Parcial (errores clasificados, U1) |
| Pase de lista, Detalle de obra, Caja, Notas, Cotizaciones, Equipo, Resumen | Pendiente — se migran al tocarlas (Fases B y C de `docs/AUDITORIA_UX_MOVIL_2026-10-07.md`) |
