# Logotipo y firma en los documentos — estándar de subida

Referencia para la subida de logotipo y firma escaneada que van impresos en los
PDF (cotización, nota de obra, estado de cuenta, nómina, caja).

Los archivos de esta carpeta son **de muestra**, generados para el proyecto. No
son la marca de ninguna empresa real y no se empaquetan en la app: sirven para
verificar cómo se imprime un logotipo y para tener a la vista el estándar.

## De dónde salen los números

En el encabezado, el logotipo se imprime a **38 px de alto**, que en una hoja
Letter equivalen a unos **10 mm**. Para que no se vea pixeleado en una impresión
a 300 DPI hacen falta ~120 px de alto reales; el doble deja margen para
pantallas de alta densidad y para acercarse en el visor sin que se deshaga.

De ahí sale la recomendación, y de ahí salen también los topes: no son cifras
redondas puestas al azar.

## Logotipo

| | |
|---|---|
| **Formato** | PNG con fondo transparente (JPG solo si el original es una foto) |
| **Alto recomendado** | 240 px |
| **Proporción** | hasta 4:1 de ancho — más largo se encoge tanto que deja de leerse |
| **Tamaño típico** | 960 × 240 px |
| **Peso** | hasta 2 MB |
| **Tope de dimensiones** | 2000 × 2000 px |

`logo-muestra.png` es exactamente eso: **960 × 240, 15 KB, con transparencia**.
Un logotipo real bien exportado pesa en ese orden; si el archivo se va a varios
megas, casi siempre es una foto de un logo, no el logo.

### Fondo transparente, no blanco

Un PNG con fondo blanco se ve bien sobre la hoja y **mal en cuanto el documento
lleve marca de agua o color**: aparece un rectángulo blanco recortando lo que
haya detrás. Es el error más común al exportar desde Word o PowerPoint.

### Si el logotipo ya trae el nombre escrito

Entonces sustituye al nombre de la empresa en el encabezado, en lugar de ir
junto a él: si no, el nombre aparece dos veces en la misma línea. Si es solo un
símbolo, va al lado y el nombre se conserva.

## Firma escaneada

| | |
|---|---|
| **Formato** | PNG con fondo transparente |
| **Alto recomendado** | 200 px |
| **Proporción** | alrededor de 4:1 |
| **Peso** | hasta 2 MB |

Se imprime **sobre la línea de firma**, no en su lugar: la línea y el rótulo
("Autorizado por obra") se conservan.

Aquí la transparencia no es una recomendación sino un requisito: una firma
escaneada con fondo blanco tapa la línea y se ve como una calcomanía pegada.
Lo habitual es escanear en blanco y negro y quitar el fondo antes de subirla.
