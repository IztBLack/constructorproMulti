-- 0033_pdf_textos_columna.sql — El texto general de los PDF, en su propia columna
-- Depende de: 0017 (empresa_config), 0026 (precedente `ui_orden`), 0032
-- Aditivo, idempotente y no destructivo.
--
-- QUÉ CAMBIA
-- ─────────
-- 0032 dejó el párrafo general por tipo de documento DENTRO del jsonb
-- `pdf_config`, junto al color, el contacto y las firmas. Aquí sale a su propia
-- columna `pdf_textos`, exactamente como `ui_orden` (0026).
--
-- POR QUÉ, SI YA FUNCIONABA EN LA WEB
-- ───────────────────────────────────
-- Porque ahora el MÓVIL también escribe este texto, y el móvil guarda su copia
-- del aspecto del PDF (nombre, color, firmas) en SharedPreferences — valores
-- LOCALES suyos, distintos de los de la web. Si para subir el texto tuviera que
-- escribir el jsonb `pdf_config` completo, se llevaría por delante el color y el
-- contacto que el dueño configuró desde la web, sin que nadie lo pidiera.
--
-- Con una columna aparte esa clase de accidente es imposible: cada plataforma
-- escribe la columna del dato que cambió y ninguna pisa lo que no tocó. Es la
-- misma razón por la que `ui_orden` nació aparte y no dentro de `pdf_config`.
--
-- Forma del jsonb: { "cotizacion": "…", "nota": "…", "estado_cuenta": "…" }
-- Clave ausente o vacía = "usa el texto integrado de la app".

alter table public.empresa_config
  add column if not exists pdf_textos jsonb not null default '{}'::jsonb;

-- Rescate por si alguien alcanzó a guardar textos con la forma de 0032. Hoy no
-- hay ninguno (se verificó antes de escribir esta migración), pero correrla dos
-- veces o sobre una base que sí los tenga debe dar el mismo resultado.
update public.empresa_config
   set pdf_textos = pdf_config -> 'textos'
 where pdf_textos = '{}'::jsonb
   and jsonb_typeof(pdf_config -> 'textos') = 'object';

-- La clave vieja se retira del jsonb para que no queden dos fuentes de verdad:
-- con las dos vivas, la próxima persona que lea `pdf_config.textos` obtendría
-- un valor rancio sin enterarse.
update public.empresa_config
   set pdf_config = pdf_config - 'textos'
 where pdf_config ? 'textos';

comment on column public.empresa_config.pdf_textos is
  'Párrafo final por tipo de documento: {"cotizacion","nota","estado_cuenta"}. Lo comparten web y móvil. Vacío = texto integrado.';

-- El trigger y las policies de `empresa_config` (0017) ya cubren la columna
-- nueva: se sella `updated_at` y solo admin/supervisor escriben. Nada más que
-- agregar aquí.
