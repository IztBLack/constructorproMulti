-- 0032_texto_final_documento.sql — Párrafo final editable por documento
-- Depende de: 0002 (cotizaciones, obras), 0017 (empresa_config), 0031 (nota_obra)
-- Aditivo, idempotente y no destructivo. No toca filas ni policies existentes.
--
-- QUÉ RESUELVE
-- ────────────
-- Al pie de cada PDF va un párrafo — "Esta cotización tiene una vigencia de 30
-- días naturales…" — que hasta hoy vivía escrito a mano dentro del builder de
-- HTML. El dueño no podía cambiar una fecha, un plazo ni una condición sin
-- tocar el código, y esas condiciones cambian según con quién esté tratando.
--
-- TRES NIVELES, UNA SOLA COLUMNA NUEVA POR TABLA
--   1. Documento → estas columnas. NULL = "no tengo el mío, usa el de arriba".
--   2. Empresa   → `pdf_config.textos` (jsonb que YA existe, 0017). No hace
--                  falta migrarlo: es un objeto libre y agregarle claves es
--                  aditivo. El móvil guarda su PdfConfig en SharedPreferences y
--                  nunca escribe esa columna, así que no puede pisarlas.
--   3. Integrado → el texto de siempre, en el código, armado con datos vivos
--                  (nombre de la empresa, leyenda del IVA).
--
-- POR QUÉ NULL Y NO CADENA VACÍA
-- ──────────────────────────────
-- Son cosas distintas y las dos son legítimas: NULL es "sigo el texto general",
-- cadena vacía sería "no quiero párrafo". Hoy la interfaz solo produce NULL o
-- texto; dejar la distinción abierta evita una migración el día que alguien
-- pida un documento sin pie.
--
-- SOBRE LA SINCRONIZACIÓN DEL MÓVIL
-- ─────────────────────────────────
-- `cotizaciones` y `obras` viajan al móvil. La columna es aditiva y el push del
-- móvil hace upsert por columnas nombradas, así que un dispositivo viejo que no
-- la conozca NO la borra al subir — la misma garantía que ya protege a
-- `cliente_id` y `avance` (ver web/DEPLOY.md §5).

alter table public.cotizaciones add column if not exists texto_final text;
alter table public.nota_obra    add column if not exists texto_final text;

-- En `obras` porque el estado de cuenta del cliente se emite POR OBRA: no hay
-- una entidad "estado de cuenta" que pueda llevar su propio texto.
alter table public.obras        add column if not exists texto_final text;

comment on column public.cotizaciones.texto_final is
  'Párrafo final del PDF solo para esta cotización. NULL = usar pdf_config.textos.cotizacion o el integrado.';
comment on column public.nota_obra.texto_final is
  'Párrafo final del PDF solo para esta nota. NULL = usar pdf_config.textos.nota o el integrado.';
comment on column public.obras.texto_final is
  'Párrafo final del estado de cuenta del cliente de esta obra. NULL = usar pdf_config.textos.estado_cuenta o el integrado.';
