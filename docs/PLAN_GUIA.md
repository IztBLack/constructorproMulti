# Ayuda en la app: íconos de ayuda + recorrido guiado

Estado: **en preview, pendiente de aprobación de Mario** · última decisión: 2026-10-01

## Qué se pidió

Un tutorial para cuentas nuevas con datos de ejemplo, que no deje nada en la
cuenta real y que se pueda repetir. Después Mario precisó:

- Que **no sea invasivo** y se pueda omitir.
- Si se inicia, que guíe **paso por paso bloqueando lo demás** para mantener el foco.
- Que se elija la **profundidad** (como Call of Duty pregunta tu experiencia y
  ajusta el tutorial), cubriendo la mayoría de las funciones.
- Además, **íconos de ayuda** junto a cada apartado con un tip breve.
- **Tono profesional**: nada de "nivel 1", misiones, rangos ni sellos.

## Decisiones (en orden)

1. **Primera versión: tarjetas (flashcards)**, decidida por un consejo de 4
   voces. Mario la vio en el preview y no lo convenció: la quería guiada sobre
   la pantalla real, con bloqueo y con profundidades. **Se retiró.**
2. **Se compararon 4 opciones con una maqueta** (tarjetas, tooltips, recorrido
   por niveles, ambos). Mario eligió **D: tooltips + recorrido**.
3. **Investigación de tono** (NN/g, Shopify, Atlassian, Microsoft Learn, guías
   de gamificación B2B): en software profesional funciona el **avance honesto**
   (temas completados, minutos restantes); los puntos, rangos e insignias se
   ignoran o se sienten condescendientes. La ayuda que el usuario pide (tooltip)
   se recuerda mejor que la que interrumpe (tutorial que salta solo).
4. Mario eligió nombrar las profundidades **por alcance** y quitar rangos y sellos:

| Alcance | Qué cubre |
|---|---|
| **Esencial** | El panel, obras, clientes, cotizaciones y tu gente |
| **Operación diaria** | Lo esencial + caja, asistencia, raya, cuadrillas y tratos |
| **Completo** | Todas las funciones activas: compras, estimaciones, papeles, ajustes… |

Cada alcance muestra **"N temas · duración aproximada X min"**, calculada con
los pasos reales (25 s por paso). Las unidades se llaman **temas** (no
"módulos": esa palabra ya es de las funciones que se prenden y apagan).

## Cómo funciona

**Íconos de ayuda (ⓘ).** Junto a títulos, columnas y conceptos no obvios
(saldo, IVA, destajo, estimación, REPSE…). Se abren al pasar el cursor, al
enfocarlos o al tocarlos (celular); Esc o un toque fuera los cierran. Textos en
`web/src/lib/guia/ayudas.ts`, componente `components/guia/ayuda.tsx`.

**Recorrido guiado.**
- Se abre con el botón **?** de la barra, desde Inicio o en Ajustes →
  Preferencias. A una cuenta nueva solo se le muestra un **aviso pequeño** en
  una esquina ("¿Es tu primera vez?… Ver opciones / Ahora no"), una sola vez.
- El lanzador muestra los tres alcances con duración y avance. Dos preguntas
  **opcionales** recomiendan uno; la elección siempre es del usuario.
- Durante el recorrido, una **capa oscura tapa todo** menos lo que toca usar;
  la tarjeta dice "Recorrido operación diaria · Tema 3 de 8: Tu gente" con una
  barra de avance del tema. Botones: Atrás, Siguiente / Terminar tema, Omitir
  tema, Salir (Esc pregunta antes de salir).
- Tipos de paso: **leer** (se señala, no se puede tocar), **tocar** (abrir un
  formulario, una pestaña, el menú: avanza solo), **escribir** (en un campo
  real, con "Escribir el ejemplo") y **bloqueado** (Guardar/Enviar: se explica
  qué haría).
- Si la cuenta no tiene datos para un paso (p. ej. aún no hay obras), se
  muestra una **vista de ejemplo** marcada como tal.

## Nada se guarda: el candado

Mientras el recorrido corre, `components/guia/recorrido/candado.ts` corta en
el navegador: todo envío de formulario, toda Server Action (`next-action`) y
toda escritura a Supabase (no-GET a `/rest/v1`, `/storage/v1`, `/functions/v1`).
La sesión (`/auth/v1`) sigue viva. Al salir del recorrido, los formularios de
ejemplo se cierran y se pierden.

**Límite conocido:** la cola sin conexión del pase de lista (IndexedDB) no pasa
por `fetch`. Por eso el recorrido **solo explica** la asistencia; una prueba
impide pasos de tocar o escribir en esas pantallas.

## Dónde vive el avance

En el navegador, por usuario: `localStorage` (temas terminados) y
`sessionStorage` (recorrido en curso). Cero escrituras a Supabase y sin
migraciones. Si cambia de dispositivo, empieza de nuevo.

## Pruebas que protegen esto

- `lib/guia/recorrido/motor.test.ts`: alcances, duración, avance, rutas.
- `lib/guia/recorrido/temas.test.ts`: cada ruta y ancla existe; reglas de
  seguridad (nada que guarde, asistencia solo lectura, vista de ejemplo dentro
  de una obra); **sin lenguaje de juego**; duraciones con tope.
- `lib/guia/ayudas.test.ts`: textos ≤260 caracteres, sin lenguaje de juego,
  ninguna ayuda sin colocar.
- `components/guia/recorrido/candado.test.ts`: qué se considera escritura.

## Fuera de alcance (por ahora)

- App móvil (Flutter): textos y temas son datos planos, portables.
- Portal del cliente.
- Métricas de uso.
