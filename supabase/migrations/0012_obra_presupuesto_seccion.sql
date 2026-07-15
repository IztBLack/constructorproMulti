-- 0012_obra_presupuesto_seccion.sql
-- Fase 3 (puente cotización→obra): agrega `seccion` a obra_presupuesto para que
-- el presupuesto de la obra conserve las secciones de la cotización de origen.
-- Al convertir una cotización aceptada en obra, cada partida se copia a
-- obra_presupuesto con el nombre de su sección; la UI agrupa y muestra totales
-- por sección.
--
-- Aditivo y no destructivo: columna nullable. Los presupuestos existentes
-- (importados de Excel, sin secciones) quedan con seccion NULL y siguen igual.
-- La app móvil sí usa esta columna (la escribe al convertir): requiere la
-- migración Drift v5→v6 correspondiente.
--
-- Depende de: 0008 (crea obra_presupuesto). Correr en el SQL Editor de Supabase.

alter table public.obra_presupuesto
  add column if not exists seccion text;
