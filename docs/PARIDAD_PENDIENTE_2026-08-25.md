# Paridad web ↔ móvil — el párrafo final de los PDF

**Abierto el 2026-08-25** tras desplegar `fcd9cc1`. **Cerrado el 2026-08-25**.

---

## Veredicto

La paridad de datos ya estaba casi cerrada; la que faltaba era de **salida**: el
mismo documento salía distinto según desde dónde se emitiera. Eso queda cerrado.

**Los tres documentos que llevan párrafo final dicen ahora lo mismo en las dos
plataformas, y se editan desde las dos.** Es la afirmación que al abrir este
documento no se podía hacer.

Por el camino salió un cuarto hueco que no estaba en la lista: la tarjeta de la
cotización —la única que existía en el móvil— **no guardaba nada**. Ver G6.

---

## Lo que se cerró

### G1 · El estado de cuenta del cliente salía sin párrafo · **alto**

`PdfService.estadoCuentaCliente` no lo imprimía; el de la web sí. Mismo
documento, mismo cliente, distinto pie según quién lo mandara.

Ahora resuelve el texto igual que `presupuesto` y `notaObra`, y lo imprime
**debajo de los totales**, que es donde la web pone su `.vigencia`: hasta dónde
cae el párrafo en la hoja forma parte de que sea el mismo documento.

### G2 · `obras.texto_final` no estaba en Drift · **alto**

Se me pasó al añadir la columna en la 0032: al móvil solo le llegó la de
`cotizaciones` y `nota_obra`. Ahora está, con su migración **v12 → v13**.

**Y con una guarda que no estaba prevista.** La columna existe en Supabase desde
la 0032 y la oficina lleva meses pudiendo escribirla, mientras que `addColumn` la
deja en NULL en todas las filas locales. Como el sync **empuja antes de traer**,
una obra `pending` —editada en la obra, sin señal— habría subido ese NULL y
borrado el párrafo de la web sin dar ningún error.

Un pull adelantado no lo arregla: `_pullTabla` aplica LWW y **salta** justo las
filas `pending`, que son las que corrían peligro. Lo que se hizo es un relleno
dirigido: `AppDatabase.columnasPorLlenar` lo apunta, `SyncService` lo atiende
antes del primer push y copia del servidor solo esa columna, solo donde está en
NULL. El aviso se persiste, así que sobrevive a los días que pueden pasar entre
actualizar la app y volver a tener señal.

Es un mecanismo general: cualquier migración futura que añada una columna que el
servidor ya tenga llena puede apuntarse ahí.

### G3 · El texto final de una NOTA no se editaba desde el móvil · **medio**

Ya se imprimía y ya se sincronizaba, pero no había dónde escribirlo. Ahora sí.

### G6 · La tarjeta de la cotización no guardaba · **alto, y no estaba en la lista**

Salió al escribir la prueba de guardado de la obra, que copiaba su patrón.
Guardaba con un `insertOnConflictUpdate` de un companion con solo el `id` y el
texto, y eso **nunca funcionó**: Drift valida la integridad del INSERT antes de
mirar el conflicto, así que lanzaba `InvalidDataException` por las columnas
obligatorias ausentes aunque la fila fuera a resolverse como UPDATE. La tarjeta
se veía bien y "Guardar" no guardaba nada, desde que existe.

La nota se salvó por casualidad: su repositorio ya escribía con `update`. Ahora
las tres van por ahí, con `setTextoFinal` en cada repositorio.

---

## Una sola tarjeta, no tres

G1 tal como estaba anotado solo habría hecho que el móvil **imprimiera** el
párrafo. Pero la web tiene su `TextoFinalCard` también en la obra, así que sin
equivalente móvil el hueco seguía abierto, igual que G3.

Son el mismo hueco, y esta es su causa: el móvil tenía la tarjeta escrita como un
método privado de la pantalla de cotización. Copiarla dos veces habría garantizado
que las tres se comportaran distinto con el tiempo — que es exactamente lo que ya
había pasado.

Ahora hay **una** (`lib/presentation/common/texto_final_card.dart`), como en la
web, y cada pantalla le pasa su tipo, su texto propio, su contexto y su forma de
guardar.

Se le puso además el candado por rol (`puedeEditarOperacionProvider`), que la web
ya tenía: el párrafo va en un documento que sale de la empresa. Concede mientras
el rol carga, como el resto de la app, y un rol de solo lectura sigue viendo el
texto — el candado es sobre editar, no sobre enterarse.

---

## Lo que queda como está, por decisión

### G4 · Los atajos nuevos son solo de la web · **bajo**

Vista rápida, menú de fila y paleta de comandos no tienen gemelo móvil. La
paleta pide teclado, y el equivalente móvil de la vista rápida —la hoja inferior
de consulta— se propuso y no se aprobó.

### G5 · `clientes` no existe en el móvil · **bajo**

Gestionar el portal del cliente es trabajo de oficina.

---

## Cómo queda cubierto

| Prueba | Qué fija |
|---|---|
| `test/data/migration_desde_v12_test.dart` | La obra sobrevive, el párrafo nace NULL, y la migración deja el aviso de relleno |
| `test/data/relleno_columna_nueva_test.dart` | El párrafo de la web sobrevive a una obra `pending`, y el relleno no pisa lo que se escribió en el celular |
| `test/data/texto_final_guardado_test.dart` | Los tres documentos guardan de verdad y quedan `pending` |
| `test/pdf/estado_cuenta_texto_final_test.dart` | El párrafo llega a la hoja y no se cuela el de otro tipo de documento |
| `test/widget/texto_final_card_test.dart` | Qué párrafo se lee, de dónde dice que salió y quién puede tocarlo |
| `test/logic/textos_finales_test.dart` (ya existía) | La redacción, palabra por palabra contra la de la web |

`flutter analyze` limpio salvo 7 avisos previos de `onReorder`; 267 pruebas en
verde.

---

## Lo que ya estaba parejo

Para que esto no se lea más grande de lo que fue:

- **Notas de obra** completas en ambas: tablas, sincronización, cálculo con
  prueba de paridad, pantallas y PDF.
- **Texto general de los PDF** compartido y editable desde los dos lados
  (`empresa_config.pdf_textos`, migración 0033).
- **Configuración del PDF** (contacto, color, pie, marca de agua, firmas), con
  el nombre de la empresa saliendo de una sola fuente.
- **Alta rápida y quitar** en el pase de lista, con las mismas reglas de rol.
- **Aviso de datos incompletos**, derivado de los datos en ambas.
- **Movimiento**: esqueletos, deshacer y respeto al ajuste de movimiento
  reducido.
