# Paridad web ↔ móvil — proyección de nómina

**Abierto el 2026-08-29**, al terminar la rama
`claude/bulk-collaborators-salary-edit-49glwi` (móvil: plazas, sueldo por
periodo, redondeo, memoria de escenarios y alta masiva).

---

## El plan que ya existía, y por qué no alcanza

No había plan escrito. El que había vivía en dos frases, repartidas entre el
comentario de la 0034 y el mensaje de `8caa9cb`:

> Queda lista para aplicar; el móvil sigue sin empujarla hasta entonces, y ese
> día el único cambio es una línea en `SyncService.pushOrder`.

> El formato lo fija `ProyeccionEstado.toJson` del móvil (y su gemelo de la web
> cuando llegue la paridad).

Las dos son ciertas, y las dos describen el **despliegue**, no la paridad. El
plan implícito es: aplicar la 0034, añadir la línea, y que la web escriba su
gemelo. Eso deja fuera lo único que puede salir caro.

**El riesgo real no es el despliegue: es que los dos gemelos se separen.** Y se
separan en silencio. Si la web serializa `'salarios'` donde el móvil lee
`'salario'`, no falla nada: la llave simplemente no está, `fromJson` es tolerante
a llaves faltantes, y el escenario abre **con los sueldos base en vez de los que
alguien ajustó a mano**. La pantalla se ve perfecta. El número está mal. Y es un
número que alguien se lleva al banco.

Ese es el hueco que este plan añade al que había.

---

## El hueco, medido

| | Móvil (tras la rama) | Web (hoy) |
|---|---|---|
| Escenario en memoria | ✅ | ✅ |
| Ajustes (destajo/anticipo/descuento) | ✅ | ✅ |
| Sueldo override por persona | ✅ | ✅ |
| **Plazas** (puestos sin cubrir) | ✅ | ❌ |
| **Redondeo** | ✅ | ❌ |
| **Sueldo por periodo** en la ficha | ✅ | ❌ |
| **Escenarios guardados** | ✅ (local) | ❌ |
| **Alta masiva** | ✅ | ❌ |

Lógica: 1,957 líneas en móvil contra 653 en web. La `ProyeccionEstado` de la web
([proyeccion-nomina.ts:98](../web/src/lib/data/proyeccion-nomina.ts)) es una
interfaz en memoria que muere al recargar la página.

En producción **la 0034 no está aplicada**: de `proyeccion_guardada`,
`colaborador_sueldo` y `nota_obra`, solo existen las dos últimas.

---

## Tres cosas que encontré revisando, y que el plan tiene que atender

### 1. El contrato JSON no lo verifica nadie · **es lo importante**

`ProyeccionEstado.toJson` tiene doce llaves, tres de ellas mapas anidados de
objetos con su propio `toJson` (`sueldo`, `plazas`, `ajustes`). Hoy hay **un solo
escritor**, así que el contrato se sostiene solo. En cuanto la web escriba,
hay dos, y nada los ata.

El proyecto ya sabe cómo se resuelve esto: `textos_finales_test.dart` y
`notas_obra_calculo_test.dart` son pruebas de paridad que nombran a su gemela de
la web en el encabezado y repiten los mismos casos y los mismos números.

**Pero aquí ese patrón se queda corto, y conviene mejorarlo.** Espejar a mano
sirve cuando lo que se compara es un *resultado* — dos calculadoras que deben dar
la misma cifra, y si una falla el test lo grita. Aquí lo que se compara son
*bytes*: nombres de llave. Dos pruebas espejadas a mano pueden estar las dos en
verde mientras cada lado escribe su propio nombre de llave, porque cada una lee
lo que ella misma escribió. El error vive justo en el punto ciego del patrón.

**Propuesta: un fixture JSON commiteado que lean las dos.** Un escenario de
ejemplo con las doce llaves pobladas, `test/fixtures/proyeccion_v1.json`. La
prueba móvil lo parsea, lo vuelve a emitir y exige que salga idéntico; la de la
web hace lo mismo. Si alguien renombra una llave de un lado, el fixture ya no
cuadra y **el otro lado se pone rojo**. Es la única forma de que el punto ciego
deje de serlo. Es una desviación del patrón de la casa, y es deliberada: el
patrón se hizo para comparar números, no formatos.

### 2. `fromJson` tolera llaves faltantes, pero no valores mal tipados

El comentario dice «tolerante a llaves faltantes», y lo es. Pero dentro de los
mapas hay `(e.value as num).toDouble()` sin guarda: un `null` o una cadena en
`destajo`, `salario` u `obraPorDia` lanza y **la pantalla de proyecciones
guardadas se cae entera**, no solo esa fila.

Mientras el único escritor fuera el móvil eso era teórico. Con la web
escribiendo —y con JavaScript, donde un `undefined` se serializa como `null` sin
que nadie se entere— deja de serlo. Hay que endurecerlo **antes** de que exista
el segundo escritor, no después del primer reporte.

### 3. La `'v'` del JSON no la lee nadie

`toJson` escribe `'v': versionEsquema`, y `fromJson` nunca la mira. El candado de
versión real está en la **columna**:
[repositories_proyeccion.dart:182](../lib/data/repositories_proyeccion.dart) hace
`if (fila.esquema > ProyeccionEstado.versionEsquema) return null`.

No es un bug —la columna es mejor sitio, porque permite descartar la fila sin
parsear el texto—, pero sí una trampa para quien escriba el gemelo: es fácil
mirar el JSON, ver la `'v'` y creer que ahí está la puerta. **La autoridad es la
columna `esquema`.** La web tiene que comprobarla igual, y conviene decirlo aquí
porque el código no lo dice en ninguna parte.

---

## Fases

Ordenadas para que cada una entregue algo y ninguna deje el sistema a medias.

### Fase 0 · Aplicar la 0034 · *requiere tu visto bueno*

Escritura en producción. Es aditiva e idempotente: crea tabla, índices, trigger y
RLS; no toca nada existente. Con ella aplicada, la línea de `pushOrder` del móvil
se puede añadir cuando queramos.

Hasta que se aplique, los escenarios guardados **no salen de la tableta**.

### Fase 1 · El contrato · *sin cambio visible, desbloquea todo lo demás*

1. `test/fixtures/proyeccion_v1.json` — escenario de ejemplo, doce llaves.
2. Prueba móvil de ida y vuelta contra el fixture.
3. Endurecer `fromJson` contra valores mal tipados (punto 2 de arriba).
4. Tipos de la web + `serializarEstado` / `deserializarEstado`, con su prueba
   contra **el mismo fixture**.

Nada de esto se ve en pantalla. Es lo que hace que las fases 2–4 no puedan
divergir en silencio.

### Fase 2 · La web lee

Lista de escenarios guardados y abrir para consultar. Solo lectura: la web
empieza leyendo lo que la tableta guardó, que es el sentido natural (se arma en
la obra, se revisa en la oficina). Sin UI de escritura no hay forma de corromper
nada mientras se valida el contrato con datos reales.

### Fase 3 · La web escribe · *y el móvil empuja*

Guardar, guardar como, duplicar, renombrar, eliminar. Aquí entra la línea de
`SyncService.pushOrder` en el móvil: es el momento en que el ida y vuelta se
cierra de verdad.

### Fase 4 · Las funciones que faltan

Plazas, redondeo, sueldo por periodo y alta masiva en la UI de la web. Va al
final a propósito: son las cuatro que **más código** piden y **menos riesgo**
tienen: si una sale mal, se ve en pantalla. Las de antes fallan calladas.

---

## Lo que este plan NO propone

- **Mover la lógica a un paquete compartido.** Es la solución de libro y aquí
  sería peor: son dos lenguajes y dos runtimes, y el proyecto lleva su vida
  entera con lógica espejada y pruebas de paridad que la sujetan. Cambiar de
  estrategia por un módulo no paga.
- **Guardar lo capturado dentro del escenario.** Ya está decidido en la 0034 y
  la razón sigue siendo buena: una proyección de hace dos semanas enseñaría el
  pase de lista de entonces.
- **Subir `versionEsquema` a 2.** El formato no cambia. Endurecer el lector no
  es cambiar el formato.
