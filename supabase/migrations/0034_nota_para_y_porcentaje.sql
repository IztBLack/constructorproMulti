-- 0034_nota_para_y_porcentaje.sql — Qué enseña la nota: el apartado «Para» y el %
-- Depende de: 0031 (nota_obra, nota_obra_renglon)
-- Aditivo, idempotente y no destructivo.
--
-- QUÉ CAMBIA
-- ─────────
-- Dos interruptores de PRESENTACIÓN, uno en la nota y otro en el renglón. No
-- tocan la aritmética: ningún total cambia por prenderlos o apagarlos.
--
-- 1. `nota_obra.mostrar_para`
--    El destinatario deja de ser obligatorio: ahora una nota puede nacer sin
--    nombre y completarse después. En pantalla eso se lee como un asterisco
--    («por completar»), pero un asterisco impreso en el PDF se leería como una
--    llamada a pie de página, así que ahí el hueco sale como una raya.
--    Esta columna decide si ese renglón vacío se imprime —listo para llenarse a
--    mano— o si el apartado desaparece del encabezado. Default `true`: las notas
--    que ya existen siguen imprimiendo «Para» exactamente como hoy.
--
-- 2. `nota_obra_renglon.mostrar_porcentaje`
--    Hoy todo renglón con `monto_base` imprime su cuenta debajo del concepto
--    («62,000 − 4% = 2,480»). En una DEDUCCION eso estorba: el socio solo tiene
--    que ver cuánto se le descontó, y el «− 4%» invita a discutir la fórmula en
--    vez del trato. Con esta columna el desglose de las deducciones se enseña
--    solo cuando el dueño lo pide, renglón por renglón.
--
--    Default `false` A PROPÓSITO, y es el único cambio visible en lo que ya
--    está guardado: las deducciones existentes dejan de enseñar el porcentaje.
--    Es justo lo que se pidió; prender de vuelta una es un clic.
--
-- POR QUÉ POR RENGLÓN Y NO POR NOTA
-- ─────────────────────────────────
-- Porque dentro de una misma nota conviven retenciones que conviene explicar
-- (la del 4% que la constructora aplica a todos) con descuentos que no (una
-- herramienta prestada). Un interruptor por nota obligaría a elegir entre
-- enseñar los dos o esconder los dos.
--
-- CONCEPTO y PAGO no se ven afectados: ahí el desglose no es adorno, es de
-- dónde sale el neto («62,000 − 4% = 59,520» explica un pago de 59,520). Esa
-- regla vive en la app (`notas-obra-calculo.ts`), no aquí: la base guarda el
-- interruptor y no opina sobre cuándo se mira.

alter table public.nota_obra
  add column if not exists mostrar_para boolean not null default true;

alter table public.nota_obra_renglon
  add column if not exists mostrar_porcentaje boolean not null default false;

comment on column public.nota_obra.mostrar_para is
  'Sin destinatario: true imprime el apartado «Para» en blanco (una raya, para llenar a mano), false lo quita del PDF. Con destinatario no aplica: siempre se imprime.';

comment on column public.nota_obra_renglon.mostrar_porcentaje is
  'Solo para renglones DEDUCCION: true enseña el desglose «base − % = valor» debajo del concepto. Default false (solo el valor). CONCEPTO y PAGO enseñan su desglose siempre.';

-- Las policies de 0031 ya cubren ambas columnas: se conceden por tabla, no por
-- columna, así que quien podía escribir la nota o el renglón puede escribir
-- estos dos interruptores. Nada que agregar.
