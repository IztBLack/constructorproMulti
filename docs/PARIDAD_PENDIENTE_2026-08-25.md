# Paridad web ↔ móvil — lo que quedó disparejo

**2026-08-25**, tras desplegar `fcd9cc1` a producción.

Comprobado contra el código y contra la base real, no de memoria: columnas de
Postgres frente a las tablas de Drift, y qué PDF de cada plataforma imprime qué.

---

## Veredicto

**La paridad de datos está casi cerrada; la que falta es de SALIDA.** Las tablas
del móvil cubren todo lo que le toca cubrir. Lo que sigue disparejo es que el
mismo documento sale distinto según desde dónde se emita — que es justo el
problema que esta sesión vino a cerrar y quedó a medias en un caso.

---

## G1 · El estado de cuenta del cliente sale distinto · **alto**

`PdfService.estadoCuentaCliente` (móvil) **no imprime el párrafo final**; el de
la web sí. De los diez PDF del móvil, solo dos lo imprimen: `presupuesto` y
`notaObra`.

Es el mismo documento, para el mismo cliente, con distinto pie según quién lo
mande. Exactamente lo que se corrigió para el presupuesto y se dejó sin corregir
aquí.

**Depende de G2**: el texto propio de ese documento vive en `obras.texto_final`,
y esa columna no existe en el móvil.

## G2 · `obras.texto_final` no está en Drift · **alto**

| Columna de `obras` | ¿En el móvil? | ¿Correcto? |
|---|---|---|
| `avance` | no | sí — es de la web, el upsert la preserva |
| `cliente_id` | no | sí — ídem |
| **`texto_final`** | **no** | **no** — se me pasó en la 0032 |

Las dos primeras están documentadas como exclusivas de la web en
`web/DEPLOY.md §5`. La tercera es un olvido: cuando añadí la columna a las tres
tablas, al móvil solo le llegó la de `cotizaciones` y `nota_obra`.

**Trabajo**: columna en Drift (v12 → v13) + migración + prueba, y pasar el texto
al PDF. La columna ya existe en el servidor, así que no hay migración de Supabase.

## G3 · El texto final de una NOTA no se edita desde el móvil · **medio**

El móvil ya **imprime** el texto propio de la nota y ya **sincroniza** la
columna, pero no tiene dónde escribirlo: la tarjeta de edición solo está en la
cotización. En la web está en los tres documentos.

Se nota poco porque el texto general suele bastar, pero deja una nota que se
capturó entera en el celular sin poder ajustar su pie ahí mismo.

**Trabajo**: reusar la tarjeta que ya existe en `cotizacion_detail_screen`.

## G4 · Los atajos nuevos son solo de la web · **bajo, y a propósito**

Vista rápida, menú de fila y paleta de comandos no tienen gemelo móvil. **No es
un descuido**: la paleta pide teclado, y el equivalente móvil de la vista rápida
—la hoja inferior de consulta— se propuso y no se aprobó.

Queda anotado para que la próxima revisión no lo lea como un olvido.

## G5 · `clientes` no existe en el móvil · **bajo, y a propósito**

Gestionar el portal del cliente es trabajo de oficina. El móvil no tiene pantalla
ni tabla, y no hace falta que las tenga.

---

## Plan

Por orden de lo que arregla frente a lo que cuesta.

### 1. Cerrar G2 + G1 juntos

Son la misma pieza. Drift v12 → v13 con `obras.textoFinal`, su migración con
prueba —la columna nace NULL, así que ningún documento existente cambia— y
`estadoCuentaCliente` resolviendo el texto igual que `presupuesto` y `notaObra`.

Al terminar, **los tres documentos que llevan párrafo dicen lo mismo en las dos
plataformas**, que es la afirmación que hoy no se puede hacer.

### 2. G3, la tarjeta en la nota del móvil

Es copiar un widget que ya existe y engancharlo al repositorio de notas, que ya
sabe escribir la columna.

### 3. Nada más

G4 y G5 se quedan como están, por decisión y no por falta de tiempo.

---

## Lo que SÍ quedó parejo

Para que el plan no se lea más grande de lo que es:

- **Notas de obra** completas en ambas: tablas, sincronización, cálculo con
  prueba de paridad, pantallas y PDF.
- **Texto general de los PDF** compartido y editable desde los dos lados.
- **Configuración del PDF** (contacto, color, pie, marca de agua, firmas) en
  `empresa_config`, con el nombre de la empresa saliendo de una sola fuente.
- **Alta rápida y quitar** en el pase de lista, con las mismas reglas de rol.
- **Aviso de datos incompletos**, derivado de los datos en ambas.
- **Movimiento**: esqueletos, deshacer y respeto al ajuste de movimiento
  reducido, que el móvil no consultaba en ningún lado.
