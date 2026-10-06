# `contracts/` — vectores dorados de la lógica duplicada

Estos JSON son la **fuente única de verdad** de los números que producen las
reglas de negocio de ConstructorPro. Los leen las dos suites de pruebas:

- `flutter test` — cargador en `test/contracts/golden_loader.dart`
- `npx vitest run` (desde `web/`) — cargador en `web/src/lib/contracts/golden.ts`

Un caso escrito aquí se ejecuta **dos veces**: una contra el Dart del móvil y
otra contra el TypeScript de la web. Si una plataforma se desvía, fallan las dos
suites y el fallo dice exactamente qué caso y qué campo.

## Por qué existe esto

La misma lógica de negocio está implementada dos veces, en Dart y en
TypeScript, **a propósito**: la app móvil es *offline-first* — se usa en obra,
sin señal — así que no puede pedirle el cálculo al servidor. La nómina, el saldo
de una nota o el párrafo final de un PDF tienen que salir del dispositivo con el
que se está trabajando.

El riesgo real de esa duplicación no es que una de las dos implementaciones esté
mal por su cuenta (eso lo caza cualquier prueba): es que **dejen de coincidir**.
Alguien ajusta una fórmula en la web, nadie toca el móvil, y la misma nota
enseña dos saldos distintos con un socio enfrente. O el mismo documento sale con
condiciones distintas según desde dónde se mandó.

Hasta ahora la paridad se sostenía con pruebas escritas a mano por duplicado:
los mismos casos, los mismos números, copiados en las dos suites. Funcionaba
mientras alguien se acordara de copiar. Los vectores dorados quitan esa memoria
del proceso: el número vive en un solo archivo y las dos plataformas lo leen.

## La regla de oro

> **Un caso nuevo se agrega aquí, no en un test.**
> Si una plataforma diverge, fallan las dos suites.

En concreto:

1. ¿Cambió un número de negocio? Se cambia en el `.golden.json`. Las dos suites
   fallan hasta que las dos implementaciones lo producen.
2. ¿Hay un caso nuevo que cubrir (un bug real, una frontera)? Se agrega un
   objeto a `casos` y **las dos suites lo corren solas**, sin tocar código de
   pruebas.
3. **Nunca** se "arregla" un golden para que pase una implementación. Si el
   número correcto cambió, se cambia con su `descripcion` diciendo por qué.
4. Los goldens cubren **los números y los textos**, no todo. Lo que no cabe en
   un JSON —que se lance una excepción, que un tipo no compile, que `undefined`
   se comporte como `null`— se queda como prueba propia de cada suite, al lado
   de las que consumen goldens.

## Formato de un `.golden.json`

```jsonc
{
  "contrato": "notas-obra/totales-nota",       // ruta lógica, para los mensajes de error
  "descripcion": "Qué regla fija este archivo y por qué importa.",
  "fuente": {
    "dart": "lib/domain/logic/notas_obra_calculo.dart",
    "ts": "web/src/lib/data/notas-obra-calculo.ts"
  },
  "casos": [
    {
      "nombre": "nota-de-orlando-sin-intervencion",  // identificador estable; sale en el nombre del test
      "descripcion": "Por qué existe este caso.",     // el contexto que un número solo no da
      "entrada": { },                                  // los argumentos de la función
      "esperado": { }                                  // lo que tiene que devolver
    }
  ]
}
```

Reglas del formato:

- **Todo en español**, igual que el resto del repo.
- `nombre` es un identificador estable en `kebab-case`. Se usa como nombre del
  test en las dos suites, así que cambiarlo cambia el nombre del fallo.
- `descripcion` explica **por qué existe el caso**, no qué hace la función. Un
  número sin su historia se borra en el primer refactor.
- `entrada` y `esperado` usan los nombres de campo del contrato, en la forma que
  viaja a Supabase cuando la hay (`"DIA"`, `"DEDUCCION"`, `"estado_cuenta"`),
  porque esa es la que las dos plataformas comparten. Cada cargador traduce a
  sus propios enums.
- Un `null` en `entrada` significa el `null` del dominio (sin valor). El
  `undefined` de TypeScript no es representable: si un caso lo necesita, va como
  prueba aparte en la suite de la web.
- `tolerancia` (opcional, en el caso) permite comparar flotantes con margen:
  `"tolerancia": 0.001` compara con `closeTo` en Dart y con una diferencia
  absoluta en vitest. Sin `tolerancia`, la comparación es exacta.

## Qué hay hoy

| Archivo | Casos | Fija |
| --- | --- | --- |
| `nomina/calculo-nomina.golden.json` | 8 | `NominaCalculator.calcular` ↔ `calcularNomina` |
| `nomina/semana.golden.json` | 5 | La semana lunes→domingo (y que se calcule en calendario de México) |
| `nomina/dias-del-periodo.golden.json` | 9 | Días que abarca un periodo de pago |
| `nomina/salario-diario.golden.json` | 8 | Sueldo del periodo → salario diario |
| `notas-obra/monto-sugerido.golden.json` | 6 | El monto que la app propone a partir de bruto y retención |
| `notas-obra/monto-efectivo.golden.json` | 5 | Con qué valor entra un renglón en los totales |
| `notas-obra/totales-nota.golden.json` | 8 | Subtotal, deducciones, total, pagado y saldo (con overrides) |
| `pdf/texto-integrado.golden.json` | 7 | El párrafo final de siempre, palabra por palabra |
| `pdf/resolver-texto-final.golden.json` | 7 | Quién gana entre documento, empresa e integrado |
| `comunes/constantes.golden.json` | 2 | Constantes que las dos plataformas tienen que declarar iguales |

**65 casos**, cada uno ejecutado dos veces: 65 pruebas en `flutter test` y 65 en
`vitest`, escritas una sola vez.

## Qué NO está aquí

- **`proyeccion_nomina.dart` ↔ `proyeccion-nomina.ts`.** Su entrada es un
  escenario editable (`ProyeccionEstado`: participantes, días marcados por
  persona, préstamos de obra por día, overrides de salario, ajustes dirigidos a
  cuadrillas) y su salida es una tabla con filas por colaborador más totales.
  Serializarla en un JSON legible es escribir un formato paralelo tan grande
  como el propio módulo, y el resultado sería más frágil que los tests que ya
  tiene cada suite. Además la proyección **no calcula nómina por su cuenta**:
  traduce el escenario a asistencias y destajos sintéticos y llama al mismo
  `NominaCalculator` / `calcularNomina` que ya cubren estos goldens, así que el
  riesgo de divergencia aritmética está cubierto por abajo. Se queda con sus
  pruebas propias en cada plataforma.
- Todo lo que dependa de base de datos, red o UI. Aquí solo entra lógica pura.
