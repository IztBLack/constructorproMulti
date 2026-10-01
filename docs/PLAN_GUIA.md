# Guía para cuentas nuevas (tutorial por tarjetas)

Fecha: 2026-10-01 · Estado: **en preview, pendiente de aprobación de Mario**

## Qué se pidió

Un tutorial "tipo videojuego" para cuentas nuevas que muestre el menú, los
ajustes y cada apartado paso a paso, con tres reglas:

1. Los datos que se ven son **de ejemplo**.
2. Al terminar, **nada** de eso queda en la cuenta real.
3. Se puede **repetir** cuando se quiera.

## Decisión: tarjetas + "Llévame ahí", sin caja de arena

Se comparó (consejo de 4 voces, ECC `council`):

- **A. Tutorial interactivo con caja de arena**: el usuario "crea" una obra de
  prueba con los formularios reales y un guardado simulado.
- **B. Tarjetas (flashcards)** que explican cada módulo y guían cómo usarlo.

Las tres voces externas (Escéptico, Pragmático, Crítico) eligieron B con
refuerzos; el Arquitecto empezó en un híbrido y cambió. Razones:

| | A. Caja de arena | B. Tarjetas + Llévame ahí |
|---|---|---|
| Datos de ejemplo | Sí, capturados | Sí, en maquetas marcadas EJEMPLO |
| Limpieza | Hay que garantizarla | No hay nada que limpiar: nunca toca Supabase |
| Costo | Alto: refactor de formularios para inyectar un guardado falso | Bajo: contenido + 6 componentes |
| Mantenimiento | Dos caminos por cada formulario; se desfasa en silencio | Una prueba truena el build si una tarjeta apunta a algo que ya no existe |
| 20 módulos | Misiones solo para unos cuantos | Una o dos tarjetas por módulo |
| Celular | Formularios largos + resaltados encimados | Tarjetas cortas, panel abajo |
| Transferencia | Practica en algo que "no es de verdad" | "Llévame ahí" abre la pantalla real y resalta por dónde empezar |
| Móvil (Flutter) | Habría que reconstruir la caja | El contenido es datos planos: se porta tal cual |

Disenso más fuerte (aceptado como riesgo): las tarjetas son pasivas y se
pueden pasar sin leer. Mitigación: "Llévame ahí" con resaltado sobre la
pantalla real, rango y sellos visibles, y la tarjeta solo cuenta al voltearla y
marcarla.

Además, en este proyecto escribir y luego borrar **no es opción**: hay
registros de evidencia que los triggers no dejan borrar, el móvil sincroniza
lo que se guarda, y muchas consultas dependen de RLS sin filtrar por empresa.

## Cómo funciona

- **Mazos = niveles**, uno por categoría del menú: Cómo funciona tu panel,
  Obras, Gente, Dinero, Operación, Ajustes. Solo aparecen las tarjetas de los
  módulos **prendidos** y que el **rol** puede abrir.
- **Tarjeta**: frente (qué es + maqueta EJEMPLO) → se voltea → reverso (pasos,
  consejo, «¡Entendido!», «Llévame ahí»).
- **Juego**: rango por avance (Ayudante → Media cuchara → Oficial → Maestro de
  obra → Residente de obra), un sello por nivel completo, puntos de avance.
- **Llévame ahí**: cierra la guía, abre la pantalla real y deja un panel con
  los pasos; resalta en ámbar el elemento `data-guia="…"` por donde se empieza.
- **Entradas**: botón **?** en la barra (con puntito mientras no se termina),
  «¿Primera vez? Ver la guía» en Inicio, y Ajustes → Preferencias → Guía (con
  «Repetir desde el principio»).
- **Cuenta nueva**: el registro (crear empresa o aceptar invitación de
  personal) manda a `/admin?guia=bienvenida`, que abre la guía **una vez**.

## Dónde vive el progreso

En `localStorage` (`cp.guia.v1.<userId>`), como el tema claro/oscuro: es del
dispositivo, no de la cuenta. Cero escrituras a Supabase, cero migraciones.
Contra: si cambia de computadora, empieza de nuevo. Si eso molesta, pasar a
`user_metadata` es un cambio local a `guia-provider.tsx`.

## Archivos

- `web/src/lib/guia/tipos.ts` — forma del contenido.
- `web/src/lib/guia/contenido.ts` — los mazos y tarjetas (datos planos).
- `web/src/lib/guia/progreso.ts` — lógica pura (filtrado, avance, rango).
- `web/src/lib/guia/*.test.ts` — lógica + anti-desfase del contenido.
- `web/src/components/guia/*` — provider, modal, maqueta, panel, botones.
- `data-guia="…"` en las pantallas reales (solo atributos).

## Fuera de alcance (por ahora)

- App móvil (Flutter): el contenido ya es portable; falta la UI.
- Portal del cliente.
- Métricas de uso de la guía.

## Criterio de terminado

1. Cuenta nueva → al crear la empresa se abre la bienvenida, una sola vez.
2. Se recorren tarjetas, sube el rango, se gana un sello.
3. «Llévame ahí» abre la pantalla real con el panel y el resaltado.
4. La pestaña de red no muestra ninguna escritura a Supabase por la guía.
5. Ajustes → «Repetir desde el principio» deja el avance en cero.
6. `npx vitest run src/lib/guia` y `npm run build` en verde.
