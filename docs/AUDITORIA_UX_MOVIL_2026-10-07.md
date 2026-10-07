# Auditoría de UX del móvil frente a la web — 2026-10-07

Retoma `docs/AUDITORIA_UX_2026-08-24.md` (N1–N5). Hecha con tres revisiones de solo lectura en paralelo: seguimiento de agosto (`ecc:code-explorer`), coherencia web ↔ móvil (guía `ui-ux-pro-max`) y UX/accesibilidad en obra (`ecc:a11y-architect`, WCAG 2.2 + Material 3). Cada hallazgo tiene archivo y línea en los informes; aquí va lo consolidado. **No se tocó código.**

## Veredicto

**El color ya está al día; lo que se quedó atrás es la estructura, el lenguaje y la forma de hablarle al usuario cuando algo falla.**
- Los colores del móvil ya copian los de la web en claro y oscuro, y el tema usa Material 3 actual.
- Pero el móvil sigue con la navegación de agosto mientras la web creció. De los 5 hallazgos de navegación de agosto, ninguno se cerró en el móvil. La bitácora repitió el error de las notas: quedó escondida en el menú ⋮ de la obra.
- Y cuando algo falla, el móvil le muestra al usuario de obra JSON de Postgres crudo y botones que no resuelven nada. Es lo que se vio en el RedMagic: "72 cambios no se pudieron subir · Motivo: cuadrilla_miembro: {"code":"42501"…}".

## Hallazgos priorizados

**Clave:** R = rápida (un día o menos) · G = grande.

### ALTO — afecta el trabajo en obra o confunde todos los días
| # | Hallazgo | Qué hacer | |
|---|---|---|---|
| U1 | **Errores de sync crudos y sin salida.** Muestra JSON/SQL; "Sincronizar ahora" reintenta lo que el servidor rechazará siempre; no separa "se reintenta solo" de "necesita que lo revises". | Generalizar `clasificarRechazo` (ya existe en la bitácora) a todas las tablas: causa en palabras de obra + acción + "Detalle técnico" plegado con "Copiar para soporte". Mostrar "Última subida completa: hoy 14:32". | R texto · G clasificador |
| U2 | **"Cerrar sesión" con un toque y sin avisar** de cambios sin subir; si `signOut` falla sin red, el estado local ya se borró. | Diálogos del plan de cambio de cuenta (abajo). Es parte de `PLAN_CAMBIO_DE_CUENTA.md`. | R aviso · G cambio de cuenta |
| U3 | **El pase de lista no dice que guardó.** Solo un check de 18 px de color, sin texto ni lector de pantalla. El indicador de sync falta en Pase de lista, Detalle de obra, Notas y Conflictos, justo donde se captura sin señal. | Indicador de sync en esas pantallas; fila con "Guardado en el teléfono · se sube después" → "Subido"; usar la insignia "Por subir" de la bitácora. | R |
| U4 | **Tres formas distintas de marcar asistencia.** Web `· ½ ¾ 1`, pase de lista móvil `F ½ ¾ ✓`, obra móvil `Falta ½ ¾ Completo`. TalkBack lee "efe". "Todos ✓" marca toda la cuadrilla sin deshacer y afecta la raya. | Un solo catálogo de opciones con etiqueta accesible, igual que la web; "Marcar a todos completo" con Deshacer. | R |
| U5 | **Errores y vacíos crudos.** `Text('Error: $e')` en unos 11 lugares y `Center(Text('Sin …'))` en unos 10. | Usar `ErrorStateView` / `EmptyStateView`, que ya existen: "No se pudo mostrar esto. Tus datos están a salvo en el teléfono." | R |
| U6 | **Navegación desalineada.** Web: Inicio + Obras/Gente/Dinero/Operación, con Pase de lista como primer enlace. Móvil: barra fija Obras/Cotizar/Equipo/Resumen/Config; Pase de lista solo en Resumen; Bitácora, Notas, Importar y Proyección en el ⋮ de la obra. | Barra inferior por categorías como la web (Inicio · Obras · Gente · Dinero · Ajustes), con Pase de lista al frente; en la obra, pestañas desplazables con el orden de la web (Detalle · Asistencia · Nómina · Notas · Bitácora). | G |

### MEDIO
| # | Hallazgo | Qué hacer | |
|---|---|---|---|
| U7 | **Nombres distintos:** Resumen/Inicio, Cotizar/Cotizaciones, Config./Ajustes, "Mis Obras"/Obras, "Colaboradores"/Equipo, "Pase lista", "Notas de trato"/Notas, Archivar/Inactiva… | Adoptar los nombres de la web (tabla completa en el informe). | R |
| U8 | **Ayuda:** la web tiene 91 íconos de ayuda y un recorrido guiado por nivel; el móvil tiene uno solo y un tutorial viejo que ignora los módulos y anuncia "datos de prueba". | Paso 1: exportar los textos de ayuda de la web a un widget `Ayuda(clave)` en Caja, Pase de lista, Nómina y Notas (R). Paso 2: "Primeros pasos" según los módulos prendidos (G). | R + G |
| U9 | **Caja:** la web abre con Costo / Recibido / Pendiente; el móvil con Entradas / Salidas / Saldo, 6 tarjetas antes de los movimientos y un botón "Borrar todos los movimientos" que la web no tiene. | Mismo orden que la web; tarjetas secundarias plegadas; un solo "Registrar movimiento"; "Borrar todos" al ⋮ o quitarlo. | G |
| U10 | **Contraste al sol:** `textFaint` (~2.5:1) no está en el test de contraste y se usa en el ícono "sin nube"; íconos de estado sobre los snacks oscuros. | Meterlos al test y subir esos usos a `textMuted`. | R |
| U11 | **Texto pequeño o fijo:** 44 `fontSize` sueltos (11 px en el aviso "se moverá" del pase de lista); la barra inferior recorta con letra grande; la fecha del pase de lista se aprieta entre 4 botones. | Estilos del tema; fecha en una fila propia; limitar la escala solo en la barra. | R |
| U12 | **Conflictos:** "Cancelar" sale de la pantalla y "Omitir" no dice lo que hace. | "Decidir después" / "Dejar solo en este teléfono". | R |
| U13 | **Login:** sin autocompletar ni "mostrar contraseña", errores en inglés, spinner mudo. | `autofillHints`, traducción, "Verificando tu cuenta… puedes seguir trabajando sin señal". | R |
| U14 | **Acciones escondidas en pulsación larga** (borrar movimiento, partidas, renglones): no se descubren y TalkBack no las ve. | Menú ⋮ visible + acciones de accesibilidad; Deshacer donde sea reversible. | R |
| U15 | **Fechas** "06/10/2026" en el móvil vs "6 oct 2026" en la web. | `DateFormat('d MMM y', 'es_MX')`. | R |
| U16 | **Tipografía:** web Geist, móvil Roboto. | Incluir Geist (licencia OFL) en la app. | R |

### TABLETA (G)
Sin rail lateral ni límite de ancho: el pase de lista y el detalle de obra son listas estiradas de 800+ dp en la SM_X510. Propuesta: rail lateral desde 600 dp, pase de lista en 2–3 columnas, maestro-detalle en Obras y Bitácora, `maxWidth` 720 en el resto, tabla semanal a todo lo ancho (como ya hace Proyección).

### BAJO
Esquinas de 10 → 8 px como la web · snacks con estilo único (24 `SnackBar` directos) · lectura en voz de montos · "Deshacer" 6 → 8 s (guantes) · **el documento de diseño de la web (`web/design-system/constructorpro/MASTER.md`) describe otra app** (Lexend, verde, landing): reescribirlo antes de seguir o desviará a quien lo lea.

## Lo que está bien y hay que copiar
La **bitácora** es la pantalla mejor hecha del móvil: insignias de estado, mensajes que explican el rechazo, lectores de pantalla y avisos que no se pierden. Es el modelo para U1, U3 y U5. Los colores, Material 3, el dinero con cifras tabulares y los toques de 48 dp ya están bien.

## Cómo encaja con el cambio de cuenta
`docs/PLAN_CAMBIO_DE_CUENTA.md` resuelve U2 y la parte de U1 que vio el RedMagic. Conviene hacerlos **juntos**: los diálogos de cerrar sesión y cambiar de cuenta se escriben una vez, con el lenguaje nuevo.

## Estado (2026-10-07)
**Fase A HECHA** en la rama `claude/auditoria-ux-movil-73d586` (versión 1.5.1+21, sin publicar): cambio de cuenta (ver `PLAN_CAMBIO_DE_CUENTA.md`), U1, U2, U3, U4, U5, U10, U12. Suite: 670 pruebas en verde; `flutter analyze` sin nuevos avisos. Falta la prueba en el RedMagic y la tableta antes de publicar.

Decisiones tomadas al implementar (revisables):
- U10: `textFaint` claro pasa de `#a3a3a3` a `#8f8f8f` (3.2:1) para pasar 3:1; se desvía de la web, como ya pasaba con `rojo700`. Afecta placeholders y texto deshabilitado.
- U4: el botón dice "Todos completo" (no cabe "Marcar a todos completo" junto a la cuadrilla); el texto completo va en la etiqueta accesible. Sin diálogo, con Deshacer de 8 s; Deshacer deja en "Falta" a quien no tenía registro.
- U3: "Subido" aparece solo en las filas tocadas en esa visita (treinta "Subido" serían ruido).
- U12: "Omitir" → "Dejar solo en este teléfono" (eso es lo que hace: `skipped`, la fila local sigue viva).

## Orden propuesto
- **Fase A — "que no asuste y que no pierda nada" (≈1 semana, 1.5.1):** cambio de cuenta (3 capas) + U1 + U2 + U3 + U4 + U5 + U12 + U10.
- **Fase B — "que hable como la web" (≈1 semana, 1.6.0):** U7, U15, U16, U11, U13, U14, ayuda paso 1 (U8) y reescribir el documento de diseño.
- **Fase C — "que se ordene como la web" (2–3 semanas, 1.7.0):** navegación por categorías y pestañas de obra (U6), caja (U9), tableta, "Primeros pasos" (U8 paso 2).
